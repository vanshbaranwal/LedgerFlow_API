import { useCallback, useEffect, useMemo, useState } from 'react'
import './Dashboard.css'
import TransferModal from './TransferModal.jsx'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
const transactionFilters = [
  ['all', 'All'],
  ['sent', 'Money sent'],
  ['received', 'Money received'],
  ['completed', 'Completed'],
  ['failed', 'Failed'],
]

const iconPaths = {
  overview: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z',
  transaction: 'M7 7h11l-3-3m3 3-3 3M17 17H6l3 3m-3-3 3-3',
  ledger: 'M5 4h14v16H5V4Zm4 0v16M5 9h14M5 14h14',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0',
  wallet: 'M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Zm0 0A2.5 2.5 0 0 0 6.5 10H20v6h-5a3 3 0 1 1 0-6',
  copy: 'M9 8V5h10v10h-3M5 9h10v10H5V9Z',
  refresh: 'M19 8V4l-2 2a7 7 0 1 0 1.5 8M19 4h-4',
  send: 'm4 12 16-8-6 16-3-6-7-2Zm7 2 9-10',
  logout: 'M10 5H5v14h5M14 8l4 4-4 4m4-4H9',
  plus: 'M12 5v14M5 12h14',
  shield: 'M12 3 5 6v5c0 4.6 2.9 8 7 10 4.1-2 7-5.4 7-10V6l-7-3Zm-3 9 2 2 4-5',
}

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={iconPaths[name]} />
    </svg>
  )
}

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

function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'LF'
}

