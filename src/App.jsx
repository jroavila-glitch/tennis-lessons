import { useState, useEffect, useMemo } from 'react'
import FilterBar from './components/FilterBar.jsx'
import StatsCards from './components/StatsCards.jsx'
import PackageTracker from './components/PackageTracker.jsx'
import LessonsTable from './components/LessonsTable.jsx'
import OutstandingModal from './components/OutstandingModal.jsx'
import ConfirmLesson from './components/ConfirmLesson.jsx'
import styles from './App.module.css'

const TABS = ['Overview', 'Packages', 'All Lessons']

export default function App() {
  if (window.location.pathname === '/confirm') return <ConfirmLesson />

  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('Overview')
  const [showOutstanding, setShowOutstanding] = useState(false)
  const [filters, setFilters] = useState({ person: '', month: '', year: '', type: '', isPackage: '', payment: '' })

  useEffect(() => {
    fetch('/api/lessons')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setLessons(data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return lessons.filter(l => {
      if (filters.person) {
        const people = l.who.split(/,+/).map(p => p.trim())
        if (!people.includes(filters.person)) return false
      }
      if (filters.month    && l.month !== filters.month) return false
      if (filters.year     && l.year  !== filters.year)  return false
      if (filters.type     && l.type  !== filters.type)  return false
      if (filters.isPackage === 'yes' && !l.isPackage)   return false
      if (filters.isPackage === 'no'  &&  l.isPackage)   return false
      if (filters.payment === 'paid'  && l.owes > 0)  return false
      if (filters.payment === 'owes'  && !(l.owes > 0)) return false
      return true
    })
  }, [lessons, filters])

  if (loading) return <div className={styles.center}>Loading…</div>
  if (error)   return <div className={styles.center}><span className={styles.err}>Error: {error}</span></div>

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1>🎾 Tennis Lessons</h1>
        <span className={styles.count}>{filtered.length} sessions</span>
      </header>

      <main className={styles.main}>
        <FilterBar lessons={lessons} filters={filters} onChange={setFilters} />

        <nav className={styles.tabs}>
          {TABS.map(t => (
            <button
              key={t}
              className={`${styles.tab} ${tab === t ? styles.active : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>

        {tab === 'Overview'     && <section className={styles.section}><StatsCards lessons={filtered} onOutstandingClick={() => setShowOutstanding(true)} /></section>}
        {tab === 'Packages'     && <section className={styles.section}><PackageTracker lessons={filtered} /></section>}

        {showOutstanding && (
          <OutstandingModal
            lessons={filtered}
            onClose={() => setShowOutstanding(false)}
          />
        )}
        {tab === 'All Lessons'  && <section className={styles.section}><LessonsTable   lessons={filtered} /></section>}
      </main>
    </div>
  )
}
