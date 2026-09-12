import { useEffect, useState } from 'react'
import { z } from 'zod'
import './App.css'
import Dashboard from './Dashboard.jsx'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

const registerSchema = loginSchema.extend({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(50, 'Name is too long'),
})

const features = [
  ['Protected sessions', 'Registration, login and logout with hashed passwords, JWT cookies, token blacklisting and backend-verified sessions.'],
  ['Account ownership', 'Users can create and view accounts, while ownership checks protect private balances and outgoing funds.'],
  ['Ledger-derived balances', 'Balances are calculated from credit and debit entries instead of an editable stored number.'],
  ['Double-entry records', 'Every transfer creates matching debit and credit entries linked to one transaction.'],
  ['Atomic transfer safety', 'MongoDB transactions and source-account locking protect transfers from partial writes and concurrent overspending.'],
  ['Idempotent payments', 'Unique idempotency keys make retries safe and prevent duplicate payment processing.'],
  ['Authenticated dashboard', 'A protected workspace shows account balances, status, profile information and secure logout controls.'],
  ['Transaction explorer', 'Filter recent activity, inspect individual transfers and safely copy transaction references and account IDs.'],
  ['Live ledger explorer', 'Follow the real debit-to-credit path and verify that both immutable entries balance for every transfer.'],
]

const transferSteps = [
  ['Authenticate', 'Verify the JWT and source-account ownership.'],
  ['Validate', 'Check account status, currency and available funds.'],
  ['Record', 'Create the transaction plus debit and credit entries atomically.'],
  ['Confirm', 'Commit the transfer and send an email notification.'],
]

function LogoMark() {
  return <span className="logo-mark" aria-hidden="true">LF</span>
}

function BrandLogo() {
  return <img className="brand-logo" src="/ledgerflow-logo.png" alt="LedgerFlow API" />
}

function SessionLoadingScreen() {
  return (
    <main className="session-loading" aria-live="polite" aria-busy="true">
      <BrandLogo />
      <span className="session-spinner" aria-hidden="true" />
      <div>
        <strong>Checking your session</strong>
        <p>Securely verifying your LedgerFlow account…</p>
      </div>
    </main>
  )
}

function AuthModal({ type, onClose, onSuccess, onSwitch }) {
  const isRegister = type === 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const handleEscape = (event) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', handleEscape)
    document.body.classList.add('modal-open')

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.classList.remove('modal-open')
    }
  }, [onClose])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
    setApiError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setApiError('')

    const values = isRegister
      ? form
      : { email: form.email, password: form.password }
    const result = (isRegister ? registerSchema : loginSchema).safeParse(values)

    if (!result.success) {
      setErrors(result.error.flatten().fieldErrors)
      return
    }

    setErrors({})
    setIsLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/auth/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(result.data),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.message || 'Request failed. Please try again.')
      }

      onSuccess(data.user, isRegister ? 'Your account was created.' : 'You are now logged in.')
    } catch (error) {
      setApiError(
        error instanceof TypeError
          ? 'Could not reach the API. Make sure the backend is running.'
          : error.message,
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close-button" type="button" onClick={onClose} aria-label="Close">×</button>
        <div className="modal-logo"><LogoMark /> LedgerFlow</div>
        <h2 id="modal-title">{isRegister ? 'Create your account' : 'Welcome back'}</h2>
        <p className="modal-description">{isRegister ? 'Enter your details to get started.' : 'Enter your details to continue.'}</p>

        <form onSubmit={handleSubmit} noValidate>
          {isRegister && (
            <label>
              Name
              <input name="name" value={form.name} onChange={handleChange} placeholder="Your name" autoComplete="name" autoFocus />
              {errors.name && <span className="field-error">{errors.name[0]}</span>}
            </label>
          )}

          <label>
            Email
            <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@example.com" autoComplete="email" autoFocus={!isRegister} />
            {errors.email && <span className="field-error">{errors.email[0]}</span>}
          </label>

          <label>
            Password
            <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="Minimum 6 characters" autoComplete={isRegister ? 'new-password' : 'current-password'} />
            {errors.password && <span className="field-error">{errors.password[0]}</span>}
          </label>

          {apiError && <p className="api-error" role="alert">{apiError}</p>}

          <button className="submit-button" type="submit" disabled={isLoading}>
            {isLoading ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p className="switch-form">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}
          <button type="button" onClick={() => onSwitch(isRegister ? 'login' : 'register')}>
            {isRegister ? 'Log in' : 'Register'}
          </button>
        </p>
      </div>
    </div>
  )
}

