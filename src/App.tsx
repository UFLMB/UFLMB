import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChangeEvent, FormEvent } from 'react'
import type { PlayerCard } from './types/card'
import { cards as starterCards } from './data/cards'
import CommunityReviews from './components/CommunityReviews'
import AuthAccess from './components/AuthAccess'
import SharedDatabasePanel from './components/SharedDatabasePanel'

const STORAGE_KEY = 'uflmb.cards.v1'
const DRIVE_CLIENT_KEY = 'uflmb.google.clientId'
const DRIVE_API_KEY = 'uflmb.google.apiKey'
const THEME_KEY = 'uflmb.site-theme.v1'
const BRANDING_KEY = 'uflmb.site-branding.v1'
type SiteBranding = { iconText: string; logoUrl: string; faviconUrl: string; backgroundImageUrls: string[] }
const defaultBranding: SiteBranding = { iconText: 'U', logoUrl: '', faviconUrl: '', backgroundImageUrls: [] }
const parseBackgroundUrls = (value: string) => Array.from(new Set(
  value.split(/[\n,]+/).map(url => url.trim()).filter(url => {
    try {
      const parsed = new URL(url)
      return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.hostname)
    } catch { return false }
  }),
))
const loadBranding = (): SiteBranding => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(BRANDING_KEY) || 'null')
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const saved = value as Record<string, unknown>
      // Migrate the previous single-image setting without losing users' saved background.
      const legacy = typeof saved.backgroundImageUrl === 'string' ? saved.backgroundImageUrl : ''
      const savedImages = Array.isArray(saved.backgroundImageUrls)
        ? saved.backgroundImageUrls.filter((url): url is string => typeof url === 'string').join('\n')
        : legacy
      return {
        ...defaultBranding,
        iconText: typeof saved.iconText === 'string' ? saved.iconText : defaultBranding.iconText,
        logoUrl: typeof saved.logoUrl === 'string' ? saved.logoUrl : '',
        faviconUrl: typeof saved.faviconUrl === 'string' ? saved.faviconUrl : '',
        backgroundImageUrls: parseBackgroundUrls(savedImages),
      }
    }
  } catch { /* use defaults */ }
  return defaultBranding
}
type SiteTheme = { preset: string; accent: string; background: string; panel: string; text: string; mode: 'gradient' | 'solid'; radius: number }
const themePresets: Record<string, Omit<SiteTheme, 'preset'>> = {
  arena: { accent: '#c5f467', background: '#0b0d12', panel: '#11141b', text: '#f3f5f8', mode: 'gradient', radius: 15 },
}
const defaultTheme: SiteTheme = { preset: 'arena', ...themePresets.arena }
// UFL-inspired Arena theme is intentionally locked; ignore older saved custom themes.
const loadTheme = (): SiteTheme => defaultTheme
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
const countryFlagCode = (nation: string) => {
  const value = nation.trim().toLowerCase()
  const aliases: Record<string, string> = {
    england: 'gb-eng', scotland: 'gb-sct', wales: 'gb-wls', 'northern ireland': 'gb-nir',
    'united states': 'us', usa: 'us', 'united states of america': 'us',
    'united kingdom': 'gb', uk: 'gb', 'south korea': 'kr', 'korea republic': 'kr',
    'north korea': 'kp', 'ivory coast': 'ci', 'côte d’ivoire': 'ci', 'cote d ivoire': 'ci',
    'bosnia and herzegovina': 'ba', 'republic of ireland': 'ie', 'cape verde': 'cv',
    'new zealand': 'nz', 'south africa': 'za', 'saudi arabia': 'sa', 'united arab emirates': 'ae',
    'central african republic': 'cf', 'democratic republic of the congo': 'cd', 'congo dr': 'cd',
    'dr congo': 'cd', 'north macedonia': 'mk', 'czech republic': 'cz', czechia: 'cz',
    turkiye: 'tr', turkey: 'tr', 'the netherlands': 'nl', netherlands: 'nl',
    france: 'fr', germany: 'de', spain: 'es', italy: 'it', portugal: 'pt',
    brazil: 'br', argentina: 'ar', mexico: 'mx', canada: 'ca', colombia: 'co',
    chile: 'cl', uruguay: 'uy', paraguay: 'py', ecuador: 'ec', peru: 'pe',
    belgium: 'be', croatia: 'hr', serbia: 'rs', switzerland: 'ch', austria: 'at',
    denmark: 'dk', norway: 'no', sweden: 'se', finland: 'fi', greece: 'gr',
    romania: 'ro', hungary: 'hu', poland: 'pl', ukraine: 'ua', russia: 'ru',
    iceland: 'is', albania: 'al', slovakia: 'sk', slovenia: 'si', bulgaria: 'bg',
    cyprus: 'cy', luxembourg: 'lu', montenegro: 'me', kosovo: 'xk',
    morocco: 'ma', senegal: 'sn', nigeria: 'ng', cameroon: 'cm', ghana: 'gh',
    egypt: 'eg', algeria: 'dz', tunisia: 'tn', mali: 'ml', 'burkina faso': 'bf',
    'guinea bissau': 'gw', guinea: 'gn', 'south sudan': 'ss', 'equatorial guinea': 'gq',
    japan: 'jp', china: 'cn', australia: 'au', india: 'in', 'costa rica': 'cr',
    jamaica: 'jm', panama: 'pa', honduras: 'hn', 'trinidad and tobago': 'tt',
    'dominican republic': 'do', 'el salvador': 'sv', bolivia: 'bo', 'hong kong': 'hk',
    iran: 'ir', iraq: 'iq', israel: 'il', lebanon: 'lb', qatar: 'qa', oman: 'om',
    bahrain: 'bh', jordan: 'jo', uzbekistan: 'uz', kazakhstan: 'kz', thailand: 'th',
    indonesia: 'id', malaysia: 'my', 'faroe islands': 'fo',
  }
  return aliases[value] || (/^[a-z]{2}$/i.test(value) ? value.toLowerCase() : '')
}
const statGroupOrder = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY', 'POS', 'REF', 'DIV', 'HAN', 'KIC']
const statGroupNames: Record<string, string> = {
  PAC: 'Pace', SHO: 'Shooting', PAS: 'Passing', DRI: 'Dribbling',
  DEF: 'Defense', PHY: 'Physical', POS: 'Positioning', REF: 'Reflexes',
  DIV: 'Diving', HAN: 'Handling', KIC: 'Kicking',
}
const statSourceGroups: Record<string, string> = {
  Pace: 'PAC', Shooting: 'SHO', Passing: 'PAS', Dribbling: 'DRI',
  Defense: 'DEF', Physical: 'PHY', Positioning: 'POS', Reflexes: 'REF',
  Diving: 'DIV', Handling: 'HAN', Kicking: 'KIC', Goalkeeping: 'GK',
}
const groupProfileStats = (stats: Record<string, number>) => {
  const groups = new Map<string, { code: string; label: string; main?: number; details: Array<{ key: string; label: string; value: number }> }>()
  for (const code of statGroupOrder) {
    if (typeof stats[code] === 'number') groups.set(code, { code, label: statGroupNames[code], main: stats[code], details: [] })
  }
  for (const [key, value] of Object.entries(stats)) {
    if (statGroupOrder.includes(key)) continue
    const separator = key.indexOf(' · ')
    const sourceGroup = separator >= 0 ? key.slice(0, separator).trim() : ''
    const detailLabel = separator >= 0 ? key.slice(separator + 3).trim() : key
    const goalkeeperGroup = sourceGroup === 'Goalkeeping'
      ? ({ Positioning: 'POS', Reflexes: 'REF', Diving: 'DIV', Handling: 'HAN', Kicking: 'KIC' } as Record<string, string>)[detailLabel] || 'GK'
      : ''
    const code = goalkeeperGroup || statSourceGroups[sourceGroup] || 'OTHER'
    const label = statGroupNames[code] || (code === 'GK' ? 'Goalkeeping' : sourceGroup || 'Other attributes')
    const groupKey = code === 'OTHER' ? `OTHER:${sourceGroup || 'misc'}` : code
    const group = groups.get(groupKey) || { code: groupKey, label, details: [] }
    group.details.push({ key, label: detailLabel, value })
    groups.set(groupKey, group)
  }
  return Array.from(groups.values())
    .filter(group => typeof group.main === 'number' || group.details.length > 0)
    .sort((a, b) => {
      const ai = statGroupOrder.indexOf(a.code)
      const bi = statGroupOrder.indexOf(b.code)
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.label.localeCompare(b.label)
    })
}

type FormationId = '4-3-3' | '4-4-2' | '3-5-2'
type SquadSlot = { id: string; label: string; positions: string[] }
const formations: Record<FormationId, SquadSlot[]> = {
  '4-3-3': [{id:'gk',label:'GK',positions:['GK']},{id:'lb',label:'LB',positions:['LB','LWB']},{id:'lcb',label:'LCB',positions:['CB']},{id:'rcb',label:'RCB',positions:['CB']},{id:'rb',label:'RB',positions:['RB','RWB']},{id:'cdm',label:'CDM',positions:['CDM','CM']},{id:'lcm',label:'LCM',positions:['CM','CDM','CAM']},{id:'rcm',label:'RCM',positions:['CM','CDM','CAM']},{id:'lw',label:'LW',positions:['LW','LM','ST']},{id:'st',label:'ST',positions:['ST','CF']},{id:'rw',label:'RW',positions:['RW','RM','ST']}],
  '4-4-2': [{id:'gk',label:'GK',positions:['GK']},{id:'lb',label:'LB',positions:['LB','LWB']},{id:'lcb',label:'LCB',positions:['CB']},{id:'rcb',label:'RCB',positions:['CB']},{id:'rb',label:'RB',positions:['RB','RWB']},{id:'lm',label:'LM',positions:['LM','LW']},{id:'lcm',label:'LCM',positions:['CM','CDM']},{id:'rcm',label:'RCM',positions:['CM','CDM']},{id:'rm',label:'RM',positions:['RM','RW']},{id:'lst',label:'ST',positions:['ST','CF']},{id:'rst',label:'ST',positions:['ST','CF']}],
  '3-5-2': [{id:'gk',label:'GK',positions:['GK']},{id:'lcb',label:'LCB',positions:['CB']},{id:'cb',label:'CB',positions:['CB']},{id:'rcb',label:'RCB',positions:['CB']},{id:'lwb',label:'LWB',positions:['LWB','LB','LM']},{id:'cdm',label:'CDM',positions:['CDM','CM']},{id:'lcm',label:'LCM',positions:['CM','CDM','CAM']},{id:'rcm',label:'RCM',positions:['CM','CDM','CAM']},{id:'rwb',label:'RWB',positions:['RWB','RB','RM']},{id:'lst',label:'ST',positions:['ST','CF']},{id:'rst',label:'ST',positions:['ST','CF']}],
}

