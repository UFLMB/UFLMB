import fs from 'node:fs'
import path from 'node:path'

const file = path.resolve('src/data/cards.ts')
const source = fs.readFileSync(file, 'utf8')
const errors = []
if (!source.includes('export const cards: PlayerCard[]')) errors.push('Missing exported cards array declaration.')
if (/DEMO DATA|NOT A REAL CARD|uflmb-demo-/i.test(source)) errors.push('Demo fixtures must not be published as verified production records.')
if (/export const cards: PlayerCard\[\] = \[\s*\]/.test(source)) {
  console.log('Source audit passed: production starter dataset is intentionally empty; no demo records will be published as verified data.')
  process.exit(0)
}
const ids = [...source.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map(match => match[1])
if (new Set(ids).size !== ids.length) errors.push('Duplicate literal card IDs detected.')
if (errors.length) {
  console.error('UFLMB source data audit failed:')
  errors.forEach(error => console.error('- ' + error))
  process.exit(1)
}
console.log('UFLMB source data audit passed. Review the source records manually before treating them as verified.')
