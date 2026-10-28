import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './SupportChat.css'

type StoredSession = { access_token?: string; user?: { id?: string } }
type Conversation = {
  id: string
  user_id: string
  subject: string
  category: string
  status: 'open' | 'in_progress' | 'resolved'
  created_at: string
  updated_at: string
}
type Message = {
  id: string
  conversation_id: string
  sender_id: string
  sender_role: 'user' | 'admin'
  body: string
  created_at: string
}

const endpoint = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const readSession = (): StoredSession | null => {
  try {
    const raw = sessionStorage.getItem('uflmb.auth.session.v1')
    const value = raw ? JSON.parse(raw) as StoredSession : null
    return value?.access_token && value.user?.id ? value : null
  } catch {
    return null
  }
}
const friendlyDate = (value: string) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

export default function SupportChat() {
  const [open, setOpen] = useState(false)
  const [adminView, setAdminView] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('general')
  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const session = readSession()
  const userId = session?.user?.id || ''
  const token = session?.access_token || ''
  const selected = conversations.find(item => item.id === selectedId) || null

  const requestHeaders = useCallback((extra: Record<string, string> = {}) => ({
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extra,
  }), [token])

  const loadConversations = useCallback(async (preferId?: string) => {
    if (!endpoint || !anonKey || !token || !userId) {
      setConversations([])
      setSelectedId('')
      setMessages([])
      return
    }
    setBusy(true)
    setError('')
    try {
      const filter = adminView && isAdmin ? '' : `&user_id=eq.${encodeURIComponent(userId)}`
      const response = await fetch(`${endpoint}/rest/v1/support_conversations?select=*&order=updated_at.desc${filter}`, {
        headers: requestHeaders(),
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Support conversations could not be loaded.')
      const rows = await response.json() as Conversation[]
      setConversations(rows)
      setSelectedId(current => {
        const desired = preferId || current
        return desired && rows.some(item => item.id === desired) ? desired : rows[0]?.id || ''
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load support conversations.')
    } finally {
      setBusy(false)
    }
  }, [adminView, isAdmin, requestHeaders, token, userId])

  useEffect(() => {
    setIsAdmin(false)
    setAdminView(false)
    setConversations([])
    setSelectedId('')
    setMessages([])
    setError('')
    setNotice('')
  }, [token, userId])

  useEffect(() => {
    if (!open || !token || !userId || !endpoint || !anonKey) return
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(`${endpoint}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(userId)}`, {
          headers: requestHeaders(),
          cache: 'no-store',
        })
        const rows = response.ok ? await response.json() as Array<{ user_id: string }> : []
        if (!cancelled) setIsAdmin(rows.some(row => row.user_id === userId))
      } catch {
        if (!cancelled) setIsAdmin(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, token, userId, requestHeaders])

  useEffect(() => {
    if (open) void loadConversations()
  }, [open, loadConversations])

  useEffect(() => {
    if (!open || !selectedId || !token || !userId) {
      setMessages([])
      return
    }
    setMessages([])
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(`${endpoint}/rest/v1/support_messages?select=*&conversation_id=eq.${encodeURIComponent(selectedId)}&order=created_at.asc`, {
          headers: requestHeaders(),
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('Messages could not be loaded.')
        const rows = await response.json() as Message[]
        if (!cancelled) setMessages(rows)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Messages could not be loaded.')
      }
    })()
    return () => { cancelled = true }
  }, [open, selectedId, token, userId, requestHeaders])

  const createConversation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token || !userId || creating) return
    const cleanSubject = subject.trim()
    if (cleanSubject.length < 3 || cleanSubject.length > 120) {
      setError('Please enter a subject between 3 and 120 characters.')
      return
    }
    setCreating(true)
    setError('')
    try {
      const response = await fetch(`${endpoint}/rest/v1/support_conversations?select=*`, {
        method: 'POST',
        headers: requestHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify({ user_id: userId, subject: cleanSubject, category }),
      })
      if (!response.ok) throw new Error('Could not open a support conversation. Please try again.')
      const rows = await response.json() as Conversation[]
      if (!rows[0]) throw new Error('The support request was not confirmed by the database.')
      setSubject('')
      setCategory('general')
      setNotice('Support request created.')
      await loadConversations(rows[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create support request.')
    } finally {
      setCreating(false)
    }
  }

  const sendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body || body.length > 4000 || !selected || !token || !userId) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${endpoint}/rest/v1/support_messages?select=*`, {
        method: 'POST',
        headers: requestHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify({
          conversation_id: selected.id,
          sender_id: userId,
          sender_role: isAdmin && adminView ? 'admin' : 'user',
          body,
        }),
      })
      if (!response.ok) throw new Error('Message was not sent. Check your connection and try again.')
      const rows = await response.json() as Message[]
      if (!rows[0]) throw new Error('The database did not confirm the message.')
      setMessages(current => [...current, rows[0]])
      setDraft('')
      setNotice('Message sent.')
      await loadConversations(selected.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Message was not sent.')
    } finally {
      setBusy(false)
    }
  }

  const changeStatus = async (status: Conversation['status']) => {
    if (!selected || !isAdmin || !adminView) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${endpoint}/rest/v1/support_conversations?id=eq.${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        headers: requestHeaders({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
      })
      if (!response.ok) throw new Error('Could not update the conversation status.')
      setConversations(current => current.map(item => item.id === selected.id ? { ...item, status } : item))
      setNotice('Conversation status updated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the status.')
    } finally {
      setBusy(false)
    }
  }

  return <>
    <button className="support-launcher" type="button" onClick={() => { setOpen(value => !value); setError(''); setNotice('') }} aria-expanded={open} aria-controls="uflmb-support-panel">
      <span aria-hidden="true">✉</span> Support
    </button>
    {open && <section className="support-panel" id="uflmb-support-panel" role="dialog" aria-modal="false" aria-label="UFLMB customer support">
      <header className="support-header">
        <div><p className="support-eyebrow">UFLMB HELP DESK</p><h2>{adminView && isAdmin ? 'Support inbox' : 'How can we help?'}</h2></div>
        <button type="button" className="support-close" onClick={() => setOpen(false)} aria-label="Close support">×</button>
      </header>
      {!token || !userId ? <div className="support-empty"><strong>Sign in to contact support</strong><p>Your support conversations are private to your account.</p></div> : <>
        {isAdmin && <div className="support-mode-switch"><button type="button" className={!adminView ? 'active' : ''} onClick={() => { setAdminView(false); setSelectedId(''); setNotice(''); setError('') }}>My requests</button><button type="button" className={adminView ? 'active' : ''} onClick={() => { setAdminView(true); setSelectedId(''); setNotice(''); setError('') }}>Admin inbox</button></div>}
        {!adminView && <form className="support-new-form" onSubmit={createConversation}>
          <label>New request <input value={subject} onChange={event => setSubject(event.target.value)} maxLength={120} minLength={3} placeholder="Briefly describe the issue" required /></label>
          <label>Category <select value={category} onChange={event => setCategory(event.target.value)}><option value="general">General question</option><option value="bug">Report a bug</option><option value="account">Account help</option><option value="feedback">Feedback</option></select></label>
          <button className="support-primary" type="submit" disabled={creating}>{creating ? 'Opening…' : 'Open request'}</button>
        </form>}
        <div className="support-workspace">
          <aside className="support-conversation-list" aria-label="Conversations">
            <div className="support-list-heading">{adminView ? 'All requests' : 'Your requests'} <button type="button" onClick={() => void loadConversations()} disabled={busy} aria-label="Refresh conversations">↻</button></div>
            {conversations.length === 0 ? <p className="support-muted">{busy ? 'Loading…' : adminView ? 'No support requests yet.' : 'Your requests will appear here.'}</p> : conversations.map(item => <button type="button" key={item.id} className={selectedId === item.id ? 'support-conversation active' : 'support-conversation'} onClick={() => { setSelectedId(item.id); setError(''); setNotice('') }}>
              <strong>{item.subject}</strong><span>{item.category.replace('_', ' ')} · {item.status.replace('_', ' ')}</span><small>{friendlyDate(item.updated_at)}</small>
            </button>)}
          </aside>
          <div className="support-thread">
            {!selected ? <div className="support-empty"><p>Select a conversation to view messages.</p></div> : <>
              <div className="support-thread-heading"><div><strong>{selected.subject}</strong><small>{selected.category.replace('_', ' ')} · {selected.status.replace('_', ' ')}</small></div>
                {adminView && isAdmin && <select aria-label="Conversation status" value={selected.status} onChange={event => void changeStatus(event.target.value as Conversation['status'])} disabled={busy}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select>}
              </div>
              <div className="support-messages" aria-live="polite">
                {messages.length === 0 ? <p className="support-muted">No messages yet. Send a message below.</p> : messages.map(message => <article key={message.id} className={message.sender_role === 'admin' ? 'support-message support-message-admin' : 'support-message'}>
                  <div className="support-message-meta"><strong>{message.sender_role === 'admin' ? 'UFLMB Support' : message.sender_id === userId ? 'You' : 'Member'}</strong><time>{friendlyDate(message.created_at)}</time></div>
                  <p>{message.body}</p>
                </article>)}
              </div>
              <form className="support-reply-form" onSubmit={sendMessage}><label className="support-sr-only" htmlFor="support-message-input">Message</label><textarea id="support-message-input" value={draft} onChange={event => setDraft(event.target.value)} maxLength={4000} rows={3} placeholder="Write your message…" required /><button className="support-primary" type="submit" disabled={busy || !draft.trim()}>{busy ? 'Sending…' : 'Send'}</button></form>
            </>}
          </div>
        </div>
      </>}
      {notice && <p className="support-notice" role="status">{notice}</p>}
      {error && <p className="support-error" role="alert">{error}</p>}
      <p className="support-privacy-note">Support messages are private to the requester and authorized administrators. They are not automatically used to issue community warnings.</p>
    </section>}
  </>
}
