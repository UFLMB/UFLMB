import type { PlayerCard } from '../types/card'

/**
 * Clearly fictional fixtures used only to test the UI and squad builder.
 * Ratings/stats are synthetic. Never treat these as real UFL Mobile card data.
 */
const today = new Date().toISOString().slice(0, 10)
const positions = [
  ['GK'], ['LB'], ['CB'], ['CB'], ['RB'],
  ['CDM'], ['CM'], ['CM'], ['LW'], ['ST'], ['RW'],
] as const
const names = [
  'Demo Alpha Keeper', 'Demo Alpha Left Back', 'Demo Alpha Centre Back 1',
  'Demo Alpha Centre Back 2', 'Demo Alpha Right Back', 'Demo Alpha Anchor',
  'Demo Alpha Midfielder 1', 'Demo Alpha Midfielder 2', 'Demo Alpha Left Wing',
  'Demo Alpha Striker', 'Demo Alpha Right Wing',
  'Demo Bravo Keeper', 'Demo Bravo Left Back', 'Demo Bravo Centre Back 1',
  'Demo Bravo Centre Back 2', 'Demo Bravo Right Back', 'Demo Bravo Anchor',
  'Demo Bravo Midfielder 1', 'Demo Bravo Midfielder 2', 'Demo Bravo Left Wing',
  'Demo Bravo Striker', 'Demo Bravo Right Wing',
]
const baseRatings = [84,82,83,81,82,84,85,83,86,88,85,81,80,82,80,81,82,83,82,84,86,83]

export const demoCards: PlayerCard[] = names.map((playerName, index) => {
  const team = index < 11 ? 'A' : 'B'
  const slot = index % 11
  const rating = baseRatings[index]
  return {
    id: `uflmb-demo-${team}-${slot + 1}`,
    playerName,
    overallRating: rating,
    positions: [...positions[slot]],
    nation: team === 'A' ? 'Demo Nation A' : 'Demo Nation B',
    cardName: 'DEMO DATA — NOT A REAL CARD',
    club: team === 'A' ? 'Demo Club Alpha' : 'Demo Club Bravo',
    stats: {
      PAC: Math.max(40, Math.min(99, rating - 1 + (slot % 4))),
      SHO: Math.max(40, Math.min(99, rating - 3 + (slot % 5))),
      PAS: Math.max(40, Math.min(99, rating - 2 + (slot % 3))),
      DRI: Math.max(40, Math.min(99, rating - 1 + (slot % 6))),
      DEF: Math.max(40, Math.min(99, rating - 4 + (slot % 7))),
      PHY: Math.max(40, Math.min(99, rating - 2 + (slot % 4))),
    },
    perks: ['Demo perk — replace with verified data'],
    sourceUrl: 'https://example.com/uflmb-demo-data-not-a-real-source',
    verifiedAt: today,
  }
})
