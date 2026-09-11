import { useCallback, useEffect, useState } from 'react'
import './TransactionDetailsPanel.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

function formatMoney(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0)
}

function formatDate(value) {
  if (!value) return 'Date unavailable'

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function CopyButton({ value, label, copiedField, onCopy }) {
  return (
    <button type="button" onClick={() => onCopy(value, label)}>
      {copiedField === label ? 'Copied' : 'Copy'}
    </button>
  )
}

function TransactionDetailsPanel({ transactionId, accountIds, onClose, onSessionExpired }) {
  const [transaction, setTransaction] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [copiedField, setCopiedField] = useState('')

  const loadDetails = useCallback(async (signal) => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch(API_BASE_URL + '/transactions/' + transactionId, {
        credentials: 'include',
        signal,
      })
      const data = await response.json().catch(() => ({}))

      if (response.status === 401) {
        onSessionExpired()
        return
      }

      if (!response.ok) {
        throw new Error(data.message || 'Unable to load transaction details.')
      }

      setTransaction(data.transaction)
    } catch (requestError) {
      if (requestError.name !== 'AbortError') {
        setError(
          requestError instanceof TypeError
            ? 'Could not reach the API. Check the backend connection and try again.'
            : requestError.message,
        )
      }
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [onSessionExpired, transactionId])

  useEffect(() => {
    const controller = new AbortController()
    // Loading protected API data is the external synchronization this effect owns.
    // oxlint-disable-next-line react/set-state-in-effect
    loadDetails(controller.signal)

    const handleEscape = (event) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', handleEscape)
    document.body.classList.add('modal-open')

    return () => {
      controller.abort()
      document.removeEventListener('keydown', handleEscape)
      document.body.classList.remove('modal-open')
    }
  }, [loadDetails, onClose])

  const copyValue = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(label)
      window.setTimeout(() => setCopiedField(''), 1500)
    } catch {
      setCopiedField('')
    }
  }

  const fromAccount = transaction ? String(transaction.fromAccount) : ''
  const toAccount = transaction ? String(transaction.toAccount) : ''
  const direction = accountIds.has(fromAccount) ? 'sent' : 'received'

  return (
    <div className="details-overlay" onMouseDown={onClose}>
      <aside
        className="transaction-details-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-details-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="details-header">
          <div>
            <p>LedgerFlow record</p>
            <h2 id="transaction-details-title">Transaction details</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close transaction details">×</button>
        </header>

        {isLoading ? (
          <div className="details-loading" aria-label="Loading transaction details">
            <span /><span /><span /><span />
          </div>
        ) : error ? (
          <div className="details-error" role="alert">
            <strong>Details could not be loaded</strong>
            <p>{error}</p>
            <button type="button" onClick={() => loadDetails()}>Try again</button>
          </div>
        ) : transaction ? (
          <div className="details-content">
            <section className={'details-summary ' + direction}>
              <span className="details-direction">{direction === 'sent' ? 'Money sent' : 'Money received'}</span>
              <strong>{direction === 'sent' ? '−' : '+'}{formatMoney(transaction.amount)}</strong>
              <span className={'details-status ' + transaction.status?.toLowerCase()}>{transaction.status}</span>
              <p>{formatDate(transaction.createdAt)}</p>
            </section>

            <section className="account-flow" aria-label="Transfer account flow">
              <div>
                <span>Sender</span>
                <strong>{fromAccount.slice(-6).toUpperCase()}</strong>
              </div>
              <span className="flow-arrow" aria-hidden="true">→</span>
              <div>
                <span>Receiver</span>
                <strong>{toAccount.slice(-6).toUpperCase()}</strong>
              </div>
            </section>

            <dl className="details-list">
              <div>
                <dt>Transaction ID</dt>
                <dd><code>{transaction._id}</code><CopyButton value={transaction._id} label="transaction" copiedField={copiedField} onCopy={copyValue} /></dd>
              </div>
              <div>
                <dt>Sender account</dt>
                <dd><code>{fromAccount}</code><CopyButton value={fromAccount} label="sender" copiedField={copiedField} onCopy={copyValue} /></dd>
              </div>
              <div>
                <dt>Receiver account</dt>
                <dd><code>{toAccount}</code><CopyButton value={toAccount} label="receiver" copiedField={copiedField} onCopy={copyValue} /></dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd><strong>{formatMoney(transaction.amount)}</strong></dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd><span className={'details-status ' + transaction.status?.toLowerCase()}>{transaction.status}</span></dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd><time dateTime={transaction.createdAt}>{formatDate(transaction.createdAt)}</time></dd>
              </div>
              <div className="details-description">
                <dt>Description</dt>
                <dd>{transaction.description || 'No description provided'}</dd>
              </div>
              <div className="details-idempotency">
                <dt>Idempotency reference</dt>
                <dd><code>{transaction.idempotencyKey}</code><CopyButton value={transaction.idempotencyKey} label="idempotency" copiedField={copiedField} onCopy={copyValue} /></dd>
              </div>
            </dl>

            <div className="details-safety">
              <span aria-hidden="true">✓</span>
              <p><strong>Traceable ledger record</strong>This reference connects the API request to one protected transaction.</p>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  )
}

export default TransactionDetailsPanel
