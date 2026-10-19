import { useState } from 'react'

type Category = 'All cards' | 'Players' | 'Goalkeepers' | 'Icons'

const categories: Category[] = ['All cards', 'Players', 'Goalkeepers', 'Icons']

export default function App() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('All cards')

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="UFLMB home">
          <span className="brand-mark">U</span>
          <span className="brand-word">UFL<span>MB</span></span>
        </a>
        <span className="status-pill"><span className="status-dot" /> Database in development</span>
      </header>

      <section className="hero">
        <p className="eyebrow">COMMUNITY DATABASE PROJECT</p>
        <h1>Your UFL Mobile<br /><span>card reference.</span></h1>
        <p className="hero-copy">
          A searchable home for UFL Mobile player cards. The foundation is live;
          verified card data will be added as the project develops.
        </p>
        <div className="search-wrap">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input
            aria-label="Search the card database"
            type="search"
            placeholder="Search players or cards…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>SEARCH</kbd>
        </div>
        <div className="category-row" aria-label="Card categories">
          {categories.map((item) => (
            <button
              className={category === item ? 'category active' : 'category'}
              key={item}
              onClick={() => setCategory(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="database-section" aria-labelledby="database-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE COLLECTION</p>
            <h2 id="database-title">Card database</h2>
          </div>
          <span className="count-label">0 verified cards</span>
        </div>

        <div className="empty-state">
          <div className="empty-emblem" aria-hidden="true">U<span>+</span></div>
          <h3>{query.trim() ? 'No verified cards to search yet' : 'The database starts here'}</h3>
          <p>
            {query.trim()
              ? `We haven’t added verified card records yet, so “${query.trim()}” has no matches.`
              : `The ${category.toLowerCase()} collection is being prepared. No sample or invented player data is shown.`}
          </p>
          <span className="empty-tag">DATA COMING SOON</span>
        </div>
      </section>

      <footer className="footer">
        <span>UFLMB <span className="footer-muted">· Community project</span></span>
        <span className="footer-muted">Not affiliated with or endorsed by the game’s publisher.</span>
      </footer>
    </main>
  )
}
