/**
 * Core data contract for UFLMB card records.
 * Only records checked against a reliable source should be added to the dataset.
 */
export type CardPosition =
  | 'GK'
  | 'CB'
  | 'LB'
  | 'RB'
  | 'LWB'
  | 'RWB'
  | 'CDM'
  | 'CM'
  | 'CAM'
  | 'LM'
  | 'RM'
  | 'LW'
  | 'RW'
  | 'CF'
  | 'ST'
  | (string & {})

export interface PlayerCard {
  /** Stable UFLMB identifier; do not use a display name as the ID. */
  id: string
  playerName: string
  overallRating: number
  positions: CardPosition[]
  nation: string
  /** Optional values should be omitted until verified. */
  cardName?: string
  club?: string
  stats?: Record<string, number>
  perks?: string[]
  imageUrl?: string
  /** Source used to verify this record. */
  sourceUrl: string
  /** ISO date (YYYY-MM-DD) when this record was last checked. */
  verifiedAt: string
}
