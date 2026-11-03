/**
 * Core data contract for UFLMB card records.
 * CSV-derived fields preserve the source dataset without claiming independent verification.
 */
export type CardPosition =
  | 'GK' | 'CB' | 'LB' | 'RB' | 'LWB' | 'RWB' | 'CDM' | 'CM' | 'CAM'
  | 'LM' | 'RM' | 'LW' | 'RW' | 'CF' | 'ST' | (string & {})

export interface PlayerCard {
  /** Stable source identifier; never use a display name as the ID. */
  id: string
  playerName: string
  overallRating: number
  /** Maximum attainable rating for this card, imported from max_rating. */
  maxRating?: number
  positions: CardPosition[]
  nation: string
  cardName?: string
  club?: string
  event?: string
  positionCategory?: string
  dateOfBirth?: string
  heightCm?: number
  weightKg?: number
  foot?: string
  weakFoot?: number
  skillMoves?: number
  /** Grouped OVR attributes and the individual source stats. */
  stats?: Record<string, number>
  perks?: string[]
  imageUrl?: string
  /** Original image reference from the CSV; the image itself may not be present. */
  sourceImagePath?: string
  /** All 60 original CSV columns retained for lossless data review/export. */
  sourceData?: Record<string, string>
  sourceStatus?: 'verified' | 'imported-unverified'
  sourceUrl: string
  /** Imported records use this as the dataset import date, not a claim of verification. */
  verifiedAt: string
}

/**
 * Short public-facing card label. Prefer the source card_name alias and
 * retain the full playerName for the detailed profile and record management.
 */
export const formatCardDisplayName = (card: Pick<PlayerCard, 'cardName' | 'playerName'>): string => {
  const raw = (card.cardName || card.playerName || '').trim().replace(/\s+/g, ' ')
  if (!raw) return ''
  const spacedInitials = raw.replace(/\.([\p{L}])/gu, '. $1')
  const particles = new Set(['de', 'del', 'da', 'das', 'do', 'dos', 'van', 'von', 'la', 'le', 'al', 'bin', 'ibn'])
  return spacedInitials.split(' ').map((word, wordIndex) => word.split(/([-’'])/).map((part, partIndex) => {
    if (/^[-’']$/.test(part)) return part
    const lower = part.toLocaleLowerCase('en')
    if (wordIndex > 0 && partIndex === 0 && particles.has(lower)) return lower
    if (part.length === 1) return part.toLocaleUpperCase('en')
    return lower.charAt(0).toLocaleUpperCase('en') + lower.slice(1)
  }).join('')).join(' ')
}
