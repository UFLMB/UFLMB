import { useState } from 'react'
import type { FormEvent } from 'react'
import './AccountManagement.css'

type Props = { userId?: string; accessToken?: string; isAdmin: boolean; adminView: boolean }
type Account = { id: string; username: string; createdAt: string | null; suspended: boolean; suspensionReason: string | null }
type Action = 'suspend' | 'restore' | 'delete'

const endpoint = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export default function AccountManagement({ userId, accessToken, isAdmin, adminView }: Props) {
  const [username, setUsername] = useState('')
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [account, setAccount] = useState<Account | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  if (!isAdmin || !adminView) return null

  const call = async (payload: Record<string, string>) => {
    if (!endpoint || !anonKey || !accessToken) throw new Error('A valid administrator session is required.')
    const response = await fetch(endpoint + '/functions/v1/account-moderation', {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
    const result = await response.json().catch(() => ({})) as { error?: string; account?: Account; message?: string }
    if (!response.ok) throw new Error(result.error || 'The account action could not be completed.')
    return result
  }

  const lookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true); setError(''); setMessage(''); setAccount(null); setConfirmation('')
    try {
      const result = await call({ action: 'lookup', username: username.trim() })
      if (!result.account) throw new Error('No registered account matched that exact username.')
      setAccount(result.account)
      setUsername(result.account.username)
      setMessage('Account found. Review the status and reason before taking action.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Account lookup failed.') }
    finally { setBusy(false) }
  }

  const runAction = async (action: Action) => {
    if (!account || !reason.trim() || !accessToken) return
    const expected = action === 'delete' ? 'DELETE ' + account.username : account.username
    if (confirmation !== expected) {
      setError(action === 'delete'
        ? 'For permanent deletion, type DELETE followed by the exact username.'
        : 'Type the exact username to confirm this account action.')
      return
    }
    const detail = action === 'delete'
      ? 'This permanently deletes the Auth account, profile, preferences, support conversation and messages, and received warnings. Public review ratings and text are retained under the display name “Deleted member”; moderation queue identity and excerpt copies are cleared. The administrator audit trail retains the target account identifier and username.'
      : action === 'suspend'
        ? 'This blocks new sign-ins and restricts account-scoped access. Existing public, anonymous access to public content is not a ban from the public website.'
        : 'This restores sign-in and account-scoped access for this member.'
    if (!window.confirm((action === 'delete' ? 'PERMANENT ACCOUNT DELETION' : action === 'suspend' ? 'Suspend account' : 'Restore account') + '\n\n' + detail + '\n\nTarget: @' + account.username + '\nReason: ' + reason.trim())) return

    setBusy(true); setError(''); setMessage('')
    try {
      const result = await call({
        action,
        username: account.username,
        reason: reason.trim(),
        confirmation,
        targetUserId: account.id,
      })
      setMessage(result.message || (action === 'delete' ? 'Account deleted.' : action === 'suspend' ? 'Account suspended.' : 'Account restored.'))
      if (action === 'delete') {
        setAccount(null); setUsername(''); setReason(''); setConfirmation('')
      } else {
        setAccount(current => current ? { ...current, suspended: action === 'suspend', suspensionReason: action === 'suspend' ? reason.trim() : null } : current)
        setConfirmation('')
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'The account action failed.') }
    finally { setBusy(false) }
  }

  return <section className="admin-panel account-management-panel">
    <div className="section-heading"><div><p className="eyebrow">ACCOUNT SAFETY</p><h2>Account suspension & deletion</h2></div></div>
    <p className="muted-copy">These are privileged actions. Accounts on the administrator allowlist cannot be suspended or deleted. Every action requires a reason and is recorded in the server-side audit log.</p>
    {error && <p className="account-management-error" role="alert">{error}</p>}
    {message && <p className="account-management-message" role="status">{message}</p>}
    <form className="account-lookup-form" onSubmit={lookup}>
      <label>Exact registered username<input value={username} onChange={event => setUsername(event.target.value)} minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" required placeholder="Member username" /></label>
      <button type="submit" className="button secondary" disabled={busy || username.trim().length < 3}>Find account</button>
    </form>
    {account && <div className="account-management-target">
      <div className="account-management-target-heading">
        <div><h3>@{account.username}</h3><p>Registered {account.createdAt ? new Date(account.createdAt).toLocaleDateString() : 'date unavailable'}</p></div>
        <span className={account.suspended ? 'account-status suspended' : 'account-status active'}>{account.suspended ? 'Suspended' : 'Active'}</span>
      </div>
      {account.suspended && <p className="account-suspension-reason"><strong>Current reason:</strong> {account.suspensionReason || 'No reason recorded'}</p>}
      <label>Reason for this action<textarea value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={500} rows={3} required placeholder="Record the policy reason and context (10–500 characters)." /></label>
      <label>Confirmation {account.suspended ? '(type the exact username to restore; type DELETE username to permanently delete)' : '(type the exact username to suspend; type DELETE username to permanently delete)'}<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" placeholder={account.suspended ? account.username : 'Username or DELETE username'} required /></label>
      <div className="account-management-actions">
        {!account.suspended && <button type="button" className="button danger" disabled={busy || reason.trim().length < 10 || confirmation !== account.username} onClick={() => void runAction('suspend')}>Suspend account</button>}
        {account.suspended && <button type="button" className="button primary" disabled={busy || reason.trim().length < 10 || confirmation !== account.username} onClick={() => void runAction('restore')}>Restore account</button>}
        <button type="button" className="button danger account-delete-button" disabled={busy || reason.trim().length < 10 || confirmation !== 'DELETE ' + account.username} onClick={() => void runAction('delete')}>Permanently delete</button>
      </div>
      <p className="account-management-caution">Permanent deletion cannot be undone. If the account owns Supabase Storage objects, deletion may be rejected until those objects are reassigned or removed.</p>
    </div>}
    <small className="account-management-footnote">Signed-in administrator: {userId ? 'verified session' : 'session unavailable'}</small>
  </section>
}
