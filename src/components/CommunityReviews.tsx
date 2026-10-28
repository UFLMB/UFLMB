import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

type Review = { id: string; card_id: string; reviewer_name: string; rating: number; review_text: string; created_at: string }

const endpoint = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const configured = Boolean(endpoint && anonKey)

export default function CommunityReviews({ cardId }: { cardId: string }) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [name, setName] = useState('')
  const [rating, setRating] = useState('5')
  const [reviewText, setReviewText] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const load = async () => {
    if (!configured) return
    try {
      const response = await fetch(`${endpoint}/rest/v1/card_reviews?select=id,card_id,reviewer_name,rating,review_text,created_at&card_id=eq.${encodeURIComponent(cardId)}&moderation_status=eq.approved&order=created_at.desc&limit=50`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      })
      if (!response.ok) throw new Error('Review service is not available.')
      setReviews(await response.json() as Review[])
    } catch { setMessage('Could not load community reviews right now.') }
  }

  useEffect(() => { void load() }, [cardId])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!configured) { setMessage('Shared reviews are not connected yet. The shared database setup is required first.'); return }
    if (!name.trim() || !reviewText.trim()) { setMessage('Enter a display name and a short review.'); return }
    const normalizedContent = (name.trim() + ' ' + reviewText.trim()).normalize('NFKD').toLowerCase().replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, '')
    const warningTerms = ['motherfucker','asshole','arsehole','bullshit','fuck','shit','bitch','bastard','cunt','faggot','nigger','nigga','kike','chink','spic','wetback','kurva','fasz','geci','picsa','kocsog','buzi','bazd','baszd','heilhitler','whitepower','alqaeda','alqaida','daesh']
    const possibleViolation = warningTerms.some(term => normalizedContent.includes(term))
      || /(uflmb|strikerz).*(admin|moderator|official|staff|support)/i.test(name.trim())
      || /https?:\\/\\/|www\\.|buy now|free money|crypto giveaway/i.test(reviewText.trim())
    if (possibleViolation) {
      setMessage('Please review the community rules and edit this content before submitting. Offensive language, impersonation, and spam may be hidden for moderator review.')
      return
    }
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`${endpoint}/rest/v1/card_reviews`, {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ card_id: cardId, reviewer_name: name.trim().slice(0, 40), rating: Number(rating), review_text: reviewText.trim().slice(0, 1000) }),
      })
      if (!response.ok) throw new Error('The review could not be saved.')
      setReviewText('')
      setMessage('Review submitted.')
      await load()
    } catch { setMessage('Review submission failed. Check the database setup and try again.') }
    finally { setBusy(false) }
  }

  const isDemo = cardId.startsWith('uflmb-demo-')
  const average = reviews.length ? reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length : 0
  return <section className="profile-section community-reviews" aria-label="Community ratings and reviews">
    <div className="community-review-heading"><div><h3>Community reviews</h3><p className="muted-copy">{configured ? reviews.length ? `★ ${average.toFixed(1)} / 5 · ${reviews.length} review(s)` : 'No reviews yet' : 'Shared review backend not configured yet'}</p></div></div>
    {configured && reviews.length > 0 && <div className="community-review-list">{reviews.map(item => <article key={item.id}><div><strong>{item.reviewer_name}</strong><span>{'★'.repeat(item.rating)}{'☆'.repeat(5-item.rating)}</span></div><p>{item.review_text}</p><small>{new Date(item.created_at).toLocaleDateString()}</small></article>)}</div>}
    {isDemo ? <p className="field-help">Demo fixtures are local-only; reviews are available for shared database records after backend setup.</p> : <form className="community-review-form" onSubmit={submit}>
      <label>Display name<input value={name} onChange={event => setName(event.target.value)} maxLength={40} placeholder="Your display name" required /></label>
      <label>Rating<select value={rating} onChange={event => setRating(event.target.value)}><option value="5">5 — Excellent</option><option value="4">4 — Very good</option><option value="3">3 — Average</option><option value="2">2 — Below average</option><option value="1">1 — Poor</option></select></label>
      <label className="full-field">Review<textarea value={reviewText} onChange={event => setReviewText(event.target.value)} maxLength={1000} rows={3} placeholder="Share your experience with this card…" required /></label>
      <button className="button primary" type="submit" disabled={busy || !configured}>{busy ? 'Submitting…' : 'Submit review'}</button>
    </form>}
    {message && <p className="field-help" role="status">{message}</p>}
    {!configured && <p className="field-help">Reviews will be shared across visitors after the Supabase project URL and public anon key are configured in the GitHub Pages build.</p>}
  </section>
}
