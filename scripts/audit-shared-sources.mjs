import fs from 'node:fs'

const baseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || ''
const summaryPath = process.env.GITHUB_STEP_SUMMARY
const report = []
const write = line => { console.log(line); report.push(line) }

if (!baseUrl || !anonKey) {
  write('## Shared source audit')
  write('Skipped: Supabase project variables are not configured. The checked-in production dataset audit still runs.')
} else {
  const response = await fetch(`${baseUrl}/rest/v1/cards?select=id,player_name,source_url,verified_at&order=player_name.asc`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  })
  if (!response.ok) throw new Error(`Shared card query failed with HTTP ${response.status}`)
  const cards = await response.json()
  const today = Date.now()
  const stale = []
  const unreachable = []
  const sourceGroups = new Map()
  const nonDemoCards = cards.filter(card => !String(card.id).startsWith('uflmb-demo-'))

  for (const card of nonDemoCards) {
    const ageDays = Math.floor((today - new Date(`${card.verified_at}T00:00:00Z`).getTime()) / 86400000)
    if (!Number.isFinite(ageDays) || ageDays > 90) stale.push(`${card.player_name} (${Number.isFinite(ageDays) ? ageDays + ' days old' : 'invalid verification date'})`)

    try {
      const url = new URL(card.source_url)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported URL protocol')
      const key = url.toString()
      const group = sourceGroups.get(key) || { url, players: [] }
      group.players.push(card.player_name)
      sourceGroups.set(key, group)
    } catch (error) {
      unreachable.push(`${card.player_name}: ${error instanceof Error ? error.message : 'invalid source URL'}`)
    }
  }

  // Many imported records share a dataset source URL. Probe each distinct URL once,
  // rather than issuing the same HEAD request hundreds of times.
  for (const { url, players } of sourceGroups.values()) {
    try {
      const check = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) })
      if (!check.ok) unreachable.push(`${players.length} record(s) use ${url.href}: HTTP ${check.status}`)
    } catch (error) {
      unreachable.push(`${players.length} record(s) use ${url.href}: ${error instanceof Error ? error.message : 'request failed'}`)
    }
  }
  write('## Shared source audit')
  write(`- Non-demo shared records checked: ${nonDemoCards.length}`)
  write(`- Verification dates older than 90 days / invalid: ${stale.length}`)
  write(`- Source URLs that did not respond successfully to HEAD: ${unreachable.length}`)
  if (stale.length) { write('\n### Review due'); stale.forEach(item => write(`- ${item}`)) }
  if (unreachable.length) { write('\n### Source links to inspect'); unreachable.forEach(item => write(`- ${item}`)) }
  write('\nThis workflow audits freshness and link reachability only. It does not silently rewrite ratings or other player facts.')
}
if (summaryPath) fs.appendFileSync(summaryPath, report.join('\n') + '\n')
