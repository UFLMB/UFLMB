import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './SupportChat.css'

type Session = { access_token?: string; user?: { id?: string; is_anonymous?: boolean } }
type Conversation = {
  id: string; user_id: string; subject: string; category: string
  status: 'open' | 'in_progress' | 'resolved'; created_at: string; updated_at: string
}
type Message = {
  id: string; conversation_id: string; sender_id: string
  sender_role: 'user' | 'admin'; body: string; created_at: string
}
type AdminState = {
  conversation_id: string; is_archived: boolean; is_starred: boolean; read_at: string | null
}
const endpoint = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const friendlyDate = (value: string) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
const readSession = (): Session | null => {
  try {
    const raw = sessionStorage.getItem('uflmb.auth.session.v1')
    const value = raw ? JSON.parse(raw) as Session : null
    return value?.access_token && value.user?.id && value.user.is_anonymous !== true ? value : null
  } catch { return null }
}

export default function AdminSupportInbox() {
  const session = readSession()
  const userId = session?.user?.id || ''
  const token = session?.access_token || ''
  const [isAdmin, setIsAdmin] = useState(false)
  const [verified, setVerified] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [adminStates, setAdminStates] = useState<AdminState[]>([])
  const [latestUserMessageAt, setLatestUserMessageAt] = useState<Record<string, string>>({})
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [folder, setFolder] = useState<'inbox' | 'archive'>('inbox')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const selected = conversations.find(item => item.id === selectedId) || null
  const selectedState = adminStates.find(item => item.conversation_id === selectedId)
  const headers = useCallback((extra: Record<string, string> = {}) => ({
    apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra,
  }), [token])
  const stateFor = useCallback((id: string): AdminState => adminStates.find(item => item.conversation_id === id) || {
    conversation_id: id, is_archived: false, is_starred: false, read_at: null,
  }, [adminStates])
  const unreadFor = useCallback((conversation: Conversation) => {
    const readAt = stateFor(conversation.id).read_at
    const latest = latestUserMessageAt[conversation.id]
    return Boolean(latest && (!readAt || new Date(latest).getTime() > new Date(readAt).getTime()))
  }, [latestUserMessageAt, stateFor])

  const saveState = useCallback(async (id: string, patch: Partial<Pick<AdminState, 'is_archived' | 'is_starred' | 'read_at'>>) => {
    // Insert the default row without UPDATE-on-conflict. The database keeps
    // the primary key immutable and grants UPDATE only on marker columns.
    const insertResponse = await fetch(`${endpoint}/rest/v1/support_admin_conversation_state?on_conflict=conversation_id`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=ignore-duplicates,return=minimal' }),
      body: JSON.stringify({ conversation_id: id }),
    })
    if (!insertResponse.ok) {
      const detail = await insertResponse.text().catch(() => '')
      throw new Error(detail || `Could not create the inbox marker (HTTP ${insertResponse.status}).`)
    }

    const updateResponse = await fetch(`${endpoint}/rest/v1/support_admin_conversation_state?conversation_id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    })
    if (!updateResponse.ok) {
      const detail = await updateResponse.text().catch(() => '')
      throw new Error(detail || `Could not update the inbox marker (HTTP ${updateResponse.status}).`)
    }
    const updatedRows = await updateResponse.json().catch(() => [])
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
      throw new Error('The inbox marker was not updated. Verify administrator permissions and try again.')
    }
    setAdminStates(current => {
      const existing = current.find(item => item.conversation_id === id)
      const next: AdminState = { conversation_id: id, is_archived: false, is_starred: false, read_at: null, ...existing, ...patch }
      return existing ? current.map(item => item.conversation_id === id ? next : item) : [...current, next]
    })
  }, [headers])

  const loadInbox = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const [conversationResponse, stateResponse, activityResponse] = await Promise.all([
        fetch(`${endpoint}/rest/v1/support_conversations?select=*&order=updated_at.desc`, { headers: headers(), cache: 'no-store' }),
        fetch(`${endpoint}/rest/v1/support_admin_conversation_state?select=*`, { headers: headers(), cache: 'no-store' }),
        fetch(`${endpoint}/rest/v1/support_messages?select=conversation_id,created_at&sender_role=eq.user&order=created_at.desc&limit=1000`, { headers: headers(), cache: 'no-store' }),
      ])
      if (!conversationResponse.ok || !stateResponse.ok || !activityResponse.ok) throw new Error('The support inbox could not be loaded.')
      const [rows, states, activity] = await Promise.all([conversationResponse.json(), stateResponse.json(), activityResponse.json()]) as [Conversation[], AdminState[], Array<{ conversation_id: string; created_at: string }>]
      const latest = activity.reduce<Record<string, string>>((map, item) => {
        if (!map[item.conversation_id] || new Date(item.created_at).getTime() > new Date(map[item.conversation_id]).getTime()) map[item.conversation_id] = item.created_at
        return map
      }, {})
      setConversations(rows)
      setAdminStates(states)
      setLatestUserMessageAt(latest)
      setSelectedId(current => current && rows.some(row => row.id === current) ? current : rows[0]?.id || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The support inbox could not be loaded.')
    } finally { setBusy(false) }
  }, [headers])

  useEffect(() => {
    let cancelled = false
    if (!token || !userId || !endpoint || !anonKey) { setVerified(true); setIsAdmin(false); return }
    void (async () => {
      try {
        const response = await fetch(`${endpoint}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(userId)}`, {
          headers: headers(), cache: 'no-store',
        })
        const rows = response.ok ? await response.json() as Array<{ user_id: string }> : []
        if (!cancelled) { setIsAdmin(rows.some(row => row.user_id === userId)); setVerified(true) }
      } catch { if (!cancelled) { setIsAdmin(false); setVerified(true) } }
    })()
    return () => { cancelled = true }
  }, [token, userId, headers])

  useEffect(() => { if (isAdmin) void loadInbox() }, [isAdmin, loadInbox])

  useEffect(() => {
    if (!isAdmin || !selectedId) { setMessages([]); return }
    let cancelled = false
    setMessages([])
    void (async () => {
      try {
        const response = await fetch(`${endpoint}/rest/v1/support_messages?select=*&conversation_id=eq.${encodeURIComponent(selectedId)}&order=created_at.asc`, {
          headers: headers(), cache: 'no-store',
        })
        if (!response.ok) throw new Error('Messages could not be loaded.')
        const rows = await response.json() as Message[]
        if (cancelled) return
        setMessages(rows)
        const latestUserMessage = rows.filter(message => message.sender_role === 'user')
          .reduce((latest, message) => Math.max(latest, new Date(message.created_at).getTime()), 0)
        const currentState = adminStates.find(item => item.conversation_id === selectedId)
        if (latestUserMessage && (!currentState?.read_at || latestUserMessage > new Date(currentState.read_at).getTime())) {
          await saveState(selectedId, { read_at: new Date().toISOString() })
        }
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : 'Messages could not be loaded.') }
    })()
    return () => { cancelled = true }
  }, [isAdmin, selectedId, headers, adminStates, saveState])

  const visibleConversations = useMemo(() => conversations.filter(item => {
    const state = stateFor(item.id)
    if (folder === 'archive' ? !state.is_archived : state.is_archived) return false
    const term = query.trim().toLowerCase()
    return !term || [item.subject, item.category, item.status, item.user_id].some(value => value.toLowerCase().includes(term))
  }).sort((a, b) => Number(stateFor(b.id).is_starred) - Number(stateFor(a.id).is_starred) ||
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()), [conversations, folder, query, stateFor])

  useEffect(() => {
    if (selectedId && !visibleConversations.some(item => item.id === selectedId)) setSelectedId(visibleConversations[0]?.id || '')
  }, [selectedId, visibleConversations])

  const toggleMarker = async (key: 'is_starred' | 'is_archived') => {
    if (!selected) return
    setBusy(true); setError(''); setNotice('')
    try {
      await saveState(selected.id, { [key]: !stateFor(selected.id)[key] })
      if (key === 'is_archived') {
        setNotice(folder === 'archive' ? 'Conversation restored to the inbox.' : 'Conversation moved to the archive.')
        setSelectedId('')
      } else setNotice(stateFor(selected.id).is_starred ? 'Conversation unstarred.' : 'Conversation starred.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update the conversation.') }
    finally { setBusy(false) }
  }

  const changeStatus = async (status: Conversation['status']) => {
    if (!selected) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`${endpoint}/rest/v1/support_conversations?id=eq.${encodeURIComponent(selected.id)}`, {
        method: 'PATCH', headers: headers({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
      })
      if (!response.ok) throw new Error('Could not update the conversation status.')
      setConversations(current => current.map(item => item.id === selected.id ? { ...item, status } : item))
      setNotice('Conversation status updated.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update the status.') }
    finally { setBusy(false) }
  }

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body || body.length > 4000 || !selected || !userId || busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`${endpoint}/rest/v1/support_messages?select=*`, {
        method: 'POST', headers: headers({ Prefer: 'return=representation' }),
        body: JSON.stringify({ conversation_id: selected.id, sender_id: userId, sender_role: 'admin', body }),
      })
      if (!response.ok) throw new Error('Message was not sent. Check your connection and try again.')
      const rows = await response.json() as Message[]
      if (!rows[0]) throw new Error('The database did not confirm the message.')
      setMessages(current => [...current, rows[0]])
      setDraft(''); setNotice('Message sent.')
      await loadInbox()
    } catch (err) { setError(err instanceof Error ? err.message : 'Message was not sent.') }
    finally { setBusy(false) }
  }

  if (!token || !userId) return <section className="admin-panel support-admin-panel"><div className="section-heading"><div><p className="eyebrow">UFLMB HELP DESK</p><h2>Support</h2></div></div><div className="support-empty"><strong>Administrator sign-in required</strong><p>Sign in with an authorized administrator account to access support conversations.</p></div></section>
  if (!verified) return <section className="admin-panel support-admin-panel"><div className="section-heading"><div><p className="eyebrow">UFLMB HELP DESK</p><h2>Support</h2></div></div><div className="support-empty"><strong>Verifying administrator access…</strong><p>Checking the trusted administrator allowlist.</p></div></section>
  if (!isAdmin) return <section className="admin-panel support-admin-panel"><div className="section-heading"><div><p className="eyebrow">UFLMB HELP DESK</p><h2>Support</h2></div></div><div className="support-empty"><strong>Administrator access required</strong><p>This inbox is available only to authorized administrators.</p></div></section>

  const unreadCount = conversations.filter(item => !stateFor(item.id).is_archived && unreadFor(item)).length
  const archivedCount = conversations.filter(item => stateFor(item.id).is_archived).length
  const selectedUnread = selected ? messages.some(message => message.sender_role === 'user' &&
    (!selectedState?.read_at || new Date(message.created_at).getTime() > new Date(selectedState.read_at).getTime())) : false

  return <section className="support-panel support-admin-dashboard support-admin-mini" aria-label="Administrator support inbox">
    <header className="support-header"><div><p className="support-eyebrow">UFLMB HELP DESK</p><h2>Support inbox</h2></div>
      <button type="button" className="support-mini-refresh" onClick={() => void loadInbox()} disabled={busy} aria-label="Refresh inbox">↻</button>
    </header>
    <div className="support-mini-toolbar">
      <div className="support-mini-folders" role="tablist" aria-label="Support folders">
        <button type="button" role="tab" aria-selected={folder === 'inbox'} className={folder === 'inbox' ? 'active' : ''} onClick={() => { setFolder('inbox'); setSelectedId(''); setNotice(''); setError('') }}>Inbox <span>{unreadCount}</span></button>
        <button type="button" role="tab" aria-selected={folder === 'archive'} className={folder === 'archive' ? 'active' : ''} onClick={() => { setFolder('archive'); setSelectedId(''); setNotice(''); setError('') }}>Archived <span>{archivedCount}</span></button>
      </div>
      <label className="support-mini-search"><span aria-hidden="true">⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={folder === 'archive' ? 'Search archived…' : 'Search inbox…'} aria-label="Search conversations" /></label>
    </div>
    <div className="support-workspace support-mini-workspace">
      <aside className="support-conversation-list" aria-label={folder === 'archive' ? 'Archived conversations' : 'Inbox conversations'}>
        <div className="support-list-heading">{folder === 'archive' ? 'Archived messages' : 'All conversations'} <span>{visibleConversations.length}</span></div>
        {visibleConversations.length === 0 ? <p className="support-muted">{busy ? 'Loading…' : folder === 'archive' ? 'No archived conversations.' : 'Your inbox is clear.'}</p> :
          visibleConversations.map(item => {
            const state = stateFor(item.id)
            const unread = unreadFor(item)
            return <div key={item.id} className={`support-mini-row ${selectedId === item.id ? 'active' : ''} ${state.is_starred ? 'starred' : ''} ${unread ? 'unread' : ''}`}>
              <button type="button" className="support-mini-open" onClick={() => { setSelectedId(item.id); setError(''); setNotice('') }}>
                <span className={`support-mini-read-dot ${unread ? 'unread' : 'read'}`} aria-label={unread ? 'Unread' : 'Read'}>{unread ? '●' : '✓'}</span>
                <span className="support-mini-row-copy"><strong>{item.subject}</strong><small>{item.category.replace('_', ' ')} · {item.status.replace('_', ' ')}</small><time>{friendlyDate(item.updated_at)}</time></span>
                <span className="support-mini-flags" aria-label={[state.is_starred ? 'Starred' : '', state.is_archived ? 'Archived' : ''].filter(Boolean).join(', ')}>
                  {state.is_starred && <span title="Starred" aria-label="Starred">★</span>}
                  {state.is_archived && <span title="Archived" aria-label="Archived">▣</span>}
                </span>
              </button>
              <button type="button" className={`support-mini-star ${state.is_starred ? 'active' : ''}`} aria-label={state.is_starred ? 'Remove star' : 'Star conversation'} title={state.is_starred ? 'Remove star' : 'Star conversation'} onClick={async () => { setBusy(true); try { await saveState(item.id, { is_starred: !state.is_starred }) } catch (err) { setError(err instanceof Error ? err.message : 'Could not update star.') } finally { setBusy(false) } }}>{state.is_starred ? '★' : '☆'}</button>
              <button type="button" className="support-mini-archive" aria-label={folder === 'archive' ? 'Restore conversation to inbox' : 'Archive conversation'} title={folder === 'archive' ? 'Restore to inbox' : 'Archive conversation'} onClick={async () => { setBusy(true); try { await saveState(item.id, { is_archived: folder !== 'archive' }); if (selectedId === item.id) setSelectedId(''); setNotice(folder === 'archive' ? 'Conversation restored to the inbox.' : 'Conversation moved to the archive.') } catch (err) { setError(err instanceof Error ? err.message : 'Could not archive conversation.') } finally { setBusy(false) } }}>{folder === 'archive' ? '↩' : '▣'}</button>
            </div>
          })}
      </aside>
      <div className="support-thread">
        {!selected ? <div className="support-empty"><strong>{folder === 'archive' ? 'Archived messages' : 'Your inbox'}</strong><p>Select a conversation to read and reply.</p></div> : <>
          <div className="support-thread-heading support-mini-thread-heading">
            <div><strong>{selected.subject}</strong><small>{selected.category.replace('_', ' ')} · {selected.status.replace('_', ' ')}</small>
              <span className="support-mini-thread-flags">{selectedState?.is_starred && <span>★ Starred</span>}{selectedState?.is_archived && <span>▣ Archived</span>}{selectedUnread && <span className="unread-label">● Unread messages</span>}</span>
            </div>
            <div className="support-mini-actions">
              <button type="button" onClick={() => void toggleMarker('is_starred')} disabled={busy} aria-label={selectedState?.is_starred ? 'Remove star' : 'Star conversation'} title={selectedState?.is_starred ? 'Remove star' : 'Star conversation'}>{selectedState?.is_starred ? '★' : '☆'}</button>
              <button type="button" onClick={() => void toggleMarker('is_archived')} disabled={busy}>{folder === 'archive' ? 'Restore to inbox' : 'Archive'}</button>
              <select aria-label="Conversation status" value={selected.status} onChange={event => void changeStatus(event.target.value as Conversation['status'])} disabled={busy}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select>
            </div>
          </div>
          <div className="support-messages" aria-live="polite">
            {messages.length === 0 ? <p className="support-muted">No messages yet. Send a message below.</p> : messages.map(message => {
              const readAt = stateFor(selected.id).read_at
              const read = message.sender_role === 'admin' || Boolean(readAt && new Date(message.created_at).getTime() <= new Date(readAt).getTime())
              return <article key={message.id} className={message.sender_role === 'admin' ? 'support-message support-message-admin' : 'support-message'}>
                <div className="support-message-meta"><strong>{message.sender_role === 'admin' ? 'UFLMB Support' : 'Member'}</strong><time>{friendlyDate(message.created_at)}</time>
                  <span className={`support-mini-message-read ${read ? 'read' : 'unread'}`} title={read ? 'Read' : 'Unread'}>{message.sender_role === 'admin' ? '✓ Sent' : read ? '✓ Read' : '● Unread'}</span>
                </div><p>{message.body}</p>
              </article>
            })}
          </div>
          <form className="support-reply-form" onSubmit={sendMessage}><label className="support-sr-only" htmlFor="support-admin-message-input">Message</label><textarea id="support-admin-message-input" value={draft} onChange={event => setDraft(event.target.value)} maxLength={4000} rows={3} placeholder="Write your reply…" required /><button className="support-primary" type="submit" disabled={busy || !draft.trim()}>{busy ? 'Sending…' : 'Send'}</button></form>
        </>}
      </div>
    </div>
    <div className="support-mini-folderbar"><span>{folder === 'archive' ? 'Archived conversations' : 'Inbox'} · {visibleConversations.length} conversations</span>
      <button type="button" onClick={() => { setFolder(folder === 'archive' ? 'inbox' : 'archive'); setSelectedId(''); setNotice(''); setError('') }}>{folder === 'archive' ? '← Back to inbox' : `Archived messages · ${archivedCount} →`}</button>
    </div>
    {notice && <p className="support-notice" role="status">{notice}</p>}
    {error && <p className="support-error" role="alert">{error}</p>}
  </section>
}
