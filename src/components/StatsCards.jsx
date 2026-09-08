import { useState } from 'react'
import styles from './StatsCards.module.css'

export default function StatsCards({ lessons, onOutstandingClick }) {
  const [profitVisible,   setProfitVisible]   = useState(false)
  const [receivedVisible, setReceivedVisible] = useState(false)

  const totalLessons   = lessons.length
  const totalProfit    = lessons.reduce((s, l) => s + (l.totalProfit      || 0), 0)
  const totalReceived  = lessons.reduce((s, l) => s + (l.amountTransferred || 0), 0)
  const totalOwed      = lessons.reduce((s, l) => s + (l.owes > 0 ? l.owes : 0), 0)
  const courtCoveredMe = lessons.reduce((s, l) => s + (l.courtFeeYou      || 0), 0)
  const pkgSessions    = lessons.filter(l => l.isPackage).length

  return (
    <div className={styles.grid}>
      <Card label="Total Lessons"     value={totalLessons}                   color="accent"  />
      <Card
        label="Total Profit"
        value={profitVisible ? `€${totalProfit.toFixed(0)}` : '€ ••••'}
        color="green"
        eye
        eyeOpen={profitVisible}
        onEyeToggle={() => setProfitVisible(v => !v)}
      />
      <Card
        label="Total Received"
        value={receivedVisible ? `€${totalReceived.toFixed(0)}` : '€ ••••'}
        color="yellow"
        eye
        eyeOpen={receivedVisible}
        onEyeToggle={() => setReceivedVisible(v => !v)}
      />
      <Card
        label="Outstanding"
        value={`€${totalOwed.toFixed(0)}`}
        color={totalOwed > 0 ? 'red' : 'green'}
        onClick={totalOwed > 0 ? onOutstandingClick : undefined}
        clickable={totalOwed > 0}
      />
      <Card label="Court (I covered)" value={`€${courtCoveredMe.toFixed(0)}`} color="muted" />
      <Card label="Package Sessions"  value={pkgSessions}                    color="accent"  />
    </div>
  )
}

function Card({ label, value, color, onClick, clickable, eye, eyeOpen, onEyeToggle }) {
  return (
    <div
      className={`${styles.card} ${styles[color]} ${clickable ? styles.clickable : ''}`}
      onClick={onClick}
    >
      <div className={styles.valueRow}>
        <div className={styles.value}>{value}</div>
        {eye && (
          <button
            className={styles.eyeBtn}
            onClick={e => { e.stopPropagation(); onEyeToggle() }}
            aria-label={eyeOpen ? 'Hide profit' : 'Show profit'}
          >
            {eyeOpen ? (
              // Eye open
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            ) : (
              // Eye closed
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            )}
          </button>
        )}
      </div>
      <div className={styles.label}>
        {label}
        {clickable && <span className={styles.hint}> · tap to see</span>}
      </div>
    </div>
  )
}
