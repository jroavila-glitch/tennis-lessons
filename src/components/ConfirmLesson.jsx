import { useState, useEffect } from 'react'
import styles from './ConfirmLesson.module.css'

const LESSON_TYPES = ['Individual', 'Group', 'Tennis Rush', 'Tennis Smash']
const METHODS = ['', 'Millenium', 'Revolut', 'Cash', 'ARQ']
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
  const [payment, setPayment]           = useState('pack') // pack: 'pack'|'packOwes'
  const [payments, setPayments]         = useState({})    // non-pack: { [name]: 'paid'|'owes' }
  const [method, setMethod]             = useState('')
  const [customTotal, setCustomTotal]   = useState(null)  // null = use computed
  const [isPackage, setIsPackage]       = useState(false)
  const [pkgSession, setPkgSession]     = useState(0)
  const [pkgSize, setPkgSize]           = useState(10)
  const [lastSession, setLastSession]   = useState(0)
  const [packPrice, setPackPrice]       = useState(0)
  const [pricePerHr, setPricePerHr]     = useState(0)

  const params = new URLSearchParams(window.location.search)

  useEffect(() => {
    const lessonId = params.get('id')
    const encoded  = params.get('d')

    if (!lessonId && !encoded) {
      setErrMsg('No lesson data in URL')
      setStatus('error')
      return
    }

    const applyData = data => {
      setLesson(data)

      const people = data.people || []
      setAttendees(people.map(p => ({ ...p, confirmed: !p.isMaybe })))
      setDurationMin(data.durationMin || 60)
      setCourtInfo(data.courtInfo || null)
      setCustomTotal(null)
      // Default everyone to paid
      const initPay = {}
      people.filter(p => !p.isMaybe).forEach(p => { initPay[p.name] = 'paid' })
      setPayments(initPay)

      const definite = people.filter(p => !p.isMaybe)
      if (definite.length > 0 && definite[0].lastPrice > 0) {
        setPricePerHr(definite[0].lastPrice)
      }

      const p0 = definite[0]
      if (definite.length > 0 && p0) {
        if (p0.packageSize)                setPkgSize(p0.packageSize)
        if (p0.nextSession)                setPkgSession(p0.nextSession)
        if (p0.lastSession !== undefined)   setLastSession(p0.lastSession)
        if (p0.packageSize && p0.lastPrice) setPackPrice((p0.packageSize - 1) * p0.lastPrice)
      }

      if (definite.length > 0 && p0 && p0.hasActivePackage) {
        setIsPackage(true)
        setPayment('pack')
      }

      setLessonType(definite.length > 1 ? 'Group' : 'Individual')
      setStatus('ready')
    }

    if (lessonId) {
      fetch(`/api/get-lesson?id=${encodeURIComponent(lessonId)}`)
        .then(r => r.json())
        .then(data => {
          if (data.error) throw new Error(data.error)
          applyData(data)
        })
        .catch(e => { setErrMsg(e.message); setStatus('error') })
    } else {
      try {
        applyData(JSON.parse(atob(encoded)))
      } catch (e) {
        setErrMsg('Could not decode lesson data: ' + e.message)
        setStatus('error')
      }
    }
  }, [])

  const confirmed          = attendees.filter(a => a.confirmed)
  const hours              = durationMin / 60
  const isFirstPackSession = isPackage && lastSession === 0

  const computedTotal = isPackage
    ? (isFirstPackSession ? packPrice : 0)
    : Math.round(pricePerHr * hours * confirmed.length * 100) / 100
  const totalDue = customTotal !== null ? customTotal : computedTotal

  // Per-person payment (non-pack only)
  const paidPeople  = confirmed.filter(a => payments[a.name] !== 'owes')
  const owesPeople  = confirmed.filter(a => payments[a.name] === 'owes')
  const anyPaid     = isPackage ? payment === 'pack'  : paidPeople.length > 0
  const allPaid     = isPackage ? payment === 'pack'  : owesPeople.length === 0
  const sharePerPerson = confirmed.length > 0 ? Math.round(totalDue / confirmed.length * 100) / 100 : 0
  const amtTx = isPackage
    ? (payment === 'pack' ? totalDue : 0)
    : Math.round(sharePerPerson * paidPeople.length * 100) / 100
  const amtOwes = Math.round((totalDue - amtTx) * 100) / 100

  const courtFeeRate = courtInfo
    ? (courtInfo.type === 'covered' ? (lightsOn ? 18 : 14) : (courtInfo.price || 0))
    : 0
  const courtFeeYou  = Math.round(courtFeeRate * hours * 100) / 100

  async function handleSubmit() {
    if (confirmed.length === 0) return
    setStatus('submitting')

    const payload = {
      date:             lesson.date,
      people:           confirmed.map(a => a.name),
      durationMin,
      pricePerHour:     pricePerHr,
      courtType:        courtInfo?.type,
      courtNum:         courtInfo?.courtNum,
      type:             lessonType,
      payment:          isPackage ? payment : (allPaid ? 'paid' : owesPeople.length === confirmed.length ? 'owes' : 'partial'),
      isPackage,
      isFirstPackSession,
      lastSession,
      packPrice:        isPackage && isFirstPackSession ? packPrice : null,
      packageSession:   isPackage ? pkgSession : null,
      packageSize:      isPackage ? pkgSize    : null,
      totalDue,
      amtTx,
      amtOwes,
      method:           anyPaid ? method : '',
      comments:         '',
      courtFeeYou,
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
          <div className={styles.summaryRow}><span>Court</span><strong>{courtInfo ? `${courtInfo.label}${courtInfo.courtNum ? ` · Campo ${courtInfo.courtNum}` : ''}${courtInfo.type === 'covered' && lightsOn ? ' + lights' : ''}` : '—'}</strong></div>
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
          <select
            className={styles.select}
            value={durationMin}
            onChange={e => setDurationMin(Number(e.target.value))}
          >
            <option value={60}>60 min · 1h</option>
            <option value={90}>90 min · 1h 30m</option>
            <option value={120}>120 min · 2h</option>
          </select>
        </section>

        {/* ── Price per hour ────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.label}>Price per hour</div>
          <div className={styles.row}>
            <span className={styles.pkgSessionDisplay}>€{pricePerHr}/hr</span>
          </div>
        </section>

        {/* ── Court ─────────────────────────────────────────────────────── */}
        {courtInfo && (
          <section className={styles.section}>
            <div className={styles.label}>Court</div>
            <div className={styles.courtTitle}>
              {courtInfo.label}{courtInfo.courtNum ? ` · Campo ${courtInfo.courtNum}` : ''}
            </div>
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

          {confirmed.length > 0 && (
            <div className={styles.packInfo}>
              {confirmed.map(a => (
                <div key={a.name} className={styles.packRow}>
                  <span className={styles.packName}>{a.name}</span>
                  <span className={styles.muted}>
                    {a.hasActivePackage
                      ? `session ${a.nextSession} / ${a.packageSize}`
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
                else if (payment === 'pack' || payment === 'packOwes') setPayment('paid')
              }}
            />
            Log as package lesson
          </label>

          {isPackage && (
            <div className={styles.pkgFields}>
              <label className={styles.smallLabel}>Session</label>
              <span className={styles.pkgSessionDisplay}>{pkgSession || '—'}</span>
              <label className={styles.smallLabel}>of</label>
              <span className={styles.pkgSessionDisplay}>{pkgSize}</span>
            </div>
          )}

          {isPackage && isFirstPackSession && (
            <div className={`${styles.row} ${styles.mt8}`}>
              <span className={styles.unit}>Pack price</span>
              <span className={styles.pkgSessionDisplay}>€{packPrice}</span>
            </div>
          )}
        </section>

        {/* ── Payment ───────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.label}>Payment</div>
          {isPackage && isFirstPackSession ? (
            // Session 1: collect whether the pack price was paid
            <>
              <div className={styles.payBtns}>
                <button
                  className={`${styles.payBtn} ${payment === 'pack' ? styles.payPaid : ''}`}
                  onClick={() => setPayment('pack')}
                >✓ Pack paid</button>
                <button
                  className={`${styles.payBtn} ${payment === 'packOwes' ? styles.payOwes : ''}`}
                  onClick={() => setPayment('packOwes')}
                >Owes pack</button>
              </div>
              {payment === 'pack' && (
                <select
                  className={`${styles.select} ${styles.mt8}`}
                  value={method}
                  onChange={e => setMethod(e.target.value)}
                >
                  {METHODS.map(m => <option key={m} value={m}>{m || '— select method —'}</option>)}
                </select>
              )}
            </>
          ) : isPackage ? (
            <div className={styles.packBadge}>📦 Pre-paid pack</div>
          ) : (
            <>
              {confirmed.map(a => (
                <div key={a.name} className={styles.personPayRow}>
                  <span className={styles.personName}>{a.name}</span>
                  <div className={styles.payBtns}>
                    <button
                      className={`${styles.payBtn} ${payments[a.name] !== 'owes' ? styles.payPaid : ''}`}
                      onClick={() => setPayments({ ...payments, [a.name]: 'paid' })}
                    >✓ Paid</button>
                    <button
                      className={`${styles.payBtn} ${payments[a.name] === 'owes' ? styles.payOwes : ''}`}
                      onClick={() => setPayments({ ...payments, [a.name]: 'owes' })}
                    >Owes</button>
                  </div>
                </div>
              ))}
              {anyPaid && (
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
          {isPackage ? (
            <span className={styles.totalAmt}>€{totalDue}</span>
          ) : (
            <input
              type="number"
              className={styles.totalInput}
              value={totalDue}
              onChange={e => setCustomTotal(Math.max(0, Number(e.target.value)))}
              min={0}
              step={1}
            />
          )}
          <span className={styles.muted}>
            {isFirstPackSession
              ? `${pkgSize} sessions (1 free) · €${packPrice}`
              : isPackage
                ? 'pre-paid'
                : `${confirmed.length}× · ${formatDuration(durationMin)} · €${pricePerHr}/hr`}
          </span>
        </div>
        {courtFeeYou > 0 && (
          <div className={styles.courtFeeRow}>
            <span className={styles.muted}>Court fee (you pay)</span>
            <span className={styles.muted}>€{courtFeeYou}</span>
          </div>
        )}

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
