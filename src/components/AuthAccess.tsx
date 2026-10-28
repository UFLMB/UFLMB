import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FormEvent } from 'react'

type AuthUser = { id: string; email?: string }
type AuthSession = {
  access_token: string
  refresh_token: string
  expires_at?: number
  user: AuthUser
}
type AuthResponse = Partial<AuthSession> & { expires_in?: number; msg?: string; message?: string; error_description?: string; error?: string }
type Mode = 'signin' | 'signup' | 'recovery' | 'updatePassword'

type Props = {
  isAdmin: boolean
  onAdminChange: (value: boolean) => void
  onAccountChange: (value: { userId: string; username: string; email?: string; accessToken: string } | null) => void
  themeMode: 'dark' | 'light' | 'system'
  onThemeModeChange: (value: 'dark' | 'light' | 'system') => void
  onDashboardChange: (value: boolean) => void
  onProfileChange: () => void
}

const SESSION_KEY = 'uflmb.auth.session.v1'
const getConfig = () => ({
  url: (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, ''),
  key: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
})
const getRedirectUrl = () => `${window.location.origin}${import.meta.env.BASE_URL || '/'}`

async function requestAuth(path: string, body?: Record<string, unknown>, options: { method?: string; accessToken?: string } = {}) {
  const { url, key } = getConfig()
  if (!url || !key) throw new Error('Authentication is not configured. Please try again later.')
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: key }
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method: options.method || 'POST',
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const result = await response.json().catch(() => ({})) as AuthResponse
  if (!response.ok) {
    const message = result.msg || result.message || result.error_description || result.error
    throw new Error(typeof message === 'string' ? message : 'Authentication failed. Please try again.')
  }
  return result
}

function toSession(result: AuthResponse): AuthSession | null {
  if (!result.access_token || !result.refresh_token || !result.user?.id) return null
  return {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (result.expires_in ?? 3600),
    user: result.user,
  }
}

