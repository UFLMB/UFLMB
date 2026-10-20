import fs from 'node:fs'
import path from 'node:path'

const csvFile = path.resolve('src/data/players-5.csv')
const source = fs.readFileSync(csvFile, 'utf8').replace(/^\uFEFF/, '')
const errors = []

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++ }
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
  return rows
}

const rows = parseCsv(source)
const headers = rows.shift() || []
const records = rows.map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? '').trim()])))
if (headers.length !== 59) errors.push(`Expected 59 CSV columns, found ${headers.length}.`)
if (records.length !== 480) errors.push(`Expected 480 source records, found ${records.length}.`)
for (const required of ['id', 'name', 'rating', 'position', 'nation', 'event', 'image', 'group:Pace', 'stat:Goalkeeping:Reflexes']) {
  if (!headers.includes(required)) errors.push(`Missing required CSV column: ${required}.`)
}
const ids = records.map(record => record.id).filter(Boolean)
if (ids.length !== records.length) errors.push('One or more source records have an empty ID.')
if (new Set(ids).size !== ids.length) errors.push('Duplicate player IDs detected in the source CSV.')
for (const [index, record] of records.entries()) {
  if (!record.name) errors.push(`Row ${index + 2}: player name is empty.`)
  if (!Number.isInteger(Number(record.rating)) || Number(record.rating) < 1) errors.push(`Row ${index + 2}: invalid rating.`)
  if (!record.position || !record.nation) errors.push(`Row ${index + 2}: missing position or nation.`)
}
if (errors.length) {
  console.error('UFLMB source CSV audit failed:')
  errors.forEach(error => console.error('- ' + error))
  process.exit(1)
}
console.log(`UFLMB source CSV audit passed: ${records.length} players, ${headers.length} columns, unique IDs, valid core fields. Imported records are not independently verified.`)
