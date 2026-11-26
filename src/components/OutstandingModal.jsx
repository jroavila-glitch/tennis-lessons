import { splitIntoPackages } from './PackageTracker'
import styles from './OutstandingModal.module.css'

export default function OutstandingModal({ lessons, onClose }) {
  // Build a map: person → their current pack sessions (all of them, not just owed)
  const packSessionsByPerson = {}
  lessons
    .filter(l => l.isPackage && l.packageSession != null)
    .forEach(l => {
      l.who.split(/[,]+/).map(p => p.trim()).filter(Boolean).forEach(person => {
        if (!packSessionsByPerson[person]) packSessionsByPerson[person] = []
        packSessionsByPerson[person].push(l)
      })
    })

  // For each person, find their current (last) pack and check if it has a debt
  const currentPackByPerson = {}
  Object.entries(packSessionsByPerson).forEach(([person, sessions]) => {
    const packs = splitIntoPackages(sessions)
    const last  = packs[packs.length - 1]
    if (last && last.some(s => s.owes > 0)) currentPackByPerson[person] = last
  })

  // Build outstanding entries grouped by person
  const byPerson = {}

  lessons.filter(l => l.owes > 0).forEach(l => {
    const people = l.who.split(/[,]+/).map(p => p.trim()).filter(Boolean)
    const n = people.length || 1

    people.forEach(person => {
      if (!byPerson[person]) byPerson[person] = { packDebt: null, regularSessions: [] }

      if (l.isPackage) {
        // For pack debt: use the full current pack (all sessions) for display
        if (!byPerson[person].packDebt && currentPackByPerson[person]) {
          const packSessions = currentPackByPerson[person]
          const totalOwed = packSessions.reduce((s, x) => s + (x.owes || 0), 0) / n
          byPerson[person].packDebt = {
            sessions: packSessions,
            totalOwed,
            numPeople: n,
          }
        }
      } else {
        byPerson[person].regularSessions.push({
          ...l,
          owes:              l.owes / n,
          totalDue:          (l.totalDue || 0) / n,
          amountTransferred: (l.amountTransferred || 0) / n,
        })
      }
    })
  })

  const entries = Object.entries(byPerson)
    .map(([person, { packDebt, regularSessions }]) => {
      const packOwed = packDebt?.totalOwed || 0
      const regOwed  = regularSessions.reduce((s, l) => s + l.owes, 0)
      return { person, packDebt, regularSessions, total: packOwed + regOwed }
    })
    .filter(e => e.total > 0)
    .sort((a, b) => b.total - a.total)

  const grandTotal = entries.reduce((s, e) => s + e.total, 0)

  const monthOrder = ['January','February','March','April','May','June','July',
                      'August','September','October','November','December']
  const sortByDate = arr => [...arr].sort((a, b) => {
    const mi = monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month)
    return mi !== 0 ? mi : (parseInt(a.date) || 0) - (parseInt(b.date) || 0)
  })

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2>Outstanding payments</h2>
            <span className={styles.sub}>{entries.length} people · total €{grandTotal.toFixed(0)}</span>
          </div>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        {entries.length === 0 ? (
          <div className={styles.empty}>All settled up 🎾</div>
        ) : (
          <div className={styles.list}>
            {entries.map(({ person, packDebt, regularSessions, total }) => (
              <div key={person} className={styles.personBlock}>
                <div className={styles.personHeader}>
                  <span className={styles.personName}>{person}</span>
                  <span className={styles.personTotal}>€{total.toFixed(0)}</span>
                </div>

                {/* Pack debt: show all sessions from the current pack */}
                {packDebt && (
                  <div className={styles.packBlock}>
                    <div className={styles.packLabel}>
                      📦 Pack · owes €{packDebt.totalOwed.toFixed(0)}
                    </div>
                    {sortByDate(packDebt.sessions).map((s, i) => (
                      <div key={i} className={`${styles.sessionRow} ${s.owes > 0 ? styles.debtRow : ''}`}>
                        <div className={styles.sessionLeft}>
                          <span className={styles.sessionDate}>{s.date} {s.month || ''}</span>
                          <span className={styles.sessionType}>{s.type}</span>
                          <span className={styles.pkg}>
                            {s.packageSession}/{s.packageSize || 10}
                          </span>
                        </div>
                        <div className={styles.sessionRight}>
                          {s.owes > 0 && (
                            <span className={styles.owes}>€{(s.owes / packDebt.numPeople).toFixed(0)} owed</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Regular (non-pack) session debts */}
                {sortByDate(regularSessions).map((l, i) => (
                  <div key={i} className={`${styles.sessionRow} ${styles.debtRow}`}>
                    <div className={styles.sessionLeft}>
                      <span className={styles.sessionDate}>{l.date} {l.month || ''}</span>
                      <span className={styles.sessionType}>{l.type}</span>
                    </div>
                    <div className={styles.sessionRight}>
                      {l.amountTransferred > 0 && (
                        <>
                          <span className={styles.due}>due €{(l.totalDue || 0).toFixed(0)}</span>
                          <span className={styles.paid}>paid €{l.amountTransferred.toFixed(0)}</span>
                        </>
                      )}
                      <span className={styles.owes}>€{l.owes.toFixed(0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
