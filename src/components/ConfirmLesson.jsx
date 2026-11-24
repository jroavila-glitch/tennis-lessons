import { useState, useEffect } from 'react'
import styles from './ConfirmLesson.module.css'

const LESSON_TYPES = ['Individual', 'Group', 'Clinic', 'Tennis Rush', 'Tennis Smash']
const METHODS = ['', 'Revolut', 'Cash', 'MB Way', 'DolarApp', 'ARQ']
const MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December']

function formatDuration(min) {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export default function ConfirmLesson() {
  const [status, setStatus]       = useState('loading') // loading|ready|submitting|done|error
  const [lesson, setLesson]       = useState(null)
  const [errMsg, setErrMsg]       = useState(null)

  // Form state
  const [attendees, setAttendees]       = useState([])
  const [durationMin, setDurationMin]   = useState(60)
  const [courtInfo, setCourtInfo]       = useState(null)
  const [lightsOn, setLightsOn]         = useState(false)
  const [lessonType, setLessonType]     = useState('Individual')
  const [payment, setPayment]           = useState('paid') // 'paid'|'owes'|'pack'
  const [method, setMethod]             = useState('')
  const [isPackage, setIsPackage]       = useState(false)
  const [pkgSession, setPkgSession]     = useState(1)
  const [pkgSize, setPkgSize]           = useState(10)

  const params = new URLSearchParams(window.location.search)

  useEffect(() => {
    const encoded = params.get('d')
    if (!encoded) { setErrMsg('No lesson data in URL'); setStatus('error'); return }

    try {
      const data = JSON.parse(atob(encoded))
      setLesson(data)

      const people = data.people || []
      setAttendees(people.map(p => ({ ...p, confirmed: !p.isMaybe })))
      setDurationMin(data.durationMin || 60)
      setCourtInfo(data.courtInfo || null)

      const definite = people.filter(p => !p.isMaybe)
      if (definite.length === 1 && definite[0].hasActivePackage) {
        setIsPackage(true)
        setPayment('pack')
        setPkgSession(definite[0].nextSession)
        setPkgSize(definite[0].packageSize)
      } else if (definite.every(p => p.hasActivePackage) && definite.length > 1) {
        setIsPackage(true)
        setPayment('pack')
        setPkgSession(definite[0].nextSession)
        setPkgSize(definite[0].packageSize)
      }

      setLessonType(definite.length > 1 ? 'Group' : 'Individual')
      setStatus('ready')
    } catch (e) {
      setErrMsg('Could not decode lesson data: ' + e.message)
      setStatus('error')
    }
  }, [])

  const confirmed = attendees.filter(a => a.confirmed)
  const pricePerHour = courtInfo
    ? (courtInfo.type === 'covered' ? (lightsOn ? 18 : 14) : (courtInfo.price || 0))
    : 0
  const hours    = durationMin / 60
  const totalDue = Math.round(pricePerHour * hours * confirmed.length * 100) / 100

  async function handleSubmit() {
    if (confirmed.length === 0) return
    setStatus('submitting')

    const payload = {
      date:         lesson.date,
      people:       confirmed.map(a => a.name),
      durationMin,
      pricePerHour,
      courtType:    courtInfo?.type,
      courtNum:     courtInfo?.courtNum,
      type:         lessonType,
      payment,
      isPackage,
      packageSession: isPackage ? pkgSession : null,
      packageSize:    isPackage ? pkgSize    : null,
      method:       payment === 'paid' ? method : '',
      comments:     '',
      courtFeeStudent: 0,
      courtFeeYou:     0,
    }

    try {
      const res = await fetch('/api/confirm-lesson', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ confirmed: payload }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setStatus('done')
    } catch (e) {
      setErrMsg(e.message)
      setStatus('error')
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (status === 'loading') return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.spinner} />
        <p className={styles.muted}>Loading lesson…</p>
      </div>
    </div>
  )

  // ── Error ────────────────────────────────────────────────────────────────
  if (status === 'error') return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.bigEmoji}>❌</div>
        <h2 className={styles.cardTitle}>Something went wrong</h2>
        <p className={styles.muted}>{errMsg}</p>
        {errMsg?.includes('expired') && (
          <p className={styles.muted}>This lesson may already have been logged.</p>
        )}
      </div>
    </div>
  )

  // ── Done ─────────────────────────────────────────────────────────────────
  if (status === 'done') return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.bigEmoji}>✅</div>
        <h2 className={styles.cardTitle}>Lesson logged!</h2>
        <div className={styles.summary}>
          <div className={styles.summaryRow}><span>Who</span><strong>{confirmed.map(a => a.name).join(', ')}</strong></div>
          <div className={styles.summaryRow}><span>Duration</span><strong>{formatDuration(durationMin)}</strong></div>
          <div className={styles.summaryRow}><span>Court</span><strong>{courtInfo?.label}{courtInfo?.type === 'covered' ? (lightsOn ? ' + lights' : '') : ''}</strong></div>
          <div className={styles.summaryRow}><span>Total</span><strong>€{totalDue}</strong></div>
          <div className={styles.summaryRow}><span>Payment</span><strong>{payment === 'pack' ? '📦 Package' : payment === 'paid' ? '✓ Paid' : 'Owes'}</strong></div>
        </div>
      </div>
    </div>
  )

  // ── Form ─────────────────────────────────────────────────────────────────
  const dateObj = new Date(lesson.date + 'T12:00:00')
  const dateStr = dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>

        <div className={styles.cardHeader}>
          <div className={styles.bigEmoji}>🎾</div>
          <h1 className={styles.cardTitle}>Confirm Lesson</h1>
          <div className={styles.dateStr}>{dateStr}</div>
        </div>

        {/* ── Attendees ─────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.label}>Who was there?</div>
          <div className={styles.chips}>
            {attendees.map((a, i) => (
              <button
                key={a.name}
                className={`${styles.chip} ${a.confirmed ? styles.chipOn : styles.chipOff}`}
                onClick={() => {
                  const next = [...attendees]
                  next[i] = { ...next[i], confirmed: !next[i].confirmed }
                  setAttendees(next)
                }}
              >
                {a.isMaybe && !a.confirmed ? '? ' : ''}{a.name}
              </button>
            ))}
          </div>
        </section>

        {/* ── Duration ──────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.label}>Duration</div>
          <div className={styles.row}>
            <input
              type="number"
              className={styles.numInput}
              value={durationMin}
              onChange={e => setDurationMin(Math.max(15, Number(e.target.value)))}
              min={15}
              step={15}
            />
            <span className={styles.unit}>min</span>
            <span className={styles.muted}>{formatDuration(durationMin)}</span>
          </div>
        </section>

        {/* ── Court ─────────────────────────────────────────────────────── */}
        {courtInfo && (
          <section className={styles.section}>
            <div className={styles.label}>Court</div>
            <div className={styles.courtTitle}>{lesson.title.replace('🎾 ', '')}</div>
            {courtInfo.type === 'covered' && (
              <div className={styles.toggle}>
                <button
                  className={`${styles.toggleBtn} ${!lightsOn ? styles.toggleActive : ''}`}
                  onClick={() => setLightsOn(false)}
                >No lights · €14/hr</button>
                <button
                  className={`${styles.toggleBtn} ${lightsOn ? styles.toggleActive : ''}`}
                  onClick={() => setLightsOn(true)}
                >Lights on · €18/hr</button>
              </div>
            )}
          </section>
        )}

        {/* ── Type ──────────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.label}>Type</div>
          <select
            className={styles.select}
            value={lessonType}
            onChange={e => setLessonType(e.target.value)}
          >
            {LESSON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </section>

        {/* ── Package ───────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.label}>Package</div>

          {/* Show each person's pack status (read-only reference) */}
          {confirmed.length > 0 && (
            <div className={styles.packInfo}>
              {confirmed.map(a => (
                <div key={a.name} className={styles.packRow}>
                  <span className={styles.packName}>{a.name}</span>
                  <span className={styles.muted}>
                    {a.hasActivePackage
                      ? `session ${a.nextSession}/${a.packageSize}`
                      : 'no active pack'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={isPackage}
              onChange={e => {
                setIsPackage(e.target.checked)
                if (e.target.checked) setPayment('pack')
                else if (payment === 'pack') setPayment('paid')
              }}
            />
            Log as package lesson
          </label>

          {isPackage && (
            <div className={styles.pkgFields}>
              <label className={styles.smallLabel}>Session</label>
              <input
                type="number"
                className={styles.smallNum}
                value={pkgSession}
                onChange={e => setPkgSession(Number(e.target.value))}
                min={1}
              />
              <label className={styles.smallLabel}>of</label>
              <input
                type="number"
                className={styles.smallNum}
                value={pkgSize}
                onChange={e => setPkgSize(Number(e.target.value))}
                min={1}
              />
            </div>
          )}
        </section>

        {/* ── Payment ───────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.label}>Payment</div>
          {isPackage ? (
            <div className={styles.packBadge}>📦 Pre-paid pack</div>
          ) : (
            <>
              <div className={styles.payBtns}>
                <button
                  className={`${styles.payBtn} ${payment === 'paid' ? styles.payPaid : ''}`}
                  onClick={() => setPayment('paid')}
                >✓ Paid</button>
                <button
                  className={`${styles.payBtn} ${payment === 'owes' ? styles.payOwes : ''}`}
                  onClick={() => setPayment('owes')}
                >Owes</button>
              </div>
              {payment === 'paid' && (
                <select
                  className={`${styles.select} ${styles.mt8}`}
                  value={method}
                  onChange={e => setMethod(e.target.value)}
                >
                  {METHODS.map(m => <option key={m} value={m}>{m || '— select method —'}</option>)}
                </select>
              )}
            </>
          )}
        </section>

        {/* ── Total ─────────────────────────────────────────────────────── */}
        <div className={styles.totalRow}>
          <span>Total</span>
          <span className={styles.totalAmt}>€{totalDue}</span>
          <span className={styles.muted}>
            {confirmed.length}× · {formatDuration(durationMin)} · €{pricePerHour}/hr
          </span>
        </div>

        {/* ── Submit ────────────────────────────────────────────────────── */}
        <button
          className={styles.submitBtn}
          disabled={confirmed.length === 0 || status === 'submitting'}
          onClick={handleSubmit}
        >
          {status === 'submitting' ? 'Logging…' : 'Log lesson ✅'}
        </button>

        {confirmed.length === 0 && (
          <p className={`${styles.muted} ${styles.center}`}>Select at least one attendee</p>
        )}
      </div>
    </div>
  )
}
