import type { PlayerCard } from '../types/card'
import playersCsv from './players-5.csv?raw'

const sourceUrl = 'https://github.com/UFLMB/UFLMB/blob/main/src/data/players-5.csv'
const importedAt = '2026-10-20'
const groupKeys: Record<string, string> = {
  Pace: 'PAC', Shooting: 'SHO', Passing: 'PAS', Dribbling: 'DRI',
  Defense: 'DEF', Physical: 'PHY', Positioning: 'POS', Reflexes: 'REF',
  Diving: 'DIV', Handling: 'HAN', Kicking: 'KIC',
}

function parseCsv(source: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i++ }
      else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(field); field = ''
    } else if (char === '\n' && !quoted) {
      row.push(field); field = ''
      if (row.some(value => value.trim())) rows.push(row)
      row = []
    } else if (char !== '\r' || quoted) field += char
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  const headers = (rows.shift() || []).map(header => header.trim())
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? '').trim()])))
}

const numeric = (value: string | undefined): number | undefined => {
  if (!value?.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const sourceRows = parseCsv(playersCsv)

export const cards: PlayerCard[] = sourceRows
  .filter(row => row.id && row.name && numeric(row.rating) !== undefined && row.position && row.nation)
  .map(row => {
    const stats: Record<string, number> = {}
    for (const [sourceKey, targetKey] of Object.entries(groupKeys)) {
      const value = numeric(row[`group:${sourceKey}`])
      if (value !== undefined) stats[targetKey] = value
    }
    for (const [key, rawValue] of Object.entries(row)) {
      if (!key.startsWith('stat:')) continue
      const value = numeric(rawValue)
      if (value === undefined) continue
      const [, group, name] = key.split(':')
      stats[`${group} · ${name}`] = value
    }
    const perks = row.perks ? row.perks.split(/[;|]/).map(value => value.trim()).filter(Boolean) : []
    return {
      id: row.id,
      playerName: row.name,
      overallRating: numeric(row.rating)!,
      positions: [row.position],
      nation: row.nation,
      cardName: row.card_name || undefined,
      club: row.club || undefined,
      event: row.event || undefined,
      positionCategory: row.position_category || undefined,
      dateOfBirth: row.dob || undefined,
      heightCm: numeric(row.height_cm),
      weightKg: numeric(row.weight_kg),
      foot: row.foot || undefined,
      weakFoot: numeric(row.foot_left),
      skillMoves: numeric(row.foot_right),
      stats,
      perks,
      sourceImagePath: row.image || undefined,
      sourceData: row,
      sourceStatus: 'imported-unverified' as const,
      sourceUrl,
      verifiedAt: importedAt,
    }
  })

export const sourceDatasetInfo = {
  filename: 'players-5.csv',
  rowCount: cards.length,
  columnCount: Object.keys(sourceRows[0] || {}).length,
  importedAt,
  independentlyVerified: false,
}