const isHttpUrl = (value: string) => {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' } catch { return false }
}
const isValidPlayerCard = (value: unknown): value is PlayerCard => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const card = value as Partial<PlayerCard>
  if (typeof card.id !== 'string' || !card.id.trim() || typeof card.playerName !== 'string' || !card.playerName.trim()) return false
  if (!Number.isInteger(card.overallRating) || (card.overallRating ?? 0) < 1 || (card.overallRating ?? 0) > 999) return false
  if (!Array.isArray(card.positions) || !card.positions.length || card.positions.some(position => typeof position !== 'string' || !position.trim())) return false
  if (typeof card.nation !== 'string' || !card.nation.trim() || typeof card.sourceUrl !== 'string' || !isHttpUrl(card.sourceUrl)) return false
  if (typeof card.verifiedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(card.verifiedAt) || Number.isNaN(new Date(card.verifiedAt + 'T00:00:00').getTime()) || new Date(card.verifiedAt + 'T00:00:00').toISOString().slice(0, 10) !== card.verifiedAt) return false
  if (card.cardName !== undefined && typeof card.cardName !== 'string') return false
  if (card.club !== undefined && typeof card.club !== 'string') return false
  if (card.imageUrl !== undefined && typeof card.imageUrl !== 'string') return false
  if (card.perks !== undefined && (!Array.isArray(card.perks) || card.perks.some(perk => typeof perk !== 'string'))) return false
  if (card.stats !== undefined && (!card.stats || typeof card.stats !== 'object' || Array.isArray(card.stats) || Object.values(card.stats).some(stat => typeof stat !== 'number' || !Number.isFinite(stat)))) return false
  return true
}
const normalizeIdentityPart = (value: unknown) => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const cardFingerprint = (card: Pick<PlayerCard, 'playerName' | 'overallRating' | 'positions' | 'nation' | 'cardName' | 'club'>) =>
  [normalizeIdentityPart(card.playerName), card.overallRating, [...card.positions].map(normalizeIdentityPart).sort().join('/'), normalizeIdentityPart(card.nation), normalizeIdentityPart(card.cardName), normalizeIdentityPart(card.club)].join('|')
