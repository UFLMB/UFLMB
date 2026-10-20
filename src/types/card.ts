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
  /** All 59 original CSV columns retained for lossless data review/export. */
  sourceData?: Record<string, string>
  sourceStatus?: 'verified' | 'imported-unverified'
  sourceUrl: string
  /** Imported records use this as the dataset import date, not a claim of verification. */
  verifiedAt: string
}
