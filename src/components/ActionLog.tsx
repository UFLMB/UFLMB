import { useEffect, useMemo, useState } from 'react'
import './ActionLog.css'

type LogEntry = {
  id: string
  event_key: string
  category: string
  actor_user_id: string | null
  actor_username: string | null
  target_user_id: string | null
  target_username: string | null
  details: Record<string, unknown> | null
  outcome: 'success' | 'failed' | 'pending'
  created_at: string
}
type Props = { accessToken?: string }
const endpoint = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const labels: Record<string, string> = {
  ACCOUNT_CREATED: 'Account created', ACCOUNT_DELETED: 'Account deleted', ACCOUNT_BANNED: 'Account banned & deleted',
  ACCOUNT_SUSPENDED: 'Account suspended', ACCOUNT_RESTORED: 'Suspension lifted', ACCOUNT_PROFILE_REMOVED: 'Profile removed',
  PROFILE_UPDATED: 'Profile updated', WARNING_ISSUED: 'Warning issued', WARNING_REMOVED: 'Warning removed',
  WARNING_UPDATED: 'Warning updated', LOGIN_SUCCESS: 'Successful sign-in', SESSION_RESTORED: 'Session restored', LOGOUT: 'Signed out', PASSWORD_CHANGED: 'Password changed',
  ADMIN_ACCESS_GRANTED: 'Admin access granted', ADMIN_ACCESS_REVOKED: 'Admin access revoked', APP_STATE_UPDATE: 'Shared application state updated',
  REVIEW_SUBMITTED: 'Review submitted', REVIEW_UPDATED: 'Review updated', REVIEW_DELETED: 'Review deleted',
  MODERATION_CASE_CREATED: 'Moderation case created', MODERATION_CASE_UPDATED: 'Moderation case updated',
  SUPPORT_CONVERSATION_CREATED: 'Support conversation opened', SUPPORT_CONVERSATION_UPDATED: 'Support conversation updated',
  SUPPORT_CONVERSATION_DELETED: 'Support conversation deleted', SUPPORT_MESSAGE_SENT: 'Support message sent',
  SUPPORT_MESSAGE_DELETED: 'Support message deleted', CARD_CREATED: 'Player card created', CARD_UPDATED: 'Player card updated',
  CARD_DELETED: 'Player card deleted', PREFERENCES_UPDATED: 'User preferences updated', SITE_SETTINGS_UPDATED: 'Site settings updated',
}
const eventLabel = (key: string) => labels[key] || key.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
const dateLabel = (value: string) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

export default function ActionLog({ accessToken }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [count, setCount] = useState(0)
  const [offset, setOffset] = useState(0)
  const [category, setCategory] = useState('all')
  const [outcome, setOutcome] = useState('all')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const load = async (reset: boolean) => {
    if (!endpoint || !anonKey || !accessToken || busy) return
    setBusy(true); setError('')
    const nextOffset = reset ? 0 : offset
    try {
      const response = await fetch(endpoint + '/functions/v1/account-moderation', {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list_action_logs', limit: 50, offset: nextOffset, category, outcome }),
        cache: 'no-store',
      })
      const result = await response.json() as { logs?: LogEntry[]; count?: number; error?: string }
      if (!response.ok || !Array.isArray(result.logs)) throw new Error(result.error || 'The action log could not be loaded.')
      setLogs(current => reset ? result.logs! : [...current, ...result.logs!])
      setCount(result.count ?? 0)
      setOffset(nextOffset + result.logs.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The action log could not be loaded.')
    } finally { setBusy(false) }
  }

  useEffect(() => { void load(true) }, [accessToken, category, outcome, refreshKey])

  const visibleLogs = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return logs
    return logs.filter(log => [
      log.event_key, eventLabel(log.event_key), log.actor_username, log.target_username,
      log.actor_user_id, log.target_user_id, log.details?.reason, JSON.stringify(log.details ?? {}),
    ].some(value => String(value ?? '').toLowerCase().includes(term)))
  }, [logs, search])

  return <section className="admin-panel action-log-panel">
    <div className="section-heading">
      <div><p className="eyebrow">SECURITY & ACCOUNTABILITY</p><h2>Action log</h2></div>
      <span className="count-label">{count.toLocaleString()} events</span>
    </div>
    <p className="muted-copy">A central, time-ordered audit record of account, moderation, community, support and database activity. Private message contents, passwords and access tokens are never displayed here.</p>
    <div className="action-log-toolbar">
      <label className="action-log-search"><span aria-hidden="true">⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search loaded events, users or IDs…" aria-label="Search action log" /></label>
      <label>Category<select value={category} onChange={event => { setCategory(event.target.value); setOffset(0) }}><option value="all">All categories</option><option value="auth">Authentication</option><option value="profile">Profiles</option><option value="moderation">Moderation</option><option value="community">Community</option><option value="support">Support</option><option value="content">Content</option><option value="system">System</option></select></label>
      <label>Outcome<select value={outcome} onChange={event => { setOutcome(event.target.value); setOffset(0) }}><option value="all">All outcomes</option><option value="success">Successful</option><option value="failed">Failed</option><option value="pending">Pending</option></select></label>
      <button type="button" className="button secondary" onClick={() => setRefreshKey(value => value + 1)} disabled={busy}>↻ Refresh</button>
    </div>
    {error && <p className="action-log-error" role="alert">{error}</p>}
    <div className="action-log-list" aria-live="polite">
      {visibleLogs.length === 0 && <div className="action-log-empty">{busy ? 'Loading audit events…' : 'No matching events were found.'}</div>}
      {visibleLogs.map(log => <article className={log.event_key === 'ACCOUNT_BANNED' ? 'action-log-entry banned' : 'action-log-entry'} key={log.id}>
        <div className="action-log-entry-main">
          <div className="action-log-entry-title"><strong>{eventLabel(log.event_key)}</strong><span className={'action-log-outcome ' + log.outcome}>{log.outcome}</span></div>
          <p>{log.actor_username ? <><b>@{log.actor_username}</b> </> : 'System '}<span className="action-log-verb">{log.event_key === 'ACCOUNT_BANNED' ? 'permanently banned and deleted' : log.event_key === 'ACCOUNT_DELETED' ? 'deleted their account' : 'performed this action'}</span>{log.target_username && log.target_username !== log.actor_username ? <> · Target: <b>@{log.target_username}</b></> : ''}</p>
          {typeof log.details?.reason === 'string' && <small className="action-log-reason">Reason: {log.details.reason}</small>}
          <small className="action-log-meta">{log.category} · {dateLabel(log.created_at)} · Event {log.id.slice(0, 8)}</small>
          <details className="action-log-details"><summary>Event details &amp; identifiers</summary><dl>
            {Object.entries(log.details ?? {}).filter(([key, value]) => key !== 'reason' && value !== null && value !== '').map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd></div>)}
            {log.actor_user_id && <div><dt>Actor UUID</dt><dd>{log.actor_user_id}</dd></div>}
            {log.target_user_id && <div><dt>Target UUID</dt><dd>{log.target_user_id}</dd></div>}
          </dl></details>
        </div>
      </article>)}
    </div>
    {offset < count && <div className="action-log-more"><button type="button" className="button secondary" onClick={() => void load(false)} disabled={busy}>{busy ? 'Loading…' : 'Load more events'}</button></div>}
    <small className="action-log-footnote">Showing {visibleLogs.length.toLocaleString()} loaded entries · {count.toLocaleString()} total events for selected filters · Newest first</small>
  </section>
}
