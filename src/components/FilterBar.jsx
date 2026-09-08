import styles from './FilterBar.module.css'

const MONTH_ORDER = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function FilterBar({ lessons, filters, onChange }) {
  const people = [...new Set(
    lessons.flatMap(l => l.who.split(/,+/).map(p => p.trim()).filter(Boolean))
  )].sort()

  const months = [...new Set(lessons.map(l => l.month).filter(Boolean))]
    .sort((a, b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b))

  const years = [...new Set(lessons.map(l => l.year).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))

  const types = [...new Set(lessons.map(l => l.type).filter(Boolean))].sort()

  const reset = () => onChange({ person: '', month: '', year: '', type: '', isPackage: '', payment: '' })

  return (
    <div className={styles.bar}>
      <div className={styles.group}>
        <label>Person</label>
        <select value={filters.person} onChange={e => onChange({ ...filters, person: e.target.value })}>
          <option value="">All</option>
          {people.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className={styles.group}>
        <label>Year</label>
        <select value={filters.year} onChange={e => onChange({ ...filters, year: e.target.value })}>
          <option value="">All</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className={styles.group}>
        <label>Month</label>
        <select value={filters.month} onChange={e => onChange({ ...filters, month: e.target.value })}>
          <option value="">All</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className={styles.group}>
        <label>Type</label>
        <select value={filters.type} onChange={e => onChange({ ...filters, type: e.target.value })}>
          <option value="">All</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className={styles.group}>
        <label>Package</label>
        <select value={filters.isPackage} onChange={e => onChange({ ...filters, isPackage: e.target.value })}>
          <option value="">All</option>
          <option value="yes">Package only</option>
          <option value="no">Single only</option>
        </select>
      </div>
      <div className={styles.group}>
        <label>Payment</label>
        <select value={filters.payment} onChange={e => onChange({ ...filters, payment: e.target.value })}>
          <option value="">All</option>
          <option value="paid">Paid</option>
          <option value="owes">Owes money</option>
        </select>
      </div>
      <button className={styles.reset} onClick={reset}>
        Reset
      </button>
    </div>
  )
}
