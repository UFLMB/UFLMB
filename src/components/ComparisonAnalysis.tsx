import type { CSSProperties } from 'react'
import type { PlayerCard } from '../types/card'

type Props = {
  cards: PlayerCard[]
  onRemove: (id: string) => void
}

const statOrder = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY', 'POS', 'REF', 'DIV', 'HAN', 'KIC']
const palette = ['var(--accent, #a3e635)', '#4f8cff', '#a78bfa']
const mainStats = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY']

const RadarChart = ({ cards, keys }: { cards: PlayerCard[]; keys: string[] }) => {
  if (keys.length < 3) return <div className="comparison-radar-empty">Not enough shared attributes for a radar chart.</div>
  const cx = 160
  const cy = 126
  const radius = 82
  const point = (index: number, value: number, scale = 1) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / keys.length
    const distance = radius * scale * Math.max(0, Math.min(100, value)) / 100
    return [cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance] as const
  }
  const labelPoint = (index: number) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / keys.length
    return [cx + Math.cos(angle) * 106, cy + Math.sin(angle) * 106] as const
  }
  return <svg className="comparison-radar" viewBox="0 0 320 252" role="img" aria-label={`Radar chart comparing ${cards.map(card => card.playerName).join(', ')}`}>
    {[25, 50, 75, 100].map(level => <polygon key={level} points={keys.map((_, index) => point(index, 100, level / 100).join(',')).join(' ')} className="comparison-radar-grid" />)}
    {keys.map((key, index) => {
      const [x, y] = point(index, 100)
      const [lx, ly] = labelPoint(index)
      return <g key={key}><line x1={cx} y1={cy} x2={x} y2={y} className="comparison-radar-axis" /><text x={lx} y={ly} className="comparison-radar-label" textAnchor={Math.abs(lx - cx) < 12 ? 'middle' : lx < cx ? 'end' : 'start'} dominantBaseline="middle">{key}</text></g>
    })}
    {cards.map((card, playerIndex) => {
      const values = keys.map(key => card.stats?.[key] ?? 0)
      const points = values.map((value, index) => point(index, value).join(',')).join(' ')
      return <g key={card.id}><polygon points={points} fill={palette[playerIndex]} fillOpacity=".12" stroke={palette[playerIndex]} strokeWidth="2" strokeLinejoin="round" />{values.map((value, index) => { const [x, y] = point(index, value); return <circle key={keys[index]} cx={x} cy={y} r="3" fill={palette[playerIndex]} stroke="var(--panel-bg, #11141b)" strokeWidth="1.5" /> })}</g>
    })}
  </svg>
}

