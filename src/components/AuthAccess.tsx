import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

type AuthSession = {
  access_token: string
  refresh_token: string
  expires_at?: number
  user: { id: string; email?: string }
}

type Props = {
  isAdmin: boolean
  onAdminChange: (value: boolean) => void
}

const SESSION_KEY = 'uflmb.auth.session.v1'
const getConfig = () => ({
  url: (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, ''),
  key: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
})

async function requestAuth(path: string, body: Record<string, unknown>) {
  const { url, key } = getConfig()
  if (!url || !key) throw new Error('Sign-in is not configured yet. Please try again later.')
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const message = typeof result.msg === 'string' ? result.msg : typeof result.message === 'string' ? result.message : typeof result.error_description === 'string' ? result.error_description : 'Authentication failed.'
    throw new Error(message)
  }
  return result
}

async function checkAdmin(session: AuthSession): Promise<boolean> {
  const { url, key } = getConfig()
  if (!url || !key) return false
  const response = await fetch(`${url}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(session.user.id)}`, {
    headers: { apikey: key, Authorization: `Bearer ${session.access_token}` },
  })
  if (!response.ok) return false
  const rows = await response.json() as Array<{ user_id: string }>
  return rows.some(row => row.user_id === session.user.id)
}

async function restoreSession(): Promise<AuthSession | null> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    let session = JSON.parse(raw) as AuthSession
    if (!session?.access_token || !session?.refresh_token || !session?.user?.id) return null
    if (session.expires_at && session.expires_at < Math.floor(Date.now() / 1000) + 30) {
      const result = await requestAuth('token?grant_type=refresh_token', { refresh_token: session.refresh_token }) as unknown as AuthSession & { expires_in?: number }
      session = { ...result, expires_at: Math.floor(Date.now() / 1000) + (result.expires_in ?? 3600) }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } else {
      const { url, key } = getConfig()
      const response = await fetch(`${url}/auth/v1/user`, {
        headers: { apikey: key, Authorization: `Bearer ${session.access_token}` },
      })
      if (!response.ok) throw new Error('Session expired')
      const user = await response.json() as { id: string; email?: string }
      session = { ...session, user }
    }
    return session
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
    return null
  }
}

export default function AuthAccess({ isAdmin, onAdminChange }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [sessionEmail, setSessionEmail] = useState('')

  useEffect(() => {
    let cancelled = false
    void restoreSession().then(async session => {
      if (cancelled || !session) return
      setSessionEmail(session.user.email || '')
      const admin = await checkAdmin(session)
      if (!cancelled) onAdminChange(admin)
    })
    return () => { cancelled = true }
  }, [onAdminChange])

  const signOut = async () => {
    const { url, key } = getConfig()
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      const session = raw ? JSON.parse(raw) as AuthSession : null
      if (session?.access_token && url && key) {
        await fetch(`${url}/auth/v1/logout`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${session.access_token}` } })
      }
    } catch { /* Always clear the local session even if the network is unavailable. */ }
    sessionStorage.removeItem(SESSION_KEY)
    setSessionEmail('')
    setPassword('')
    setMessage('')
    setOpen(false)
    onAdminChange(false)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const result = await requestAuth(
        mode === 'signup' ? 'signup' : 'token?grant_type=password',
        { email: email.trim(), password },
      ) as unknown as AuthSession & { expires_in?: number; access_token?: string; refresh_token?: string; user?: AuthSession['user'] }
      if (!result.access_token || !result.refresh_token || !result.user?.id) {
        setMessage(mode === 'signup'
          ? 'Account created. Check your email to confirm the account, then sign in.'
          : 'Check your email and password, then try again.')
        return
      }
      const session: AuthSession = {
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (result.expires_in ?? 3600),
        user: result.user,
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
      setSessionEmail(session.user.email || email.trim())
      setPassword('')
      const admin = await checkAdmin(session)
      onAdminChange(admin)
      if (admin) {
        setMessage('Admin access verified.')
        setOpen(false)
      } else {
        setMessage('Community account ready. Community features coming soon…')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className="button primary auth-trigger" type="button" onClick={() => isAdmin ? void signOut() : (setOpen(true), setMessage(''))}>
        {isAdmin ? <><svg className="auth-trigger-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></svg><span>Logout</span></> : <><svg className="auth-trigger-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6" /></svg><span>Sign In/Up</span></>}
      </button>
      {open && !isAdmin && <div className="auth-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
        <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <button className="auth-close" type="button" aria-label="Close sign-in window" onClick={() => setOpen(false)}>×</button>
          <p className="eyebrow">UFLMB COMMUNITY</p>
          <h2 id="auth-title">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="auth-copy">{mode === 'signin' ? 'Sign in to your UFLMB account.' : 'Create a community account to get started.'}</p>
          <div className={`auth-mode-switch ${mode === 'signup' ? 'mode-signup' : 'mode-signin'}`} role="group" aria-label="Account action">
            <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setMessage('') }}>Sign In</button>
            <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setMessage('') }}>Sign Up</button>
          </div>
          {sessionEmail && <p className="auth-session-note">Signed in as {sessionEmail}. {isAdmin ? 'Administrator access is active.' : 'Community features coming soon…'}</p>}
          <form className="auth-form" onSubmit={submit}>
            <label>Email address<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>
            <label>Password<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={6} required value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 6 characters" /></label>
            <button className="button primary auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create account'}</button>
          </form>
          {message && <p className="auth-message" role="status">{message}</p>}
          {sessionEmail && <button className="button secondary auth-signout" type="button" onClick={() => void signOut()}>Sign out</button>}
        </section>
      </div>}
    </>
  )
}