function App() {
  const [modal, setModal] = useState(null)
  const [message, setMessage] = useState('')
  const [user, setUser] = useState(null)
  const [isAuthChecking, setIsAuthChecking] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    const verifySession = async () => {
      try {
        const response = await fetch(API_BASE_URL + '/auth/me', {
          credentials: 'include',
          signal: controller.signal,
        })
        const data = await response.json().catch(() => ({}))

        if (response.ok && data.user) {
          setUser(data.user)
          return
        }

        setUser(null)
      } catch (error) {
        if (error.name === 'AbortError') return
        setUser(null)
        setMessage('Your session could not be verified. Please log in to continue.')
      } finally {
        if (!controller.signal.aborted) setIsAuthChecking(false)
      }
    }

    verifySession()
    return () => controller.abort()
  }, [])

  const handleSuccess = (authenticatedUser) => {
    setModal(null)
    setUser(authenticatedUser)
    setMessage('')
    window.history.replaceState({}, '', '/dashboard')
  }

  const leaveDashboard = (sessionExpired = false) => {
    setUser(null)
    setMessage(sessionExpired ? 'Your session expired. Please log in again.' : 'You have been logged out.')
    window.history.replaceState({}, '', '/')
  }

  useEffect(() => {
    if (isAuthChecking) return

    if (user && window.location.pathname !== '/dashboard') {
      window.history.replaceState({}, '', '/dashboard')
    }

    if (!user && window.location.pathname === '/dashboard') {
      window.history.replaceState({}, '', '/')
    }
  }, [isAuthChecking, user])

  if (isAuthChecking) {
    return <SessionLoadingScreen />
  }

  if (user) {
    return (
      <Dashboard
        user={user}
        onLogout={() => leaveDashboard(false)}
        onSessionExpired={() => leaveDashboard(true)}
      />
    )
  }

  return (
    <div className="page">
      <header>
        <a className="logo" href="#top"><BrandLogo /></a>
        <nav aria-label="Main navigation"><a href="#about">About</a><a href="#features">Features</a><a href="#flow">Flow</a></nav>
        <div className="auth-buttons">
          <button className="login-button" type="button" onClick={() => setModal('login')}>Log in</button>
          <button className="register-button" type="button" onClick={() => setModal('register')}>Register</button>
        </div>
      </header>

      <main id="top">
        {message && <button className="success-message" type="button" onClick={() => setMessage('')}><span>✓</span>{message}</button>}

        <section className="hero" id="about">
          <p className="eyebrow">A ledger-backed transaction API</p>
          <h1>Move money with<br /><span>clarity and confidence.</span></h1>
          <p className="hero-copy">Create accounts, move simulated funds and inspect every transaction from request to balanced ledger entries—all through a protected full-stack banking workspace.</p>
          <div className="hero-buttons">
            <button className="register-button large" type="button" onClick={() => setModal('register')}>Create an account</button>
            <button className="login-button large" type="button" onClick={() => setModal('login')}>Log in</button>
          </div>

        </section>

        <section className="showcase" id="features">
          <div className="section-heading">
            <p className="eyebrow">Full-stack showcase</p>
            <h2>A banking flow you can inspect end to end.</h2>
            <p>LedgerFlow combines a secure transaction API with an interactive dashboard that makes its authorization, reliability and accounting decisions visible.</p>
          </div>

          <div className="features">
            {features.map(([title, description], index) => (
              <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{description}</p></article>
            ))}
          </div>
        </section>

        <section className="transfer-flow" id="flow">
          <div className="section-heading compact-heading">
            <p className="eyebrow">Transaction flow</p>
            <h2>One request, four deliberate steps.</h2>
          </div>

          <ol>
            {transferSteps.map(([title, description], index) => (
              <li key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div></li>
            ))}
          </ol>

          <div className="tech-stack" aria-label="Technology stack">
            <span>React</span><span>Vite</span><span>Zod</span><span>Node.js</span><span>Express</span><span>MongoDB</span><span>Mongoose</span><span>JWT</span><span>OAuth2 Email</span>
          </div>
        </section>
      </main>

      <footer>
        <a className="logo" href="#top"><BrandLogo /></a>
        <div className="footer-credit">
          <p>Built by Vansh Baranwal</p>
          <a className="github-link" href="https://github.com/vanshbaranwal" target="_blank" rel="noreferrer" aria-label="Visit Vansh Baranwal on GitHub">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 6.82a9.5 9.5 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
            </svg>
          </a>
        </div>
      </footer>

      {modal && <AuthModal key={modal} type={modal} onClose={() => setModal(null)} onSwitch={setModal} onSuccess={handleSuccess} />}
    </div>
  )
}

export default App