function saveSession(session: AuthSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

async function checkAdmin(session: AuthSession): Promise<boolean> {
  const { url, key } = getConfig()
  if (!url || !key) return false
  try {
    const response = await fetch(`${url}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(session.user.id)}`, {
      headers: { apikey: key, Authorization: `Bearer ${session.access_token} ` .trim() },
    })
    if (!response.ok) return false
    const rows = await response.json() as Array<{ user_id: string }>
    return rows.some(row => row.user_id === session.user.id)
  } catch {
    return false
  }
}


async function usernameSignIn(username: string, password: string): Promise<AuthResponse> {
  const { url, key } = getConfig()
  const response = await fetch(`${url}/functions/v1/username-signin`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username.trim(), password }),
  })
  const result = await response.json().catch(() => ({})) as AuthResponse
  if (!response.ok) throw new Error(result.error_description || result.message || result.error || 'The username or password is incorrect.')
  return result
}
async function getProfileUsername(session: AuthSession): Promise<string> {
  const { url, key } = getConfig()
  try {
    const response = await fetch(`${url}/rest/v1/profiles?select=username&id=eq.${encodeURIComponent(session.user.id)}&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${session.access_token}` },
    })
    const rows = response.ok ? await response.json() as Array<{ username?: string }> : []
    return rows[0]?.username || session.user.email?.split('@')[0] || 'Account'
  } catch { return session.user.email?.split('@')[0] || 'Account' }
}
async function restoreSession(): Promise<AuthSession | null> {
  const { url, key } = getConfig()
  try {
    // Supabase email confirmation and password recovery can return tokens in the URL fragment.
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const accessToken = fragment.get('access_token')
    const refreshToken = fragment.get('refresh_token')
    if (accessToken && refreshToken) {
      const response = await fetch(`${url}/auth/v1/user`, {
        headers: { apikey: key, Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) throw new Error('The email link has expired. Please request a new one.')
      const user = await response.json() as AuthUser
      const expiresIn = Number(fragment.get('expires_in') || 3600)
      const session: AuthSession = {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: Math.floor(Date.now() / 1000) + expiresIn,
        user,
      }
      saveSession(session)
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
      return session
    }

    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    let session = JSON.parse(raw) as AuthSession
    if (!session?.access_token || !session?.refresh_token || !session?.user?.id) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    if (session.expires_at && session.expires_at < Math.floor(Date.now() / 1000) + 30) {
      const result = await requestAuth('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
      const refreshed = toSession(result)
      if (!refreshed) throw new Error('Session refresh failed')
      session = refreshed
      saveSession(session)
    } else {
      const response = await fetch(`${url}/auth/v1/user`, {
        headers: { apikey: key, Authorization: `Bearer ${session.access_token}` },
      })
      if (!response.ok) throw new Error('Session expired')
      session = { ...session, user: await response.json() as AuthUser }
      saveSession(session)
    }
    return session
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
    return null
  }
}

export default function AuthAccess({ isAdmin, onAdminChange, onAccountChange, themeMode, onThemeModeChange, onDashboardChange, onProfileChange }: Props) {
  const [open, setOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [sessionUsername, setSessionUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info')
  const [sessionEmail, setSessionEmail] = useState('')
  const [session, setSession] = useState<AuthSession | null>(null)

  useEffect(() => {
    if (!accountMenuOpen) return
    const closeOnOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setAccountMenuOpen(false) }
    document.addEventListener('pointerdown', closeOnOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [accountMenuOpen])

  useEffect(() => {
    if (!open || isAdmin) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, isAdmin])

  const showMessage = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setMessage(text)
    setMessageType(type)
  }

  useEffect(() => {
    let cancelled = false
    const fragmentType = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type')
    if (fragmentType === 'recovery') {
      setMode('updatePassword')
      setOpen(true)
      showMessage('Choose a new password for your account.', 'info')
    } else if (fragmentType === 'signup') {
      setOpen(true)
      showMessage('Email confirmed. You can now sign in.', 'success')
    }
    void restoreSession().then(async restored => {
      if (cancelled || !restored) return
      setSession(restored)
      setSessionEmail(restored.user.email || '')
      const restoredUsername = await getProfileUsername(restored)
      setSessionUsername(restoredUsername)
      if (!cancelled) onAccountChange({ userId: restored.user.id, username: restoredUsername, email: restored.user.email || '', accessToken: restored.access_token })
      const admin = await checkAdmin(restored)
      if (!cancelled) onAdminChange(admin)
      if (!cancelled && fragmentType === 'recovery') showMessage('Choose a new password for your account.', 'info')
      if (!cancelled && fragmentType === 'signup') showMessage('Email confirmed. Your account is ready.', 'success')
    })
    return () => { cancelled = true }
  }, [onAdminChange, onAccountChange])

  const signOut = async () => {
    const { url, key } = getConfig()
    try {
      if (session?.access_token && url && key) {
        await fetch(`${url}/auth/v1/logout`, {
          method: 'POST',
          headers: { apikey: key, Authorization: `Bearer ${session.access_token}` },
        })
      }
    } catch { /* Always clear the local session even if the network is unavailable. */ }
    sessionStorage.removeItem(SESSION_KEY)
    setSession(null)
    setSessionEmail('')
    setSessionUsername('')
    onAccountChange(null)
    setPassword('')
    setConfirmPassword('')
    setMessage('')
    setOpen(false)
    setAccountMenuOpen(false)
    onDashboardChange(false)
    onAdminChange(false)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      if (mode === 'recovery') {
        await requestAuth(`recover?redirect_to=${encodeURIComponent(getRedirectUrl())}`, { email: email.trim() })
        showMessage('If an account exists for this email, a password-reset link has been sent. Check your inbox and spam folder.', 'success')
        return
      }

      if (mode === 'updatePassword') {
        if (password.length < 6) {
          showMessage('Your password must contain at least 6 characters.', 'error')
          return
        }
        if (password !== confirmPassword) {
          showMessage('The passwords do not match.', 'error')
          return
        }
        const activeSession = session || (() => {
          const raw = sessionStorage.getItem(SESSION_KEY)
          return raw ? JSON.parse(raw) as AuthSession : null
        })()
        if (!activeSession?.access_token) {
          showMessage('This reset link is invalid or expired. Request a new password-reset link.', 'error')
          return
        }
        await requestAuth('user', { password }, { method: 'PUT', accessToken: activeSession.access_token })
        setPassword('')
        setConfirmPassword('')
        setMode('signin')
        showMessage('Password updated. You can now sign in with your new password.', 'success')
        return
      }

      if (mode === 'signup' && !/^[A-Za-z0-9_]{3,24}$/.test(username.trim())) {
        showMessage('Username must be 3–24 characters and use only letters, numbers, or underscores.', 'error')
        return
      }
      if (mode === 'signup' && password !== confirmPassword) {
        showMessage('The passwords do not match.', 'error')
        return
      }

      const path = mode === 'signup'
        ? `signup?redirect_to=${encodeURIComponent(getRedirectUrl())}`
        : 'token?grant_type=password'
      const result = mode === 'signin' && !email.trim().includes('@')
        ? await usernameSignIn(email.trim(), password)
        : await requestAuth(path, mode === 'signup' ? { email: email.trim(), password, data: { username: username.trim() } } : { email: email.trim(), password })
      const nextSession = toSession(result)
      if (!nextSession) {
        if (mode === 'signup') {
          setMode('signin')
          setConfirmPassword('')
          showMessage('Your account request was received. Check your email to confirm the address, then sign in.', 'success')
        } else {
          showMessage('Sign-in did not return a session. Confirm your email address or try again.', 'error')
        }
        return
      }

      saveSession(nextSession)
      setSession(nextSession)
      setSessionEmail(nextSession.user.email || email.trim())
      const nextUsername = mode === 'signup' ? username.trim() : await getProfileUsername(nextSession)
      setSessionUsername(nextUsername)
      onAccountChange({ userId: nextSession.user.id, username: nextUsername, email: nextSession.user.email || '', accessToken: nextSession.access_token })
      setPassword('')
      setConfirmPassword('')
      const admin = await checkAdmin(nextSession)
      onAdminChange(admin)
      if (admin) {
        showMessage('Administrator access verified.', 'success')
      } else {
        showMessage('You are signed in. Community account access is active.', 'success')
      }
      if (mode === 'signin') {
        setRedirecting(true)
        showMessage(admin ? 'Administrator access verified.' : 'Sign-in successful.', 'success')
        await new Promise(resolve => window.setTimeout(resolve, 1350))
        setOpen(false)
        setRedirecting(false)
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'Authentication failed. Please try again.'
      const lower = raw.toLowerCase()
      const friendly = lower.includes('invalid login credentials') ? 'The email or password is incorrect.'
        : lower.includes('email not confirmed') ? 'Please confirm your email using the link we sent you.'
        : lower.includes('user already registered') ? 'An account with this email already exists. Try signing in instead.'
        : lower.includes('password should be') ? raw
        : lower.includes('rate limit') ? 'Too many attempts. Please wait a little before trying again.'
        : raw
      showMessage(friendly, 'error')
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'signin' ? 'Welcome back'
    : mode === 'signup' ? 'Create your account'
    : mode === 'recovery' ? 'Reset your password'
    : 'Choose a new password'
  const description = mode === 'signin' ? 'Sign in to your UFLMB account.'
    : mode === 'signup' ? 'Create a community account to get started.'
    : mode === 'recovery' ? 'We’ll email you a secure link to reset your password.'
    : 'Set a new password to secure your account.'
  const currentlyDark = themeMode === 'dark' || (themeMode === 'system' && (typeof window === 'undefined' || !window.matchMedia('(prefers-color-scheme: light)').matches))

  return (
    <>
      <div className="auth-account-wrap" ref={accountMenuRef}>
        <button className={session ? 'auth-trigger account-trigger' : 'button primary auth-trigger'} type="button" aria-haspopup={session ? 'menu' : 'dialog'} aria-expanded={session ? accountMenuOpen : open} onClick={() => {
          if (session) { setAccountMenuOpen(value => !value); setOpen(false) }
          else { setOpen(value => !value); setMessage('') }
        }}>
          {session && isAdmin
            ? <svg className="auth-trigger-icon auth-admin-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 20 6v5.1c0 5.1-3.4 8.3-8 10.1-4.6-1.8-8-5-8-10.1V6z" fill="currentColor" stroke="none"/><path d="m8.5 12 2.2 2.2 4.8-5" fill="none" stroke="#10140b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            : <svg className="auth-trigger-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="4" fill="currentColor" stroke="none" /><path d="M4 21v-2.2a8 8 0 0 1 16 0V21z" fill="currentColor" stroke="none" /></svg>}
          <span>{session ? isAdmin ? 'ADMIN' : sessionUsername || 'Account' : 'Sign In/Up'}</span>
          {session && <svg className={accountMenuOpen ? 'account-chevron is-open' : 'account-chevron'} viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </button>
        {!session && <button className="public-theme-toggle" type="button" aria-label={currentlyDark ? 'Switch to light theme' : 'Switch to dark theme'} title={currentlyDark ? 'Light theme' : 'Dark theme'} onClick={() => onThemeModeChange(currentlyDark ? 'light' : 'dark')}>
          {currentlyDark
            ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6m11 11 1.6 1.6M2 12h2.2m15.6 0H22M4.9 19.1l1.6-1.6m11-11 1.6-1.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.6 8.6 0 1 0 20.2 15.1Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </button>}
        {session && <div className={accountMenuOpen ? 'account-dropdown is-open' : 'account-dropdown'} role="menu" aria-label="Account menu" hidden={!accountMenuOpen}>
          <div className="account-menu-label">APPEARANCE</div>
          <div className="theme-mode-options" role="group" aria-label="Theme mode">
            <button type="button" role="menuitemradio" aria-label="Dark theme" title="Dark" aria-checked={themeMode === 'dark'} className={themeMode === 'dark' ? 'theme-mode-button active' : 'theme-mode-button'} onClick={() => onThemeModeChange('dark')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.6 8.6 0 1 0 20.2 15.1Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button type="button" role="menuitemradio" aria-label="Light theme" title="Light" aria-checked={themeMode === 'light'} className={themeMode === 'light' ? 'theme-mode-button active' : 'theme-mode-button'} onClick={() => onThemeModeChange('light')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6m11 11 1.6 1.6M2 12h2.2m15.6 0H22M4.9 19.1l1.6-1.6m11-11 1.6-1.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            </button>
            <button type="button" role="menuitemradio" aria-label="System theme" title="System" aria-checked={themeMode === 'system'} className={themeMode === 'system' ? 'theme-mode-button active' : 'theme-mode-button'} onClick={() => onThemeModeChange('system')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M8 21h8m-4-4v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            </button>
          </div>
          <button className="account-menu-item" type="button" role="menuitem" onClick={() => { setAccountMenuOpen(false); onProfileChange() }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M4 21v-2a8 8 0 0 1 16 0v2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            <span>Profile</span>
          </button>
          {isAdmin && <button className="account-menu-item" type="button" role="menuitem" onClick={() => { setAccountMenuOpen(false); onDashboardChange(true) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8"/><rect x="13" y="3" width="8" height="5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8"/><rect x="13" y="10" width="8" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8"/><rect x="3" y="13" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>
            <span>Dashboard</span>
          </button>}
          <div className="account-menu-divider" />
          <button className="account-menu-item logout-item" type="button" role="menuitem" onClick={() => void signOut()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M16 16l5-4-5-4m5 4H9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span>Logout</span>
          </button>
        </div>}
      </div>
      {open && (!isAdmin || redirecting) && createPortal(<div className="auth-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
        <section className={`auth-modal${redirecting ? ' is-redirecting' : ''}`} role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <button className="auth-close" type="button" aria-label="Close sign-in window" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setOpen(false) }}>×</button>
          {redirecting && <div className="auth-redirect-state" role="status" aria-live="polite">
            <div className="auth-redirect-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
            <p className="eyebrow">UFLMB COMMUNITY</p>
            <h2>Sign-in successful</h2>
            <p className="auth-redirect-copy">{isAdmin ? 'Administrator access verified.' : 'Your community account is ready.'}</p>
            <div className="auth-redirect-progress" aria-hidden="true"><span /></div>
            <p className="auth-redirect-caption"><span className="auth-redirect-spinner" aria-hidden="true" /> Returning to UFLMB…</p>
          </div>}
          <p className="eyebrow">UFLMB COMMUNITY</p>
          <h2 id="auth-title">{title}</h2>
          <p className="auth-copy">{description}</p>
          {mode !== 'recovery' && mode !== 'updatePassword' && (
            <div className={`auth-mode-switch ${mode === 'signup' ? 'mode-signup' : 'mode-signin'}`} role="group" aria-label="Account action">
              <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setMessage(''); setPassword(''); setConfirmPassword('') }}>Sign In</button>
              <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setMessage(''); setPassword(''); setConfirmPassword('') }}>Sign Up</button>
            </div>
          )}
          {sessionEmail && <p className="auth-session-note">Signed in as {sessionEmail}. {isAdmin ? 'Administrator access is active.' : 'Your community session is active.'}</p>}
          <form className="auth-form" onSubmit={submit}>
            {mode === 'signup' && <label>Username<input type="text" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" value={username} onChange={event => setUsername(event.target.value)} placeholder="Choose a unique username" /></label>}
            {mode !== 'updatePassword' && <label>{mode === 'signin' ? 'Email or username' : 'Email address'}<input type={mode === 'signin' ? 'text' : 'email'} autoComplete={mode === 'signin' ? 'username' : 'email'} required value={email} onChange={event => setEmail(event.target.value)} placeholder={mode === 'signin' ? 'you@example.com or username' : 'you@example.com'} /></label>}
            {mode !== 'recovery' && <label>{mode === 'updatePassword' ? 'New password' : 'Password'}<span className="auth-password-field"><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' || mode === 'updatePassword' ? 'new-password' : 'current-password'} minLength={6} required value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'updatePassword' ? 'Enter a new password' : 'At least 6 characters'} /><button className="auth-password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} title={showPassword ? 'Hide password' : 'Show password'}><svg viewBox="0 0 24 24" aria-hidden="true">{showPassword ? <><path d="M3 3 21 21" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A11.7 11.7 0 0 1 12 5c5.2 0 8.6 4.5 9.5 6-.4.7-1.4 2.1-3.1 3.5" /><path d="M6.2 6.2C4.1 7.5 2.9 9.5 2.5 11c.8 1.4 4.2 6 9.5 6 1 0 1.9-.2 2.7-.5" /></> : <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>}</svg></button></span></label>}
            {(mode === 'signup' || mode === 'updatePassword') && <label>Confirm password<span className="auth-password-field"><input type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" minLength={6} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Enter the password again" /><button className="auth-password-toggle" type="button" aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'} aria-pressed={showConfirmPassword} onClick={() => setShowConfirmPassword(value => !value)} title={showConfirmPassword ? 'Hide password' : 'Show password'}><svg viewBox="0 0 24 24" aria-hidden="true">{showConfirmPassword ? <><path d="M3 3 21 21" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A11.7 11.7 0 0 1 12 5c5.2 0 8.6 4.5 9.5 6-.4.7-1.4 2.1-3.1 3.5" /><path d="M6.2 6.2C4.1 7.5 2.9 9.5 2.5 11c.8 1.4 4.2 6 9.5 6 1 0 1.9-.2 2.7-.5" /></> : <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>}</svg></button></span></label>}
            <button className="button primary auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create account' : mode === 'recovery' ? 'Send reset link' : 'Update password'}</button>
          </form>
          {message && <p className={`auth-message auth-message-${messageType}`} role="status" aria-live="polite">{message}</p>}
          {mode === 'signin' && <button className="auth-text-action" type="button" onClick={() => { setMode('recovery'); setMessage(''); setPassword('') }}>Forgot password?</button>}
          {(mode === 'recovery' || mode === 'updatePassword') && <button className="auth-text-action" type="button" onClick={() => { setMode('signin'); setMessage(''); setPassword(''); setConfirmPassword('') }}>Back to sign in</button>}
        </section>
      </div>, document.body)}
    </>
  )
}
