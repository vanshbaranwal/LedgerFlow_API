import './LedgerFlow.css'

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
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function maskId(value = '') {
  const id = String(value)
  return id ? '•••• ' + id.slice(-6).toUpperCase() : 'Missing entry'
}

function LedgerEntry({ entry, type, accountIds }) {
  const isDebit = type === 'DEBIT'
  const accountId = entry ? String(entry.account) : ''

  return (
    <div className={'ledger-entry ' + type.toLowerCase() + (!entry ? ' missing' : '')}>
      <div className="ledger-entry-heading">
        <span className="ledger-entry-icon" aria-hidden="true">{isDebit ? '−' : '+'}</span>
        <div>
          <p>{type}</p>
          <strong>{isDebit ? 'Sender debited' : 'Receiver credited'}</strong>
        </div>
      </div>
      <div className="ledger-entry-account">
        <span>Account</span>
        <strong>{maskId(accountId)}</strong>
        {entry && accountIds.has(accountId) && <small>Your account</small>}
      </div>
      <strong className="ledger-entry-amount">
        {entry ? (isDebit ? '−' : '+') + formatMoney(entry.amount) : 'Not recorded'}
      </strong>
    </div>
  )
}

function LedgerFlow({
  flows,
  isLoading,
  error,
  accountIds,
  onRetry,
  onViewTransaction,
}) {
  return (
    <article className="dashboard-card ledger-flow-card" id="ledger-flow">
      <div className="ledger-flow-title">
        <div>
          <p className="card-kicker">Ledger flow</p>
          <h2>Every transfer, balanced on both sides.</h2>
          <span>Real debit and credit entries read from the protected ledger API.</span>
        </div>
        <button type="button" onClick={onRetry} disabled={isLoading}>
          <span aria-hidden="true">↻</span>{isLoading ? 'Loading…' : 'Refresh ledger'}
        </button>
      </div>

      <div className="ledger-principles" aria-label="Ledger guarantees">
        <div><strong>Double-entry</strong><span>One debit + one credit</span></div>
        <div><strong>Immutable</strong><span>Entries cannot be edited</span></div>
        <div><strong>Traceable</strong><span>Linked by transaction ID</span></div>
      </div>

      {isLoading ? (
        <div className="ledger-flow-loading" aria-label="Loading ledger entries">
          <span /><span />
        </div>
      ) : error ? (
        <div className="ledger-flow-state error" role="alert">
          <div>
            <strong>Ledger flow could not be loaded</strong>
            <p>{error}</p>
          </div>
          <button type="button" onClick={onRetry}>Try again</button>
        </div>
      ) : flows.length ? (
        <div className="ledger-flow-list">
          {flows.map((flow) => {
            const debitEntry = flow.entries.find((entry) => entry.type === 'DEBIT')
            const creditEntry = flow.entries.find((entry) => entry.type === 'CREDIT')
            const isBalanced = Boolean(
              debitEntry
              && creditEntry
              && Number(debitEntry.amount) === Number(creditEntry.amount),
            )

            return (
              <section className="ledger-flow-record" key={flow.transactionId}>
                <header>
                  <div>
                    <span>Transaction</span>
                    <strong>{maskId(flow.transactionId)}</strong>
                  </div>
                  <div className="ledger-record-meta">
                    <span className={'ledger-record-status ' + flow.status?.toLowerCase()}>{flow.status}</span>
                    <time dateTime={flow.createdAt}>{formatDate(flow.createdAt)}</time>
                  </div>
                </header>

                <div className="ledger-entry-path">
                  <LedgerEntry entry={debitEntry} type="DEBIT" accountIds={accountIds} />
                  <div className="ledger-connector" aria-hidden="true">
                    <span />
                    <b>→</b>
                    <span />
                  </div>
                  <LedgerEntry entry={creditEntry} type="CREDIT" accountIds={accountIds} />
                </div>

                <footer>
                  <span className={isBalanced ? 'balanced' : 'unbalanced'}>
                    <i aria-hidden="true">{isBalanced ? '✓' : '!'}</i>
                    {isBalanced ? 'Ledger balanced' : 'Ledger needs attention'}
                  </span>
                  <button type="button" onClick={() => onViewTransaction(String(flow.transactionId))}>
                    View transaction <span aria-hidden="true">→</span>
                  </button>
                </footer>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="ledger-flow-state">
          <span className="ledger-empty-icon" aria-hidden="true">LF</span>
          <div>
            <strong>No ledger entries yet</strong>
            <p>Complete a transfer and its debit-credit pair will appear here.</p>
          </div>
        </div>
      )}
    </article>
  )
}

export default LedgerFlow
