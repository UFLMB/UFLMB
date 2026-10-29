import type { PlayerCard } from '../types/card'

export type CardImageFilenameMatch = {
  card: PlayerCard | null
  reason: string
}

const normalize = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '')

const eventType = (card: PlayerCard): 'fp' | 'ot' | null => {
  const event = normalize([
    card.event || '',
    card.cardName || '',
    card.sourceData?.event || '',
    card.sourceData?.card_name || '',
  ].join(' '))
  if (event.includes('firstpulse')) return 'fp'
  if (event.includes('opentournament')) return 'ot'
  return null
}

const nameAliases = (card: PlayerCard): Set<string> => {
  const source = card.sourceData || {}
  const aliases = [
    card.playerName,
    card.cardName || '',
    source.name || '',
    source.card_name || '',
    source.surname || '',
    [source.first_name, source.surname].filter(Boolean).join(' '),
  ]
  return new Set(aliases.map(normalize).filter(Boolean))
}

export function parseCardImageFilename(filename: string): {
  type: 'fp' | 'ot'
  playerSlug: string
  overallRating: number
  position: string
} | null {
  const match = filename.match(/^([a-z]{2})\.([a-z0-9_]+)\.(\d{1,3})\.([a-z]{2,3})\.(png|jpe?g|webp)$/i)
  if (!match) return null
  const type = match[1].toLowerCase()
  const overallRating = Number(match[3])
  const position = match[4].toUpperCase()
  if ((type !== 'fp' && type !== 'ot') || overallRating < 1 || overallRating > 999) return null
  const validPositions = new Set(['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'])
  if (!validPositions.has(position)) return null
  return { type, playerSlug: normalize(match[2]), overallRating, position }
}

export function matchCardImageFilename(filename: string, cards: PlayerCard[]): CardImageFilenameMatch {
  const parsed = parseCardImageFilename(filename)
  if (!parsed) {
    return { card: null, reason: 'invalid filename; use fp.playername.ovr.position.png or ot.playername.ovr.position.png' }
  }
  const candidates = cards.filter(card =>
    card.overallRating === parsed.overallRating &&
    card.positions.some(position => position.toUpperCase() === parsed.position) &&
    eventType(card) === parsed.type &&
    nameAliases(card).has(parsed.playerSlug)
  )
  if (candidates.length === 1) return { card: candidates[0], reason: 'unique match' }
  if (candidates.length === 0) {
    return { card: null, reason: 'no card matches type, player alias, OVR and position' }
  }
  return { card: null, reason: 'ambiguous match (' + candidates.length + ' cards); no image was assigned' }
}