function formatTransactionDate(value) {
  if (!value) return 'Date unavailable'

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

async function apiRequest(path, options = {}) {
  const response = await fetch(API_BASE_URL + path, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(data.message || 'Something went wrong. Please try again.')
    error.status = response.status
    throw error
  }

  return data
}

function Dashboard({ user, onLogout, onSessionExpired }) {
  const [accounts, setAccounts] = useState([])
  const [balances, setBalances] = useState({})
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isTransferOpen, setIsTransferOpen] = useState(false)
  const [showFullAccountId, setShowFullAccountId] = useState(false)
  const [transactions, setTransactions] = useState([])
  const [transactionFilter, setTransactionFilter] = useState('all')
  const [isTransactionsLoading, setIsTransactionsLoading] = useState(true)
  const [transactionError, setTransactionError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadAccounts = useCallback(async (signal) => {
    try {
      const { accounts: userAccounts = [] } = await apiRequest('/accounts', { signal })
      const balancePairs = await Promise.all(
        userAccounts.map(async (account) => {
          const result = await apiRequest('/accounts/balance/' + account._id, { signal })
          return [account._id, result.balance]
        }),
      )

      setError('')
      setAccounts(userAccounts)
      setBalances(Object.fromEntries(balancePairs))
      setSelectedAccountId((current) => (
        userAccounts.some((account) => account._id === current)
          ? current
          : userAccounts[0]?._id || ''
      ))
    } catch (requestError) {
      if (requestError.name === 'AbortError') return
      if (requestError.status === 401) {
        onSessionExpired()
        return
      }
      setError(requestError.message)
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [onSessionExpired])

  const loadTransactions = useCallback(async (signal) => {
    setIsTransactionsLoading(true)
    setTransactionError('')

    try {
      const data = await apiRequest('/transactions', { signal })
      setTransactions(Array.isArray(data.transactions) ? data.transactions : [])
    } catch (requestError) {
      if (requestError.name === 'AbortError') return
      if (requestError.status === 401) {
        onSessionExpired()
        return
      }
      setTransactionError(requestError.message)
    } finally {
      if (!signal?.aborted) setIsTransactionsLoading(false)
    }
  }, [onSessionExpired])

  useEffect(() => {
    const controller = new AbortController()
    // Loading protected API data is the external synchronization this effect owns.
    // oxlint-disable-next-line react/set-state-in-effect
    loadAccounts(controller.signal)
    return () => controller.abort()
  }, [loadAccounts])

  useEffect(() => {
    const controller = new AbortController()
    // Loading protected API data is the external synchronization this effect owns.
    // oxlint-disable-next-line react/set-state-in-effect
    loadTransactions(controller.signal)
    return () => controller.abort()
  }, [loadTransactions])

  const selectedAccount = useMemo(
    () => accounts.find((account) => account._id === selectedAccountId) || accounts[0],
    [accounts, selectedAccountId],
  )

  const selectedBalance = selectedAccount ? balances[selectedAccount._id] ?? 0 : 0
  const firstName = user.name?.trim().split(/\s+/)[0] || 'there'
  const accountIds = useMemo(
    () => new Set(accounts.map((account) => account._id)),
    [accounts],
  )
  const displayTransactions = useMemo(() => (
    transactions.map((transaction) => {
      const fromAccount = String(transaction.fromAccount)
      const toAccount = String(transaction.toAccount)
      const direction = accountIds.has(fromAccount) ? 'sent' : 'received'

      return {
        ...transaction,
        direction,
        counterpartyAccount: direction === 'sent' ? toAccount : fromAccount,
      }
    })
  ), [accountIds, transactions])
  const filteredTransactions = useMemo(() => {
    if (transactionFilter === 'all') return displayTransactions
    if (transactionFilter === 'sent' || transactionFilter === 'received') {
      return displayTransactions.filter((transaction) => transaction.direction === transactionFilter)
    }
    return displayTransactions.filter(
      (transaction) => transaction.status?.toLowerCase() === transactionFilter,
    )
  }, [displayTransactions, transactionFilter])

  const createAccount = async () => {
    setIsCreating(true)
    setError('')
    setNotice('')

    try {
      await apiRequest('/accounts', { method: 'POST' })
      setNotice('Your new INR account is ready.')
      await loadAccounts()
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired()
      else setError(requestError.message)
    } finally {
      setIsCreating(false)
    }
  }

  const copyAccountId = async () => {
    if (!selectedAccount) return

    try {
      await navigator.clipboard.writeText(selectedAccount._id)
      setNotice('Account ID copied to your clipboard.')
    } catch {
      setNotice('Account ID: ' + selectedAccount._id)
    }
  }

  const logout = async () => {
    setIsLoggingOut(true)
    setError('')

    try {
      await apiRequest('/auth/logout', { method: 'POST' })
      onLogout()
    } catch (requestError) {
      setError(requestError.message)
      setIsLoggingOut(false)
    }
  }

  const completeTransfer = async () => {
    await Promise.all([loadAccounts(), loadTransactions()])
    setNotice('Transfer completed and your ledger balance has been refreshed.')
  }

  return (
    <div className="dashboard-page">
      <aside className="dashboard-sidebar">
        <a className="dashboard-brand" href="/dashboard" aria-label="LedgerFlow dashboard">
          <img src="/ledgerflow-logo.png" alt="LedgerFlow API" />
        </a>

        <nav className="dashboard-nav" aria-label="Dashboard navigation">
          <p>Workspace</p>
          <button className="active" type="button"><Icon name="overview" />Overview</button>
          <button type="button" onClick={() => document.querySelector('#transaction-history')?.scrollIntoView({ behavior: 'smooth' })}>
            <Icon name="transaction" />Transactions
          </button>
          <button type="button" disabled><Icon name="ledger" />Ledger flow<span>Next</span></button>
        </nav>

        <div className="sidebar-security">
          <span><Icon name="shield" /></span>
          <div>
            <strong>Ledger protected</strong>
            <p>Balances come from immutable debit and credit records.</p>
          </div>
        </div>

        <div className="sidebar-profile">
          <span className="profile-avatar">{getInitials(user.name)}</span>
          <div>
            <strong>{user.name}</strong>
            <p>{user.email}</p>
          </div>
          <button type="button" onClick={logout} disabled={isLoggingOut} aria-label="Log out">
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      <div className="dashboard-workspace">
        <header className="dashboard-topbar">
          <div>
            <p>Welcome back</p>
            <strong>{user.name}</strong>
          </div>
          <div className="topbar-actions">
            <span className={'api-status ' + (error ? 'offline' : isLoading ? 'checking' : '')}>
              <i />{error ? 'API unavailable' : isLoading ? 'Checking API' : 'API connected'}
            </span>
            <span className="topbar-avatar">{getInitials(user.name)}</span>
          </div>
        </header>

        <main className="dashboard-main">
          <section className="dashboard-heading">
            <div>
              <p className="dashboard-eyebrow">Overview</p>
              <h1>Good day, {firstName}.</h1>
              <p>Here is the current state of your LedgerFlow accounts.</p>
            </div>
            <button className="add-account-button" type="button" onClick={createAccount} disabled={isCreating}>
              <Icon name="plus" />
              {isCreating ? 'Creating…' : 'Add account'}
            </button>
          </section>

          {error && <div className="dashboard-alert error" role="alert">{error}</div>}
          {notice && <button className="dashboard-alert success" type="button" onClick={() => setNotice('')}>{notice}<span>×</span></button>}

          <section className="dashboard-grid">
            <article className="dashboard-card balance-card">
              <div className="card-title-row">
                <div>
                  <p className="card-kicker">Available balance</p>
                  <span>Calculated from your ledger</span>
                </div>
                <span className="live-badge">Live</span>
              </div>

              {isLoading ? (
                <div className="dashboard-skeleton balance-skeleton" />
              ) : (
                <>
                  <h2>{formatMoney(selectedBalance, selectedAccount?.currency)}</h2>
                  <div className="balance-meta">
                    <span>{selectedAccount ? maskAccountId(selectedAccount._id) : 'No account yet'}</span>
                    <span className={'account-status ' + (selectedAccount?.status?.toLowerCase() || 'empty')}>
                      {selectedAccount?.status || 'NO ACCOUNT'}
                    </span>
                  </div>
                </>
              )}

              <div className="balance-flow" aria-hidden="true">
                <svg viewBox="0 0 560 92" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e8dfd5" stopOpacity=".18" />
                      <stop offset="100%" stopColor="#e8dfd5" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path className="flow-fill" d="M0 74C60 63 72 78 128 58s88-26 130-15 76 7 116-12 88-3 116-10 45-17 70-11v82H0Z" />
                  <path className="flow-line" d="M0 74C60 63 72 78 128 58s88-26 130-15 76 7 116-12 88-3 116-10 45-17 70-11" />
                </svg>
              </div>
            </article>

            <article className="dashboard-card account-card">
              <div className="card-title-row">
                <div>
                  <p className="card-kicker">Your accounts</p>
                  <span>{accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}</span>
                </div>
                <span className="card-icon"><Icon name="wallet" /></span>
              </div>

              {isLoading ? (
                <div className="dashboard-skeleton account-skeleton" />
              ) : accounts.length ? (
                <div className="account-list">
                  {accounts.map((account) => (
                    <button
                      className={selectedAccount?._id === account._id ? 'selected' : ''}
                      type="button"
                      key={account._id}
                      onClick={() => setSelectedAccountId(account._id)}
                    >
                      <span className="account-symbol">₹</span>
                      <span><strong>{maskAccountId(account._id)}</strong><small>{account.currency} account</small></span>
                      <b>{formatMoney(balances[account._id], account.currency)}</b>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-account">
                  <span><Icon name="wallet" /></span>
                  <strong>No account yet</strong>
                  <p>Create your first account to start using LedgerFlow.</p>
                  <button type="button" onClick={createAccount} disabled={isCreating}>Create account</button>
                </div>
              )}
            </article>

            <article className="dashboard-card quick-actions-card">
              <div className="card-title-row">
                <div>
                  <p className="card-kicker">Quick actions</p>
                  <span>Manage your selected account</span>
                </div>
              </div>
              <div className="quick-actions">
                <button
                  type="button"
                  onClick={() => setIsTransferOpen(true)}
                  disabled={!selectedAccount || selectedAccount.status !== 'ACTIVE'}
                >
                  <span><Icon name="send" /></span>
                  <strong>Transfer funds</strong>
                  <small>Send through the API</small>
                </button>
                <button type="button" onClick={copyAccountId} disabled={!selectedAccount}>
                  <span><Icon name="copy" /></span>
                  <strong>Copy account ID</strong>
                  <small>Share to receive funds</small>
                </button>
                <button type="button" onClick={() => loadAccounts()} disabled={isLoading}>
                  <span><Icon name="refresh" /></span>
                  <strong>Refresh balance</strong>
                  <small>Read the latest ledger</small>
                </button>
              </div>
            </article>

            <article className="dashboard-card account-details-card">
              <div className="card-title-row">
                <div>
                  <p className="card-kicker">Account details</p>
                  <span>Backend-owned account data</span>
                </div>
                <span className="card-icon"><Icon name="account" /></span>
              </div>
              <dl>
                <div className="account-id-detail">
                  <dt>Account ID</dt>
                  <dd>
                    <code>{selectedAccount ? (showFullAccountId ? selectedAccount._id : maskAccountId(selectedAccount._id)) : '—'}</code>
                    <button
                      type="button"
                      onClick={() => setShowFullAccountId((current) => !current)}
                      disabled={!selectedAccount}
                      aria-pressed={showFullAccountId}
                    >
                      {showFullAccountId ? 'Hide ID' : 'View ID'}
                    </button>
                  </dd>
                </div>
                <div><dt>Currency</dt><dd>{selectedAccount?.currency || '—'}</dd></div>
                <div><dt>Status</dt><dd>{selectedAccount?.status || '—'}</dd></div>
                <div><dt>Balance source</dt><dd>Credit − debit entries</dd></div>
              </dl>
            </article>

            <article className="dashboard-card recent-card" id="transaction-history">
              <div className="card-title-row">
                <div>
                  <p className="card-kicker">Transaction history</p>
                  <span>Your 50 most recent money movements</span>
                </div>
                <button className="history-refresh" type="button" onClick={() => loadTransactions()} disabled={isTransactionsLoading}>
                  <Icon name="refresh" />Refresh
                </button>
              </div>

              <div className="transaction-filters" aria-label="Filter transactions">
                {transactionFilters.map(([value, label]) => (
                  <button
                    className={transactionFilter === value ? 'active' : ''}
                    type="button"
                    key={value}
                    onClick={() => setTransactionFilter(value)}
                    aria-pressed={transactionFilter === value}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {isTransactionsLoading ? (
                <div className="history-loading" aria-label="Loading transaction history">
                  <span /><span /><span />
                </div>
              ) : transactionError ? (
                <div className="history-state error" role="alert">
                  <span><Icon name="transaction" /></span>
                  <div>
                    <strong>History could not be loaded</strong>
                    <p>{transactionError}</p>
                  </div>
                  <button type="button" onClick={() => loadTransactions()}>Try again</button>
                </div>
              ) : filteredTransactions.length ? (
                <div className="transaction-table">
                  <div className="transaction-table-head" aria-hidden="true">
                    <span>Type</span><span>Account</span><span>Amount</span><span>Status</span><span>Date</span>
                  </div>
                  <div className="transaction-table-body">
                    {filteredTransactions.map((transaction) => (
                      <article className="transaction-row" key={transaction._id}>
                        <div className={'transaction-type ' + transaction.direction}>
                          <span><Icon name="send" /></span>
                          <strong>{transaction.direction === 'sent' ? 'Sent' : 'Received'}</strong>
                        </div>
                        <div className="transaction-account" data-label="Account">
                          <span>{transaction.direction === 'sent' ? 'To' : 'From'}</span>
                          <strong>{maskAccountId(transaction.counterpartyAccount)}</strong>
                        </div>
                        <strong className={'transaction-amount ' + transaction.direction} data-label="Amount">
                          {transaction.direction === 'sent' ? '−' : '+'}{formatMoney(transaction.amount, 'INR')}
                        </strong>
                        <span className={'transaction-status ' + transaction.status?.toLowerCase()} data-label="Status">
                          {transaction.status || 'UNKNOWN'}
                        </span>
                        <time dateTime={transaction.createdAt} data-label="Date">
                          {formatTransactionDate(transaction.createdAt)}
                        </time>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="history-state">
                  <span><Icon name="transaction" /></span>
                  <div>
                    <strong>{transactions.length ? 'No matching transactions' : 'No transactions yet'}</strong>
                    <p>{transactions.length ? 'Choose a different filter to see more activity.' : 'Your completed transfers will appear here automatically.'}</p>
                  </div>
                </div>
              )}
            </article>
          </section>
        </main>
      </div>

      {isTransferOpen && selectedAccount && (
        <TransferModal
          account={selectedAccount}
          availableBalance={selectedBalance}
          onClose={() => setIsTransferOpen(false)}
          onSuccess={completeTransfer}
          onSessionExpired={onSessionExpired}
        />
      )}
    </div>
  )
}

export default Dashboard
