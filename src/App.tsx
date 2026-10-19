import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { PlayerCard } from './types/card'
import { cards as starterCards } from './data/cards'

const STORAGE_KEY = 'uflmb.cards.v1'
const categories = ['All cards', 'Goalkeepers', 'Defenders', 'Midfielders', 'Forwards'] as const
type Category = typeof categories[number]
type Draft = {
  playerName: string; overallRating: string; positions: string; nation: string
  cardName: string; club: string; perks: string; stats: string; imageUrl: string
  sourceUrl: string; verifiedAt: string
}
const emptyDraft = (): Draft => ({
  playerName: '', overallRating: '', positions: '', nation: '', cardName: '', club: '',
  perks: '', stats: '', imageUrl: '', sourceUrl: '', verifiedAt: new Date().toISOString().slice(0, 10),
})
const makeId = () => `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const loadCards = (): PlayerCard[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return starterCards
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as PlayerCard[] : starterCards
  } catch { return starterCards }
}
const saveCards = (next: PlayerCard[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
const positionGroup = (positions: string[]) => {
  if (positions.some(p => p === 'GK')) return 'Goalkeepers'
  if (positions.some(p => ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(p))) return 'Defenders'
  if (positions.some(p => ['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(p))) return 'Midfielders'
  return 'Forwards'
}
const downloadJson = (cards: PlayerCard[]) => {
  const blob = new Blob([JSON.stringify(cards, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'uflmb-cards-backup.json'; a.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  const isAdmin = window.location.pathname.replace(/\/$/, '').endsWith('/admin') || window.location.hash === '#admin'
  const [allCards, setAllCards] = useState<PlayerCard[]>(loadCards)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('All cards')
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [importText, setImportText] = useState('')
  const [adminSearch, setAdminSearch] = useState('')

  useEffect(() => {
    try { saveCards(allCards) } catch {
      setNotice('Saving failed. The image may be too large; try a smaller image or use an image URL.')
    }
  }, [allCards])

  const visibleCards = useMemo(() => allCards.filter(card => {
    const text = [card.playerName, card.nation, card.club, card.cardName, ...card.positions].filter(Boolean).join(' ').toLowerCase()
    return text.includes(query.toLowerCase()) && (category === 'All cards' || positionGroup(card.positions) === category)
  }), [allCards, query, category])

  const adminCards = useMemo(() => allCards.filter(card =>
    [card.playerName, card.nation, card.club, card.cardName, card.id].filter(Boolean).join(' ').toLowerCase().includes(adminSearch.toLowerCase())
  ), [allCards, adminSearch])

  const updateDraft = (key: keyof Draft, value: string) => setDraft(current => ({ ...current, [key]: value }))

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setNotice('Only image files can be uploaded.'); return }
    if (file.size > 8 * 1024 * 1024) { setNotice('The image file must be 8 MB or smaller.'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const max = 1000
        const scale = Math.min(1, max / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        const context = canvas.getContext('2d')
        if (!context) { setNotice('Image processing failed.'); return }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        updateDraft('imageUrl', canvas.toDataURL('image/jpeg', 0.82))
        setNotice('Image uploaded and optimized.')
      }
      image.onerror = () => setNotice('Could not open the image.')
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const resetForm = () => { setDraft(emptyDraft()); setEditingId(null) }

  const submitCard = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const rating = Number(draft.overallRating)
    const positions = draft.positions.split(/[;,]/).map(p => p.trim().toUpperCase()).filter(Boolean)
    if (!draft.playerName.trim() || !draft.nation.trim() || !positions.length || !draft.sourceUrl.trim()) {
      setNotice("Enter the player's name, nation, at least one position, and a verifiable source.")
      return
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 999) { setNotice('OVR must be a whole number between 1 and 999.'); return }
    let stats: Record<string, number> | undefined
    if (draft.stats.trim()) {
      try {
        const parsed: unknown = JSON.parse(draft.stats)
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || Object.values(parsed).some(v => typeof v !== 'number' || !Number.isFinite(v))) {
          setNotice('Stats must be a valid JSON object with numeric values.'); return
        }
        stats = parsed as Record<string, number>
      } catch { setNotice('Invalid JSON format for stats. Example: {"PAC":90,"SHO":85}'); return }
    }
    const record: PlayerCard = {
      id: editingId ?? makeId(),
      playerName: draft.playerName.trim(),
      overallRating: rating,
      positions,
      nation: draft.nation.trim(),
      ...(draft.cardName.trim() ? { cardName: draft.cardName.trim() } : {}),
      ...(draft.club.trim() ? { club: draft.club.trim() } : {}),
      ...(stats ? { stats } : {}),
      ...(draft.perks.trim() ? { perks: draft.perks.split(/[;,\n]/).map(v => v.trim()).filter(Boolean) } : {}),
      ...(draft.imageUrl.trim() ? { imageUrl: draft.imageUrl.trim() } : {}),
      sourceUrl: draft.sourceUrl.trim(),
      verifiedAt: draft.verifiedAt || new Date().toISOString().slice(0, 10),
    }
    const next = editingId ? allCards.map(card => card.id === editingId ? record : card) : [record, ...allCards]
    try {
      saveCards(next)
      setAllCards(next)
      resetForm()
      setNotice(editingId ? 'Card updated.' : 'Card added.')
    } catch {
      setNotice('Saving failed; browser storage may be full. Use a smaller image or an image URL.')
    }
  }

  const startEdit = (card: PlayerCard) => {
    setEditingId(card.id)
    setDraft({
      playerName: card.playerName, overallRating: String(card.overallRating), positions: card.positions.join(', '),
      nation: card.nation, cardName: card.cardName ?? '', club: card.club ?? '', perks: card.perks?.join(', ') ?? '',
      stats: card.stats ? JSON.stringify(card.stats, null, 2) : '', imageUrl: card.imageUrl ?? '',
      sourceUrl: card.sourceUrl, verifiedAt: card.verifiedAt,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const importCards = () => {
    try {
      const parsed: unknown = JSON.parse(importText)
      if (!Array.isArray(parsed)) { setNotice('The import must be a JSON array of card records.'); return }
      const valid = parsed.every(card => card && typeof card.id === 'string' && typeof card.playerName === 'string' &&
        Number.isFinite(card.overallRating) && Array.isArray(card.positions) && typeof card.nation === 'string' &&
        typeof card.sourceUrl === 'string' && typeof card.verifiedAt === 'string')
      if (!valid) { setNotice('At least one imported record is incomplete or invalid. Check the required fields.'); return }
      const unique = new Map<string, PlayerCard>()
      ;[...allCards, ...(parsed as PlayerCard[])].forEach(card => unique.set(card.id, card))
      const next = Array.from(unique.values())
      saveCards(next); setAllCards(next); setImportText('')
      setNotice(`Import complete. There are ${next.length} cards in the local database.`)
    } catch { setNotice('Invalid JSON. Check the file contents.') }
  }

  if (isAdmin) return (
    <main className="app-shell admin-shell">
      <header className="topbar">
        <a className="brand" href="/UFLMB/" aria-label="UFLMB home"><span className="brand-mark">U</span><span className="brand-word">UFL<span>MB</span></span></a>
        <a className="back-link" href="/UFLMB/">← Public database</a>
      </header>
      <section className="admin-intro">
        <p className="eyebrow">CONTENT MANAGEMENT</p>
        <h1>Card <span>manager.</span></h1>
        <p className="hero-copy">Manually add, edit, save, and export cards, images, stats, and verification sources.</p>
        <div className="notice warning"><strong>Important:</strong> this version saves data to the current browser's local storage. It does not sync with other visitors or devices, and the admin page is not protected by a login. A public shared database requires server-side storage and authenticated admin access.</div>
        {notice && <div className="notice">{notice}</div>}
      </section>
      <section className="admin-panel">
        <div className="section-heading"><div><p className="eyebrow">{editingId ? 'EDIT RECORD' : 'NEW RECORD'}</p><h2>{editingId ? 'Edit card' : 'Add card'}</h2></div><span className="count-label">{allCards.length} local records</span></div>
        <form className="card-form" onSubmit={submitCard}>
          <label>Player name *<input value={draft.playerName} onChange={e => updateDraft('playerName', e.target.value)} required placeholder="e.g. Player Name" /></label>
          <label>OVR *<input type="number" min="1" max="999" step="1" value={draft.overallRating} onChange={e => updateDraft('overallRating', e.target.value)} required placeholder="e.g. 95" /></label>
          <label>Position(s) *<input value={draft.positions} onChange={e => updateDraft('positions', e.target.value)} required placeholder="e.g. ST, LW" /></label>
          <label>Nation *<input value={draft.nation} onChange={e => updateDraft('nation', e.target.value)} required placeholder="e.g. France" /></label>
          <label>Card type / edition<input value={draft.cardName} onChange={e => updateDraft('cardName', e.target.value)} placeholder="e.g. Icon, event name" /></label>
          <label>Club<input value={draft.club} onChange={e => updateDraft('club', e.target.value)} placeholder="Optional" /></label>
          <label className="full-field">Stats (JSON)<textarea rows={4} value={draft.stats} onChange={e => updateDraft('stats', e.target.value)} placeholder={'{"PAC": 90, "SHO": 85, "PAS": 88}'} /></label>
          <label className="full-field">Perks / attributes<input value={draft.perks} onChange={e => updateDraft('perks', e.target.value)} placeholder="Comma-separated values" /></label>
          <label className="full-field">Upload card image<input type="file" accept="image/*" onChange={handleImage} /><span className="field-help">Maximum 8 MB; the image is optimized in your browser and saved to local storage.</span></label>
          <label className="full-field">Or image URL<input value={draft.imageUrl.startsWith('data:') ? '' : draft.imageUrl} onChange={e => updateDraft('imageUrl', e.target.value)} placeholder="https://…" /></label>
          {draft.imageUrl && <div className="image-preview"><img src={draft.imageUrl} alt="Card preview" /><button type="button" className="button secondary" onClick={() => updateDraft('imageUrl', '')}>Remove image</button></div>}
          <label className="full-field">Verifiable source URL *<input type="url" value={draft.sourceUrl} onChange={e => updateDraft('sourceUrl', e.target.value)} required placeholder="https://…" /></label>
          <label>Verification date<input type="date" value={draft.verifiedAt} onChange={e => updateDraft('verifiedAt', e.target.value)} /></label>
          <div className="form-actions full-field"><button className="button primary" type="submit">{editingId ? 'Save changes' : 'Add card'}</button><button className="button secondary" type="button" onClick={resetForm}>Clear form</button></div>
        </form>
      </section>
      <section className="admin-panel">
        <div className="section-heading"><div><p className="eyebrow">RECORDS</p><h2>Existing cards</h2></div><input className="admin-search" value={adminSearch} onChange={e => setAdminSearch(e.target.value)} placeholder="Search…" aria-label="Search admin records" /></div>
        {adminCards.length === 0 ? <p className="muted-copy">No cards have been added yet.</p> : <div className="record-list">{adminCards.map(card => <article className="record-row" key={card.id}>
          {card.imageUrl ? <img className="record-thumb" src={card.imageUrl} alt="" /> : <div className="record-thumb placeholder-thumb">U</div>}
          <div className="record-info"><strong>{card.playerName}</strong><span>OVR {card.overallRating} · {card.positions.join('/')} · {card.nation}</span><small>{card.cardName || 'No card type specified'} · verified: {card.verifiedAt}</small></div>
          <button className="button secondary" type="button" onClick={() => startEdit(card)}>Edit</button>
          <button className="button danger" type="button" onClick={() => { if (window.confirm(`Are you sure you want to delete this record: ${card.playerName}?`)) { const next = allCards.filter(item => item.id !== card.id); setAllCards(next); setNotice('Record deleted.'); if (editingId === card.id) resetForm() } }}>Delete</button>
        </article>)}</div>}
      </section>
      <section className="admin-panel tools-panel">
        <p className="eyebrow">BACKUP & DATA TRANSFER</p><h2>Export / import</h2>
        <p className="muted-copy">Export JSON backups regularly. During import, records with matching IDs are replaced by the versions in the imported file.</p>
        <div className="form-actions"><button className="button primary" type="button" onClick={() => downloadJson(allCards)}>Download JSON backup</button><button className="button secondary" type="button" onClick={() => setImportText('')}>Clear import field</button></div>
        <label className="full-field">Paste JSON to import<textarea rows={5} value={importText} onChange={e => setImportText(e.target.value)} placeholder="Paste the full contents of the exported JSON file…" /></label>
        <button className="button secondary" type="button" onClick={importCards}>Import JSON</button>
      </section>
      <footer className="footer"><span>UFLMB <span className="footer-muted">· Admin tools</span></span><a href="/UFLMB/">Back to home</a></footer>
    </main>
  )

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/UFLMB/" aria-label="UFLMB home"><span className="brand-mark">U</span><span className="brand-word">UFL<span>MB</span></span></a>
        <div className="top-actions"><span className="status-pill"><span className="status-dot" /> Community database</span><a className="admin-link" href="/UFLMB/#admin">Admin / data entry ↗</a></div>
      </header>
      <section className="hero">
        <p className="eyebrow">COMMUNITY DATABASE PROJECT</p>
        <h1>Your UFL Mobile<br /><span>card reference.</span></h1>
        <p className="hero-copy">A searchable home for UFL Mobile player cards. Browse verified records, check card details, and help build a reliable community reference.</p>
        <div className="search-wrap"><span className="search-icon" aria-hidden="true">⌕</span><input aria-label="Search the card database" type="search" placeholder="Search players, nations, positions…" value={query} onChange={e => setQuery(e.target.value)} /><kbd>{visibleCards.length} FOUND</kbd></div>
        <div className="category-row" aria-label="Card categories">{categories.map(item => <button className={category === item ? 'category active' : 'category'} key={item} onClick={() => setCategory(item)} type="button">{item}</button>)}</div>
      </section>
      <section className="database-section" aria-labelledby="database-title">
        <div className="section-heading"><div><p className="eyebrow">THE COLLECTION</p><h2 id="database-title">Card database</h2></div><span className="count-label">{allCards.length} cards · local dataset</span></div>
        {visibleCards.length === 0 ? <div className="empty-state"><div className="empty-emblem" aria-hidden="true">U<span>+</span></div><h3>{query.trim() ? 'No matching cards found' : 'The database starts here'}</h3><p>{query.trim() ? `No verified card matches “${query.trim()}”. Try another search or category.` : 'No card records have been entered yet. Open the admin area to add verified cards, images, stats and sources.'}</p><a className="button primary" href="/UFLMB/#admin">Open card manager</a><span className="empty-tag">VERIFIED DATA ONLY</span></div> :
          <div className="card-grid">{visibleCards.map(card => <article className="player-card" key={card.id}>
            <div className="player-image">{card.imageUrl ? <img src={card.imageUrl} alt={`${card.playerName} card`} loading="lazy" /> : <div className="no-image">UFL<span>MB</span></div>}<span className="ovr-badge">{card.overallRating}</span><span className="position-badge">{card.positions.join(' / ')}</span></div>
            <div className="player-card-body"><h3>{card.playerName}</h3><p>{card.nation}{card.club ? ` · ${card.club}` : ''}</p>{card.cardName && <span className="card-type">{card.cardName}</span>}{card.stats && <div className="stats-grid">{Object.entries(card.stats).slice(0, 6).map(([key, value]) => <span key={key}><b>{value}</b><small>{key}</small></span>)}</div>}{card.perks?.length ? <div className="perk-row">{card.perks.map(perk => <span key={perk}>{perk}</span>)}</div> : null}<a className="source-link" href={card.sourceUrl} target="_blank" rel="noreferrer">Verified source ↗</a><small className="verified-date">Checked {card.verifiedAt}</small></div>
          </article>)}</div>}
      </section>
      <footer className="footer"><span>UFLMB <span className="footer-muted">· Community project</span></span><span className="footer-muted">Independent community project; not affiliated with or endorsed by the game’s publisher.</span><a href="/UFLMB/#admin">Card manager</a></footer>
    </main>
  )
}
