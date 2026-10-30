import { useEffect, useState } from 'react'
import './AccountManagement.css'

type SelectedAccount = { id: string; username: string; createdAt: string | null; isAdmin: boolean }
type Props = {
  userId?: string
  accessToken?: string
  isAdmin: boolean
  adminView: boolean
  selectedAccount: SelectedAccount
  onDeleted?: () => void
}
type Account = { id: string; username: string; createdAt: string | null; suspended: boolean; suspensionReason: string | null }
type Action = 'suspend' | 'restore' | 'delete'

const endpoint = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export default function AccountManagement({ userId, accessToken, isAdmin, adminView, selectedAccount, onDeleted }: Props) {
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [account, setAccount] = useState<Account | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

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

  useEffect(() => {
    let cancelled = false
    setAccount(null)
    setReason('')
    setConfirmation('')
    setError('')
    setMessage('')
    if (!isAdmin || !adminView || !accessToken) {
      setError('A verified administrator session is required.')
      return () => { cancelled = true }
    }
    if (selectedAccount.isAdmin) {
      setMessage('This is a trusted administrator account. Suspension and deletion are protected.')
      return () => { cancelled = true }
    }
    void (async () => {
      setBusy(true)
      try {
        const result = await call({ action: 'lookup', username: selectedAccount.username })
        if (!result.account || result.account.id !== selectedAccount.id) {
          throw new Error('The selected account could not be verified. Refresh the profile list before continuing.')
        }
        if (!cancelled) {
          setAccount(result.account)
          setMessage('Account verified. Actions below apply only to this selected profile.')
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Account status could not be loaded.')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [selectedAccount.id, selectedAccount.username, selectedAccount.isAdmin, isAdmin, adminView, accessToken])

  const runAction = async (action: Action) => {
    if (!account || !reason.trim() || !accessToken || busy) return
    if (action === 'delete' && confirmation !== 'DELETE ' + account.username) {
      setError('For permanent deletion, type DELETE followed by the exact username.')
      return
    }
    const detail = action === 'delete'
      ? 'This permanently deletes the Auth account, profile, preferences, support conversation and messages, and received warnings. Public reviews without an account link and the moderation audit trail are retained.'
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
      if (action === 'delete') {
        setAccount(null)
        setReason('')
        setConfirmation('')
        setMessage(result.message || 'Account permanently deleted.')
        onDeleted?.()
      } else {
        setAccount(current => current ? { ...current, suspended: action === 'suspend', suspensionReason: action === 'suspend' ? reason.trim() : null } : current)
        setConfirmation('')
        setMessage(result.message || (action === 'suspend' ? 'Account suspended.' : 'Account restored.'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The account action failed.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="account-management-panel">
    <div className="account-management-heading">
      <div><p className="eyebrow">ACCOUNT ACTIONS</p><h3>Account status & safety</h3></div>
      {account && <span className={account.suspended ? 'account-status suspended' : 'account-status active'}>{account.suspended ? 'Suspended' : 'Active'}</span>}
      {selectedAccount.isAdmin && <span className="account-status protected">Protected admin</span>}
    </div>
    <p className="account-management-description">Manage this selected account here. Every privileged action is checked by the server and recorded in the moderation audit log.</p>
    {error && <p className="account-management-error" role="alert">{error}</p>}
    {message && <p className="account-management-message" role="status">{message}</p>}
    {busy && <p className="account-management-loading" role="status">Verifying account status…</p>}
    {account?.suspended && <p className="account-suspension-reason"><strong>Current suspension reason:</strong> {account.suspensionReason || 'No reason recorded'}</p>}
    {account && <>
      <label className="account-management-field">Reason for this action
        <textarea value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={500} rows={3} required placeholder="Record the policy reason and context (10–500 characters)." />
      </label>
      <label className="account-management-field">Permanent deletion confirmation <small>Only needed to permanently delete this account. Type exactly: DELETE {account.username}</small>
        <input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" placeholder={'DELETE ' + account.username} />
      </label>
      <div className="account-management-actions">
        {!account.suspended && <button type="button" className="button danger" disabled={busy || reason.trim().length < 10} onClick={() => void runAction('suspend')}>Suspend account</button>}
        {account.suspended && <button type="button" className="button primary" disabled={busy || reason.trim().length < 10} onClick={() => void runAction('restore')}>Restore account</button>}
        <button type="button" className="button danger account-delete-button" disabled={busy || reason.trim().length < 10 || confirmation !== 'DELETE ' + account.username} onClick={() => void runAction('delete')}>Permanently delete</button>
      </div>
      <p className="account-management-caution">Permanent deletion cannot be undone. If the account owns Supabase Storage objects, deletion may be rejected until those objects are reassigned or removed.</p>
    </>}
    <small className="account-management-footnote">Selected account: @{selectedAccount.username} · {selectedAccount.createdAt ? 'Registered ' + new Date(selectedAccount.createdAt).toLocaleDateString() : 'Registration date unavailable'} · {userId ? 'administrator session verified' : 'session unavailable'}</small>
  </div>
}