export default function ComparisonAnalysis({ cards, onRemove }: Props) {
  const statKeys = Array.from(new Set(cards.flatMap(card => Object.keys(card.stats ?? {}))))
    .sort((a, b) => {
      const ai = statOrder.indexOf(a)
      const bi = statOrder.indexOf(b)
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.localeCompare(b)
    })
  const radarKeys = mainStats.filter(key => cards.every(card => typeof card.stats?.[key] === 'number'))
  const leaders = statKeys.map(key => {
    const values = cards.map(card => card.stats?.[key]).filter((value): value is number => typeof value === 'number')
    const best = values.length ? Math.max(...values) : null
    return { key, best, winners: best === null ? [] : cards.map((card, index) => card.stats?.[key] === best ? index : -1).filter(index => index >= 0) }
  })
  const wins = cards.map((_, index) => leaders.filter(item => item.winners.length === 1 && item.winners[0] === index).length)
  const tied = leaders.filter(item => item.winners.length > 1).length
  const overallValues = cards.map(card => card.overallRating)
  const bestOverall = Math.max(...overallValues)

  return <div className="comparison-analysis">
    <div className="comparison-player-strip">
      {cards.map((card, index) => <article className="comparison-player-card" key={card.id} style={{ '--comparison-player': palette[index] } as CSSProperties}>
        <div className="comparison-player-art">{card.imageUrl ? <img src={card.imageUrl} alt="" loading="lazy" /> : <span>UFL<span>MB</span></span>}</div>
        <div className="comparison-player-info"><strong title={card.playerName}>{card.playerName}</strong><span>{card.positions.join(' / ')} · {card.nation}</span><b className={card.overallRating === bestOverall ? 'is-leading' : ''}><small>OVR</small>{card.overallRating}</b></div>
        <button type="button" onClick={() => onRemove(card.id)} aria-label={`Remove ${card.playerName} from comparison`}>×</button>
      </article>)}
    </div>

    <div className="comparison-overview">
      {cards.map((card, index) => <div className="comparison-score" key={card.id} style={{ '--comparison-player': palette[index] } as CSSProperties}>
        <span>{card.playerName}</span><strong>{wins[index]}<small>/ {leaders.length}</small></strong><small>attribute wins</small>
      </div>)}
      {tied > 0 && <div className="comparison-ties"><strong>{tied}<small>/ {leaders.length}</small></strong><span>tied attributes</span></div>}
    </div>

    <section className="comparison-visual-panel">
      <div className="comparison-panel-heading"><div><p className="eyebrow">ATTRIBUTE PROFILE</p><h3>Radar comparison</h3></div><span>Higher value = further out</span></div>
      <RadarChart cards={cards} keys={radarKeys} />
      <div className="comparison-legend">{cards.map((card, index) => <span key={card.id} style={{ '--comparison-player': palette[index] } as CSSProperties}><i />{card.playerName}</span>)}</div>
    </section>

    <section className="comparison-visual-panel comparison-attributes-panel">
      <div className="comparison-panel-heading"><div><p className="eyebrow">HEAD-TO-HEAD</p><h3>Attribute breakdown</h3></div><span>{statKeys.length} attributes</span></div>
      {statKeys.length === 0 ? <p className="comparison-no-stats">No verified attribute values are available for these cards.</p> : <div className="comparison-attribute-list">
        {statKeys.map(key => {
          const values = cards.map(card => card.stats?.[key])
          const numeric = values.filter((value): value is number => typeof value === 'number')
          const best = numeric.length ? Math.max(...numeric) : null
          const worst = numeric.length > 1 ? Math.min(...numeric) : null
          const second = numeric.length > 1 ? [...new Set(numeric)].sort((a, b) => b - a)[1] : null
          return <div className="comparison-attribute-row" key={key}>
            <div className="comparison-attribute-label"><strong>{key}</strong>{best !== null && second !== null && best > second && <small>Leader +{Number((best - second).toFixed(1))}</small>}</div>
            <div className="comparison-attribute-values">{cards.map((card, index) => {
              const value = values[index]
              const isWinner = typeof value === 'number' && value === best
              const isBiggestLoss = typeof value === 'number' && !isWinner && worst !== null && value === worst
              return <div className={`comparison-attribute-value ${isWinner ? 'is-winner' : ''} ${isBiggestLoss ? 'is-biggest-loss' : ''}`} key={card.id} style={{ '--comparison-player': palette[index] } as CSSProperties}>
                <div className="comparison-value-top"><span>{card.playerName}</span><strong style={!isWinner && typeof value === 'number' && best !== null ? { color: `color-mix(in srgb, #7f1d1d ${40 + Math.min(60, ((best - value) / 20) * 60)}%, #f87171)` } : undefined}>{typeof value === 'number' ? (isWinner ? value : `−${Number((best! - value).toFixed(1))}`) : '—'}</strong>{isWinner && <em>LEADER</em>}</div>
                <div className="comparison-value-track"><i style={{ width: `${typeof value === 'number' ? Math.max(0, Math.min(100, value)) : 0}%` }} /></div>
              </div>
            })}</div>
          </div>
        })}
      </div>}
    </section>
  </div>
}
