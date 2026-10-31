import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './NotificationCenter.css'

type NotificationRow = {
  id: string
  title: string
  body: string
  type: string
  created_at: string
  read_at: string | null
  metadata?: Record<string, unknown> | null
}
type Props = {
  userId?: string
  accessToken?: string
  username: string
  isAdmin: boolean
  dashboardOpen: boolean
  menuOpen: boolean
  onUnreadCountChange: (count: number) => void
}
const config = () => ({ url: (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, ''), key: import.meta.env.VITE_SUPABASE_ANON_KEY || '' })
const toastEvent = 'uflmb:toast'
type Toast = { id: number; title: string; message: string; kind: 'success' | 'error' | 'info' }

export default function NotificationCenter({ userId, accessToken, username, isAdmin, dashboardOpen, menuOpen, onUnreadCountChange }: Props) {
  const [items, setItems] = useState<NotificationRow[]>([])
  const [open, setOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [welcome, setWelcome] = useState<NotificationRow[]>([])
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const { url, key } = config()
    if (!url || !key || !accessToken) throw new Error('Notifications are temporarily unavailable.')
    const response = await fetch(url + '/rest/v1/' + path, {
      ...init,
      headers: { apikey: key, Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json', ...(init.headers || {}) },
      cache: 'no-store',
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(detail || 'Notification request failed (' + response.status + ').')
    }
    return response.status === 204 ? null : response.json()
  }, [accessToken])

  const refresh = useCallback(async () => {
    if (!userId || !accessToken) { setItems([]); onUnreadCountChange(0); return }
    setLoading(true)
    try {
      const rows = await request('notifications?select=id,title,body,type,created_at,read_at,metadata&order=created_at.desc') as NotificationRow[]
      setItems(rows)
      onUnreadCountChange(rows.filter(item => !item.read_at).length)
    } catch {
      // Keep the last successfully loaded state; notification failures must not block the app.
    } finally { setLoading(false) }
  }, [userId, accessToken, request, onUnreadCountChange])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { if (menuOpen) void refresh() }, [menuOpen, refresh])

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{ title?: string; message?: string; kind?: Toast['kind'] }>).detail || {}
      const toast: Toast = { id: Date.now() + Math.random(), title: detail.title || (detail.kind === 'error' ? 'Something went wrong' : detail.kind === 'success' ? 'Completed' : 'UFLMB notification'), message: detail.message || '', kind: detail.kind || 'info' }
      setToasts(current => [...current, toast].slice(-4))
      window.setTimeout(() => setToasts(current => current.filter(item => item.id !== toast.id)), 4400)
    }
    window.addEventListener(toastEvent, receive)
    return () => window.removeEventListener(toastEvent, receive)
  }, [])

  useEffect(() => {
    if (!isAdmin || !dashboardOpen || !userId || !accessToken) return
    let cancelled = false
    void (async () => {
      try {
        const state = await request('admin_dashboard_visits?select=last_seen_at&user_id=eq.' + encodeURIComponent(userId) + '&limit=1') as Array<{ last_seen_at: string }>
        const lastSeen = state[0]?.last_seen_at
        const since = lastSeen || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const rows = await request('notifications?select=id,title,body,type,created_at,read_at,metadata&created_at=gt.' + encodeURIComponent(since) + '&order=created_at.desc') as NotificationRow[]
        if (cancelled) return
        if (rows.length) { setWelcome(rows); setWelcomeOpen(true) }
        const now = new Date().toISOString()
        if (state.length) {
          await request('admin_dashboard_visits?user_id=eq.' + encodeURIComponent(userId), { method: 'PATCH', body: JSON.stringify({ last_seen_at: now }) })
        } else {
          await request('admin_dashboard_visits', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: userId, last_seen_at: now }) })
        }
      } catch {
        // The admin dashboard remains available if the optional welcome summary cannot load.
      }
    })()
    return () => { cancelled = true }
  }, [isAdmin, dashboardOpen, userId, accessToken, request])

  const markRead = async (item: NotificationRow) => {
    if (item.read_at) return
    const readAt = new Date().toISOString()
    try {
      await request('notifications?id=eq.' + encodeURIComponent(item.id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ read_at: readAt }) })
      setItems(current => current.map(row => row.id === item.id ? { ...row, read_at: readAt } : row))
      onUnreadCountChange(items.filter(row => row.id !== item.id && !row.read_at).length)
    } catch (error) {
      window.dispatchEvent(new CustomEvent(toastEvent, { detail: { kind: 'error', title: 'Could not mark as read', message: error instanceof Error ? error.message : 'Please try again.' } }))
    }
  }
  const unread = items.filter(item => !item.read_at).length

  return <>
    <button className="account-menu-item notification-menu-trigger" type="button" role="menuitem" aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open) void refresh() }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      <span>Notifications</span>{unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <section className="notification-popover" aria-label="Notification history">
      <header><div><strong>Notifications</strong><small>{unread} unread</small></div><button type="button" onClick={() => void refresh()} aria-label="Refresh notifications" disabled={loading}>↻</button></header>
      <div className="notification-list">
        {items.length === 0 ? <p className="notification-empty">You're all caught up.</p> : items.map(item => <article key={item.id} className={item.read_at ? 'notification-item' : 'notification-item unread'}>
          <button type="button" onClick={() => void markRead(item)} aria-label={item.read_at ? 'Notification read' : 'Mark notification as read'} className="notification-item-main">
            <span className="notification-item-dot" />
            <span className="notification-item-copy"><strong>{item.title}</strong><span>{item.body}</span><time>{new Date(item.created_at).toLocaleString()}</time></span>
          </button>
          {!item.read_at && <button type="button" className="notification-read-action" onClick={() => void markRead(item)}>Mark read</button>}
        </article>)}
      </div>
    </section>}
    {toasts.length > 0 && createPortal(<div className="uflmb-toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map(toast => <div key={toast.id} className={'uflmb-toast ' + toast.kind} role="status">
        <span className="uflmb-toast-icon">{toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '!' : 'i'}</span>
        <span><strong>{toast.title}</strong>{toast.message && <small>{toast.message}</small>}</span>
        <button type="button" aria-label="Dismiss notification" onClick={() => setToasts(current => current.filter(item => item.id !== toast.id))}>×</button>
      </div>)}
    </div>, document.body)}
    {welcomeOpen && createPortal(<div className="admin-welcome-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setWelcomeOpen(false) }}>
      <section className="admin-welcome-modal" role="dialog" aria-modal="true" aria-labelledby="admin-welcome-title">
        <button type="button" className="admin-welcome-close" onClick={() => setWelcomeOpen(false)} aria-label="Close summary">×</button>
        <p className="notification-eyebrow">ADMIN DASHBOARD · ACTIVITY SUMMARY</p>
        <h2 id="admin-welcome-title">Welcome back, {username || 'Admin'}.</h2>
        <p className="admin-welcome-subtitle">{welcome.length} new {welcome.length === 1 ? 'update' : 'updates'} since your last visit.</p>
        <div className="admin-welcome-list">{welcome.map(item => <article key={item.id}><span className="notification-item-dot" /><div><strong>{item.title}</strong><p>{item.body}</p><time>{new Date(item.created_at).toLocaleString()}</time></div></article>)}</div>
        <button type="button" className="admin-welcome-action" onClick={() => setWelcomeOpen(false)}>Continue to dashboard</button>
      </section>
    </div>, document.body)}
  </>
}
