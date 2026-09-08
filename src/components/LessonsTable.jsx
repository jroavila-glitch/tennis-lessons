import { useState } from 'react'
import styles from './LessonsTable.module.css'

const COLS = [
  { key: 'month',            label: 'Month'         },
  { key: 'date',             label: 'Date'          },
  { key: 'type',             label: 'Type'          },
  { key: 'who',              label: 'Who'           },
  { key: 'packageSession',   label: 'Pkg'           },
  { key: 'pricePerHour',     label: '€/hr'          },
  { key: 'hours',            label: 'Hrs'           },
  { key: 'people',           label: 'People'        },
  { key: 'totalDue',         label: 'Total due'     },
  { key: 'owes',             label: 'Owes'          },
  { key: 'amountTransferred',label: 'Transferred'   },
  { key: 'courtFeeTotal',    label: 'Court'         },
  { key: 'courtFeeYou',      label: 'Court (me)'    },
  { key: 'totalProfit',      label: 'Profit'        },
  { key: 'method',           label: 'Method'        },
  { key: 'comments',         label: 'Notes'         },
]

const MONEY = new Set(['pricePerHour','totalDue','owes','amountTransferred','courtFeeTotal','courtFeeYou','totalProfit'])

export default function LessonsTable({ lessons }) {
  const [sort, setSort] = useState({ key: null, dir: 1 })

  const sorted = [...lessons].sort((a, b) => {
    if (!sort.key) return 0
    const av = a[sort.key], bv = b[sort.key]
    if (av == null) return 1
    if (bv == null) return -1
    if (typeof av === 'number') return (av - bv) * sort.dir
    return String(av).localeCompare(String(bv)) * sort.dir
  })

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir * -1 } : { key, dir: 1 })
  }

  function fmt(key, val, row) {
    if (key === 'packageSession') {
      return val != null
        ? <span className={styles.pkg}>{val}/{row.packageSize || 10}</span>
        : <span className={styles.empty}>—</span>
    }
    if (key === 'owes') {
      if (val == null || val <= 0) return <span className={styles.paid}>✓</span>
      return <span className={styles.owes}>€{val.toFixed(0)}</span>
    }
    if (key === 'method') {
      if (!val) return <span className={styles.unpaid}>Unpaid</span>
      return <span className={styles.method}>{val}</span>
    }
    if (MONEY.has(key)) {
      if (val == null) return <span className={styles.empty}>—</span>
      const cls = key === 'totalProfit' && val < 0 ? styles.negative : ''
      return <span className={cls}>€{val.toFixed(0)}</span>
    }
    if (val == null || val === '') return <span className={styles.empty}>—</span>
    return String(val)
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {COLS.map(c => (
              <th key={c.key} onClick={() => toggleSort(c.key)} className={sort.key === c.key ? styles.sorted : ''}>
                {c.label}{sort.key === c.key && <span>{sort.dir === 1 ? ' ↑' : ' ↓'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((l, i) => (
            <tr key={i} className={`${l.isPackage ? styles.pkgRow : ''} ${l.owes > 0 ? styles.owesRow : ''}`}>
              {COLS.map(c => (
                <td key={c.key} className={c.key === 'comments' ? styles.notes : ''}>
                  {fmt(c.key, l[c.key], l)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
