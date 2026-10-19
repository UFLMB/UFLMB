import { useState } from 'react'
import type { PlayerCard } from '../types/card'

const baseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const enabled = Boolean(baseUrl && anonKey)

type Props = {
  cards: PlayerCard[]
  onLoad: (cards: PlayerCard[]) => void
  onMessage: (message: string) => void
}

type DbCard = {
  id: string; player_name: string; overall_rating: number; positions: string[]; nation: string
  card_name?: string | null; club?: string | null; stats?: Record<string, number> | null
  perks?: string[] | null; image_url?: string | null; source_url: string; verified_at: string
}

const fromDb = (row: DbCard): PlayerCard => ({
  id: row.id, playerName: row.player_name, overallRating: row.overall_rating, positions: row.positions,
  nation: row.nation, ...(row.card_name ? { cardName: row.card_name } : {}),
  ...(row.club ? { club: row.club } : {}), ...(row.stats && Object.keys(row.stats).length ? { stats: row.stats } : {}),
  ...(row.perks?.length ? { perks: row.perks } : {}), ...(row.image_url ? { imageUrl: row.image_url } : {}),
  sourceUrl: row.source_url, verifiedAt: row.verified_at,
})
const toDb = (card: PlayerCard) => ({
  id: card.id, player_name: card.playerName, overall_rating: card.overallRating, positions: card.positions,
  nation: card.nation, card_name: card.cardName ?? null, club: card.club ?? null, stats: card.stats ?? {},
  perks: card.perks ?? [], image_url: card.imageUrl ?? null, source_url: card.sourceUrl,
  verified_at: card.verifiedAt, is_demo: card.id.startsWith('uflmb-demo-'), updated_at: new Date().toISOString(),
})

export default function SharedDatabasePanel({ cards, onLoad, onMessage }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState(() => { try { return localStorage.getItem('uflmb.supabase.accessToken') || '' } catch { return '' } })
  const [busy, setBusy] = useState(false)
  const [loadedIds, setLoadedIds] = useState<string[] | null>(null)

  const signIn = async () => {
    if (!enabled) { onMessage('Shared database is not configured. Follow supabase/SETUP.md first.'); return }
    if (!email.trim() || !password) { onMessage('Enter the Supabase admin email and password.'); return }
    setBusy(true)
    try {
      const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await response.json()
      if (!response.ok || !data.access_token) throw new Error(data.msg || data.message || 'Sign-in failed.')
      localStorage.setItem('uflmb.supabase.accessToken', data.access_token)
      setToken(data.access_token)
      setPassword('')
      onMessage('Signed in to the shared database. Load the shared records before publishing changes.')
    } catch (error) { onMessage(error instanceof Error ? error.message : 'Sign-in failed.') }
    finally { setBusy(false) }
  }

  const signOut = () => {
    localStorage.removeItem('uflmb.supabase.accessToken')
    setToken('')
    setLoadedIds(null)
    onMessage('Signed out of the shared database. Local card editing remains available.')
  }

  const loadShared = async () => {
    if (!enabled) { onMessage('Shared database is not configured. Follow supabase/SETUP.md first.'); return }
    setBusy(true)
    try {
      const response = await fetch(`${baseUrl}/rest/v1/cards?select=*&order=player_name.asc`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${token || anonKey}` },
      })
      if (!response.ok) throw new Error('Could not read shared cards. Check that the SQL schema was installed.')
      const rows = await response.json() as DbCard[]
      const parsed = rows.filter(row => !row.id.startsWith('uflmb-demo-')).map(fromDb)
      setLoadedIds(parsed.map(card => card.id))
      onLoad(parsed)
      onMessage(`Loaded ${parsed.length} shared card record(s). Demo fixtures in this browser were preserved.`)
    } catch (error) { onMessage(error instanceof Error ? error.message : 'Could not load shared records.') }
    finally { setBusy(false) }
  }

  const publish = async () => {
    if (!enabled) { onMessage('Shared database is not configured. Follow supabase/SETUP.md first.'); return }
    if (!token) { onMessage('Sign in with an authenticated Supabase account before publishing card edits.'); return }
    if (loadedIds === null) { onMessage('Load shared records first. This safety check prevents accidental overwrites before comparing the current database.'); return }
    if (!window.confirm('Publish the current non-demo card collection to the shared database? Records removed locally since the last load will also be deleted remotely. Demo fixtures are excluded.')) return
    setBusy(true)
    try {
      const realCards = cards.filter(card => !card.id.startsWith('uflmb-demo-'))
      if (realCards.length) {
        const upsert = await fetch(`${baseUrl}/rest/v1/cards?on_conflict=id`, {
          method: 'POST',
          headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(realCards.map(toDb)),
        })
        if (!upsert.ok) throw new Error('Publishing failed. Your account may not have authenticated card-write permissions.')
      }
      const currentIds = new Set(realCards.map(card => card.id))
      const removedIds = loadedIds.filter(id => !currentIds.has(id))
      for (const id of removedIds) {
        const response = await fetch(`${baseUrl}/rest/v1/cards?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE', headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
        })
        if (!response.ok) throw new Error('Some removed records could not be deleted from the shared database.')
      }
      setLoadedIds(realCards.map(card => card.id))
      onMessage(`Published ${realCards.length} non-demo card(s) to the shared database; removed ${removedIds.length} remote record(s). Demo fixtures were not uploaded.`)
    } catch (error) { onMessage(error instanceof Error ? error.message : 'Publishing failed.') }
    finally { setBusy(false) }
  }

  return <section className="admin-panel tools-panel shared-database-panel">
    <p className="eyebrow">SHARED DATABASE</p><h2>Shared card database</h2>
    <p className="muted-copy">Once configured, public visitors can read shared cards and community reviews. Signed-in admins can publish card edits from this manager. Demo fixtures are always excluded from publishing.</p>
    {!enabled ? <div className="notice warning">Backend not connected yet. Create the Supabase project, run the SQL schema, and add the two public build variables as described in <code>supabase/SETUP.md</code>.</div> : <>
      <div className="shared-db-status"><span className={token ? 'status-dot' : 'status-dot status-dot-off'} />{token ? 'Admin session token saved in this browser' : 'Read-only mode — sign in to publish edits'}</div>
      {!token && <div className="card-form shared-login-form"><label>Admin email<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" /></label><label>Admin password<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label><button className="button primary" type="button" disabled={busy} onClick={() => void signIn()}>{busy ? 'Connecting…' : 'Sign in'}</button></div>}
      {token && <div className="form-actions"><button className="button secondary" type="button" disabled={busy} onClick={signOut}>Sign out</button></div>}
      <div className="form-actions"><button className="button secondary" type="button" disabled={busy} onClick={() => void loadShared()}>{busy ? 'Working…' : 'Load shared records'}</button><button className="button primary" type="button" disabled={busy || !token || loadedIds === null} onClick={() => void publish()}>Publish local edits</button></div>
      <p className="field-help">Safe workflow: load the shared records first, make edits in Card manager, then publish. The publish step synchronizes the non-demo records and applies deletions confirmed by the loaded snapshot.</p>
    </>}
  </section>
}
