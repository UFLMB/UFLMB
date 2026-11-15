import { useEffect, useMemo, useRef, useState } from 'react'

export type ProfileStatGroup = {
  code: string
  label: string
  main?: number
  details: Array<{ key: string; label: string; value: number }>
}

type ProfileStatGroupsProps = {
  groups: ProfileStatGroup[]
}

const DURATION_MS = 760
const FRAME_INTERVAL_MS = 32

const formatStatValue = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)))

export default function ProfileStatGroups({ groups }: ProfileStatGroupsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [animatedValues, setAnimatedValues] = useState<Record<string, number>>({})
  const targetEntries = useMemo(() => groups.flatMap(group => [
    ...(typeof group.main === 'number' ? [{ key: `${group.code}:main`, value: group.main }] : []),
    ...group.details.map(stat => ({ key: `${group.code}:${stat.key}`, value: stat.value })),
  ]), [groups])
  const targetSignature = targetEntries.map(entry => `${entry.key}=${entry.value}`).join('|')

  useEffect(() => {
    const targets = Object.fromEntries(targetEntries.map(entry => [entry.key, entry.value]))
    let frameId = 0
    let started = false

    const startAnimation = () => {
      if (started) return
      started = true

      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      if (reduceMotion || targetEntries.length === 0) {
        setAnimatedValues(targets)
        return
      }

      setAnimatedValues(Object.fromEntries(targetEntries.map(entry => [entry.key, 0])))
      const startTime = performance.now()
      let lastPaint = 0

      const tick = (now: number) => {
        const progress = Math.min(1, (now - startTime) / DURATION_MS)
        const easedProgress = 1 - Math.pow(1 - progress, 3)

        if (now - lastPaint >= FRAME_INTERVAL_MS || progress === 1) {
          lastPaint = now
          const nextValues: Record<string, number> = {}
          for (const entry of targetEntries) {
            nextValues[entry.key] = entry.value * easedProgress
          }
          setAnimatedValues(nextValues)
        }

        if (progress < 1) frameId = window.requestAnimationFrame(tick)
      }

      frameId = window.requestAnimationFrame(tick)
    }

    const node = containerRef.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      startAnimation()
    } else {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect()
          startAnimation()
        }
      }, { threshold: 0.08 })
      observer.observe(node)
      return () => {
        observer.disconnect()
        if (frameId) window.cancelAnimationFrame(frameId)
      }
    }

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId)
    }
  }, [targetSignature])

  const getValue = (key: string) => animatedValues[key] ?? 0
  const isComplete = targetEntries.every(entry => animatedValues[entry.key] === entry.value)

  return (
    <div ref={containerRef} className="profile-stat-groups" data-animation-complete={isComplete}>
      {groups.map(group => <section className="profile-stat-group" key={group.code}>
        <div className="profile-stat-group-header">
          <span className="profile-stat-group-code">{group.code === 'GK' ? 'GK' : group.code}</span>
          <span className="profile-stat-group-name">{group.label}</span>
          {typeof group.main === 'number' && <div className="profile-stat-group-score">
            <strong className="profile-stat-main-value text-lime-400 font-bold">{formatStatValue(getValue(`${group.code}:main`))}</strong>
          </div>}
        </div>
        {group.details.length > 0 && <div className="profile-stat-group-details">
          {group.details.slice().sort((a, b) => a.label.localeCompare(b.label)).map(stat => {
            const value = getValue(`${group.code}:${stat.key}`)
            return <div className="profile-stat-detail" key={stat.key}>
              <span className="profile-stat-label" title={stat.label}>{stat.label}</span>
              <div className="profile-stat-meter">
                <i style={{ display: 'block', flex: '1 1 auto', minWidth: 0, height: 6, overflow: 'hidden', borderRadius: 999, backgroundColor: 'rgba(255,255,255,.12)' }}>
                  <b style={{ display: 'block', width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', maxWidth: '100%', backgroundColor: '#a3e635', borderRadius: 999 }} />
                </i>
                <strong>{formatStatValue(value)}</strong>
              </div>
            </div>
          })}
        </div>}
      </section>)}
    </div>
  )
}
