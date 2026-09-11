import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import './TransferModal.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const transferSchema = z.object({
  toAccount: z
    .string()
    .trim()
    .min(1, 'Receiver account ID is required')
    .regex(/^[a-f\d]{24}$/i, 'Enter a valid 24-character account ID'),
  amount: z
    .string()
    .trim()
    .min(1, 'Amount is required')
    .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, 'Enter an amount greater than zero')
    .transform(Number),
  description: z
    .string()
    .trim()
    .max(120, 'Description must be 120 characters or fewer'),
})

function formatMoney(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0)
}

function maskAccountId(accountId = '') {
  return accountId ? '•••• ' + accountId.slice(-6).toUpperCase() : 'Not available'
}

function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'ledgerflow-' + Date.now() + '-' + Math.random().toString(16).slice(2)
}

function friendlyTransferError(message = '') {
  const normalized = message.toLowerCase()

  if (normalized.includes('insufficient balance')) {
    return 'Insufficient balance for this transfer. Try a smaller amount.'
  }
  if (normalized.includes('destination account not found or is not active')) {
    return 'The receiver account could not be found or is not active.'
  }
  if (normalized.includes('destination') && normalized.includes('not found')) {
    return 'The receiver account could not be found. Check the account ID.'
  }
  if (normalized.includes('destination') && normalized.includes('not active')) {
    return 'The receiver account is not active and cannot receive funds.'
  }
  if (normalized.includes('source') && normalized.includes('inactive')) {
    return 'Your selected account is not active and cannot send funds.'
  }
  if (normalized.includes('not owned')) {
    return 'You are not authorized to transfer from this account.'
  }
  if (normalized.includes('currenc')) {
    return 'The sender and receiver accounts must use the same currency.'
  }
  if (normalized.includes('processing failed')) {
    return 'The transfer could not be completed. Your funds were not moved; you can safely retry.'
  }

  return message || 'The transfer could not be completed. Please try again.'
}

