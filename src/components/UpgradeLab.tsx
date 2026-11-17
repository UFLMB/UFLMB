import { useEffect, useMemo, useState } from 'react'
import type { PlayerCard } from '../types/card'
import { formatCardDisplayName } from '../types/card'
import './UpgradeLab.css'

type Props = { cards: PlayerCard[] }
type UpgradeLabState = { search: string; selectedId: string; currentRank: number; currentLevel: number; targetRank: number; targetLevel: number }

const STORAGE_KEY = 'uflmb.upgrade-lab.v1'
const defaultState: UpgradeLabState = { search: '', selectedId: '', currentRank: 0, currentLevel: 1, targetRank: 0, targetLevel: 1 }
const rankOptions = [0, 1, 2, 3, 4, 5]
const statKeys = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'] as const
const capForRank = (rank: number) => (rank + 1) * 5
const loadUpgradeLabState = (): UpgradeLabState => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaultState
    const value = saved as Partial<UpgradeLabState>
    const currentRank = Number.isInteger(value.currentRank) ? Math.min(5, Math.max(0, value.currentRank!)) : 0
    const currentLevel = Number.isInteger(value.currentLevel) ? Math.min(capForRank(currentRank), Math.max(1, value.currentLevel!)) : 1
    const targetRank = Number.isInteger(value.targetRank) ? Math.min(5, Math.max(currentRank, value.targetRank!)) : currentRank
    const targetLevel = Number.isInteger(value.targetLevel) ? Math.min(capForRank(targetRank), Math.max(currentLevel, value.targetLevel!)) : currentLevel
    return { search: typeof value.search === 'string' ? value.search : '', selectedId: typeof value.selectedId === 'string' ? value.selectedId : '', currentRank, currentLevel, targetRank, targetLevel }
  } catch { return defaultState }
}
const getCardType = (card: PlayerCard): string => {
  const source = card.sourceData || {}
  return (source.card_type || source['card type'] || source.rarity || source.type || '').trim().replace(/\\s+/g, ' ').toLocaleLowerCase()
}
const formatCardType = (value: string): string => value ? value.replace(/\\b\\w/g, letter => letter.toLocaleUpperCase()) : 'Unknown card type'
const statValue = (card: PlayerCard, key: string): number | null => {
  const value = card.stats?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export default function UpgradeLab({ cards }: Props) {
  const [savedState, setSavedState] = useState<UpgradeLabState>(loadUpgradeLabState)
  const { search, selectedId, currentRank, currentLevel, targetRank, targetLevel } = savedState

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState)) } catch { /* Keep the current simulation active if browser storage is unavailable. */ }
  }, [savedState])

  const orderedCards = useMemo(() => [...cards].sort((a, b) => a.playerName.localeCompare(b.playerName)), [cards])
  const matches = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return orderedCards.filter(card => !term || [card.playerName, card.cardName, card.club, ...card.positions].some(value => value?.toLocaleLowerCase().includes(term))).slice(0, 80)
  }, [orderedCards, search])
  const selected = orderedCards.find(card => card.id === selectedId) ?? null
  const validCurrent = currentLevel <= capForRank(currentRank)
  const validTarget = targetLevel <= capForRank(targetRank) && targetRank >= currentRank && targetLevel >= currentLevel
  const rankUps = Math.max(0, targetRank - currentRank)
  const levelUps = Math.max(0, targetLevel - currentLevel)
  const cardType = selected ? getCardType(selected) : ''
  const cardTypeLabel = formatCardType(cardType)

  const chooseRank = (value: number, target: boolean) => {
    setSavedState(current => target
      ? { ...current, targetRank: value, targetLevel: Math.min(Math.max(current.targetLevel, current.currentLevel), capForRank(value)) }
      : {
          ...current,
          currentRank: value,
          currentLevel: Math.min(current.currentLevel, capForRank(value)),
          targetRank: Math.max(current.targetRank, value),
          targetLevel: Math.max(current.targetLevel, current.currentLevel),
        })
  }

  const updateTargetLevel = (value: number) => setSavedState(current => ({ ...current, targetLevel: value }))
  const updateCurrentLevel = (value: number) => setSavedState(current => ({ ...current, currentLevel: value, targetLevel: Math.max(current.targetLevel, value) }))
  const hasSelection = Boolean(selected)
  const validPlan = hasSelection && validCurrent && validTarget

  return (
    <section className="upgrade-lab-page" aria-labelledby="upgrade-lab-title">
      <div className="upgrade-lab-heading">
        <p className="eyebrow">PLAYER DEVELOPMENT WORKSPACE</p>
        <h1 id="upgrade-lab-title">Upgrade <span>Lab.</span></h1>
        <p className="hero-copy">Plan a player's Rank and Level progression, review every development category, and keep the original card untouched.</p>
      </div>

      <div className="upgrade-lab-grid">
        <section className="upgrade-lab-panel upgrade-lab-player-panel">
          <div className="upgrade-lab-panel-heading"><div><p className="eyebrow">STEP 01</p><h2>Select player</h2></div><span className="upgrade-lab-count">{cards.length.toLocaleString()} cards</span></div>
          <label className="upgrade-lab-field">Find a player
            <input type="search" value={search} onChange={event => setSavedState(current => ({ ...current, search: event.target.value }))} placeholder="Search player, card or position…" />
          </label>
          <label className="upgrade-lab-field">Player card
            <select value={selectedId} onChange={event => setSavedState(current => ({ ...current, selectedId: event.target.value }))}>
              <option value="">Choose a player card…</option>
              {matches.map(card => <option key={card.id} value={card.id}>{formatCardDisplayName(card)} · {card.overallRating} OVR · {card.positions.join('/')}</option>)}
            </select>
          </label>
          {selected && <div className="upgrade-lab-selected-card">
            {selected.imageUrl ? <img src={selected.imageUrl} alt={`${selected.playerName} player card`} /> : <div className="upgrade-lab-card-placeholder"><strong>{selected.overallRating}</strong><span>OVR</span></div>}
            <div><strong>{formatCardDisplayName(selected)}</strong><span>{selected.positions.join(' / ')} · {selected.nation}</span><span>Base OVR <b>{selected.overallRating}</b></span>{typeof selected.maxRating === 'number' && <span>Recorded MAX <b>{selected.maxRating}</b></span>}</div>
          </div>}
        </section>

        <section className="upgrade-lab-panel">
          <div className="upgrade-lab-panel-heading"><div><p className="eyebrow">STEP 02</p><h2>Current progression</h2></div></div>
          <div className="upgrade-lab-progression-fields">
            <label className="upgrade-lab-field">Current Rank
              <select value={currentRank} onChange={event => chooseRank(Number(event.target.value), false)}>{rankOptions.map(rank => <option key={rank} value={rank}>{rank} {rank === 1 ? 'Star' : 'Stars'}</option>)}</select>
            </label>
            <label className="upgrade-lab-field">Current Level
              <select value={currentLevel} onChange={event => updateCurrentLevel(Number(event.target.value))}>{Array.from({ length: capForRank(currentRank) }, (_, index) => index + 1).map(level => <option key={level} value={level}>Level {level}</option>)}</select>
            </label>
          </div>
          <p className="upgrade-lab-hint">Rank {currentRank} unlocks progression up to Level {capForRank(currentRank)}.</p>
        </section>

        <section className="upgrade-lab-panel">
          <div className="upgrade-lab-panel-heading"><div><p className="eyebrow">STEP 03</p><h2>Target progression</h2></div></div>
          <div className="upgrade-lab-progression-fields">
            <label className="upgrade-lab-field">Target Rank
              <select value={targetRank} onChange={event => chooseRank(Number(event.target.value), true)}>{rankOptions.filter(rank => rank >= currentRank).map(rank => <option key={rank} value={rank}>{rank} {rank === 1 ? 'Star' : 'Stars'}</option>)}</select>
            </label>
            <label className="upgrade-lab-field">Target Level
              <select value={targetLevel} onChange={event => updateTargetLevel(Number(event.target.value))}>{Array.from({ length: Math.max(0, capForRank(targetRank) - currentLevel + 1) }, (_, index) => currentLevel + index).map(level => <option key={level} value={level}>Level {level}</option>)}</select>
            </label>
          </div>
          <p className="upgrade-lab-hint">Rank {targetRank} unlocks progression up to Level {capForRank(targetRank)}.</p>
        </section>

        <section className="upgrade-lab-panel upgrade-lab-results">
          <div className="upgrade-lab-panel-heading"><div><p className="eyebrow">DEVELOPMENT OVERVIEW</p><h2>Upgrade results</h2></div><span className="upgrade-lab-simulation-tag">SIMULATION ONLY</span></div>
          {!selected ? <p className="upgrade-lab-empty">Select a player card to prepare the full development preview.</p> : !validPlan ? <p className="upgrade-lab-validation" role="alert">The selected Rank and Level combination is not valid. Each Rank unlocks five additional Levels.</p> : <>
            <section className="upgrade-lab-result-section upgrade-lab-ovr-section">
              <div className="upgrade-lab-result-title"><div><p className="eyebrow">01 / OVERALL RATING</p><h3>Developed OVR</h3></div><span className="upgrade-lab-pending">CALCULATION PENDING</span></div>
              <div className="upgrade-lab-ovr-grid">
                <div className="upgrade-lab-ovr-value"><span>Base OVR</span><strong>{selected.overallRating}</strong><small>Original card rating</small></div>
                <div className="upgrade-lab-ovr-arrow" aria-hidden="true">→</div>
                <div className="upgrade-lab-ovr-value upgrade-lab-ovr-target"><span>Developed OVR</span><strong>—</strong><small>Awaiting verified formula</small></div>
                <div className="upgrade-lab-ovr-growth"><span>OVR growth</span><strong>—</strong><small>Not estimated</small></div>
              </div>
              {typeof selected.maxRating === 'number' && <p className="upgrade-lab-data-note">Dataset maximum rating: <b>{selected.maxRating}</b>. This is source metadata, not a calculated result for the selected Rank and Level.</p>}
            </section>

            <section className="upgrade-lab-result-section">
              <div className="upgrade-lab-result-title"><div><p className="eyebrow">02 / SIX CORE ATTRIBUTES</p><h3>Attribute Development</h3></div><span className="upgrade-lab-pending">GROWTH PENDING</span></div>
              <div className="upgrade-lab-attribute-table" role="table" aria-label="Base and developed player attributes">
                <div className="upgrade-lab-attribute-row upgrade-lab-attribute-head" role="row"><span role="columnheader">Attribute</span><span role="columnheader">Base</span><span role="columnheader">Developed</span><span role="columnheader">Change</span></div>
                {statKeys.map(key => <div className="upgrade-lab-attribute-row" role="row" key={key}><strong role="cell">{key}</strong><span role="cell">{statValue(selected, key) ?? '—'}</span><span className="upgrade-lab-muted-value" role="cell">—</span><span className="upgrade-lab-muted-value" role="cell">—</span></div>)}
              </div>
              <p className="upgrade-lab-data-note">Base attributes are read from the selected database card where available. Developed values and deltas remain blank until position-specific growth rules are verified.</p>
            </section>

            <div className="upgrade-lab-metric-grid">
              <section className="upgrade-lab-result-section upgrade-lab-metric-panel">
                <div className="upgrade-lab-result-title"><div><p className="eyebrow">03 / DEVELOPMENT COST</p><h3>CP Cost</h3></div><span className="upgrade-lab-pending">PENDING</span></div>
                <div className="upgrade-lab-metric-pair"><div><span>Per level</span><strong>— CP</strong></div><div><span>Total ({levelUps} level-ups)</span><strong>— CP</strong></div></div>
                <p className="upgrade-lab-data-note">The progressive CP cost curve has not been confirmed.</p>
              </section>
              <section className="upgrade-lab-result-section upgrade-lab-metric-panel">
                <div className="upgrade-lab-result-title"><div><p className="eyebrow">04 / LEVEL REQUIREMENTS</p><h3>EXP Progression</h3></div><span className="upgrade-lab-pending">PENDING</span></div>
                <div className="upgrade-lab-metric-pair"><div><span>Next level</span><strong>— EXP</strong></div><div><span>Total required</span><strong>— EXP</strong></div></div>
                <p className="upgrade-lab-data-note">Level-based EXP thresholds have not been confirmed.</p>
              </section>
            </div>

            <section className="upgrade-lab-result-section">
              <div className="upgrade-lab-result-title"><div><p className="eyebrow">05 / REQUIRED MATERIALS</p><h3>Rank Up Requirements</h3></div><span className="upgrade-lab-pending">PLANNING</span></div>
              <div className="upgrade-lab-rankup-card">
                <div className="upgrade-lab-rankup-count"><strong>{rankUps}</strong><span>Rank-ups</span></div>
                <div className="upgrade-lab-rankup-copy"><strong>{rankUps > 0 ? (cardType ? `${rankUps} × ${cardTypeLabel} card` : `${rankUps} × card of the same type`) : 'No rank-up card required'}</strong><p>Any player's card can be used. It does not need to match the selected player — only the card type must match (for example, Legendary → Legendary or Icon → Icon).</p></div>
              </div>
              {!cardType && rankUps > 0 && <p className="upgrade-lab-data-note">Automatic type validation is unavailable because the current player-card schema does not contain a separate rarity/card-type field. Campaign or event labels are not treated as rarity.</p>}
            </section>

            <section className="upgrade-lab-result-section upgrade-lab-final-summary">
              <div className="upgrade-lab-result-title"><div><p className="eyebrow">06 / PLAN SUMMARY</p><h3>Development Summary</h3></div></div>
              <div className="upgrade-lab-summary-grid">
                <div><span>Selected player</span><strong>{formatCardDisplayName(selected)}</strong></div>
                <div><span>Progression</span><strong>Rank {currentRank} · Level {currentLevel} <i>→</i> Rank {targetRank} · Level {targetLevel}</strong></div>
                <div><span>Level increases</span><strong>+{levelUps}</strong></div>
                <div><span>Rank-ups</span><strong>+{rankUps}</strong></div>
                <div><span>Developed OVR</span><strong>Pending verification</strong></div>
                <div><span>CP / EXP totals</span><strong>Pending verification</strong></div>
              </div>
            </section>
          </>}
        </section>
      </div>
      <div className="upgrade-lab-safety-note"><span aria-hidden="true">◈</span><p><strong>Safe sandbox.</strong> Your player selection and progression settings are saved in this browser and restored after refresh or when you return to Upgrade Lab. This tool never edits the source card, saved collection, or shared database. Rank-up requirements are for planning only; no card is consumed. Perks are intentionally excluded from this first version.</p></div>
    </section>
  )
}
