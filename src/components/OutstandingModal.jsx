import styles from './OutstandingModal.module.css'

export default function OutstandingModal({ lessons, onClose }) {
  // Group owing sessions by person
  const byPerson = {}
  lessons
    .filter(l => l.owes > 0)
    .forEach(l => {
      // A session can involve multiple people — split owes evenly
      const people = l.who.split(/[,]+/).map(p => p.trim()).filter(Boolean)
      const owesPerPerson = l.owes / (people.length || 1)
      const totalDuePerPerson = (l.totalDue || 0) / (people.length || 1)
      const transferredPerPerson = (l.amountTransferred || 0) / (people.length || 1)
      people.forEach(person => {
        if (!byPerson[person]) byPerson[person] = []
        byPerson[person].push({
          ...l,
          owes: owesPerPerson,
          totalDue: totalDuePerPerson,
          amountTransferred: transferredPerPerson,
        })
      })
    })

  // Sort each person's sessions by date, then sort people by total owed desc
  const entries = Object.entries(byPerson)
    .map(([person, sessions]) => ({
      person,
      sessions: [...sessions].sort((a, b) => {
        const monthOrder = ['January','February','March','April','May','June','July','August','September','October','November','December']
        const mi = monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month)
        return mi !== 0 ? mi : (parseInt(a.date) || 0) - (parseInt(b.date) || 0)
      }),
      total: sessions.reduce((s, l) => s + l.owes, 0),
    }))
    .sort((a, b) => b.total - a.total)

  const grandTotal = entries.reduce((s, e) => s + e.total, 0)

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
            {entries.map(({ person, sessions, total }) => (
              <div key={person} className={styles.personBlock}>
                <div className={styles.personHeader}>
                  <span className={styles.personName}>{person}</span>
                  <span className={styles.personTotal}>€{total.toFixed(0)}</span>
                </div>
                {sessions.map((l, i) => (
                  <div key={i} className={styles.sessionRow}>
                    <div className={styles.sessionLeft}>
                      <span className={styles.sessionDate}>{l.date} {l.month || ''}</span>
                      <span className={styles.sessionType}>{l.type}</span>
                      {l.isPackage && <span className={styles.pkg}>pkg {l.packageSession}/{l.packageSize || 10}</span>}
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
