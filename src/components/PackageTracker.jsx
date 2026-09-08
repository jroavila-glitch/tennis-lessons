import styles from './PackageTracker.module.css'

function splitIntoPackages(sessions) {
  // Trust the sheet row order (chronological as entered).
  // Only start a new package when the previous one is fully complete —
  // this avoids phantom splits caused by sessions with no dates or minor data issues.
  const packages = []
  let current = []
  for (const s of sessions) {
    if (s.packageSession === 1 && current.length > 0) {
      const prevSize      = Math.max(...current.map(x => x.packageSize || 10))
      const prevCompleted = Math.max(...current.map(x => x.packageSession))
      if (prevCompleted >= prevSize) {
        // Previous pack is done — this really is a new package
        packages.push(current)
        current = [s]
      } else {
        // Previous pack isn't done — this is likely a numbering quirk, keep going
        current.push(s)
      }
    } else {
      current.push(s)
    }
  }
  if (current.length > 0) packages.push(current)
  return packages
}

export default function PackageTracker({ lessons }) {
  const byPerson = {}

  lessons
    .filter(l => l.isPackage && l.packageSession != null)
    .forEach(l => {
      l.who.split(/,+/).map(p => p.trim()).filter(Boolean).forEach(person => {
        if (!byPerson[person]) byPerson[person] = []
        byPerson[person].push(l)
      })
    })

  const entries = Object.entries(byPerson)
    .map(([person, allSessions]) => ({
      person,
      packages: splitIntoPackages(allSessions), // trust sheet row order
    }))
    .sort((a, b) => a.person.localeCompare(b.person))

  if (entries.length === 0)
    return <div className={styles.empty}>No package sessions in current selection.</div>

  return (
    <div className={styles.list}>
      {entries.map(({ person, packages }) => (
        <div key={person} className={styles.personGroup}>
          <div className={styles.personLabel}>{person}</div>

          {packages.map((sessions, pkgIndex) => {
            const pkgSize       = Math.max(...sessions.map(s => s.packageSize || 10))
            const completed     = Math.max(...sessions.map(s => s.packageSession))
            const floorComp     = Math.floor(completed)
            const isFractional  = completed % 1 !== 0
            const isOverCap     = completed > pkgSize
            const isDone        = completed >= pkgSize
            const totalDots     = isOverCap ? Math.ceil(completed) : pkgSize
            const session1      = sessions.find(s => s.packageSession === 1)
            const startDate     = session1 ? `${session1.date} ${session1.month || ''}`.trim() : '—'
            const owes          = sessions.reduce((s, l) => s + (l.owes > 0 ? l.owes : 0), 0)
            const multiPkg      = packages.length > 1
            const displayCount  = Number.isInteger(completed) ? completed : completed

            return (
              <div key={pkgIndex} className={`${styles.row} ${isDone ? styles.done : ''}`}>
                <div className={styles.meta}>
                  {multiPkg && (
                    <span className={styles.pkgNum}>Pack {pkgIndex + 1}</span>
                  )}
                  <span className={styles.sub}>
                    Started {startDate}
                    {owes > 0 && <span className={styles.owes}> · owes €{owes}</span>}
                    {isDone && !isOverCap && <span className={styles.complete}> · ✓ complete</span>}
                    {isOverCap && <span className={styles.overCap}> · +{Math.ceil(completed) - pkgSize} bonus</span>}
                  </span>
                </div>

                <div className={styles.progress}>
                  {Array.from({ length: totalDots }, (_, i) => {
                    const isBonus  = i >= pkgSize
                    const isFilled = !isBonus && i < floorComp
                    const isHalf   = !isBonus && isFractional && i === floorComp
                    const isLast   = !isDone && (isHalf || (!isFractional && i === floorComp - 1))
                    const cls = [
                      styles.dot,
                      isBonus  ? styles.bonus  : '',
                      isFilled ? styles.filled : '',
                      isHalf   ? styles.half   : '',
                      isLast   ? styles.last   : '',
                    ].filter(Boolean).join(' ')
                    return (
                      <div
                        key={i}
                        className={cls}
                        title={isBonus ? `Bonus session ${i - pkgSize + 1}` : `Session ${i + 1}`}
                      />
                    )
                  })}
                </div>

                <div className={styles.count}>
                  <span className={isDone ? styles.doneCount : ''}>{displayCount}</span>
                  <span className={styles.slash}>/</span>
                  <span>{pkgSize}</span>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