const loadCards = (): PlayerCard[] => {
  let savedCards: PlayerCard[] = []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) savedCards = parsed.filter(isValidPlayerCard)
    }
  } catch { /* keep the bundled source dataset available */ }
  // Seed every browser with the source CSV while preserving local edits and demo fixtures.
  const merged = new Map(starterCards.map(card => [card.id, card]))
  for (const card of savedCards) merged.set(card.id, card)
  return Array.from(merged.values())
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
  const link = document.createElement('a')
  link.href = url
  link.download = 'uflmb-cards-backup.json'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const downloadCsv = (cards: PlayerCard[]) => {
  // Preserve every original imported CSV column while also including normalized fields
  // used by the app. This makes CSV round-trips useful for audits and future migrations.
  const normalizedColumns = ['Player Name', 'OVR', 'Position(s)', 'Nation', 'Card Type', 'Club', 'Image URL', 'Perks', 'Verified At', 'Source URL', 'PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY']
  const sourceColumns = cards.flatMap(card => Object.keys(card.sourceData ?? {}))
  const columns = Array.from(new Set([...sourceColumns, ...normalizedColumns]))
  const quote = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"'
  const rows = cards.map(card => {
    const values: Record<string, unknown> = {
      ...(card.sourceData ?? {}),
      'Player Name': card.playerName, 'OVR': card.overallRating,
      'Position(s)': card.positions.join('/'), 'Nation': card.nation,
      'Card Type': card.cardName, 'Club': card.club, 'Image URL': card.imageUrl,
      'Perks': card.perks?.join('; '), 'Verified At': card.verifiedAt, 'Source URL': card.sourceUrl,
      'PAC': card.stats?.PAC, 'SHO': card.stats?.SHO, 'PAS': card.stats?.PAS,
      'DRI': card.stats?.DRI, 'DEF': card.stats?.DEF, 'PHY': card.stats?.PHY,
    }
    return columns.map(column => quote(values[column])).join(',')
  })
  const blob = new Blob(['\uFEFF' + [columns.map(quote).join(','), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'uflmb-cards-export.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  const [allCards, setAllCards] = useState<PlayerCard[]>(loadCards)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [page, setPage] = useState<'home' | 'players' | 'compare'>('home')
  const [cardPage, setCardPage] = useState(1)
  const [isAdminSession, setIsAdminSession] = useState(false)
  const [category, setCategory] = useState<Category>('All cards')
  const [nationFilter, setNationFilter] = useState('All nations')
  const [positionFilter, setPositionFilter] = useState('All positions')
  const [cardTypeFilter, setCardTypeFilter] = useState('All card types')
  const [eventFilter, setEventFilter] = useState('All events')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'imported' | 'verified' | 'demo'>('all')
  const [sortBy, setSortBy] = useState<'ovr-desc' | 'ovr-asc' | 'name-asc' | 'verified-desc'>('ovr-desc')
  const [minOvr, setMinOvr] = useState('')
  const [maxOvr, setMaxOvr] = useState('')
  const [statFilter, setStatFilter] = useState('Any stat')
  const [minStat, setMinStat] = useState('')
  const [maxStat, setMaxStat] = useState('')
  const [showBookmarked, setShowBookmarked] = useState(false)
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => { try { const saved = JSON.parse(localStorage.getItem('uflmb.bookmarks.v1') || '[]'); return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [] } catch { return [] } })
  const [selectedCard, setSelectedCard] = useState<PlayerCard | null>(null)
  const [formationId, setFormationId] = useState<FormationId>(() => { try { const v = localStorage.getItem('uflmb.squad.formation'); return v === '4-4-2' || v === '3-5-2' ? v : '4-3-3' } catch { return '4-3-3' } })
  const [squadAssignments, setSquadAssignments] = useState<Record<string,string>>(() => { try { const v: unknown = JSON.parse(localStorage.getItem('uflmb.squad.assignments') || '{}'); if (!v || typeof v !== 'object' || Array.isArray(v)) return {}; const saved = v as Record<string,string>; return Object.keys(saved).some(key => key.startsWith('A:') || key.startsWith('B:')) ? saved : Object.fromEntries(Object.entries(saved).map(([key,id]) => [`A:${key}`,id])) } catch { return {} } })
  const [activeSquad, setActiveSquad] = useState<'A' | 'B'>('A')
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [importText, setImportText] = useState('')
  const [adminSearch, setAdminSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [googleClientId, setGoogleClientId] = useState(() => localStorage.getItem(DRIVE_CLIENT_KEY) ?? '')
  const [googleApiKey, setGoogleApiKey] = useState(() => localStorage.getItem(DRIVE_API_KEY) ?? '')
  const [driveBusy, setDriveBusy] = useState(false)
  const [siteTheme] = useState<SiteTheme>(loadTheme)
  const [siteBranding, setSiteBranding] = useState<SiteBranding>(loadBranding)
  const [backgroundUrlsText, setBackgroundUrlsText] = useState(() => siteBranding.backgroundImageUrls.join('\n'))
  const [backgroundIndex, setBackgroundIndex] = useState(0)
  const [sharedBrandingLoaded, setSharedBrandingLoaded] = useState(false)
  const [sharedBrandingStatus, setSharedBrandingStatus] = useState('Loading shared appearance…')
  const [brandingPublishBusy, setBrandingPublishBusy] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState(false)
  const [adminTab, setAdminTab] = useState<'cards' | 'quality' | 'imports' | 'appearance' | 'cloud'>('cards')

  const autoSaveSnapshot = useRef({ allCards, bookmarkedIds, formationId, squadAssignments, siteTheme, siteBranding, googleClientId, googleApiKey })
  autoSaveSnapshot.current = { allCards, bookmarkedIds, formationId, squadAssignments, siteTheme, siteBranding, googleClientId, googleApiKey }

  useEffect(() => {
    try { localStorage.setItem('uflmb.bookmarks.v1', JSON.stringify(bookmarkedIds)) } catch { /* session-only fallback */ }
  }, [bookmarkedIds])

  useEffect(() => {
    try { localStorage.setItem('uflmb.squad.formation', formationId); localStorage.setItem('uflmb.squad.assignments', JSON.stringify(squadAssignments)) } catch { /* squad remains available for this session */ }
  }, [formationId, squadAssignments])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--accent', siteTheme.accent)
    root.style.setProperty('--page-bg', siteTheme.background)
    root.style.setProperty('--panel-bg', siteTheme.panel)
    root.style.setProperty('--text-color', siteTheme.text)
    root.style.setProperty('--card-radius', `${siteTheme.radius}px`)
    root.dataset.themeMode = siteTheme.mode
    try { localStorage.setItem(THEME_KEY, JSON.stringify(siteTheme)) } catch { /* theme still applies for this session */ }
  }, [siteTheme])

  useEffect(() => {
    const images = siteBranding.backgroundImageUrls
    const image = images.length ? images[backgroundIndex % images.length] : ''
    // The gradient is always above the image, preserving legible text regardless of the photo.
    document.body.classList.toggle('has-background-images', Boolean(image))
    document.body.style.setProperty('--site-background-image', image
      ? `url("${image.replace(/["\\\\]/g, '')}")`
      : 'none')
    document.body.style.backgroundImage = ''
    document.body.style.backgroundColor = '#0b0d12'
    document.body.style.backgroundSize = ''
    document.body.style.backgroundPosition = ''
    document.body.style.backgroundAttachment = ''
  }, [siteBranding.backgroundImageUrls, backgroundIndex])

  useEffect(() => {
    const images = siteBranding.backgroundImageUrls
    if (images.length <= 1) {
      setBackgroundIndex(0)
      return
    }
    const interval = window.setInterval(() => {
      setBackgroundIndex(current => (current + 1) % images.length)
    }, 30_000)
    return () => window.clearInterval(interval)
  }, [siteBranding.backgroundImageUrls])

  useEffect(() => {
    try { localStorage.setItem(BRANDING_KEY, JSON.stringify(siteBranding)) } catch { /* applies for this session */ }
    let favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (!favicon) {
      favicon = document.createElement('link')
      favicon.rel = 'icon'
      document.head.appendChild(favicon)
    }
    if (siteBranding.faviconUrl.trim()) favicon.href = siteBranding.faviconUrl.trim()
    else favicon.removeAttribute('href')
  }, [siteBranding])

  // Shared branding is public-readable but only trusted admins can publish it.
  useEffect(() => {
    const endpoint = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    if (!endpoint || !anonKey) {
      setSharedBrandingStatus('Shared appearance is not configured; using this browser’s saved settings.')
      return
    }
    let cancelled = false
    void fetch(`${endpoint}/rest/v1/site_settings?id=eq.branding&select=payload,updated_at`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    }).then(async response => {
      if (!response.ok) throw new Error('Shared appearance could not be loaded.')
      return await response.json() as Array<{ payload?: { branding?: Partial<SiteBranding> } }>
    }).then(rows => {
      if (cancelled) return
      const saved = rows[0]?.payload?.branding
      if (saved && typeof saved === 'object') {
        const urls = Array.isArray(saved.backgroundImageUrls)
          ? saved.backgroundImageUrls.filter((url): url is string => typeof url === 'string').join('\n')
          : ''
        setSiteBranding({
          iconText: typeof saved.iconText === 'string' ? saved.iconText.slice(0, 5) : defaultBranding.iconText,
          logoUrl: typeof saved.logoUrl === 'string' ? saved.logoUrl : '',
          faviconUrl: typeof saved.faviconUrl === 'string' ? saved.faviconUrl : '',
          backgroundImageUrls: parseBackgroundUrls(urls),
        })
        setBackgroundUrlsText(parseBackgroundUrls(urls).join('\n'))
        setSharedBrandingStatus('Shared appearance loaded.')
      } else {
        setSharedBrandingStatus('No shared appearance has been published yet.')
      }
      setSharedBrandingLoaded(true)
    }).catch(() => {
      if (cancelled) return
      setSharedBrandingStatus('Could not load shared appearance; using this browser’s saved settings. Reload before publishing to avoid overwriting a shared version.')
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!sharedBrandingLoaded || !isAdminSession) return
    const endpoint = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    let token = ''
    try {
      const raw = sessionStorage.getItem('uflmb.auth.session.v1')
      token = raw ? (JSON.parse(raw) as { access_token?: string }).access_token || '' : ''
    } catch { /* require a valid admin session */ }
    if (!endpoint || !anonKey || !token) {
      setSharedBrandingStatus('Sign in with the admin account to publish shared appearance changes.')
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setSharedBrandingStatus('Publishing appearance for all visitors…')
      try {
        const response = await fetch(`${endpoint}/rest/v1/site_settings?on_conflict=id`, {
          method: 'POST',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify({
            id: 'branding',
            payload: { theme: siteTheme, branding: siteBranding },
            updated_at: new Date().toISOString(),
          }),
        })
        if (!response.ok) {
          const detail = await response.text().catch(() => '')
          throw new Error(detail || `Request failed (HTTP ${response.status}).`)
        }
        if (!cancelled) setSharedBrandingStatus(`Shared appearance saved · ${new Date().toLocaleTimeString()}`)
      } catch (error) {
        if (!cancelled) setSharedBrandingStatus(error instanceof Error
          ? `Shared appearance save failed: ${error.message}`
          : 'Shared appearance could not be saved.')
      }
    }, 800)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [siteBranding, siteTheme, isAdminSession, sharedBrandingLoaded])

  useEffect(() => {
    // Batch rapid state changes so imports/cloud loads do not repeatedly serialize a large collection.
    const timer = window.setTimeout(() => {
      try { saveCards(allCards) } catch {
        setNotice('Saving failed. The image may be too large; try a smaller image or use an image URL.')
      }
    }, 350)
    return () => window.clearTimeout(timer)
  }, [allCards])

  // Public reads must preserve the full cloud record, not just the legacy card fields.
  // Otherwise a refresh silently hides event, physical metadata, source provenance and raw CSV fields.
  useEffect(() => {
    const endpoint = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    if (!endpoint || !anonKey) return
    let cancelled = false
    type PublicDbCard = {
      id: string; player_name: string; overall_rating: number; positions: string[]; nation: string
      card_name?: string | null; club?: string | null; stats?: Record<string, number> | null
      perks?: string[] | null; image_url?: string | null; source_url: string; verified_at: string
      event?: string | null; position_category?: string | null; date_of_birth?: string | null
      height_cm?: number | string | null; weight_kg?: number | string | null; foot?: string | null
      weak_foot?: number | null; skill_moves?: number | null; source_image_path?: string | null
      source_data?: Record<string, string> | null; source_status?: 'verified' | 'imported-unverified' | null
    }
    void fetch(`${endpoint}/rest/v1/cards?select=*&order=player_name.asc`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    }).then(async response => {
      if (!response.ok) throw new Error('Shared database read failed')
      return await response.json() as PublicDbCard[]
    }).then(rows => {
      if (cancelled) return
      const remoteCards: PlayerCard[] = rows.filter(row => !row.id.startsWith('uflmb-demo-')).map(row => ({
        id: row.id, playerName: row.player_name, overallRating: row.overall_rating, positions: row.positions,
        nation: row.nation, ...(row.card_name ? { cardName: row.card_name } : {}),
        ...(row.club ? { club: row.club } : {}),
        ...(row.stats && Object.keys(row.stats).length ? { stats: row.stats } : {}),
        ...(row.perks?.length ? { perks: row.perks } : {}),
        ...(row.image_url ? { imageUrl: row.image_url } : {}),
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
      }))
      const ids = new Set(remoteCards.map(card => card.id))
      setAllCards(current => [...remoteCards, ...current.filter(card => card.id.startsWith('uflmb-demo-') || !ids.has(card.id))])
    }).catch(() => {
      // Keep the local cache usable if the shared backend is temporarily unavailable.
    })
    return () => { cancelled = true }
  }, [])

  const nations = useMemo(() => Array.from(new Set(allCards.map(card => card.nation).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [allCards])
  const availableStats = useMemo(() => Array.from(new Set(allCards.flatMap(card => Object.keys(card.stats ?? {})))).sort((a,b) => a.localeCompare(b)), [allCards])
  const positions = useMemo(() => Array.from(new Set(allCards.flatMap(card => card.positions).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [allCards])
  const cardTypes = useMemo(() => Array.from(new Set(allCards.map(card => card.cardName).filter((value): value is string => Boolean(value?.trim())))).sort((a, b) => a.localeCompare(b)), [allCards])
  const events = useMemo(() => Array.from(new Set(allCards.map(card => card.event).filter((value): value is string => Boolean(value?.trim())))).sort((a, b) => a.localeCompare(b)), [allCards])

  const searchIndex = useMemo(() => new Map(allCards.map(card => [card.id,
    [card.playerName, card.nation, card.club, card.cardName, card.event, card.positionCategory, card.foot, card.sourceImagePath, card.sourceUrl, ...card.positions, ...(card.perks ?? []), ...Object.entries(card.stats ?? {}).flatMap(([key, value]) => [key, String(value)]), ...Object.entries(card.sourceData ?? {}).flatMap(([key, value]) => [key, value])]
      .filter(Boolean).join(' ').toLowerCase(),
  ] as const)), [allCards])

  const visibleCards = useMemo(() => allCards.filter(card => {
    return (searchIndex.get(card.id) ?? '').includes(query.toLowerCase()) &&
      (category === 'All cards' || positionGroup(card.positions) === category) &&
      (nationFilter === 'All nations' || card.nation === nationFilter) &&
      (positionFilter === 'All positions' || card.positions.includes(positionFilter)) &&
      (cardTypeFilter === 'All card types' || card.cardName === cardTypeFilter) &&
      (eventFilter === 'All events' || card.event === eventFilter) &&
      (sourceFilter === 'all' || (sourceFilter === 'imported' && card.sourceStatus === 'imported-unverified') || (sourceFilter === 'demo' && card.id.startsWith('uflmb-demo-')) || (sourceFilter === 'verified' && card.sourceStatus !== 'imported-unverified' && !card.id.startsWith('uflmb-demo-'))) &&
      (minOvr === '' || card.overallRating >= Number(minOvr)) &&
      (maxOvr === '' || card.overallRating <= Number(maxOvr)) &&
      (statFilter === 'Any stat' || (typeof card.stats?.[statFilter] === 'number' && (minStat === '' || card.stats[statFilter] >= Number(minStat)) && (maxStat === '' || card.stats[statFilter] <= Number(maxStat)))) &&
      (!showBookmarked || bookmarkedIds.includes(card.id))
  }).sort((a, b) => sortBy === 'ovr-desc' ? b.overallRating - a.overallRating || a.playerName.localeCompare(b.playerName) :
    sortBy === 'ovr-asc' ? a.overallRating - b.overallRating || a.playerName.localeCompare(b.playerName) :
      sortBy === 'verified-desc' ? (b.verifiedAt || '').localeCompare(a.verifiedAt || '') || a.playerName.localeCompare(b.playerName) :
        a.playerName.localeCompare(b.playerName)), [allCards, searchIndex, query, category, nationFilter, positionFilter, cardTypeFilter, eventFilter, sourceFilter, sortBy, minOvr, maxOvr, statFilter, minStat, maxStat, showBookmarked, bookmarkedIds])

  const comparedCards = useMemo(() => compareIds.map(id => allCards.find(card => card.id === id)).filter((card): card is PlayerCard => Boolean(card)), [allCards, compareIds])
  const pagedCards = useMemo(() => visibleCards.slice(0, cardPage * 24), [visibleCards, cardPage])
  useEffect(() => { setCardPage(1) }, [visibleCards])
  const squadSlots = formations[formationId]
  const activeSquadKey = `${activeSquad}:`
  const squadPlayers = squadSlots.map(slot => ({ slot, card: allCards.find(card => card.id === squadAssignments[`${activeSquadKey}${slot.id}`]) })).filter((entry): entry is {slot: SquadSlot; card: PlayerCard} => Boolean(entry.card))
  const squadRating = squadPlayers.length ? Math.round(squadPlayers.reduce((total, entry) => total + entry.card.overallRating, 0) / squadPlayers.length) : 0
  const squadPositionFits = squadPlayers.filter(({slot,card}) => card.positions.some(position => slot.positions.includes(position))).length
  const statLeaders = useMemo(() => {
    const statKeys = Array.from(new Set(allCards.flatMap(card => Object.keys(card.stats ?? {}))))
      .filter(key => allCards.some(card => typeof card.stats?.[key] === 'number'))
      .sort((a, b) => a.localeCompare(b))
    return statKeys.map(key => ({ key, cards: allCards.filter(card => typeof card.stats?.[key] === 'number').sort((a, b) => (b.stats?.[key] ?? -Infinity) - (a.stats?.[key] ?? -Infinity)).slice(0, 5) })).filter(item => item.cards.length)
  }, [allCards])

  const toggleBookmark = (id: string) => setBookmarkedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])

  const toggleCompare = (id: string) => {
    setShowCompare(true)
    setCompareIds(current => {
    if (current.includes(id)) return current.filter(value => value !== id)
    if (current.length >= 3) { setNotice('Compare up to three cards at once. Remove one selection first.'); return current }
    return [...current, id]
    })
  }

  const autoFillSquad = () => {
    if (!allCards.length) { setNotice('Add verified player cards before building a squad.'); return }
    const used = new Set<string>()
    const next: Record<string, string> = { ...squadAssignments }
    Object.keys(next).filter(key => key.startsWith(activeSquadKey)).forEach(key => delete next[key])
    for (const slot of squadSlots) {
      const candidate = allCards
        .filter(card => !used.has(card.id))
        .sort((a, b) =>
          Number(b.positions.some(position => slot.positions.includes(position))) - Number(a.positions.some(position => slot.positions.includes(position))) ||
          b.overallRating - a.overallRating ||
          a.playerName.localeCompare(b.playerName))
        .find(card => !used.has(card.id))
      if (candidate) {
        next[`${activeSquadKey}${slot.id}`] = candidate.id
        used.add(candidate.id)
      }
    }
    setSquadAssignments(next)
    setNotice(`Auto-filled ${Math.min(squadSlots.length, allCards.length)} positions using position fit first, then OVR. Review the lineup before using it.`)
  }

  const exportSquad = () => {
    const payload = {
      format: 'uflmb-squad-v1',
      formation: formationId,
      team: activeSquad,
      exportedAt: new Date().toISOString(),
      players: squadSlots.flatMap(slot => {
        const card = allCards.find(item => item.id === squadAssignments[`${activeSquadKey}${slot.id}`])
        return card ? [{
          slotId: slot.id,
          slotLabel: slot.label,
          playerName: card.playerName,
          overallRating: card.overallRating,
          positions: card.positions,
          nation: card.nation,
          club: card.club ?? '',
          cardName: card.cardName ?? '',
          sourceUrl: card.sourceUrl,
        }] : []
      }),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `uflmb-squad-${activeSquad}-${formationId}.json`
    link.click()
    URL.revokeObjectURL(url)
    setNotice('Squad exported as a portable JSON file. It includes player references, not images or card database records.')
  }

  const importSquad = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid file')
      const data = parsed as { format?: unknown; formation?: unknown; players?: unknown }
      if (data.format !== 'uflmb-squad-v1' || !Array.isArray(data.players)) throw new Error('Unsupported format')
      const nextFormation: FormationId = data.formation === '4-4-2' || data.formation === '3-5-2' ? data.formation : '4-3-3'
      const nextSlots = formations[nextFormation]
      const nextAssignments: Record<string, string> = { ...squadAssignments }
      Object.keys(nextAssignments).filter(key => key.startsWith(activeSquadKey)).forEach(key => delete nextAssignments[key])
      const used = new Set<string>()
      let matched = 0
      for (const raw of data.players) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
        const player = raw as { slotId?: unknown; playerName?: unknown; overallRating?: unknown; nation?: unknown; club?: unknown; cardName?: unknown }
        if (typeof player.slotId !== 'string' || typeof player.playerName !== 'string') continue
        const slot = nextSlots.find(item => item.id === player.slotId)
        if (!slot) continue
        const card = allCards.find(item =>
          !used.has(item.id) &&
          item.playerName === player.playerName &&
          item.overallRating === player.overallRating &&
          item.nation === player.nation &&
          (item.club ?? '') === player.club &&
          (item.cardName ?? '') === player.cardName)
        if (!card) continue
        nextAssignments[`${activeSquad}:${slot.id}`] = card.id
        used.add(card.id)
        matched++
      }
      setFormationId(nextFormation)
      setSquadAssignments(nextAssignments)
      setNotice(`Squad imported: ${matched}/${data.players.length} player(s) matched to cards already in this browser. Missing cards were left empty; no card data was added.`)
    } catch {
      setNotice('Could not import this squad. Choose a valid UFLMB squad JSON export.')
    }
  }

  const adminCards = useMemo(() => allCards.filter(card =>
    [card.playerName, card.nation, card.club, card.cardName, card.id, card.sourceUrl, ...card.positions, ...(card.perks ?? []), ...Object.entries(card.stats ?? {}).flatMap(([key, value]) => [key, String(value)])].filter(Boolean).join(' ').toLowerCase().includes(adminSearch.toLowerCase())
  ), [allCards, adminSearch])

  const dataQuality = useMemo(() => {
    const today = new Date()
    const missingImage = allCards.filter(card => !card.imageUrl?.trim()).length
    const missingClubOrType = allCards.filter(card => !card.club?.trim() || !card.cardName?.trim()).length
    const missingStats = allCards.filter(card => !card.stats || !Object.keys(card.stats).length).length
    const invalidSource = allCards.filter(card => !/^https?:\/\//i.test(card.sourceUrl || '')).length
    const staleVerification = allCards.filter(card => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(card.verifiedAt || '')) return true
      const date = new Date(card.verifiedAt + 'T00:00:00')
      return Number.isNaN(date.getTime()) || (today.getTime() - date.getTime()) > 90 * 24 * 60 * 60 * 1000
    }).length
    const keys = new Set<string>()
    let duplicates = 0
    allCards.forEach(card => {
      const key = cardFingerprint(card)
      if (keys.has(key)) duplicates++
      else keys.add(key)
    })
    return { total: allCards.length, missingImage, missingClubOrType, missingStats, invalidSource, staleVerification, duplicates }
  }, [allCards])

  const reviewCandidates = useMemo(() => allCards.map(card => {
    const issues: string[] = []
    if (!card.imageUrl?.trim()) issues.push('Missing image')
    if (!card.stats || !Object.keys(card.stats).length) issues.push('Missing stats')
    if (!card.club?.trim()) issues.push('Missing club')
    if (!card.cardName?.trim()) issues.push('Missing card type')
    if (!isHttpUrl(card.sourceUrl || '')) issues.push('Invalid source')
    const verified = /^\d{4}-\d{2}-\d{2}$/.test(card.verifiedAt || '') ? new Date(card.verifiedAt + 'T00:00:00') : null
    if (!verified || Number.isNaN(verified.getTime()) || (Date.now() - verified.getTime()) > 90 * 86400000) issues.push('Source review due')
    return { card, issues }
  }).filter(item => item.issues.length > 0).sort((a, b) => b.issues.length - a.issues.length || a.card.playerName.localeCompare(b.card.playerName)).slice(0, 50), [allCards])

  const toggleSelected = (id: string) => setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  const selectVisible = () => setSelectedIds(current => {
    const visibleIds = adminCards.map(card => card.id)
    return visibleIds.every(id => current.includes(id))
      ? current.filter(id => !visibleIds.includes(id))
      : Array.from(new Set([...current, ...visibleIds]))
  })
  const deleteSelected = () => {
    const selected = new Set(selectedIds)
    if (!selected.size || !window.confirm(`Delete ${selected.size} selected card(s) from this browser? Export a JSON backup first if needed.`)) return
    const next = allCards.filter(card => !selected.has(card.id))
    setAllCards(next)
    setSelectedIds([])
    if (editingId && selected.has(editingId)) resetForm()
    setNotice(`${allCards.length - next.length} selected card(s) deleted.`)
  }

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
    const normalize = (value: string) => value.toLowerCase().replace(/\\.[^.]+$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
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
      const valid = parsed.filter(isValidPlayerCard)
      const keys = new Set(allCards.map(cardFingerprint))
      const additions = valid.filter(card => {
        const key = cardFingerprint(card)
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
      id: editingId ? editingId : makeId(),
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
      const XLSX = await import('xlsx')
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
      const existingKeys = new Set(allCards.map(cardFingerprint))
      const uniqueImported = imported.filter(card => {
        const key = cardFingerprint(card)
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

  const saveEverything = () => {
    const backup = {
      format: 'uflmb-full-backup-v1',
      savedAt: new Date().toISOString(),
      cards: allCards,
      bookmarks: bookmarkedIds,
      squad: { formation: formationId, assignments: squadAssignments, activeTeam: activeSquad },
      appearance: { theme: siteTheme, branding: siteBranding },
    }

    let localSaveSucceeded = true
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allCards))
      localStorage.setItem('uflmb.bookmarks.v1', JSON.stringify(bookmarkedIds))
      localStorage.setItem('uflmb.squad.formation', formationId)
      localStorage.setItem('uflmb.squad.assignments', JSON.stringify(squadAssignments))
      localStorage.setItem(THEME_KEY, JSON.stringify(siteTheme))
      localStorage.setItem(BRANDING_KEY, JSON.stringify(siteBranding))
      localStorage.setItem(DRIVE_CLIENT_KEY, googleClientId.trim())
      localStorage.setItem(DRIVE_API_KEY, googleApiKey.trim())
    } catch {
      localSaveSucceeded = false
    }

    // Export a portable backup without Google configuration values.
    // Those settings are saved locally, but should not be copied into a shareable backup.
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'uflmb-full-backup.json'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)

    setNotice(localSaveSucceeded
      ? 'All UFLMB data and settings were saved in this browser. A full JSON backup was downloaded.'
      : 'A JSON backup was downloaded, but browser storage could not save everything (possibly full storage). Keep the backup file safe.')
  }

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
      if (!parsed.every(isValidPlayerCard)) {
        setNotice('Import cancelled: at least one record is invalid. No records were changed. Check IDs, OVR, positions, nation, source URL and verification date.')
        return
      }
      const incoming = parsed as PlayerCard[]
      const incomingIds = new Set<string>()
      for (const card of incoming) {
        if (incomingIds.has(card.id)) {
          setNotice(`Import cancelled: duplicate ID "${card.id}" appears more than once in the file. No records were changed.`)
          return
        }
        incomingIds.add(card.id)
      }

      const existingById = new Map(allCards.map(card => [card.id, card]))
      const incomingById = new Map(incoming.map(card => [card.id, card]))
      const replacementCount = incoming.filter(card => existingById.has(card.id)).length
      const existingFingerprints = new Set(allCards.map(cardFingerprint))
      const importFingerprints = new Set<string>()
      let duplicateCount = 0
      const additions: PlayerCard[] = []
      for (const card of incoming) {
        if (existingById.has(card.id)) continue
        const fingerprint = cardFingerprint(card)
        if (existingFingerprints.has(fingerprint) || importFingerprints.has(fingerprint)) {
          duplicateCount++
          continue
        }
        importFingerprints.add(fingerprint)
        additions.push(card)
      }

      const prompt = [
        `Import contains ${incoming.length} valid record(s).`,
        `${replacementCount} existing record(s) share an ID and would be updated.`,
        `${additions.length} new record(s) would be added.`,
        `${duplicateCount} likely duplicate(s) would be skipped.`,
        '',
        'Continue? Export a backup first if you are unsure.',
      ].join('\n')
      if (!window.confirm(prompt)) {
        setNotice('Import cancelled. No records were changed.')
        return
      }

      const replacements = incoming.filter(card => existingById.has(card.id))
      const next = [
        ...replacements,
        ...additions,
        ...allCards.filter(card => !incomingById.has(card.id)),
      ]
      try {
        saveCards(next)
        setAllCards(next)
        setImportText('')
        setNotice(`Import complete: ${replacements.length} updated, ${additions.length} added, ${duplicateCount} duplicate(s) skipped. ${next.length} total records saved.`)
      } catch {
        setNotice('Import could not be saved. Browser storage may be full; export a backup and try a smaller dataset.')
      }
    } catch { setNotice('Invalid JSON. Check the file contents.') }
  }

    if (isAdminSession) return (
    <main className="app-shell admin-shell">
      <header className="topbar admin-topbar">
        <a className="brand" href="/UFLMB/" aria-label="UFLMB home">{siteBranding.logoUrl.trim() ? <img className="brand-logo-image" src={siteBranding.logoUrl.trim()} alt="UFLMB logo" /> : <span className="brand-mark">{siteBranding.iconText || 'U'}</span>}<span className="brand-word">UFL<span>MB</span></span></a>
        <div className="top-actions"><span className="status-pill"><span className="status-dot" /> Admin access verified</span><a className="back-link" href="/UFLMB/">Public database ↗</a><AuthAccess isAdmin={isAdminSession} onAdminChange={setIsAdminSession} /></div>
      </header>
      <section className="admin-intro">
        <p className="eyebrow">CONTENT MANAGEMENT</p>
        <h1>Card <span>manager.</span></h1>
        <p className="hero-copy">Manually add, edit, save, and export cards, images, stats, and verification sources.</p>
        {notice && <div className="notice">{notice}</div>}
      </section>
      <nav className="admin-tabs" aria-label="Admin sections">
        {([
          ['cards', '▣', 'Card manager', 'Add, edit and manage records'],
          ['quality', '✓', 'Data quality', 'Collection health checks'],
          ['imports', '⇅', 'Import / Export', 'Files, backups and data transfer'],
          ['appearance', '◈', 'Branding', 'Logo, icon and background'],
          ['cloud', '☁', 'Cloud sync', 'Admin sign-in and shared records'],
        ] as const).map(([id, icon, label, description]) => (
          <button key={id} type="button" className={adminTab === id ? 'admin-tab active' : 'admin-tab'} onClick={() => setAdminTab(id)}>
            <span className="admin-tab-icon">{icon}</span><span className="admin-tab-copy"><strong>{label}</strong><small>{description}</small></span><span className="admin-tab-arrow">›</span>
          </button>
        ))}
      </nav>
            {adminTab === 'appearance' && <>
      <section className="admin-panel theme-editor">
        <div className="section-heading"><div><p className="eyebrow">SITE APPEARANCE</p><h2>UFL Arena theme</h2></div><span className="count-label">Fixed theme</span></div>
        <p className="muted-copy">The site uses one fixed UFL-inspired visual style: dark arena backgrounds, lime-green accents, high-contrast text and rounded panels. Theme colors and styling cannot be changed from the admin panel.</p>
        <div className="theme-live-preview" style={{ background: 'radial-gradient(ellipse at 20% 0%, #c5f46725, transparent 55%), #0b0d12', color: '#f3f5f8', borderRadius: 15 }}>
          <div className="theme-preview-top"><span className="theme-preview-mark" style={{ background: '#c5f467', color: '#0b0d12' }}>U</span><strong>UFLMB <small>ARENA</small></strong></div>
          <div className="theme-preview-card" style={{ background: '#11141b', borderRadius: 12 }}><span className="theme-preview-accent" style={{ color: '#c5f467' }}>UFL-INSPIRED DESIGN</span><h3>One identity. One arena.</h3><p style={{ opacity: .72 }}>Charcoal surfaces, lime highlights and clear, readable contrast.</p><button type="button" style={{ background: '#c5f467', color: '#0b0d12', borderRadius: 10 }}>Sample action</button></div>
        </div>
<section className="branding-editor">
          <div className="section-heading"><div><p className="eyebrow">BRAND IDENTITY</p><h2>Logo, icon & background image</h2></div></div>
          <p className="muted-copy">Paste direct image URLs (HTTPS recommended). Changes preview immediately and sync to every visitor after the cloud save.</p>
          <div className="theme-controls branding-controls">
            <label>Brand icon / symbol<input maxLength={5} value={siteBranding.iconText} onChange={e => setSiteBranding(current => ({ ...current, iconText: e.target.value.slice(0, 5) }))} placeholder="U, ⚽, ★" /><small>Text, initials or emoji shown in the square brand mark</small></label>
            <label>Logo image URL<input type="url" value={siteBranding.logoUrl} onChange={e => setSiteBranding(current => ({ ...current, logoUrl: e.target.value }))} placeholder="https://example.com/logo.png" /><small>Direct URL to a PNG, SVG, WebP or JPG logo</small></label>
            <label>Browser tab icon (favicon) URL<input type="url" value={siteBranding.faviconUrl} onChange={e => setSiteBranding(current => ({ ...current, faviconUrl: e.target.value }))} placeholder="https://example.com/icon.png" /><small>Small icon shown on the browser tab</small></label>
            <label className="branding-wide">Background image URLs (one per line)<textarea rows={5} value={backgroundUrlsText} onChange={e => setBackgroundUrlsText(e.target.value)} onBlur={() => { const backgroundImageUrls = parseBackgroundUrls(backgroundUrlsText); setSiteBranding(current => ({ ...current, backgroundImageUrls })); setBackgroundUrlsText(backgroundImageUrls.join('\n')); setBackgroundIndex(0) }} placeholder={'https://example.com/arena-1.jpg\nhttps://example.com/arena-2.jpg\nhttps://example.com/arena-3.jpg'} /><small>Add multiple direct image URLs, one per line (or separated by commas). Click Apply backgrounds or leave this field to save the list. Valid HTTP/HTTPS links are saved; duplicates and invalid links are ignored. Backgrounds rotate automatically every 30 seconds. A strong dark gradient overlay is applied to every background to keep text readable.</small></label>
          </div>
          <div className="branding-preview">
            <div className="branding-preview-item"><strong>Brand mark / logo</strong>{siteBranding.logoUrl.trim() ? <img src={siteBranding.logoUrl.trim()} alt="Logo preview" onError={e => { e.currentTarget.style.display = 'none' }} /> : <span className="brand-mark">{siteBranding.iconText || 'U'}</span>}</div>
            {siteBranding.faviconUrl.trim() && <div className="branding-preview-item"><strong>Browser icon</strong><img className="favicon-preview" src={siteBranding.faviconUrl.trim()} alt="Favicon preview" /></div>}
            {siteBranding.backgroundImageUrls.length > 0 && <div className="branding-background-preview" style={{ backgroundImage: `linear-gradient(rgba(5,8,14,.74), rgba(5,8,14,.82)), url("${siteBranding.backgroundImageUrls[backgroundIndex % siteBranding.backgroundImageUrls.length].replace(/["\\]/g, '')}")` }}><span>Background preview · {backgroundIndex % siteBranding.backgroundImageUrls.length + 1}/{siteBranding.backgroundImageUrls.length} · rotates every 30 seconds</span></div>}
          </div>
          <div className="branding-publish-panel">
            <div className="branding-publish-copy"><strong>Publish site appearance</strong><span>Apply the current branding to every visitor through the shared database.</span></div>
            <div className="branding-publish-actions">
              <button className="button primary branding-publish-button" type="button" onClick={() => void publishBranding()} disabled={brandingPublishBusy || !sharedBrandingLoaded || !isAdminSession}>
                <span aria-hidden="true">{brandingPublishBusy ? '◌' : '↗'}</span>{brandingPublishBusy ? 'Updating branding…' : 'Update branding'}
              </button>
              <div className={`branding-publish-status ${brandingPublishBusy ? 'is-loading' : /verified:|shared appearance saved/i.test(sharedBrandingStatus) ? 'is-success' : /failed|could not|please use|admin sign-in|wait until|reload before/i.test(sharedBrandingStatus) ? 'is-error' : 'is-info'}`} role="status" aria-live="polite">
                <span className="branding-status-icon" aria-hidden="true">{brandingPublishBusy ? '◌' : /verified:|shared appearance saved/i.test(sharedBrandingStatus) ? '✓' : /failed|could not|please use|admin sign-in|wait until|reload before/i.test(sharedBrandingStatus) ? '!' : 'i'}</span>
                <span className="branding-status-text">{sharedBrandingStatus}</span>
              </div>
            </div>
          </div>
          <div className="form-actions"><button className="button secondary" type="button" onClick={() => { const backgroundImageUrls = parseBackgroundUrls(backgroundUrlsText); setSiteBranding(current => ({ ...current, backgroundImageUrls })); setBackgroundIndex(0); setBackgroundUrlsText(backgroundImageUrls.join('\n')) }}>Apply backgrounds</button><button className="button secondary" type="button" onClick={() => { setSiteBranding(defaultBranding); setBackgroundUrlsText(''); setBackgroundIndex(0) }}>Reset branding</button></div>
        </section>
      </section>
      </>}
      {adminTab === 'cards' && <>
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
      </>}
      {adminTab === 'quality' && <>
      <section className="admin-panel">
        <p className="eyebrow">DATA QUALITY</p><h2>Collection health</h2>
        <p className="muted-copy">These checks help identify incomplete or potentially stale records. Missing optional fields are warnings, not proof that a card is incorrect. Verification older than 90 days is flagged for review.</p>
        <div className="quality-grid">
          <div className="quality-tile"><strong>{dataQuality.total}</strong><span>Total cards</span></div>
          <div className="quality-tile"><strong>{dataQuality.missingImage}</strong><span>Missing image</span></div>
          <div className="quality-tile"><strong>{dataQuality.missingStats}</strong><span>Missing stats</span></div>
          <div className="quality-tile"><strong>{dataQuality.missingClubOrType}</strong><span>Missing club or type</span></div>
          <div className="quality-tile"><strong>{dataQuality.staleVerification}</strong><span>Needs source review</span></div>
          <div className="quality-tile"><strong>{dataQuality.invalidSource}</strong><span>Invalid source URL</span></div>
          <div className={dataQuality.duplicates ? 'quality-tile quality-warning' : 'quality-tile'}><strong>{dataQuality.duplicates}</strong><span>Possible duplicates</span></div>
        </div>
        <div className="quality-review">
          <div className="section-heading"><div><p className="eyebrow">ACTIONABLE AUDIT</p><h3>Records to review</h3></div><span className="count-label">Showing {Math.min(reviewCandidates.length, 50)} of {reviewCandidates.length}</span></div>
          <p className="muted-copy">Use these flags as a review queue. Missing optional details do not automatically mean a record is wrong. Review the source before changing factual data.</p>
          {reviewCandidates.length === 0 ? <p className="muted-copy">No records currently need attention. Keep source links and verification dates current.</p> : <div className="record-list">{reviewCandidates.map(({ card, issues }) => <article className="record-row" key={card.id}>
            {card.imageUrl ? <img className="record-thumb" src={card.imageUrl} alt="" loading="lazy" /> : <div className="record-thumb placeholder-thumb">U</div>}
            <div className="record-info"><strong>{card.playerName} · OVR {card.overallRating}</strong><span>{card.positions.join('/')} · {card.nation}</span><small>{issues.join(' · ')}</small></div>
            <button className="button secondary" type="button" onClick={() => { setAdminTab('cards'); startEdit(card); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Review record</button>
          </article>)}</div>}
        </div>
      </section>
      </>}
      {adminTab === 'cards' && <>
      <section className="admin-panel">
        <div className="section-heading"><div><p className="eyebrow">RECORDS</p><h2>Existing cards</h2></div><input className="admin-search" value={adminSearch} onChange={e => setAdminSearch(e.target.value)} placeholder="Search…" aria-label="Search admin records" /></div>
        <div className="form-actions record-bulk-actions">
          <button className="button secondary" type="button" onClick={selectVisible}>{adminCards.length > 0 && adminCards.every(card => selectedIds.includes(card.id)) ? 'Deselect visible' : 'Select visible'}</button>
          <span className="muted-copy">{selectedIds.length} selected</span>
          <button className="button danger" type="button" disabled={!selectedIds.length} onClick={deleteSelected}>Delete selected</button>
        </div>
        {adminCards.length === 0 ? <p className="muted-copy">No cards have been added yet.</p> : <div className="record-list">{adminCards.map(card => <article className={selectedIds.includes(card.id) ? 'record-row record-row-selected' : 'record-row'} key={card.id}>
          <label className="record-select" aria-label={`Select ${card.playerName}`}><input type="checkbox" checked={selectedIds.includes(card.id)} onChange={() => toggleSelected(card.id)} /></label>
          {card.imageUrl ? <img className="record-thumb" src={card.imageUrl} alt="" /> : <div className="record-thumb placeholder-thumb">U</div>}
          <div className="record-info"><strong>{card.playerName}</strong><span>OVR {card.overallRating} · {card.positions.join('/')} · {card.nation}</span><small>{card.cardName || 'No card type specified'} · verified: {card.verifiedAt}</small></div>
          <button className="button secondary" type="button" onClick={() => startEdit(card)}>Edit</button>
          <button className="button danger" type="button" onClick={() => { if (window.confirm(`Are you sure you want to delete this record: ${card.playerName}?`)) { const next = allCards.filter(item => item.id !== card.id); setAllCards(next); setNotice('Record deleted.'); if (editingId === card.id) resetForm() } }}>Delete</button>
        </article>)}</div>}
      </section>
      </>}
      <div style={{ display: adminTab === 'cloud' ? 'contents' : 'none' }}>
      <SharedDatabasePanel
        cards={allCards}
        appState={{ bookmarkedIds, formationId, squadAssignments }}
        onLoad={remoteCards => setAllCards(current => [...remoteCards, ...current.filter(card => card.id.startsWith('uflmb-demo-') || !remoteCards.some(remote => remote.id === card.id))])}
        onLoadAppState={saved => {
          if (Array.isArray(saved.bookmarkedIds)) setBookmarkedIds(saved.bookmarkedIds.filter((id): id is string => typeof id === 'string'))
          if (saved.formationId === '4-3-3' || saved.formationId === '4-4-2' || saved.formationId === '3-5-2') setFormationId(saved.formationId)
          if (saved.squadAssignments && typeof saved.squadAssignments === 'object' && !Array.isArray(saved.squadAssignments)) setSquadAssignments(Object.fromEntries(Object.entries(saved.squadAssignments).filter((entry): entry is [string, string] => typeof entry[1] === 'string')))
        }}
        onMessage={setNotice}
      />
      </div>
      {adminTab === 'cloud' && <section className="admin-panel tools-panel cloud-help-panel">
        <p className="eyebrow">SYNC SAFETY</p><h2>How cloud sync works</h2>
        <ul className="cloud-safety-list"><li>Sign in with the Supabase Auth account that was added to the trusted admin list.</li><li>Load the shared records before editing so the app has a current cloud snapshot.</li><li>Card additions and edits auto-save after a short delay; automatic saving does not delete remote records.</li><li>Remote deletions are only applied through the separate, confirmed publish action.</li></ul>
      </section>}
      {adminTab === 'imports' && <>
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
      </>}
      <div className="admin-backup-action">
        <button className="button secondary" type="button" onClick={saveEverything} title="Save all browser data and download a JSON backup" aria-label="Save everything and download backup"><span aria-hidden="true">⇩</span> Save &amp; backup</button>
      </div>
      {createPortal(
        <nav className="mobile-bottom-nav" aria-label="Primary navigation">
                <button type="button" className={page === 'home' ? 'mobile-nav-item active' : 'mobile-nav-item'} aria-current={page === 'home' ? 'page' : undefined} onClick={() => { setPage('home'); window.scrollTo({ top: 0, behavior: 'auto' }) }}><span className="mobile-nav-icon" aria-hidden="true">⌂</span><span>Home</span></button>
                <button type="button" className={!showBookmarked && page === 'players' ? 'mobile-nav-item active' : 'mobile-nav-item'} aria-current={!showBookmarked && page === 'players' ? 'page' : undefined} onClick={() => { setPage('players'); setShowBookmarked(false); window.scrollTo({ top: 0, behavior: 'auto' }) }}><span className="mobile-nav-icon player-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="7" r="4" fill="currentColor" /><path d="M4.5 21v-2.2a7.5 7.5 0 0 1 15 0V21z" fill="currentColor" /></svg></span><span>Players</span><small>{allCards.length}</small></button>
          <button type="button" className={showBookmarked && page === 'players' ? 'mobile-nav-item active' : 'mobile-nav-item'} aria-current={showBookmarked && page === 'players' ? 'page' : undefined} onClick={() => { setPage('players'); setShowBookmarked(true); setQuery(''); setCategory('All cards'); setNationFilter('All nations'); setPositionFilter('All positions'); setCardTypeFilter('All card types'); setEventFilter('All events'); setSourceFilter('all'); setSortBy('ovr-desc'); setMinOvr(''); setMaxOvr(''); setStatFilter('Any stat'); setMinStat(''); setMaxStat(''); window.scrollTo({ top: 0, behavior: 'auto' }) }}><span className="mobile-nav-icon" aria-hidden="true">★</span><span>Favorites</span>{bookmarkedIds.length > 0 && <small>{bookmarkedIds.length}</small>}</button>
                <button type="button" className={page === 'compare' ? 'mobile-nav-item active' : 'mobile-nav-item'} aria-current={page === 'compare' ? 'page' : undefined} onClick={() => { setPage('compare'); window.scrollTo({ top: 0, behavior: 'auto' }) }}><span className="mobile-nav-icon" aria-hidden="true">⇄</span><span>Compare</span>{compareIds.length > 0 && <small>{compareIds.length}</small>}</button>
              </nav>,
        document.body,
      )}
      <footer className="footer"><span>UFLMB <span className="footer-muted">· Admin tools</span></span><a href="/UFLMB/">Back to home</a></footer>
    </main>
  )


  const publishBranding = async () => {
    if (brandingPublishBusy) return
    if (!sharedBrandingLoaded) {
      setSharedBrandingStatus('Wait until the current shared appearance has loaded before publishing.')
      return
    }
    const endpoint = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    let token = ''
    try {
      const raw = sessionStorage.getItem('uflmb.auth.session.v1')
      token = raw ? (JSON.parse(raw) as { access_token?: string }).access_token || '' : ''
    } catch { /* require a valid admin session */ }
    if (!endpoint || !anonKey || !token || !isAdminSession) {
      setSharedBrandingStatus('Admin sign-in is required to publish the site appearance.')
      return
    }

    const brandingToPublish: SiteBranding = {
      iconText: siteBranding.iconText.trim().slice(0, 5) || defaultBranding.iconText,
      logoUrl: siteBranding.logoUrl.trim(),
      faviconUrl: siteBranding.faviconUrl.trim(),
      backgroundImageUrls: parseBackgroundUrls(backgroundUrlsText),
    }
    if ((brandingToPublish.logoUrl && !isHttpUrl(brandingToPublish.logoUrl)) ||
        (brandingToPublish.faviconUrl && !isHttpUrl(brandingToPublish.faviconUrl))) {
      setSharedBrandingStatus('Please use valid HTTP or HTTPS URLs for the logo and browser icon before publishing.')
      return
    }

    setBrandingPublishBusy(true)
    setSharedBrandingStatus('Publishing appearance to the shared site…')
    setSiteBranding(brandingToPublish)
    setBackgroundUrlsText(brandingToPublish.backgroundImageUrls.join('\n'))
    setBackgroundIndex(0)
    const payload = { theme: siteTheme, branding: brandingToPublish }
    const updatedAt = new Date().toISOString()
    try {
      const response = await fetch(`${endpoint}/rest/v1/site_settings?on_conflict=id`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({ id: 'branding', payload, updated_at: updatedAt }),
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(detail || `Request failed (HTTP ${response.status}).`)
      }

      // Confirm the shared row can immediately be read back before reporting success.
      const verifyResponse = await fetch(`${endpoint}/rest/v1/site_settings?id=eq.branding&select=payload,updated_at`, {
        cache: 'no-store',
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      })
      if (!verifyResponse.ok) throw new Error('The save request completed, but the shared appearance could not be verified.')
      const rows = await verifyResponse.json() as Array<{ payload?: { branding?: Partial<SiteBranding> }; updated_at?: string }>
      const saved = rows[0]?.payload?.branding
      if (!saved || saved.iconText !== brandingToPublish.iconText ||
          saved.logoUrl !== brandingToPublish.logoUrl ||
          saved.faviconUrl !== brandingToPublish.faviconUrl ||
          JSON.stringify(saved.backgroundImageUrls ?? []) !== JSON.stringify(brandingToPublish.backgroundImageUrls)) {
        throw new Error('The shared appearance did not match the submitted settings after saving. Please try again.')
      }
      setSharedBrandingStatus(`Verified: appearance updated for all visitors · ${new Date().toLocaleTimeString()}`)
    } catch (error) {
      setSharedBrandingStatus(error instanceof Error
        ? `Branding update failed: ${error.message}`
        : 'Branding update failed. Please try again.')
    } finally {
      setBrandingPublishBusy(false)
    }
  }


  return (
    <main className="app-shell">
      <header className={menuOpen ? "topbar topbar-menu-open" : "topbar"}>
        <a className="brand" href="/UFLMB/" aria-label="UFLMB home" onClick={() => setMenuOpen(false)}>{siteBranding.logoUrl.trim() ? <img className="brand-logo-image" src={siteBranding.logoUrl.trim()} alt="UFLMB logo" /> : <span className="brand-mark">{siteBranding.iconText || 'U'}</span>}<span className="brand-word">UFL<span>MB</span></span></a>
        <nav className={menuOpen ? "site-nav site-nav-open" : "site-nav"} id="uflmb-main-navigation" aria-label="Main navigation">
          <button type="button" className={page === 'home' ? 'nav-page active' : 'nav-page'} aria-current={page === 'home' ? 'page' : undefined} onClick={() => { setPage('home'); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'auto' }) }}>Home</button>
          <button type="button" className={!showBookmarked && page === 'players' ? 'nav-page active' : 'nav-page'} aria-current={!showBookmarked && page === 'players' ? 'page' : undefined} onClick={() => { setPage('players'); setShowBookmarked(false); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'auto' }) }}>Players <span className="nav-count">{allCards.length}</span></button>
          <button type="button" className={showBookmarked && page === 'players' ? 'nav-page active' : 'nav-page'} aria-current={showBookmarked && page === 'players' ? 'page' : undefined} onClick={() => { setPage('players'); setShowBookmarked(true); setQuery(''); setCategory('All cards'); setNationFilter('All nations'); setPositionFilter('All positions'); setCardTypeFilter('All card types'); setEventFilter('All events'); setSourceFilter('all'); setSortBy('ovr-desc'); setMinOvr(''); setMaxOvr(''); setStatFilter('Any stat'); setMinStat(''); setMaxStat(''); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'auto' }) }}>Favorites <span className="nav-count">{bookmarkedIds.length}</span></button>
          <button type="button" className={page === 'compare' ? 'nav-page active' : 'nav-page'} aria-current={page === 'compare' ? 'page' : undefined} onClick={() => { setPage('compare'); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'auto' }) }}>Compare <span className="nav-count">{compareIds.length}</span></button>
        </nav>
        <div className="top-actions"><AuthAccess isAdmin={isAdminSession} onAdminChange={setIsAdminSession} /><button className="menu-toggle" type="button" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen} aria-controls="uflmb-main-navigation" onClick={() => setMenuOpen(value => !value)}><span className={menuOpen ? "menu-toggle-icon menu-toggle-icon-open" : "menu-toggle-icon"} aria-hidden="true"><i /><i /><i /></span><span>{menuOpen ? "Close" : "Menu"}</span></button></div>
      </header>
      {page === 'home' && <section className="home-page">
        <section className="home-hero"><p className="eyebrow">UFL MOBILE DATABASE</p><h1>Every card.<br /><span>One arena.</span></h1>
          <p className="hero-copy">Explore the community player-card collection, search player data, and compare attributes in one place.</p>
          <div className="home-actions"><button type="button" className="button primary" onClick={() => { setPage('players'); window.scrollTo({ top: 0, behavior: 'auto' }) }}>Browse all players <span aria-hidden="true">→</span></button><button type="button" className="button secondary" onClick={() => { setPage('compare'); window.scrollTo({ top: 0, behavior: 'auto' }) }}>Compare cards</button></div>
        </section>
        <section className="home-overview" aria-label="Database overview"><article><span>PLAYER CARDS</span><strong>{allCards.length.toLocaleString()}</strong><small>Records in the collection</small></article><article><span>NATIONS</span><strong>{nations.length.toLocaleString()}</strong><small>Countries represented</small></article><article><span>WITH ATTRIBUTES</span><strong>{allCards.filter(card => Boolean(card.stats && Object.keys(card.stats).length)).length.toLocaleString()}</strong><small>Cards with stat data</small></article></section>
        <section className="home-featured"><div className="section-heading"><div><p className="eyebrow">QUICK DISCOVERY</p><h2>Top-rated cards</h2></div><button type="button" className="button secondary" onClick={() => setPage('players')}>View all players ↗</button></div>
          <div className="featured-list">{[...allCards].sort((a,b) => b.overallRating-a.overallRating || a.playerName.localeCompare(b.playerName)).slice(0,6).map(card => <button type="button" className="featured-player" key={card.id} onClick={() => { setPage('players'); setQuery(card.playerName) }}><span className="featured-ovr">{card.overallRating}</span><span className="featured-name"><strong>{card.playerName}</strong><small>{card.positions.join(' / ')} · {card.nation}</small></span><span className="featured-arrow">↗</span></button>)}</div>
        </section>
      </section>}
      {page === 'players' && <section className="hero">
        <p className="eyebrow">{showBookmarked ? 'YOUR COLLECTION' : 'PLAYER DATABASE'}</p>
        <h1>{showBookmarked ? <>Your <span>favorites.</span></> : <>Your UFL Mobile<br /><span>card reference.</span></>}</h1>
        <p className="hero-copy">{showBookmarked ? 'Your starred player cards, collected in one place.' : 'A searchable home for UFL Mobile player cards. Browse verified records, check card details, and help build a reliable community reference.'}</p>
        <div className="search-wrap"><span className="search-icon" aria-hidden="true">⌕</span><input aria-label="Search the card database" type="search" placeholder="Search players, stats, perks, nations, positions…" value={query} onChange={e => setQuery(e.target.value)} /><kbd>{visibleCards.length} FOUND</kbd></div>
        <div className="category-row" aria-label="Card categories">{categories.map(item => <button className={category === item ? 'category active' : 'category'} key={item} onClick={() => setCategory(item)} type="button">{item}</button>)}</div>
        <details className="filter-disclosure">
          <summary><span className="filter-disclosure-title">Filters &amp; sorting</span><span className="filter-disclosure-hint">Nation, position, OVR, stats</span><span className="filter-disclosure-chevron" aria-hidden="true">⌄</span></summary>
          <div className="browse-controls" aria-label="Additional filters">
          <label>Nation <select value={nationFilter} onChange={e => setNationFilter(e.target.value)}><option>All nations</option>{nations.map(nation => <option key={nation} value={nation}>{nation}</option>)}</select></label>
          <label>Position <select value={positionFilter} onChange={e => setPositionFilter(e.target.value)}><option>All positions</option>{positions.map(position => <option key={position} value={position}>{position}</option>)}</select></label>
          <label>Card type <select value={cardTypeFilter} onChange={e => setCardTypeFilter(e.target.value)}><option>All card types</option>{cardTypes.map(cardType => <option key={cardType} value={cardType}>{cardType}</option>)}</select></label>
          <label>Event <select value={eventFilter} onChange={e => setEventFilter(e.target.value)}><option>All events</option>{events.map(event => <option key={event} value={event}>{event}</option>)}</select></label>
          <label>Data status <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value as 'all' | 'imported' | 'verified' | 'demo')}><option value="all">All data statuses</option><option value="imported">Imported · unverified</option><option value="verified">Verified records</option><option value="demo">Demo records</option></select></label>
          <label>Sort by <select value={sortBy} onChange={e => setSortBy(e.target.value as 'ovr-desc' | 'ovr-asc' | 'name-asc' | 'verified-desc')}><option value="ovr-desc">Highest OVR</option><option value="ovr-asc">Lowest OVR</option><option value="name-asc">Player name A–Z</option><option value="verified-desc">Recently verified</option></select></label>
          <label className="ovr-range">Min OVR <input aria-label="Minimum overall rating" type="number" min="1" max="999" value={minOvr} onChange={e => setMinOvr(e.target.value)} placeholder="Any" /></label>
          <label className="ovr-range">Max OVR <input aria-label="Maximum overall rating" type="number" min="1" max="999" value={maxOvr} onChange={e => setMaxOvr(e.target.value)} placeholder="Any" /></label>
          <label>Attribute <select value={statFilter} onChange={e => setStatFilter(e.target.value)}><option>Any stat</option>{availableStats.map(stat => <option key={stat} value={stat}>{stat}</option>)}</select></label>
          <label className="ovr-range">Min stat <input aria-label="Minimum selected attribute" type="number" min="0" max="999" disabled={statFilter === 'Any stat'} value={minStat} onChange={e => setMinStat(e.target.value)} placeholder="Any" /></label>
          <label className="ovr-range">Max stat <input aria-label="Maximum selected attribute" type="number" min="0" max="999" disabled={statFilter === 'Any stat'} value={maxStat} onChange={e => setMaxStat(e.target.value)} placeholder="Any" /></label>
          <button className={showBookmarked ? 'category active' : 'category'} type="button" aria-pressed={showBookmarked} onClick={() => setShowBookmarked(value => !value)}>★ {showBookmarked ? 'Show all cards' : `Saved cards (${bookmarkedIds.length})`}</button>
          {(query !== '' || category !== 'All cards' || nationFilter !== 'All nations' || positionFilter !== 'All positions' || cardTypeFilter !== 'All card types' || eventFilter !== 'All events' || sourceFilter !== 'all' || sortBy !== 'ovr-desc' || minOvr !== '' || maxOvr !== '' || statFilter !== 'Any stat' || minStat !== '' || maxStat !== '' || showBookmarked) && <button className="category" type="button" onClick={() => { setQuery(''); setCategory('All cards'); setNationFilter('All nations'); setPositionFilter('All positions'); setCardTypeFilter('All card types'); setEventFilter('All events'); setSourceFilter('all'); setSortBy('ovr-desc'); setMinOvr(''); setMaxOvr(''); setStatFilter('Any stat'); setMinStat(''); setMaxStat(''); setShowBookmarked(false) }}>Reset all filters</button>}
          </div>
        </details>
      </section>}
      {page === 'players' && allCards.some(card => card.id.startsWith('uflmb-demo-')) && <div className="demo-warning" role="status"><strong>TEST DATA LOADED</strong><span>These 22 demo cards are fictional. All OVRs, stats, perks, clubs and nations are synthetic; do not treat them as verified UFL Mobile data. They are not verified UFL Mobile data.</span></div>}
      {false && <section className="squad-section" aria-labelledby="squad-title">
        <div className="section-heading"><div><p className="eyebrow">TACTICAL WORKSPACE</p><h2 id="squad-title">My squad builder</h2></div><span className="count-label">Saved in this browser</span></div>
        <div className="squad-toolbar"><div className="squad-team-switch" role="group" aria-label="Choose squad"><button className={activeSquad === 'A' ? 'button primary' : 'button secondary'} type="button" onClick={() => setActiveSquad('A')}>Demo Team A</button><button className={activeSquad === 'B' ? 'button primary' : 'button secondary'} type="button" onClick={() => setActiveSquad('B')}>Demo Team B</button></div><label>Formation <select value={formationId} onChange={e => setFormationId(e.target.value as FormationId)}><option value="4-3-3">4-3-3</option><option value="4-4-2">4-4-2</option><option value="3-5-2">3-5-2</option></select></label><div className="squad-summary"><span><strong>{squadPlayers.length}/11</strong> selected</span><span><strong>{squadRating || '—'}</strong> avg. OVR</span><span><strong>{squadPositionFits}/{squadPlayers.length || 11}</strong> position fits</span></div><button className="button secondary" type="button" onClick={autoFillSquad}>Auto-fill best XI</button><button className="button secondary" type="button" onClick={exportSquad}>Export squad</button><label className="button secondary squad-import-button">Import squad<input type="file" accept="application/json,.json" onChange={importSquad} /></label><button className="button secondary" type="button" onClick={() => setSquadAssignments(current => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(activeSquadKey))))}>Clear this squad</button></div>
        {allCards.length === 0 ? <div className="squad-empty"><strong>Your tactics start with verified cards.</strong><p>No player records are available yet. Add real, source-verified cards when the database editor is rebuilt, then assign them here. UFLMB will never fill the squad with invented players.</p></div> : <div className={`squad-pitch formation-${formationId.replace('-', '')}`}><div className="pitch-lines" aria-hidden="true" />{squadSlots.map(slot => { const assigned = allCards.find(card => card.id === squadAssignments[`${activeSquadKey}${slot.id}`]); const occupiedElsewhere = new Set(Object.entries(squadAssignments).filter(([key]) => key.startsWith(activeSquadKey) && key !== `${activeSquadKey}${slot.id}`).map(([,id]) => id)); return <div className={`squad-slot squad-slot-${slot.id}`} key={slot.id}><span className="squad-slot-label">{slot.label}</span><select aria-label={`Choose ${slot.label} player`} value={assigned?.id ?? ''} onChange={e => setSquadAssignments(current => ({...current,[`${activeSquadKey}${slot.id}`]:e.target.value}))}><option value="">+ Add player</option>{allCards.filter(card => !occupiedElsewhere.has(card.id)).sort((a,b) => Number(b.positions.some(p => slot.positions.includes(p))) - Number(a.positions.some(p => slot.positions.includes(p))) || b.overallRating-a.overallRating || a.playerName.localeCompare(b.playerName)).map(card => <option key={card.id} value={card.id}>{card.playerName} · {card.overallRating} OVR · {card.positions.join('/')}</option>)}</select>{assigned && <div className={assigned.positions.some(p => slot.positions.includes(p)) ? 'squad-player-rating fit' : 'squad-player-rating'}><strong>{assigned.overallRating}</strong><small>{assigned.playerName}</small></div>}</div>})}</div>}
        <p className="squad-footnote">Average OVR is calculated from assigned cards only. Position fit checks the recorded positions; no chemistry or gameplay performance is fabricated.</p>
      </section>}
      {false && <section className="analytics-section" aria-labelledby="analytics-title">
        <div className="section-heading"><div><p className="eyebrow">LIVE COLLECTION INSIGHTS</p><h2 id="analytics-title">Rankings & analytics</h2></div><span className="count-label">{allCards.length} records in this browser</span></div>
        <div className="analytics-grid">
          <article className="analytics-panel"><p className="eyebrow">OVERALL RATING</p><h3>Top OVR cards</h3>{allCards.length ? <ol className="leader-list">{[...allCards].sort((a,b) => b.overallRating-a.overallRating || a.playerName.localeCompare(b.playerName)).slice(0,5).map((card,index) => <li key={card.id}><span className="leader-rank">{index+1}</span>{card.imageUrl ? <img src={card.imageUrl} alt="" /> : <span className="leader-avatar">U</span>}<span className="leader-name"><strong>{card.playerName}</strong><small>{card.positions.join(' / ')} · {card.nation}</small></span><b className="leader-value">{card.overallRating}</b></li>)}</ol> : <p className="muted-copy">Rankings will appear when verified cards are added. No sample records are used.</p>}</article>
          <article className="analytics-panel"><p className="eyebrow">DATABASE SNAPSHOT</p><h3>Collection coverage</h3><div className="snapshot-grid"><div><strong>{allCards.length}</strong><span>Total cards</span></div><div><strong>{new Set(allCards.map(card => card.playerName.trim().toLowerCase())).size}</strong><span>Unique player names</span></div><div><strong>{allCards.filter(card => card.imageUrl?.trim()).length}</strong><span>With card image</span></div><div><strong>{allCards.filter(card => card.stats && Object.keys(card.stats).length).length}</strong><span>With stats</span></div><div><strong>{allCards.filter(card => /^https?:\/\//i.test(card.sourceUrl || '')).length}</strong><span>With source link</span></div><div><strong>{allCards.filter(card => card.verifiedAt && (Date.now()-new Date(card.verifiedAt+'T00:00:00').getTime()) <= 90*86400000).length}</strong><span>Checked within 90 days</span></div></div></article>
        </div>
        {statLeaders.length > 0 && <div className="stat-leader-grid">{statLeaders.map(item => <article className="analytics-panel stat-leader-panel" key={item.key}><p className="eyebrow">STAT LEADERBOARD</p><h3>{item.key}</h3><ol className="leader-list">{item.cards.map((card,index) => <li key={card.id}><span className="leader-rank">{index+1}</span><span className="leader-name"><strong>{card.playerName}</strong><small>{card.positions.join(' / ')} · OVR {card.overallRating}</small></span><b className="leader-value">{card.stats?.[item.key]}</b></li>)}</ol></article>)}</div>}
      </section>}
      {page === 'players' && <section className="database-section" aria-labelledby="database-title">
        <div className="section-heading"><div><p className="eyebrow">{showBookmarked ? 'STARRED PLAYERS' : 'THE COLLECTION'}</p><h2 id="database-title">{showBookmarked ? 'Your favorites' : 'Card database'}</h2></div><div className="collection-actions"><span className="count-label">{visibleCards.length} shown / {showBookmarked ? bookmarkedIds.length : allCards.length} total</span></div></div>
        {visibleCards.length === 0 ? <div className="empty-state"><div className="empty-emblem" aria-hidden="true">U<span>+</span></div><h3>{showBookmarked ? 'No favorites yet' : query.trim() ? 'No matching cards found' : 'The database starts here'}</h3><p>{showBookmarked ? 'Tap the star on any player card to add it to this list.' : query.trim() ? `No verified card matches “${query.trim()}”. Try another search or category.` : 'No card records have been entered yet.'}</p><span className="empty-tag">VERIFIED DATA ONLY</span></div> :
          <div className="card-grid">{pagedCards.map((card, index) => <article className={`player-card ${card.sourceStatus === 'imported-unverified' ? 'imported-card' : ''} ${card.overallRating >= 90 ? 'elite-card ovr-elite' : card.overallRating >= 80 ? 'ovr-high' : card.overallRating >= 70 ? 'ovr-mid' : 'ovr-standard'}`} key={card.id} style={{ animationDelay: `${Math.min(index % 12, 11) * 45}ms` }}>
            <div className="player-image"><div className="card-art-glow" aria-hidden="true" />
              {card.imageUrl ? <img src={card.imageUrl} alt={`${card.playerName} card`} loading="lazy" /> : <div className="no-image"><span className="no-image-mark">✦</span><strong>UFL<span>MB</span></strong><small>PLAYER DATABASE</small></div>}
              <div className="ovr-badge" aria-label={`Overall rating ${card.overallRating}`}>
                <strong>{card.overallRating}</strong>
                {countryFlagCode(card.nation) ? <img className="card-country-flag ovr-country-flag" src={`https://flagcdn.com/${countryFlagCode(card.nation)}.svg`} alt={card.nation} loading="lazy" /> : <span className="ovr-flag-fallback" aria-label={card.nation}>⚑</span>}
                <span className="ovr-position">{card.positions[0] || '—'}</span>
              </div>
              <div className="card-quick-actions">
                <button className={bookmarkedIds.includes(card.id) ? 'bookmark-toggle saved' : 'bookmark-toggle'} type="button" aria-label={bookmarkedIds.includes(card.id) ? `Remove ${card.playerName} from saved cards` : `Save ${card.playerName}`} aria-pressed={bookmarkedIds.includes(card.id)} onClick={() => toggleBookmark(card.id)}>{bookmarkedIds.includes(card.id) ? '★' : '☆'}</button>
                <button className={compareIds.includes(card.id) ? 'compare-toggle selected' : 'compare-toggle'} type="button" aria-label={compareIds.includes(card.id) ? `Remove ${card.playerName} from comparison` : `Add ${card.playerName} to comparison`} aria-pressed={compareIds.includes(card.id)} onClick={() => toggleCompare(card.id)}>⇄</button>
              </div>
            </div>
            <div className="player-card-body">{card.event && <div className="event-ribbon"><span aria-hidden="true">✦</span> {card.event}</div>}<div className="player-title-row"><div className="player-title-copy"><h3>{card.playerName}</h3><p><span className="card-nationality"><span>{card.nation}</span></span></p></div></div>
              {card.stats && <div className="stats-grid">{['PAC','SHO','PAS','DRI','DEF','PHY'].filter(key => typeof card.stats?.[key] === 'number').map(key => <span key={key}><b>{card.stats![key]}</b><small>{key}</small></span>)}</div>}
              {card.perks?.length ? <div className="perk-row"><span className="perk-heading"><span aria-hidden="true">✦</span> PERKS</span>{card.perks.slice(0, 2).map(perk => <span key={perk}>{perk}</span>)}{card.perks.length > 2 && <span className="perk-more">+{card.perks.length - 2}</span>}</div> : null}
              <div className="card-actions"><button className="button secondary" type="button" onClick={() => setSelectedCard(card)}><span aria-hidden="true">↗</span> Player profile</button>{card.sourceStatus !== 'imported-unverified' && <span className="source-status"><span className="source-status-dot" />{card.id.startsWith('uflmb-demo-') ? 'Demo' : 'Verified'}</span>}</div>{card.sourceStatus !== 'imported-unverified' && <small className="verified-date">{card.id.startsWith('uflmb-demo-') ? 'Demo record' : `Checked ${card.verifiedAt}`}</small>}
            </div>
          </article>)}</div>}
        {visibleCards.length > pagedCards.length && <div className="load-more-wrap"><p>Showing {pagedCards.length} of {visibleCards.length} matching cards</p><button type="button" className="button primary" onClick={() => setCardPage(value => value + 1)}>Load 24 more cards</button></div>}
      </section>}
      {page === 'compare' && <section className="compare-section" aria-labelledby="compare-title">{compareIds.length === 0 && <div className="empty-state compare-empty"><div className="empty-emblem" aria-hidden="true">⇄</div><h3>Build your comparison</h3><p>Open Players, select up to three cards with the Compare checkbox, then return here to compare their ratings and attributes.</p><button type="button" className="button primary" onClick={() => setPage('players')}>Browse players</button></div>}<div className="section-heading"><div><p className="eyebrow">SIDE-BY-SIDE ANALYSIS</p><h2 id="compare-title">Compare cards ({compareIds.length}/3)</h2></div><div className="form-actions"><button className="button secondary" type="button" onClick={() => setShowCompare(value => !value)}>{showCompare ? 'Hide comparison' : 'Show comparison'}</button><button className="button secondary" type="button" onClick={() => { setCompareIds([]); setShowCompare(false) }}>Clear selection</button></div></div>
        <div className="compare-chips">{comparedCards.map(card => <span className="compare-chip" key={card.id}>{card.playerName} · {card.overallRating}<button type="button" onClick={() => toggleCompare(card.id)} aria-label={`Remove ${card.playerName} from comparison`}>×</button></span>)}</div>
        {showCompare && <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>Attribute</th>{comparedCards.map(card => <th key={card.id}>{card.playerName}</th>)}</tr></thead><tbody>{[['OVR','overallRating'],['Position','positions'],['Nation','nation'],['Club','club'],['Card type','cardName'],...Array.from(new Set(comparedCards.flatMap(card => Object.keys(card.stats ?? {}))).values()).sort().map(key => [key, `stat:${key}`])].map(([label,key]) => <tr key={key}><th>{label}</th>{comparedCards.map(card => { const value = key === 'overallRating' ? card.overallRating : key === 'positions' ? card.positions.join(' / ') : key.startsWith('stat:') ? card.stats?.[key.slice(5)] ?? '—' : card[key as 'nation' | 'club' | 'cardName'] ?? '—'; return <td key={card.id}>{value}</td> })}</tr>)}</tbody></table></div>}
      </section>}
      {selectedCard && <div className="profile-backdrop" role="presentation" onClick={() => setSelectedCard(null)}><section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title" onClick={event => event.stopPropagation()}><button className="profile-close" type="button" onClick={() => setSelectedCard(null)} aria-label="Close player profile">×</button><div className="profile-heading">{selectedCard.imageUrl ? <img src={selectedCard.imageUrl} alt={`${selectedCard.playerName} card`} /> : <div className="profile-placeholder">UFL<span>MB</span></div>}<div><p className="eyebrow">PLAYER PROFILE</p><h2 id="profile-title">{selectedCard.playerName}</h2><div className="profile-meta"><strong className={`profile-ovr profile-ovr-${selectedCard.overallRating >= 90 ? 'elite' : selectedCard.overallRating >= 80 ? 'high' : selectedCard.overallRating >= 70 ? 'mid' : 'standard'}`}>OVR {selectedCard.overallRating}</strong><span className="profile-meta-badge profile-nationality-badge">{countryFlagCode(selectedCard.nation) ? <img className="profile-country-flag" src={`https://flagcdn.com/${countryFlagCode(selectedCard.nation)}.svg`} alt="" aria-hidden="true" loading="lazy" /> : null}<span>{selectedCard.nation}</span></span>{selectedCard.positions.length > 0 && <span className="profile-meta-badge profile-position-badge">{selectedCard.positions.join(' / ')}</span>}{selectedCard.event && <span className="profile-meta-badge profile-event-badge">{selectedCard.event}</span>}</div>{(selectedCard.dateOfBirth || selectedCard.heightCm || selectedCard.weightKg || selectedCard.foot) && <p className="muted-copy">{[selectedCard.dateOfBirth ? `DOB ${selectedCard.dateOfBirth}` : '', selectedCard.heightCm ? `${selectedCard.heightCm} cm` : '', selectedCard.weightKg ? `${selectedCard.weightKg} kg` : '', selectedCard.foot ? `${selectedCard.foot}-footed` : '', selectedCard.weakFoot ? `Weak foot ${selectedCard.weakFoot}/5` : '', selectedCard.skillMoves ? `Skill moves ${selectedCard.skillMoves}/5` : ''].filter(Boolean).join(' · ')}</p>}</div></div><div className="profile-section"><h3>Attributes</h3>{selectedCard.stats && Object.keys(selectedCard.stats).length ? <div className="profile-stat-groups">{groupProfileStats(selectedCard.stats).map(group => <section className="profile-stat-group" key={group.code}><div className="profile-stat-group-header"><span className="profile-stat-group-code">{group.code === 'GK' ? 'GK' : group.code}</span><span className="profile-stat-group-name">{group.label}</span>{typeof group.main === 'number' && <div className="profile-stat-group-score"><strong className="profile-stat-main-value text-lime-400 font-bold">{group.main}</strong></div>}</div>{group.details.length > 0 && <div className="profile-stat-group-details">{group.details.sort((a,b) => a.label.localeCompare(b.label)).map(stat => <div className="profile-stat-detail" key={stat.key}><span className="profile-stat-label" title={stat.label}>{stat.label}</span><div className="profile-stat-meter"><i style={{display:'block', flex:'1 1 auto', minWidth:0, height:6, overflow:'hidden', borderRadius:999, backgroundColor:'rgba(255,255,255,.12)'}}><b style={{display:'block', width:`${Math.max(0,Math.min(100,Number(stat.value)))}%`, height:'100%', maxWidth:'100%', backgroundColor:'#a3e635', borderRadius:999}} /></i><strong>{stat.value}</strong></div></div>)}</div>}</section>)}</div> : <p className="muted-copy">No verified attribute data has been entered for this card yet.</p>}</div>{selectedCard.perks?.length ? <div className="profile-section"><h3>Perks</h3><div className="perk-row">{selectedCard.perks.map(perk => <span key={perk}>{perk}</span>)}</div></div> : null}<CommunityReviews cardId={selectedCard.id} /><div className="profile-footer">{selectedCard.sourceStatus !== 'imported-unverified' && <><span className="verified-date">{selectedCard.id.startsWith('uflmb-demo-') ? 'Demo fixture — no verified source' : `Verified ${selectedCard.verifiedAt}`}</span>{selectedCard.id.startsWith('uflmb-demo-') ? <span className="field-help">Demo fixture — no verified source</span> : <a className="button primary" href={selectedCard.sourceUrl} target="_blank" rel="noreferrer">Open verified source ↗</a>}</>}<button className="button secondary" type="button" onClick={() => toggleBookmark(selectedCard.id)}>{bookmarkedIds.includes(selectedCard.id) ? '★ Saved' : '☆ Save card'}</button></div></section></div>}
      <nav className="mobile-bottom-nav" aria-label="Primary navigation">
        <button type="button" className={page === 'home' ? 'mobile-nav-item active' : 'mobile-nav-item'} aria-current={page === 'home' ? 'page' : undefined} onClick={() => { setPage('home'); window.scrollTo({ top: 0, behavior: 'auto' }) }}><span className="mobile-nav-icon" aria-hidden="true">⌂</span><span>Home</span></button>
        <button type="button" className={!showBookmarked && page === 'players' ? 'mobile-nav-item active' : 'mobile-nav-item'} aria-current={!showBookmarked && page === 'players' ? 'page' : undefined} onClick={() => { setPage('players'); setShowBookmarked(false); window.scrollTo({ top: 0, behavior: 'auto' }) }}><span className="mobile-nav-icon player-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="7" r="4" fill="currentColor" /><path d="M4.5 21v-2.2a7.5 7.5 0 0 1 15 0V21z" fill="currentColor" /></svg></span><span>Players</span><small>{allCards.length}</small></button>
        <button type="button" className={showBookmarked && page === 'players' ? 'mobile-nav-item active' : 'mobile-nav-item'} aria-current={showBookmarked && page === 'players' ? 'page' : undefined} onClick={() => { setPage('players'); setShowBookmarked(true); setQuery(''); setCategory('All cards'); setNationFilter('All nations'); setPositionFilter('All positions'); setCardTypeFilter('All card types'); setEventFilter('All events'); setSourceFilter('all'); setSortBy('ovr-desc'); setMinOvr(''); setMaxOvr(''); setStatFilter('Any stat'); setMinStat(''); setMaxStat(''); window.scrollTo({ top: 0, behavior: 'auto' }) }}><span className="mobile-nav-icon" aria-hidden="true">★</span><span>Favorites</span>{bookmarkedIds.length > 0 && <small>{bookmarkedIds.length}</small>}</button>
        <button type="button" className={page === 'compare' ? 'mobile-nav-item active' : 'mobile-nav-item'} aria-current={page === 'compare' ? 'page' : undefined} onClick={() => { setPage('compare'); window.scrollTo({ top: 0, behavior: 'auto' }) }}><span className="mobile-nav-icon" aria-hidden="true">⇄</span><span>Compare</span>{compareIds.length > 0 && <small>{compareIds.length}</small>}</button>
      </nav>
      <footer className="footer"><span>UFLMB <span className="footer-muted">· Community project</span></span><span className="footer-muted">Independent community project; not affiliated with or endorsed by the game’s publisher.</span></footer>
    </main>
  )
}
