import { useState } from 'react'

type Props = { username: string; accessToken: string }
const endpoint = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export default function AccountSelfDeletion({ username, accessToken }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const expected = 'DELETE ' + username

  const deleteAccount = async () => {
    if (busy || confirmation !== expected) return
    setBusy(true); setError('')
    try {
      const response = await fetch(endpoint + '/functions/v1/account-moderation', {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_self', confirmation }),
        cache: 'no-store',
      })
      const result = await response.json().catch(() => ({})) as { message?: string; error?: string }
      if (!response.ok) throw new Error(result.error || 'Your account could not be deleted.')
      window.dispatchEvent(new CustomEvent('uflmb:account-deleted'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your account could not be deleted. Please try again.')
      setBusy(false)
    }
  }

  return <section className="account-panel account-self-delete-panel">
    <p className="eyebrow">ACCOUNT OWNERSHIP</p>
    <h3>Delete your account</h3>
    <p className="account-panel-description">Permanently delete your UFLMB account and profile. This cannot be undone. Your submitted public reviews may remain without a linked account, while support conversations and account preferences are removed. A minimal deletion record is retained in the action log.</p>
    {!expanded ? <button type="button" className="button danger" onClick={() => setExpanded(true)}>Delete my account</button> : <>
      <div className="account-self-delete-warning" role="alert"><strong>This action is permanent.</strong><span>To confirm, type exactly: <b>{expected}</b></span></div>
      <label className="account-self-delete-confirm">Confirmation<input autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder={expected} /></label>
      {error && <p className="profile-feedback error" role="alert">{error}</p>}
      <div className="account-self-delete-actions"><button type="button" className="button danger" disabled={busy || confirmation !== expected} onClick={() => void deleteAccount()}>{busy ? 'Deleting account…' : 'Permanently delete account'}</button><button type="button" className="button secondary" disabled={busy} onClick={() => { setExpanded(false); setConfirmation(''); setError('') }}>Cancel</button></div>
    </>}
  </section>
}