function TransferModal({ account, availableBalance, onClose, onSuccess, onSessionExpired }) {
  const [form, setForm] = useState({ toAccount: '', amount: '', description: '' })
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [completedTransfer, setCompletedTransfer] = useState(null)
  const idempotencyKeyRef = useRef('')
  const submissionLockRef = useRef(false)

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !submissionLockRef.current) onClose()
    }
    document.addEventListener('keydown', handleEscape)
    document.body.classList.add('modal-open')

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.classList.remove('modal-open')
    }
  }, [onClose])

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
    setApiError('')
    idempotencyKeyRef.current = ''
  }

  const submitTransfer = async (event) => {
    event.preventDefault()
    if (submissionLockRef.current) return

    const result = transferSchema.safeParse(form)

    if (!result.success) {
      setErrors(result.error.flatten().fieldErrors)
      return
    }

    if (result.data.toAccount === account._id) {
      setErrors({ toAccount: ['The receiver must be a different account'] })
      return
    }

    if (result.data.amount > Number(availableBalance)) {
      setErrors({ amount: ['This amount is greater than your available balance'] })
      return
    }

    submissionLockRef.current = true
    setIsSubmitting(true)
    setErrors({})
    setApiError('')
    idempotencyKeyRef.current ||= createIdempotencyKey()

    try {
      const response = await fetch(API_BASE_URL + '/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fromAccount: account._id,
          toAccount: result.data.toAccount,
          amount: result.data.amount,
          description: result.data.description,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      })
      const data = await response.json().catch(() => ({}))

      if (response.status === 401) {
        onSessionExpired()
        return
      }

      if (!response.ok) {
        const error = new Error(friendlyTransferError(data.message))
        error.status = response.status
        throw error
      }

      if (!data.transaction && data.message?.toLowerCase().includes('processing')) {
        setApiError('This transfer is still processing. Wait a moment, then retry safely.')
        return
      }

      setCompletedTransfer(data.transaction || {
        amount: result.data.amount,
        status: 'COMPLETED',
      })
      await onSuccess(data)
      idempotencyKeyRef.current = ''
    } catch (error) {
      setApiError(
        error instanceof TypeError
          ? 'Could not reach the API. The same safe request key will be reused when you retry.'
          : error.message,
      )
    } finally {
      submissionLockRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <div className="transfer-overlay" onMouseDown={() => !submissionLockRef.current && onClose()}>
      <section
        className="transfer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="transfer-close" type="button" onClick={onClose} disabled={isSubmitting} aria-label="Close transfer form">×</button>

        {completedTransfer ? (
          <div className="transfer-success">
            <span className="success-check" aria-hidden="true">✓</span>
            <p className="transfer-eyebrow">Transfer completed</p>
            <h2>{formatMoney(completedTransfer.amount, account.currency)}</h2>
            <p>The debit and credit entries were recorded successfully.</p>
            <dl>
              <div><dt>From</dt><dd>{maskAccountId(account._id)}</dd></div>
              <div><dt>To</dt><dd>{maskAccountId(form.toAccount)}</dd></div>
              <div><dt>Status</dt><dd>{completedTransfer.status || 'COMPLETED'}</dd></div>
              {completedTransfer._id && <div><dt>Transaction</dt><dd>{maskAccountId(completedTransfer._id)}</dd></div>}
            </dl>
            <button type="button" onClick={onClose}>Back to dashboard</button>
          </div>
        ) : (
          <>
            <div className="transfer-heading">
              <span className="transfer-symbol" aria-hidden="true">₹</span>
              <p className="transfer-eyebrow">New transaction</p>
              <h2 id="transfer-title">Transfer funds</h2>
              <p>Send simulated funds through LedgerFlow’s protected transaction API.</p>
            </div>

            <div className="transfer-source">
              <div>
                <span>Sending from</span>
                <strong>{maskAccountId(account._id)}</strong>
              </div>
              <div>
                <span>Available</span>
                <strong>{formatMoney(availableBalance, account.currency)}</strong>
              </div>
            </div>

            <form onSubmit={submitTransfer} noValidate>
              <label>
                Receiver account ID
                <input
                  name="toAccount"
                  value={form.toAccount}
                  onChange={updateField}
                  placeholder="Enter the 24-character account ID"
                  autoComplete="off"
                  autoFocus
                  disabled={isSubmitting}
                />
                {errors.toAccount && <span className="transfer-field-error">{errors.toAccount[0]}</span>}
              </label>

              <label>
                Amount
                <div className="amount-input">
                  <span>₹</span>
                  <input
                    name="amount"
                    value={form.amount}
                    onChange={updateField}
                    placeholder="0.00"
                    inputMode="decimal"
                    autoComplete="off"
                    disabled={isSubmitting}
                  />
                  <small>{account.currency}</small>
                </div>
                {errors.amount && <span className="transfer-field-error">{errors.amount[0]}</span>}
              </label>

              <label>
                <span className="transfer-label-row">Description <small>Optional</small></span>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={updateField}
                  placeholder="What is this transfer for?"
                  maxLength={120}
                  disabled={isSubmitting}
                />
                <span className="description-count">{form.description.length}/120</span>
                {errors.description && <span className="transfer-field-error">{errors.description[0]}</span>}
              </label>

              <div className="transfer-safety">
                <span aria-hidden="true">✓</span>
                <p><strong>Duplicate-payment protection</strong>A unique request key makes retries safe.</p>
              </div>

              {apiError && <p className="transfer-api-error" role="alert">{apiError}</p>}

              <div className="transfer-buttons">
                <button type="button" onClick={onClose} disabled={isSubmitting}>Cancel</button>
                <button type="submit" disabled={isSubmitting || account.status !== 'ACTIVE'}>
                  {isSubmitting ? 'Processing…' : 'Confirm transfer'}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  )
}

export default TransferModal
