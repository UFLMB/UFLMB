import { useEffect, useMemo, useState } from 'react'
import type { PlayerCard } from '../types/card'
import './UpgradeLab.css'
import { formatCardDisplayName } from '../types/card'

type Props = { cards: PlayerCard[] }

const STORAGE_KEY = 'uflmb.upgrade-lab.v1'
type UpgradeLabState = { search: string; selectedId: string; currentRank: number; currentLevel: number; targetRank: number; targetLevel: number }
const defaultState: UpgradeLabState = { search: '', selectedId: '', currentRank: 0, currentLevel: 1, targetRank: 0, targetLevel: 1 }
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
  return (source.card_type || source['card type'] || source.rarity || source.type || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}
const formatCardType = (value: string): string => value ? value.replace(/\b\w/g, letter => letter.toLocaleUpperCase()) : 'Unknown card type'

const rankOptions = [0, 1, 2, 3, 4, 5]

export default function UpgradeLab({ cards }: Props) {
  const [savedState, setSavedState] = useState<UpgradeLabState>(loadUpgradeLabState)
  const { search, selectedId, currentRank, currentLevel, targetRank, targetLevel } = savedState
  const setSearch = (search: string) => setSavedState(current => ({ ...current, search }))
  const setSelectedId = (selectedId: string) => setSavedState(current => ({ ...current, selectedId }))
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
  const cardType = selected ? getCardType(selected) : ''
  const cardTypeLabel = formatCardType(cardType)
  const levelUps = Math.max(0, targetLevel - currentLevel)

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

  return (
    <section className="upgrade-lab-page" aria-labelledby="upgrade-lab-title">
      <div className="upgrade-lab-heading">
        <p className="eyebrow">PLAYER DEVELOPMENT WORKSPACE</p>
        <h1 id="upgrade-lab-title">Upgrade <span>Lab.</span></h1>
        <p className="hero-copy">Explore a player's Rank and Level progression without changing the original card or database record.</p>
      </div>

      <div className="upgrade-lab-grid">
        <section className="upgrade-lab-panel upgrade-lab-player-panel">
          <div className="upgrade-lab-panel-heading"><div><p className="eyebrow">STEP 01</p><h2>Select player</h2></div><span className="upgrade-lab-count">{cards.length.toLocaleString()} cards</span></div>
          <label className="upgrade-lab-field">Find a player
            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search player, card or position…" />
          </label>
          <label className="upgrade-lab-field">Player card
            <select value={selectedId} onChange={event => setSelectedId(event.target.value)}>
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
              <select value={currentLevel} onChange={event => { const next = Number(event.target.value); setSavedState(current => ({ ...current, currentLevel: next, targetLevel: Math.max(current.targetLevel, next) })) }}>{Array.from({ length: capForRank(currentRank) }, (_, index) => index + 1).map(level => <option key={level} value={level}>Level {level}</option>)}</select>
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
              <select value={targetLevel} onChange={event => setTargetLevel(Number(event.target.value))}>{Array.from({ length: capForRank(targetRank) - currentLevel + 1 }, (_, index) => currentLevel + index).map(level => <option key={level} value={level}>Level {level}</option>)}</select>
            </label>
          </div>
          <p className="upgrade-lab-hint">Rank {targetRank} unlocks progression up to Level {capForRank(targetRank)}.</p>
        </section>

        <section className="upgrade-lab-panel upgrade-lab-results">
          <div className="upgrade-lab-panel-heading"><div><p className="eyebrow">SIMULATION SUMMARY</p><h2>Progression preview</h2></div><span className="upgrade-lab-simulation-tag">SIMULATION ONLY</span></div>
          {!selected ? <p className="upgrade-lab-empty">Select a player card to prepare a progression preview.</p> : !validCurrent || !validTarget ? <p className="upgrade-lab-validation" role="alert">The selected Rank and Level combination is not valid. Each Rank unlocks five additional Levels.</p> : <>
            <div className="upgrade-lab-summary-grid">
              <div><span>Level change</span><strong>{currentLevel} <i>→</i> {targetLevel}</strong><small>+{levelUps} levels</small></div>
              <div><span>Rank change</span><strong>{currentRank} <i>→</i> {targetRank}</strong><small>+{rankUps} rank-ups</small></div>
              <div><span>Unlocked cap</span><strong>{capForRank(currentRank)} <i>→</i> {capForRank(targetRank)}</strong><small>Maximum Level</small></div>
            </div>
            <div className="upgrade-lab-disclaimer"><strong>Attribute calculation not enabled yet</strong><p>The progression selection is validated, but exact stat growth and OVR changes are not calculated until the in-game formula is confirmed. No estimated or invented values are shown.</p></div>
            <div className="upgrade-lab-rule-list">
              <div><span>Rank-up card requirement</span><strong>{rankUps > 0 ? (cardType ? `${rankUps} × ${cardTypeLabel} card` : `${rankUps} × any card of the same type`) : 'No rank-up card needed'}</strong></div>
            </div>
            <p className="upgrade-lab-footnote">A rank-up accepts any player card with the same card type. It does not need to be the same player (for example: Legendary → Legendary, Icon → Icon). {cardType ? '' : 'The current card dataset does not expose a separate card-type field yet, so the type match cannot be verified automatically.'} The perk system is intentionally excluded from this first version.</p>
          </>}
        </section>
      </div>
      <div className="upgrade-lab-safety-note"><span aria-hidden="true">◈</span><p><strong>Safe sandbox.</strong> Your player selection and progression settings are saved in this browser and restored after refresh or when you return to Upgrade Lab. This tool never edits the source card, saved collection, or shared database. Rank-up requirements are shown for planning only; no card is consumed.</p></div>
    </section>
  )
}
