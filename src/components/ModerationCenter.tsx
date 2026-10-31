import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './ModerationCenter.css'

type QueueItem = {
  id: string
  content_type: 'card_review' | 'profile'
  content_id: string
  user_id: string | null
  display_name: string
  content_excerpt: string
  reason_codes: string[]
  status: 'pending' | 'reviewing' | 'dismissed' | 'actioned'
  admin_note: string | null
  created_at: string
}
type Warning = { id: string; reason: string; policy_area: string; acknowledged_at: string | null; created_at: string }
type Props = { userId?: string; accessToken?: string; isAdmin: boolean; adminView?: boolean }
const endpoint = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const dateLabel = (value: string) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

export default function ModerationCenter({ userId, accessToken, isAdmin, adminView = false }: Props) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [warnings, setWarnings] = useState<Warning[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [note, setNote] = useState('')
  const [warningReason, setWarningReason] = useState('')
  const [warningArea, setWarningArea] = useState('community_review')
  const [targetUsername, setTargetUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessageState] = useState('')
  const [error, setErrorState] = useState('')
  const setMessage = useCallback((value: string) => {
    setMessageState(value)
    if (value.trim()) window.dispatchEvent(new CustomEvent('uflmb:toast', { detail: { title: 'Moderation update', message: value, kind: 'success' } }))
  }, [])
  const setError = useCallback((value: string) => {
    setErrorState(value)
    if (value.trim()) window.dispatchEvent(new CustomEvent('uflmb:toast', { detail: { title: 'Moderation action failed', message: value, kind: 'error' } }))
  }, [])
  const selected = queue.find(item => item.id === selectedId) || null
  const headers = () => ({ apikey: anonKey, Authorization: `Bearer ${accessToken || ''}`, 'Content-Type': 'application/json' })

  const loadWarnings = async () => {
    if (!userId || !accessToken || !endpoint || !anonKey) { setWarnings([]); return }
    try {
      const response = await fetch(`${endpoint}/rest/v1/user_warnings?select=id,reason,policy_area,acknowledged_at,created_at&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`, { headers: headers(), cache: 'no-store' })
      if (!response.ok) throw new Error('Warnings could not be loaded.')
      setWarnings(await response.json() as Warning[])
    } catch { /* The notice stays hidden if the warning service is unavailable. */ }
  }
  const loadQueue = async () => {
    if (!adminView || !isAdmin || !accessToken || !endpoint || !anonKey) { setQueue([]); setSelectedId(''); return }
    setBusy(true); setError('')
    try {
      const response = await fetch(`${endpoint}/rest/v1/moderation_queue?select=*&order=created_at.desc&limit=100`, { headers: headers(), cache: 'no-store' })
      if (!response.ok) throw new Error('Moderation queue could not be loaded. Confirm the admin database permissions.')
      const rows = await response.json() as QueueItem[]
      setQueue(rows)
      setSelectedId(current => current && rows.some(item => item.id === current) ? current : rows[0]?.id || '')
    } catch (err) { setError(err instanceof Error ? err.message : 'Moderation queue could not be loaded.') }
    finally { setBusy(false) }
  }

  useEffect(() => { void loadWarnings() }, [userId, accessToken])
  useEffect(() => { void loadQueue() }, [adminView, isAdmin, accessToken])

  const updateQueue = async (status: QueueItem['status']) => {
    if (!selected || !isAdmin || !adminView) return
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(`${endpoint}/rest/v1/moderation_queue?id=eq.${encodeURIComponent(selected.id)}`, {
        method: 'PATCH', headers: { ...headers(), Prefer: 'return=minimal' },
        body: JSON.stringify({ status, admin_note: note.trim() || null, reviewed_by: userId, reviewed_at: new Date().toISOString() }),
      })
      if (!response.ok) throw new Error('Could not save the moderation decision.')
      if (selected.content_type === 'card_review' && (status === 'dismissed' || status === 'actioned')) {
        const reviewStatus = status === 'dismissed' ? 'approved' : 'hidden'
        const reviewResponse = await fetch(`${endpoint}/rest/v1/card_reviews?id=eq.${encodeURIComponent(selected.content_id)}`, {
          method: 'PATCH', headers: { ...headers(), Prefer: 'return=minimal' },
          body: JSON.stringify({ moderation_status: reviewStatus }),
        })
        if (!reviewResponse.ok) throw new Error('Queue status saved, but review visibility could not be changed. Check the review-table admin policy.')
      }
      setMessage(status === 'dismissed' ? 'Flag dismissed; the content is approved.' : status === 'actioned' ? 'Content hidden after review.' : 'Case moved to review.')
      await loadQueue()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the decision.') }
    finally { setBusy(false) }
  }

  const issueWarning = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected || !selected.user_id || !warningReason.trim() || !isAdmin || !adminView) return
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(`${endpoint}/rest/v1/user_warnings`, {
        method: 'POST', headers: { ...headers(), Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: selected.user_id, reason: warningReason.trim(), policy_area: warningArea, related_queue_id: selected.id, issued_by: userId }),
      })
      if (!response.ok) throw new Error('Warning was not issued. Only a verified admin can issue warnings to linked accounts.')
      setWarningReason('')
      setMessage('Warning issued to the linked account.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Warning was not issued.') }
    finally { setBusy(false) }
  }

  const issueManualWarning = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const username = targetUsername.trim()
    if (!username || warningReason.trim().length < 3 || !isAdmin || !adminView || !userId) return
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(endpoint + '/rest/v1/profiles?select=id,username&username=eq.' + encodeURIComponent(username) + '&limit=2', { headers: headers(), cache: 'no-store' })
      if (!response.ok) throw new Error('Could not verify that username. No warning was issued.')
      const profiles = await response.json() as Array<{ id: string; username: string }>
      if (profiles.length !== 1) throw new Error(profiles.length ? 'Username lookup was ambiguous. No warning was issued.' : 'No matching registered username was found. No warning was issued.')
      const issueResponse = await fetch(endpoint + '/rest/v1/user_warnings', {
        method: 'POST', headers: { ...headers(), Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: profiles[0].id, reason: warningReason.trim(), policy_area: warningArea, issued_by: userId }),
      })
      if (!issueResponse.ok) throw new Error('Warning was not issued. Verify administrator permissions.')
      setMessage('Warning issued to @' + profiles[0].username + '.')
      setWarningReason('')
      setTargetUsername('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Warning was not issued.') }
    finally { setBusy(false) }
  }
  const acknowledgeWarning = async (warning: Warning) => {
    if (!userId || !accessToken || warning.acknowledged_at) return
    const response = await fetch(`${endpoint}/rest/v1/user_warnings?id=eq.${encodeURIComponent(warning.id)}&user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH', headers: { ...headers(), Prefer: 'return=minimal' },
      body: JSON.stringify({ acknowledged_at: new Date().toISOString() }),
    })
    if (response.ok) setWarnings(current => current.map(item => item.id === warning.id ? { ...item, acknowledged_at: new Date().toISOString() } : item))
  }

  return <>
    {!adminView && warnings.some(item => !item.acknowledged_at) && <section className="moderation-warning-notice" role="status">
      <div><strong>UFLMB community notice</strong><p>You have {warnings.filter(item => !item.acknowledged_at).length} moderator warning(s) to review.</p></div>
      {warnings.filter(item => !item.acknowledged_at).map(item => <article key={item.id}><p>{item.reason}</p><small>{item.policy_area.replace('_', ' ')} · {dateLabel(item.created_at)}</small><button type="button" onClick={() => void acknowledgeWarning(item)}>Acknowledge</button></article>)}
    </section>}
    {adminView && isAdmin && <section className="admin-panel moderation-management-panel">
      <div className="section-heading"><div><p className="eyebrow">COMMUNITY SAFETY</p><h2>Moderation & warnings</h2></div><button type="button" className="button secondary" onClick={() => void loadQueue()} disabled={busy}>Refresh</button></div>
      <p className="muted-copy">Automated flags are review signals, not proof of a violation. Review context before taking action. Content hidden by moderation can be restored by dismissing its flag.</p>
      <div className="moderation-overview"><div><strong>{queue.filter(item => item.status === 'pending').length}</strong><span>Pending review</span></div><div><strong>{queue.filter(item => item.status === 'reviewing').length}</strong><span>In review</span></div><div><strong>{queue.filter(item => item.status === 'actioned').length}</strong><span>Actioned</span></div><div><strong>{queue.filter(item => item.status === 'dismissed').length}</strong><span>Dismissed</span></div></div>
      {error && <p className="moderation-error" role="alert">{error}</p>}{message && <p className="moderation-success" role="status">{message}</p>}
      <form className="moderation-manual-warning" onSubmit={issueManualWarning}>
        <h3>Issue a warning to a registered member</h3>
        <p className="muted-copy">Use an exact registered username after reviewing the context. This does not rely on a public display name.</p>
        <div className="moderation-manual-warning-fields"><label>Exact username<input value={targetUsername} onChange={event => setTargetUsername(event.target.value)} maxLength={24} minLength={3} pattern="[A-Za-z0-9_]{3,24}" required placeholder="Member username" /></label>
          <label>Policy area<select value={warningArea} onChange={event => setWarningArea(event.target.value)}><option value="community_review">Community review</option><option value="username">Username</option><option value="harassment">Harassment</option><option value="spam">Spam</option><option value="impersonation">Impersonation</option><option value="other">Other</option></select></label>
          <label>Reason<textarea value={warningReason} onChange={event => setWarningReason(event.target.value)} minLength={3} maxLength={500} rows={2} required placeholder="Explain the rule and how to correct the issue…" /></label>
        </div>
        <button type="submit" className="button primary" disabled={busy || warningReason.trim().length < 3 || targetUsername.trim().length < 3}>Issue warning</button>
      </form>
      <div className="moderation-workspace"><aside className="moderation-list"><h3>Flagged content</h3>{queue.length === 0 ? <p className="muted-copy">{busy ? 'Loading moderation queue…' : 'No flagged content. New community reviews will be checked automatically.'}</p> : queue.map(item => <button type="button" key={item.id} className={selectedId === item.id ? 'moderation-case active' : 'moderation-case'} onClick={() => { setSelectedId(item.id); setNote(item.admin_note || ''); setMessage(''); setError('') }}><strong>{item.display_name}</strong><span>{item.content_type.replace('_', ' ')} · {item.status.replace('_', ' ')}</span><small>{item.reason_codes.join(', ') || 'Needs manual review'}</small><time>{dateLabel(item.created_at)}</time></button>)}</aside>
        <div className="moderation-detail">{!selected ? <p className="muted-copy">Select a flagged item to review its context.</p> : <><div className="moderation-detail-heading"><div><h3>{selected.display_name}</h3><small>{selected.content_type.replace('_', ' ')} · {selected.status.replace('_', ' ')}</small></div><span className="moderation-status">{selected.status.replace('_', ' ')}</span></div><blockquote>{selected.content_excerpt || '(No text excerpt)'}</blockquote><p className="moderation-reasons">Signals: {selected.reason_codes.join(', ') || 'Manual review'}</p><label>Moderator note<textarea rows={3} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder="Record the context and reason for your decision…" /></label><div className="moderation-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => void updateQueue('reviewing')}>Mark in review</button><button type="button" className="button secondary" disabled={busy} onClick={() => void updateQueue('dismissed')}>Dismiss flag</button><button type="button" className="button danger" disabled={busy} onClick={() => void updateQueue('actioned')}>Hide content</button></div>
          {selected.user_id ? <form className="moderation-warning-form" onSubmit={issueWarning}><h4>Issue user warning</h4><label>Policy area<select value={warningArea} onChange={event => setWarningArea(event.target.value)}><option value="community_review">Community review</option><option value="username">Username</option><option value="harassment">Harassment</option><option value="spam">Spam</option><option value="impersonation">Impersonation</option><option value="other">Other</option></select></label><label>Reason<textarea value={warningReason} onChange={event => setWarningReason(event.target.value)} minLength={3} maxLength={500} rows={3} required placeholder="Explain the rule and how to correct the issue…" /></label><button type="submit" className="button primary" disabled={busy || warningReason.trim().length < 3}>Issue warning</button></form> : <p className="moderation-note">This report has no linked signed-in account, so an account warning is unavailable. Do not infer identity from a display name.</p>}
        </>}</div></div>
    </section>}
  </>
}
