import { useEffect, useRef, useState } from 'react'
import type { PlayerCard } from '../types/card'

const baseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const enabled = Boolean(baseUrl && anonKey)

type CloudAppState = {
  bookmarkedIds: string[]
  formationId: '4-3-3' | '4-4-2' | '3-5-2'
  squadAssignments: Record<string, string>
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
  event?: string | null; position_category?: string | null; date_of_birth?: string | null
  height_cm?: number | null; weight_kg?: number | null; foot?: string | null
  weak_foot?: number | null; skill_moves?: number | null; source_image_path?: string | null
  source_data?: Record<string, string> | null; source_status?: 'verified' | 'imported-unverified' | null
}

const fromDb = (row: DbCard): PlayerCard => ({
  id: row.id, playerName: row.player_name, overallRating: row.overall_rating, positions: row.positions,
  nation: row.nation, ...(row.card_name ? { cardName: row.card_name } : {}),
  ...(row.club ? { club: row.club } : {}), ...(row.stats && Object.keys(row.stats).length ? { stats: row.stats } : {}),
  ...(row.perks?.length ? { perks: row.perks } : {}), ...(row.image_url ? { imageUrl: row.image_url } : {}),
  ...(row.event ? { event: row.event } : {}),
  ...(row.position_category ? { positionCategory: row.position_category } : {}),
  ...(row.date_of_birth ? { dateOfBirth: row.date_of_birth } : {}),
  ...(row.height_cm != null ? { heightCm: Number(row.height_cm) } : {}),
  ...(row.weight_kg != null ? { weightKg: Number(row.weight_kg) } : {}),
  ...(row.foot ? { foot: row.foot } : {}),
  ...(row.weak_foot != null ? { weakFoot: Number(row.weak_foot) } : {}),
  ...(row.skill_moves != null ? { skillMoves: Number(row.skill_moves) } : {}),
  ...(row.source_image_path ? { sourceImagePath: row.source_image_path } : {}),
  ...(row.source_data ? { sourceData: row.source_data } : {}),
  sourceStatus: row.source_status || 'imported-unverified',
  sourceUrl: row.source_url, verifiedAt: row.verified_at,
})
const toDb = (card: PlayerCard) => ({
  id: card.id, player_name: card.playerName, overall_rating: card.overallRating, positions: card.positions,
  nation: card.nation, card_name: card.cardName ?? null, club: card.club ?? null, stats: card.stats ?? {},
  perks: card.perks ?? [], image_url: card.imageUrl ?? null, source_url: card.sourceUrl,
  event: card.event ?? null, position_category: card.positionCategory ?? null,
  date_of_birth: card.dateOfBirth ?? null, height_cm: card.heightCm ?? null, weight_kg: card.weightKg ?? null,
  foot: card.foot ?? null, weak_foot: card.weakFoot ?? null, skill_moves: card.skillMoves ?? null,
  source_image_path: card.sourceImagePath ?? null, source_data: card.sourceData ?? {},
  source_status: card.sourceStatus ?? 'imported-unverified',
  verified_at: card.verifiedAt, is_demo: card.id.startsWith('uflmb-demo-'), updated_at: new Date().toISOString(),
})

const responseMessage = async (response: Response) => {
  try {
    const body = await response.json() as { message?: string; details?: string; hint?: string; msg?: string }
    return body.message || body.msg || body.details || body.hint || `Request failed (HTTP ${response.status}).`
  } catch { return `Request failed (HTTP ${response.status}).` }
}

export default function SharedDatabasePanel({ cards, appState, onLoad, onLoadAppState, onMessage }: Props) {
  const appStateJson = JSON.stringify(appState)
  const [token] = useState(() => {
    try {
      const raw = sessionStorage.getItem('uflmb.auth.session.v1')
      const session = raw ? JSON.parse(raw) as { access_token?: string } : null
      return session?.access_token || ''
    } catch { return '' }
  })
  const [busy, setBusy] = useState(false)
  const [cloudSaving, setCloudSaving] = useState(false)
  const [cloudSaveStatus, setCloudSaveStatus] = useState('Sign in and load shared records to enable cloud auto-save.')
  const [loadedIds, setLoadedIds] = useState<string[] | null>(null)
  // Ref avoids a second autosave loop when the successfully-synced ID snapshot is updated.
  const loadedIdsRef = useRef<string[] | null>(null)

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
          body: JSON.stringify({ id: 'primary', payload: JSON.parse(appStateJson), updated_at: new Date().toISOString() }),
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
  }, [appStateJson, token])

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
    <div className="section-heading">
      <div><p className="eyebrow">CLOUD INFRASTRUCTURE</p><h2>Shared database</h2></div>
      <span className={token && enabled ? 'cloud-state cloud-state-ready' : 'cloud-state'}><i />{!enabled ? 'Not configured' : token ? 'Admin session detected' : 'Sign-in required'}</span>
    </div>
    <p className="muted-copy">Load the latest shared records before editing. Card changes then auto-save to Supabase; removing remote records requires the separate, confirmed publish action. Fictional demo cards are never uploaded.</p>
    {!enabled ? <div className="notice warning">Supabase is not configured in this build. Check the project URL and publishable key in the deployment workflow.</div> : <>
      <div className="cloud-status-card">
        <span className="cloud-status-icon" aria-hidden="true">↔</span>
        <div><strong>{cloudSaving ? 'Sync in progress' : token ? 'Protected connection' : 'No active admin session'}</strong><p role="status" aria-live="polite">{cloudSaveStatus}</p></div>
      </div>
      <div className="cloud-action-grid">
        <button className="button secondary" type="button" disabled={busy || cloudSaving || !token} onClick={() => void loadShared()}>{busy ? 'Working…' : 'Load shared records'}</button>
        <button className="button primary" type="button" disabled={busy || cloudSaving || !token || loadedIds === null} onClick={() => void publish()}>Publish changes</button>
      </div>
      <p className="field-help">Safe workflow: load the current cloud snapshot first. Auto-save only inserts and updates. The publish action can also delete remote records removed locally, and asks for confirmation before doing so.</p>
    </>}
  </section>
}
