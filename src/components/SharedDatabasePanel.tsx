import { useEffect, useRef, useState } from 'react'
import type { PlayerCard } from '../types/card'

const baseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const enabled = Boolean(baseUrl && anonKey)

type CloudAppState = {
  bookmarkedIds: string[]
  formationId: '4-3-3' | '4-4-2' | '3-5-2'
  squadAssignments: Record<string, string>
  siteBranding: { iconText: string; logoUrl: string; faviconUrl: string; backgroundImageUrls: string[] }
}

type Props = {
  cards: PlayerCard[]
  appState: CloudAppState
  onLoad: (cards: PlayerCard[]) => void
  onLoadAppState: (state: Partial<CloudAppState>) => void
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

const responseMessage = async (response: Response) => {
  try {
    const body = await response.json() as { message?: string; details?: string; hint?: string; msg?: string }
    return body.message || body.msg || body.details || body.hint || `Request failed (HTTP ${response.status}).`
  } catch { return `Request failed (HTTP ${response.status}).` }
}

export default function SharedDatabasePanel({ cards, appState, onLoad, onLoadAppState, onMessage }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState(() => { try { return localStorage.getItem('uflmb.supabase.accessToken') || '' } catch { return '' } })
  const [busy, setBusy] = useState(false)
  const [cloudSaving, setCloudSaving] = useState(false)
  const [cloudSaveStatus, setCloudSaveStatus] = useState('Sign in and load shared records to enable cloud auto-save.')
  const [loadedIds, setLoadedIds] = useState<string[] | null>(null)
  // Ref avoids a second autosave loop when the successfully-synced ID snapshot is updated.
  const loadedIdsRef = useRef<string[] | null>(null)

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
      setCloudSaveStatus('Signed in. Load shared records to safely enable cloud auto-save.')
      onMessage('Signed in to the shared database. Load the shared records to enable cloud auto-save.')
    } catch (error) { onMessage(error instanceof Error ? error.message : 'Sign-in failed.') }
    finally { setBusy(false) }
  }

  const signOut = () => {
    localStorage.removeItem('uflmb.supabase.accessToken')
    setToken('')
    setLoadedIds(null)
    loadedIdsRef.current = null
    setCloudSaveStatus('Signed out. Cloud auto-save is paused; local editing remains available.')
    onMessage('Signed out of the shared database. Local card editing remains available.')
  }

  const loadShared = async () => {
    if (!enabled) { onMessage('Shared database is not configured. Follow supabase/SETUP.md first.'); return }
    if (!token) { onMessage('Sign in with the trusted admin account before loading records and enabling cloud auto-save.'); return }
    setBusy(true)
    try {
      const response = await fetch(`${baseUrl}/rest/v1/cards?select=*&order=player_name.asc`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${token || anonKey}` },
      })
      if (!response.ok) throw new Error(await responseMessage(response))
      const rows = await response.json() as DbCard[]
      const stateResponse = await fetch(`${baseUrl}/rest/v1/app_state?id=eq.primary&select=payload`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      })
      if (!stateResponse.ok) throw new Error(await responseMessage(stateResponse))
      const stateRows = await stateResponse.json() as Array<{ payload?: Partial<CloudAppState> }>
      const parsed = rows.filter(row => !row.id.startsWith('uflmb-demo-')).map(fromDb)
      const ids = parsed.map(card => card.id)
      if (stateRows[0]?.payload && typeof stateRows[0].payload === 'object') onLoadAppState(stateRows[0].payload)
      loadedIdsRef.current = ids
      setLoadedIds(ids)
      onLoad(parsed)
      setCloudSaveStatus(`Connected. Loaded ${parsed.length} shared card(s); cloud auto-save is enabled.`)
      onMessage(`Loaded ${parsed.length} shared card record(s). Cloud auto-save is enabled after each change; remote deletions still require the explicit publish action.`)
    } catch (error) {
      loadedIdsRef.current = null
      setLoadedIds(null)
      setCloudSaveStatus('Could not enable cloud auto-save. Check the connection and admin permissions.')
      onMessage(error instanceof Error ? error.message : 'Could not load shared records.')
    } finally { setBusy(false) }
  }

  // Upsert-only autosave: never automatically deletes a remote record.
  // It starts only after an admin explicitly loads the current shared snapshot.
  useEffect(() => {
    if (!enabled || !token || loadedIdsRef.current === null) return
    const realCards = cards.filter(card => !card.id.startsWith('uflmb-demo-'))
    if (!realCards.length) {
      setCloudSaveStatus('Connected. No non-demo cards to save; remote records are not deleted automatically.')
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setCloudSaving(true)
      setCloudSaveStatus('Saving card changes to Supabase…')
      try {
        const response = await fetch(`${baseUrl}/rest/v1/cards?on_conflict=id`, {
          method: 'POST',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify(realCards.map(toDb)),
        })
        if (!response.ok) throw new Error(await responseMessage(response))
        if (cancelled) return
        // Keep IDs ever synchronized in this session so the explicit publish workflow can
        // still identify locally removed records. Autosave itself never performs deletes.
        const syncedIds = Array.from(new Set([...(loadedIdsRef.current || []), ...realCards.map(card => card.id)]))
        loadedIdsRef.current = syncedIds
        setLoadedIds(syncedIds)
        setCloudSaveStatus(`Cloud auto-save successful · ${new Date().toLocaleTimeString()} · ${realCards.length} card(s) synced`)
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Unknown cloud save error.'
        setCloudSaveStatus(`Cloud auto-save failed: ${message}`)
      } finally {
        if (!cancelled) setCloudSaving(false)
      }
    }, 1200)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [cards, token])

  useEffect(() => {
    if (!enabled || !token || loadedIdsRef.current === null) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setCloudSaving(true)
      try {
        const response = await fetch(`${baseUrl}/rest/v1/app_state?on_conflict=id`, {
          method: 'POST',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify({ id: 'primary', payload: appState, updated_at: new Date().toISOString() }),
        })
        if (!response.ok) throw new Error(await responseMessage(response))
        if (!cancelled) setCloudSaveStatus('Saved')
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unknown cloud save error.'
          setCloudSaveStatus(`Cloud save failed: ${message}`)
        }
      } finally {
        if (!cancelled) setCloudSaving(false)
      }
    }, 1200)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [appState, token])

  const publish = async () => {
    if (!enabled) { onMessage('Shared database is not configured. Follow supabase/SETUP.md first.'); return }
    if (!token) { onMessage('Sign in with an authenticated Supabase account before publishing card edits.'); return }
    if (loadedIds === null) { onMessage('Load shared records first. This safety check prevents accidental overwrites before comparing the current database.'); return }
    if (!window.confirm('Publish the current non-demo card collection to the shared database? Records removed locally since the last shared snapshot will also be deleted remotely. Demo fixtures are excluded.')) return
    setBusy(true)
    try {
      const realCards = cards.filter(card => !card.id.startsWith('uflmb-demo-'))
      if (realCards.length) {
        const upsert = await fetch(`${baseUrl}/rest/v1/cards?on_conflict=id`, {
          method: 'POST',
          headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(realCards.map(toDb)),
        })
        if (!upsert.ok) throw new Error(await responseMessage(upsert))
      }
      const currentIds = new Set(realCards.map(card => card.id))
      const removedIds = loadedIds.filter(id => !currentIds.has(id))
      for (const id of removedIds) {
        const response = await fetch(`${baseUrl}/rest/v1/cards?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE', headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
        })
        if (!response.ok) throw new Error(await responseMessage(response))
      }
      const ids = realCards.map(card => card.id)
      loadedIdsRef.current = ids
      setLoadedIds(ids)
      setCloudSaveStatus(`Publish complete · ${new Date().toLocaleTimeString()} · ${ids.length} card(s) synced`)
      onMessage(`Published ${realCards.length} non-demo card(s) to the shared database; removed ${removedIds.length} remote record(s). Demo fixtures were not uploaded.`)
    } catch (error) { onMessage(error instanceof Error ? error.message : 'Publishing failed.') }
    finally { setBusy(false) }
  }

  return <section className="admin-panel tools-panel shared-database-panel">
    <p className="eyebrow">SHARED DATABASE</p><h2>Shared card database</h2>
    <p className="muted-copy">Public visitors can read shared cards and community reviews. Signed-in admins can auto-save card edits to Supabase after loading the shared records. Auto-save adds or updates records only; remote deletions require the explicit publish action.</p>
    {!enabled ? <div className="notice warning">Backend not connected yet. Create the Supabase project, run the SQL schema, and add the two public build variables as described in <code>supabase/SETUP.md</code>.</div> : <>
      <div className="shared-db-status"><span className={token ? 'status-dot' : 'status-dot status-dot-off'} />{token ? 'Admin session token saved in this browser' : 'Read-only mode — sign in to save card edits'}</div>
      <p className="field-help" role="status" aria-live="polite">{cloudSaving ? 'Saving to Supabase…' : cloudSaveStatus}</p>
      {!token && <div className="card-form shared-login-form"><label>Admin email<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" /></label><label>Admin password<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label><button className="button primary" type="button" disabled={busy} onClick={() => void signIn()}>{busy ? 'Connecting…' : 'Sign in'}</button></div>}
      {token && <div className="form-actions"><button className="button secondary" type="button" disabled={busy || cloudSaving} onClick={signOut}>Sign out</button></div>}
      <div className="form-actions"><button className="button secondary" type="button" disabled={busy || cloudSaving || !token} onClick={() => void loadShared()}>{busy ? 'Working…' : 'Load shared records & enable auto-save'}</button><button className="button primary" type="button" disabled={busy || cloudSaving || !token || loadedIds === null} onClick={() => void publish()}>Publish + apply deletions</button></div>
      <p className="field-help">Safe workflow: sign in with an account listed in <code>public.admin_users</code>, load shared records once, then card additions/edits are saved automatically. The explicit publish action is the only action that deletes remote records.</p>
    </>}
  </section>
}
