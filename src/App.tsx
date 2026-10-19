import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { PlayerCard } from './types/card'
import * as XLSX from 'xlsx'
import { cards as starterCards } from './data/cards'

const STORAGE_KEY = 'uflmb.cards.v1'
const DRIVE_CLIENT_KEY = 'uflmb.google.clientId'
const DRIVE_API_KEY = 'uflmb.google.apiKey'
type DriveFile = { id: string; name: string; mimeType: string; size?: string }
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

const downloadCsv = (cards: PlayerCard[]) => {
  const columns = ['Player Name', 'OVR', 'Position(s)', 'Nation', 'Card Type', 'Club', 'Image URL', 'Perks', 'Verified At', 'Source URL', 'PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY']
  const quote = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"'
  const rows = cards.map(card => [
    card.playerName, card.overallRating, card.positions.join('/'), card.nation, card.cardName, card.club,
    card.imageUrl, card.perks?.join('; '), card.verifiedAt, card.sourceUrl,
    card.stats?.PAC, card.stats?.SHO, card.stats?.PAS, card.stats?.DRI, card.stats?.DEF, card.stats?.PHY,
  ].map(quote).join(','))
  const blob = new Blob(['\uFEFF' + [columns.map(quote).join(','), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'uflmb-cards-export.csv'; a.click()
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
  const [googleClientId, setGoogleClientId] = useState(() => localStorage.getItem(DRIVE_CLIENT_KEY) ?? '')
  const [googleApiKey, setGoogleApiKey] = useState(() => localStorage.getItem(DRIVE_API_KEY) ?? '')
  const [driveBusy, setDriveBusy] = useState(false)

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

  const handleBulkImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    const nextById = new Map(allCards.map(card => [card.id, card]))
    let matched = 0
    let skipped = 0
    const normalize = (value: string) => value.toLowerCase().replace(/\\.[^.]+$/, '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]/g, '')
    for (const file of files) {
      if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) { skipped++; continue }
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onerror = () => reject(new Error('Read failed'))
          reader.onload = () => {
            const image = new Image()
            image.onerror = () => reject(new Error('Invalid image'))
            image.onload = () => {
              const scale = Math.min(1, 1000 / Math.max(image.width, image.height))
              const canvas = document.createElement('canvas')
              canvas.width = Math.max(1, Math.round(image.width * scale))
              canvas.height = Math.max(1, Math.round(image.height * scale))
              const context = canvas.getContext('2d')
              if (!context) { reject(new Error('Canvas unavailable')); return }
              context.drawImage(image, 0, 0, canvas.width, canvas.height)
              resolve(canvas.toDataURL('image/jpeg', 0.78))
            }
            image.src = String(reader.result)
          }
          reader.readAsDataURL(file)
        })
        const key = normalize(file.name)
        const match = Array.from(nextById.values()).find(card => normalize(card.playerName) === key)
        if (!match) { skipped++; continue }
        nextById.set(match.id, { ...match, imageUrl: dataUrl })
        matched++
      } catch { skipped++ }
    }
    if (matched) {
      const next = Array.from(nextById.values())
      try {
        saveCards(next)
        setAllCards(next)
        setNotice(`Bulk image import complete: ${matched} image(s) matched to cards; ${skipped} file(s) skipped. Name each image after the player (for example, Player Name.jpg).`)
      } catch {
        setNotice('The images exceeded available browser storage. Try fewer images at a time or smaller files.')
      }
    } else setNotice(`No images were matched. ${skipped} file(s) were skipped. Image filenames must match player names, and each source image must be 8 MB or smaller.`)
  }

  const handleJsonFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!Array.isArray(parsed)) { setNotice('JSON backup must contain an array of card records.'); return }
      const valid = parsed.filter((card): card is PlayerCard => Boolean(card && typeof card === 'object' &&
        typeof (card as PlayerCard).playerName === 'string' && Number.isFinite((card as PlayerCard).overallRating) &&
        Array.isArray((card as PlayerCard).positions) && typeof (card as PlayerCard).nation === 'string' &&
        typeof (card as PlayerCard).sourceUrl === 'string' && /^https?:\/\//i.test((card as PlayerCard).sourceUrl) &&
        typeof (card as PlayerCard).verifiedAt === 'string'))
      const keys = new Set(allCards.map(card => [card.playerName, card.overallRating, card.positions.join('/'), card.nation].join('|').toLowerCase()))
      const additions = valid.filter(card => {
        const key = [card.playerName, card.overallRating, card.positions.join('/'), card.nation].join('|').toLowerCase()
        if (keys.has(key)) return false
        keys.add(key)
        return true
      }).map(card => ({ ...card, id: makeId() }))
      if (!additions.length) { setNotice(`No new records imported. ${parsed.length - valid.length} invalid record(s); all other records may already exist.`); return }
      const next = [...additions, ...allCards]
      saveCards(next); setAllCards(next)
      setNotice(`JSON file import complete: ${additions.length} new record(s) added. Existing cards were preserved; ${parsed.length - valid.length} invalid record(s) rejected.`)
    } catch { setNotice('Could not read this JSON file. Select a valid UFLMB JSON backup.') }
  }

  const clearAllLocalData = () => {
    if (!window.confirm('This deletes every card stored in this browser. Export a JSON backup first. Continue?')) return
    setAllCards([])
    setNotice('Local card collection cleared. This cannot be undone without a backup.')
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

  const importExcel = async (source: ChangeEvent<HTMLInputElement> | File) => {
    const file = source instanceof File ? source : source.target.files?.[0]
    if (!file) return
    if (!(source instanceof File)) source.target.value = ''
    try {
      const bytes = await file.arrayBuffer()
      const workbook = XLSX.read(bytes, { type: 'array', cellDates: true })
      const firstSheet = workbook.SheetNames[0]
      if (!firstSheet) { setNotice('The selected spreadsheet has no worksheet.'); return }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: '' })
      if (!rows.length) { setNotice('The selected worksheet contains no data rows.'); return }
      const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
      const get = (row: Record<string, unknown>, aliases: string[]) => {
        const entries = Object.entries(row)
        const match = entries.find(([key]) => aliases.includes(normalize(key)))
        return match?.[1] ?? ''
      }
      const asText = (value: unknown) => value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value ?? '').trim()
      const statsKeys = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY', 'DIV', 'REF', 'HAN', 'KIC', 'SPD', 'POS']
      const imported: PlayerCard[] = []
      let skipped = 0
      rows.forEach((row: Record<string, unknown>) => {
        const playerName = asText(get(row, ['playername', 'name', 'player']))
        const rawRating = get(row, ['ovr', 'overallrating', 'overall', 'rating'])
        const overallRating = Number(rawRating)
        const positions = asText(get(row, ['positions', 'position', 'pos'])).split(/[;,/|]/).map(p => p.trim().toUpperCase()).filter(Boolean)
        const nation = asText(get(row, ['nation', 'nationality', 'country']))
        const sourceUrl = asText(get(row, ['sourceurl', 'source', 'verificationurl', 'verifiablesourceurl']))
        if (!playerName || !Number.isInteger(overallRating) || overallRating < 1 || overallRating > 999 || !positions.length || !nation || !/^https?:\/\//i.test(sourceUrl)) {
          skipped++
          return
        }
        const cardName = asText(get(row, ['cardtype', 'cardname', 'edition', 'cardtypeedition']))
        const club = asText(get(row, ['club', 'team']))
        const imageUrl = asText(get(row, ['imageurl', 'cardimageurl', 'image']))
        const verifiedRaw = get(row, ['verifiedat', 'verificationdate', 'verifieddate', 'checked'])
        const verifiedAt = asText(verifiedRaw) || new Date().toISOString().slice(0, 10)
        const stats: Record<string, number> = {}
        statsKeys.forEach(key => {
          const value = get(row, [key.toLowerCase(), key.toLowerCase() + 'stat'])
          if (value !== '' && value !== null && Number.isFinite(Number(value))) stats[key] = Number(value)
        })
        const perksRaw = asText(get(row, ['perks', 'attributes', 'traits']))
        imported.push({
          id: makeId(), playerName, overallRating, positions, nation,
          ...(cardName ? { cardName } : {}),
          ...(club ? { club } : {}),
          ...(Object.keys(stats).length ? { stats } : {}),
          ...(perksRaw ? { perks: perksRaw.split(/[;,|]/).map(v => v.trim()).filter(Boolean) } : {}),
          ...(imageUrl ? { imageUrl } : {}),
          sourceUrl,
          verifiedAt: /^\d{4}-\d{2}-\d{2}$/.test(verifiedAt) ? verifiedAt : new Date().toISOString().slice(0, 10),
        })
      })
      if (!imported.length) {
        setNotice(`No valid cards were imported. ${skipped} row(s) were skipped. Check the required columns: Player Name, OVR, Position(s), Nation, and Source URL.`)
        return
      }
      const existingKeys = new Set(allCards.map(card => [card.playerName, card.overallRating, card.positions.join('/'), card.nation].join('|').toLowerCase()))
      const uniqueImported = imported.filter(card => {
        const key = [card.playerName, card.overallRating, card.positions.join('/'), card.nation].join('|').toLowerCase()
        if (existingKeys.has(key)) { skipped++; return false }
        existingKeys.add(key)
        return true
      })
      if (!uniqueImported.length) {
        setNotice(`Nothing new to import. ${skipped} row(s) were skipped as invalid or already present.`)
        return
      }
      const next = [...uniqueImported, ...allCards]
      try {
        saveCards(next)
        setAllCards(next)
        setNotice(`Excel import complete: ${uniqueImported.length} card(s) added; ${skipped} row(s) skipped. Imported records were added without overwriting existing cards.`)
      } catch {
        setNotice('Import could not be saved. Browser storage may be full; try a smaller spreadsheet or remove large images.')
      }
    } catch {
      setNotice('Could not read this spreadsheet. Please use a valid .xlsx, .xls, or .csv file.')
    }
  }


  const loadGoogleScript = (src: string, id: string) => new Promise<void>((resolve, reject) => {
    if (document.getElementById(id)) { resolve(); return }
    const script = document.createElement('script')
    script.id = id; script.src = src; script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Google sign-in components could not be loaded.'))
    document.head.appendChild(script)
  })

  const saveDriveSettings = () => {
    localStorage.setItem(DRIVE_CLIENT_KEY, googleClientId.trim())
    localStorage.setItem(DRIVE_API_KEY, googleApiKey.trim())
    setNotice('Google Drive settings saved in this browser.')
  }

  const openDrivePicker = async () => {
    if (!googleClientId.trim() || !googleApiKey.trim()) {
      setNotice('Enter and save your Google OAuth Client ID and Google Picker API key first.')
      return
    }
    setDriveBusy(true)
    try {
      await Promise.all([
        loadGoogleScript('https://accounts.google.com/gsi/client', 'google-identity-services'),
        loadGoogleScript('https://apis.google.com/js/api.js', 'google-api-client'),
      ])
      const w = window as unknown as { google?: any; gapi?: any }
      await new Promise<void>((resolve, reject) => w.gapi.load('picker', { callback: resolve, onerror: reject }))
      const tokenClient = w.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId.trim(),
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: async (tokenResponse: { access_token?: string; error?: string }) => {
          if (tokenResponse.error || !tokenResponse.access_token) {
            setNotice('Google Drive sign-in was not completed. Check the OAuth setup and try again.')
            setDriveBusy(false)
            return
          }
          try {
            const picker = new w.gapi.picker.PickerBuilder()
              .setDeveloperKey(googleApiKey.trim())
              .setOAuthToken(tokenResponse.access_token)
              .setTitle('Select UFLMB data files and card images')
              .setSelectableMimeTypes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/json,image/jpeg,image/png,image/webp,image/gif')
              .enableFeature(w.gapi.picker.Feature.MULTISELECT_ENABLED)
              .addView(new w.gapi.picker.DocsView().setIncludeFolders(false))
              .setCallback(async (data: { action: string; docs?: DriveFile[] }) => {
                if (data.action !== w.gapi.picker.Action.PICKED || !data.docs?.length) {
                  if (data.action === w.gapi.picker.Action.CANCEL) setNotice('Google Drive selection cancelled.')
                  setDriveBusy(false)
                  return
                }
                let importedFiles = 0
                let importedImages = 0
                let skippedFiles = 0
                for (const doc of data.docs) {
                  try {
                    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(doc.id)}?alt=media`, {
                      headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                    })
                    if (!response.ok) throw new Error('Drive download failed')
                    const blob = await response.blob()
                    if (doc.mimeType.startsWith('image/')) {
                      if (blob.size > 8 * 1024 * 1024) { skippedFiles++; continue }
                      const dataUrl = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader()
                        reader.onload = () => resolve(String(reader.result))
                        reader.onerror = () => reject(new Error('Image could not be read'))
                        reader.readAsDataURL(blob)
                      })
                      const imageName = doc.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '')
                      const match = allCards.find(card => card.playerName.toLowerCase().replace(/[^a-z0-9]/g, '') === imageName)
                      if (match) {
                        const next = allCards.map(card => card.id === match.id ? { ...card, imageUrl: dataUrl } : card)
                        saveCards(next); setAllCards(next); importedImages++
                      } else {
                        setDraft(current => ({ ...current, imageUrl: dataUrl }))
                        importedImages++
                      }
                      continue
                    }
                    const file = new File([blob], doc.name, { type: doc.mimeType })
                    if (/\.(xlsx|xls|csv)$/i.test(doc.name) || /spreadsheet|excel|csv/.test(doc.mimeType)) {
                      await importExcel(file)
                      importedFiles++
                    } else if (/\.json$/i.test(doc.name) || doc.mimeType === 'application/json') {
                      const parsed: unknown = JSON.parse(await file.text())
                      if (!Array.isArray(parsed)) { skippedFiles++; continue }
                      const records = parsed.filter((card): card is PlayerCard => Boolean(card && typeof card === 'object' &&
                        typeof (card as PlayerCard).playerName === 'string' && Number.isFinite((card as PlayerCard).overallRating) &&
                        Array.isArray((card as PlayerCard).positions) && typeof (card as PlayerCard).nation === 'string' &&
                        typeof (card as PlayerCard).sourceUrl === 'string' && typeof (card as PlayerCard).verifiedAt === 'string'))
                      const existingKeys = new Set(allCards.map(card => [card.playerName, card.overallRating, card.positions.join('/'), card.nation].join('|').toLowerCase()))
                      const additions = records.filter(card => {
                        const key = [card.playerName, card.overallRating, card.positions.join('/'), card.nation].join('|').toLowerCase()
                        if (existingKeys.has(key)) return false
                        existingKeys.add(key)
                        return true
                      }).map(card => ({ ...card, id: makeId() }))
                      if (additions.length) {
                        const next = [...additions, ...allCards]
                        saveCards(next); setAllCards(next); importedFiles += additions.length
                      }
                    } else skippedFiles++
                  } catch { skippedFiles++ }
                }
                setNotice(`Google Drive import finished: ${importedFiles} data record(s) imported, ${importedImages} image(s) applied/selected, ${skippedFiles} file(s) skipped. Images are matched to existing cards by filename; an unmatched image is placed in the current card form.`)
                setDriveBusy(false)
              })
              .build()
            picker.setVisible(true)
          } catch {
            setNotice('Could not open Google Drive Picker. Check that the Google Picker API and Drive API are enabled.')
            setDriveBusy(false)
          }
        },
      })
      tokenClient.requestAccessToken()
    } catch {
      setNotice('Google Drive could not be initialized. Check the client ID, API key, and enabled Google APIs.')
      setDriveBusy(false)
    }
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
        <p className="eyebrow">GOOGLE DRIVE</p><h2>Import from Google Drive</h2>
        <p className="muted-copy">Sign in with Google and select Excel, CSV, JSON files, and card images. Data files are imported into this browser. Images are matched to existing cards by filename (for example, “Player Name.jpg”); unmatched images are placed in the current card form. Nothing is uploaded to Google Drive.</p>
        <label className="full-field">Google OAuth Client ID<input value={googleClientId} onChange={e => setGoogleClientId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" autoComplete="off" /></label>
        <label className="full-field">Google Picker API key<input value={googleApiKey} onChange={e => setGoogleApiKey(e.target.value)} placeholder="Google API key" autoComplete="off" /></label>
        <div className="form-actions"><button className="button secondary" type="button" onClick={saveDriveSettings}>Save Google settings</button><button className="button primary" type="button" disabled={driveBusy} onClick={openDrivePicker}>{driveBusy ? 'Connecting to Google Drive…' : 'Sign in & choose Drive files'}</button></div>
        <span className="field-help">Setup required in Google Cloud Console: enable Google Drive API and Google Picker API, configure an OAuth web client with this site's origin (https://uflplayer2026.github.io), and restrict the API key to the Picker API. This app requests read-only Drive access.</span>
      </section>
      <section className="admin-panel tools-panel">
        <p className="eyebrow">SPREADSHEET IMPORT</p><h2>Import from Excel</h2>
        <p className="muted-copy">Import .xlsx, .xls, or .csv files. The first worksheet is read. Required columns: Player Name, OVR, Position(s), Nation, and Source URL. Optional columns: Card Type, Club, Image URL, Perks, Verified At, and individual stat columns such as PAC, SHO, PAS, DRI, DEF, and PHY. Existing matching cards are skipped rather than overwritten.</p>
        <label className="full-field">Choose spreadsheet file<input type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" onChange={importExcel} /><span className="field-help">Only valid rows are imported. Invalid rows and duplicate player/OVR/position/nation combinations are skipped and counted.</span></label>
      </section>
      <section className="admin-panel tools-panel">
        <p className="eyebrow">LOCAL FILE IMPORT</p><h2>Import images & backups</h2>
        <p className="muted-copy">No Google account required. Select multiple image files to match them to existing cards by filename, or import a JSON backup. For example, “Kylian Mbappe.jpg” matches a card named “Kylian Mbappe”. Images are optimized before saving in this browser.</p>
        <label className="full-field">Import multiple card images<input type="file" accept="image/*" multiple onChange={handleBulkImages} /><span className="field-help">Up to 8 MB per source image. Filenames must match player names; unmatched images are skipped. Local browser storage has limited capacity.</span></label>
        <label className="full-field">Import JSON backup file<input type="file" accept=".json,application/json" onChange={handleJsonFile} /><span className="field-help">Adds valid new records without replacing existing cards. Use JSON backup for full record fields.</span></label>
      </section>
      <section className="admin-panel tools-panel">
        <p className="eyebrow">BACKUP & DATA TRANSFER</p><h2>Export / import</h2>
        <p className="muted-copy">Export JSON backups regularly. During import, records with matching IDs are replaced by the versions in the imported file.</p>
        <div className="form-actions"><button className="button primary" type="button" onClick={() => downloadJson(allCards)}>Download JSON backup</button><button className="button secondary" type="button" onClick={() => downloadCsv(allCards)}>Export CSV / Excel-compatible</button><button className="button danger" type="button" onClick={clearAllLocalData}>Clear local database</button><button className="button secondary" type="button" onClick={() => setImportText('')}>Clear import field</button></div>
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
