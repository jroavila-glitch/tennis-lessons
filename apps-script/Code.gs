// ═══════════════════════════════════════════════════════════════════════
// TENNIS LESSONS — POST-LESSON AUTOMATION
// ═══════════════════════════════════════════════════════════════════════
//
// SETUP (do this once, in order):
//
// 1. Open your Google Sheet → Extensions → Apps Script
// 2. Paste this entire file, replacing any existing code
// 3. Run setupProperties()  ← sets all credentials automatically
// 4. Deploy as Web App: Deploy → New Deployment → Web App
//      Execute as: Me  |  Who has access: Anyone
//    Copy the /exec URL — add to Vercel env vars as APPS_SCRIPT_URL
// 5. Run installTriggers()
// 6. Test with testTodaysLessons() or testProcessMostRecentLesson()
//
// ═══════════════════════════════════════════════════════════════════════

// ── One-time credential setup — run this first ───────────────────────────
function setupProperties() {
  PropertiesService.getScriptProperties().setProperties({
    SHEET_ID:          '19TJJ02E19NeWVmmnHsMwL4FXvYtxdNf8w5qlY5oqEtg',
    CALENDAR_ID:       'jroavila@gmail.com',
    WHATSAPP_NUMBER:   '5217771922492',
    CALLMEBOT_API_KEY: '6508295',
    CONFIRM_BASE_URL:  'https://tennis-lessons.vercel.app',
    SERVER_SECRET:     'tennis-2026-mHvQ8pX3nK7wR5tYqL',
  })
  console.log('✅ Properties set. Next: deploy as Web App, then run installTriggers()')
}

// ── Court mapping ────────────────────────────────────────────────────────
const COURTS = {
  1:  { type: 'hard',    label: 'Hard court',    price: 9  },
  2:  { type: 'hard',    label: 'Hard court',    price: 9  },
  3:  { type: 'hard',    label: 'Hard court',    price: 9  },
  4:  { type: 'hard',    label: 'Hard court',    price: 9  },
  5:  { type: 'hard',    label: 'Hard court',    price: 9  },
  6:  { type: 'covered', label: 'Covered court', price: 14 }, // +4 if lights
  7:  { type: 'covered', label: 'Covered court', price: 14 },
  8:  { type: 'clay',    label: 'Clay court',    price: 10 },
  9:  { type: 'clay',    label: 'Clay court',    price: 10 },
  10: { type: 'clay',    label: 'Clay court',    price: 10 },
  11: { type: 'clay',    label: 'Clay court',    price: 10 },
}

function getCourtInfo(token) {
  const n = parseInt(token)
  if (!isNaN(n) && COURTS[n]) return { ...COURTS[n], courtNum: n }
  if (/central/i.test(token)) return { type: 'clay', label: 'Clay court (Central)', price: 10, courtNum: 'central' }
  return { type: 'unknown', label: token, price: 0, courtNum: token }
}

// ── Event parsing ─────────────────────────────────────────────────────────
// Handles: "🎾 Guillaume · Campo 1"
//          "🎾 Jesse & Mai & (maybe) Maria · Campo 6"
function parseCalendarEvent(event) {
  const title = event.getTitle().trim()
  if (!title.startsWith('🎾')) return null

  const inner = title.replace(/^🎾\s*/, '')
  const segments = inner.split(/\s*·\s*/)
  if (segments.length < 2) return null

  const courtSegment = segments[segments.length - 1]
  const namesSegment = segments.slice(0, -1).join(' · ')

  // Parse court
  const courtMatch = courtSegment.match(/Campo\s+(\w+)/i)
  const courtInfo = courtMatch
    ? getCourtInfo(courtMatch[1])
    : { type: 'unknown', label: courtSegment, price: 0, courtNum: null }

  // Parse names separated by " & ", flag "(maybe)" prefix
  const people = namesSegment.split(/\s*&\s*/).map(n => {
    const isMaybe = /^\(maybe\)/i.test(n.trim())
    const name = n.trim().replace(/^\(maybe\)\s*/i, '').trim()
    return { name, isMaybe }
  }).filter(p => p.name.length > 0)

  const start = event.getStartTime()
  const end   = event.getEndTime()

  return {
    eventId:     event.getId(),
    title,
    people,
    courtInfo,
    durationMin: Math.round((end - start) / 60000),
    startTime:   start.toISOString(),
    endTime:     end.toISOString(),
    date:        Utilities.formatDate(start, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
  }
}

const SHEET_NAME = 'Sheet1'

// ── Student price lookup (column H = Price per person/hr) ─────────────────
function getStudentPrice(sheet, studentName) {
  const data = sheet.getDataRange().getValues()
  const nameLower = studentName.toLowerCase().trim()
  for (let i = data.length - 1; i >= 1; i--) {
    const whoCell = (data[i][3] || '').toString().trim()
    if (!whoCell) continue
    const names = whoCell.split(',').map(n => n.trim().toLowerCase())
    if (!names.includes(nameLower)) continue
    const price = parseFloat(data[i][7])
    if (price > 0) return price
  }
  return 0
}

// ── Package lookup ────────────────────────────────────────────────────────
function getPackageInfo(sheet, studentName) {
  const data = sheet.getDataRange().getValues()
  const nameLower = studentName.toLowerCase().trim()

  // Collect all pack rows for this student in sheet order
  const packRows = []
  for (let i = 1; i < data.length; i++) {
    const whoCell = (data[i][3] || '').toString().trim()
    if (!whoCell) continue
    const names = whoCell.split(',').map(n => n.trim().toLowerCase())
    if (!names.includes(nameLower)) continue
    const isPkg = (data[i][4] || '').toString().trim().toUpperCase() === 'Y'
    if (!isPkg) continue
    const f = parseFloat(data[i][5]) || 0
    const g = parseFloat(data[i][6]) || 10
    if (f > 0) packRows.push({ f, g })
  }

  if (!packRows.length) return { hasActivePackage: false, lastSession: 0, nextSession: 0, packageSize: 10 }

  // Find where the current pack starts: scan backwards for the last completed pack (f >= g)
  let currentPackStart = 0
  for (let i = packRows.length - 1; i >= 0; i--) {
    if (packRows[i].f >= packRows[i].g) {
      currentPackStart = i + 1
      break
    }
  }

  const currentRows = packRows.slice(currentPackStart)
  const packageSize = currentRows.length
    ? currentRows[currentRows.length - 1].g
    : packRows[packRows.length - 1].g

  if (!currentRows.length) {
    // No rows in current pack yet — pack just completed, next will be session 1
    return { hasActivePackage: false, lastSession: 0, nextSession: 0, packageSize }
  }

  const lastSession = currentRows[currentRows.length - 1].f
  return {
    hasActivePackage: lastSession > 0 && lastSession < packageSize,
    lastSession,
    nextSession: lastSession,  // overridden in processEvent with + lessonHours
    packageSize,
  }
}

// ── Pack paid status: M value of the first session of the current pack ───────
function getPackFirstSessionPaid(sheet, studentName, packageSize) {
  const data = sheet.getDataRange().getValues()
  const nameLower = studentName.toLowerCase().trim()
  const packRows = []

  for (let i = 1; i < data.length; i++) {
    const whoCell = (data[i][3] || '').toString().trim()
    if (!whoCell) continue
    const names = whoCell.split(',').map(n => n.trim().toLowerCase())
    if (!names.includes(nameLower)) continue
    const isPkg = (data[i][4] || '').toString().trim().toUpperCase() === 'Y'
    if (!isPkg) continue
    packRows.push({ f: parseFloat(data[i][5]) || 0, m: (data[i][12] || '').toString().trim() })
  }

  if (!packRows.length) return 'N'

  // Find the first session of the current pack by locating the last "reset"
  // A pack resets after a row where f >= packageSize (pack completed)
  let firstIdx = 0
  for (let i = packRows.length - 1; i > 0; i--) {
    if (packRows[i - 1].f >= packageSize) { firstIdx = i; break }
  }

  return packRows[firstIdx].m || 'N'
}

// ── Known students (unique names already in column D) ─────────────────────
function getKnownStudents(sheet) {
  const data = sheet.getDataRange().getValues()
  const names = new Set()
  for (let i = 1; i < data.length; i++) {
    const who = (data[i][3] || '').toString().trim()
    if (who) who.split(',').map(n => n.trim()).filter(Boolean).forEach(n => names.add(n))
  }
  return [...names].sort()
}

// Fuzzy match a parsed name against known students (case-insensitive)
function matchStudent(parsed, knownStudents) {
  const lc = parsed.toLowerCase().trim()
  return knownStudents.find(s => s.toLowerCase().trim() === lc) || parsed
}

// ── Callmebot WhatsApp ────────────────────────────────────────────────────
function sendWhatsApp(message) {
  const props  = PropertiesService.getScriptProperties()
  const phone  = props.getProperty('WHATSAPP_NUMBER')
  const apiKey = props.getProperty('CALLMEBOT_API_KEY')
  if (!phone || !apiKey) { console.warn('WhatsApp not configured'); return }

  const url = 'https://api.callmebot.com/whatsapp.php'
    + '?phone='  + encodeURIComponent(phone)
    + '&text='   + encodeURIComponent(message)
    + '&apikey=' + encodeURIComponent(apiKey)

  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true })
    console.log('WhatsApp response:', res.getContentText().substring(0, 100))
  } catch (e) {
    console.error('WhatsApp send failed:', e)
  }
}

// ── Pending lesson storage (Script Properties, 48hr TTL) ─────────────────
function storePendingLesson(id, data) {
  PropertiesService.getScriptProperties().setProperty('lesson_' + id, JSON.stringify({
    ...data,
    createdAt: Date.now(),
    expiresAt: Date.now() + 48 * 60 * 60 * 1000,
  }))
}

function getPendingLesson(id) {
  const raw = PropertiesService.getScriptProperties().getProperty('lesson_' + id)
  if (!raw) return null
  const data = JSON.parse(raw)
  if (Date.now() > data.expiresAt) {
    PropertiesService.getScriptProperties().deleteProperty('lesson_' + id)
    return null
  }
  return data
}

function deletePendingLesson(id) {
  PropertiesService.getScriptProperties().deleteProperty('lesson_' + id)
}

// Hash event ID to a safe property key (avoids special chars / length issues)
function eventKey(eventId) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, eventId)
  return 'sched_' + bytes.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('').substring(0, 20)
}

// ── Core: fire for a single calendar event ────────────────────────────────
function processEvent(eventId) {
  const props   = PropertiesService.getScriptProperties()
  const calId   = props.getProperty('CALENDAR_ID')
  const sheetId = props.getProperty('SHEET_ID')
  const baseUrl = props.getProperty('CONFIRM_BASE_URL') || 'https://tennis-lessons.vercel.app'

  const event = CalendarApp.getCalendarById(calId).getEventById(eventId)
  if (!event) { console.log('Event not found: ' + eventId); return }

  const parsed = parseCalendarEvent(event)
  if (!parsed) { console.log('Not a tennis event: ' + event.getTitle()); return }

  const sheet         = SpreadsheetApp.openById(sheetId).getSheetByName(SHEET_NAME)
  const knownStudents = getKnownStudents(sheet)

  const lessonHours = parsed.durationMin / 60
  const peopleInfo = parsed.people.map(p => {
    const matchedName  = matchStudent(p.name, knownStudents)
    const pkgInfo      = getPackageInfo(sheet, matchedName)
    // If the pack is already complete, reset so form treats next session as pack session 1
    const packComplete = pkgInfo.lastSession >= pkgInfo.packageSize && pkgInfo.lastSession > 0
    return {
      ...p,
      name:            matchedName,
      ...pkgInfo,
      hasActivePackage: packComplete ? false : pkgInfo.hasActivePackage,
      lastSession:      packComplete ? 0     : pkgInfo.lastSession,
      // F column is cumulative lesson hours; reset to this lesson's hours when pack just completed
      nextSession: packComplete
        ? Math.round(lessonHours * 100) / 100
        : Math.round((pkgInfo.lastSession + lessonHours) * 100) / 100,
      lastPrice: getStudentPrice(sheet, matchedName),
    }
  })

  // Store lesson data server-side; put only a short ID in the WhatsApp URL
  const urlData  = { ...parsed, people: peopleInfo }
  const lessonId = Utilities.getUuid().replace(/-/g, '').substring(0, 10)
  storePendingLesson(lessonId, urlData)
  const confirmUrl = `${baseUrl}/confirm?id=${lessonId}`

  // Build a readable WhatsApp message
  const confirmedPeople = peopleInfo.filter(p => !p.isMaybe)
  const maybes    = peopleInfo.filter(p => p.isMaybe)
  const nameStr   = confirmedPeople.map(p => p.name).join(', ')
    + (maybes.length ? ` *(+ maybe: ${maybes.map(p => p.name).join(', ')})*` : '')

  const hrs = parsed.durationMin / 60
  const hrsStr = Number.isInteger(hrs) ? `${hrs}h` : `${Math.floor(hrs)}h${parsed.durationMin % 60}m`

  const msg = [
    '🎾 Lesson just ended',
    `👤 ${nameStr}`,
    `📍 ${parsed.title.replace('🎾 ', '')}  ·  ${hrsStr}  ·  €${parsed.courtInfo.price}/hr`,
    '',
    `✅ ${confirmUrl}`,
  ].join('\n')

  sendWhatsApp(msg)
  console.log('WhatsApp sent for:', parsed.title)
  console.log('Confirm URL length:', confirmUrl.length)
}

// ── Trigger handler (called 5 min after lesson ends) ──────────────────────
function runScheduledLesson(e) {
  const triggerId = e && e.triggerUid
  if (!triggerId) return
  const props   = PropertiesService.getScriptProperties()
  const eventId = props.getProperty('trigger_' + triggerId)
  if (!eventId) return
  props.deleteProperty('trigger_' + triggerId)
  deleteTriggerById(triggerId)
  processEvent(eventId)
}

function deleteTriggerById(uid) {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getUniqueId() === uid)
    .forEach(t => ScriptApp.deleteTrigger(t))
}

function schedulePostLessonTrigger(event) {
  const props   = PropertiesService.getScriptProperties()
  const eventId = event.getId()

  // Mark this event as scheduled so the evening check skips it
  props.setProperty(eventKey(eventId), '1')

  const fireAt = new Date(event.getEndTime().getTime() + 5 * 60 * 1000)
  if (fireAt <= new Date()) {
    // Already past — fire immediately
    processEvent(eventId)
    return
  }

  const trigger = ScriptApp.newTrigger('runScheduledLesson')
    .timeBased().at(fireAt).create()

  props.setProperty('trigger_' + trigger.getUniqueId(), eventId)
  console.log('Trigger scheduled:', event.getTitle(), '@', fireAt)
}

// ── Daily 2am: schedule tomorrow's lessons ────────────────────────────────
function dailyMorningSetup() {
  const props = PropertiesService.getScriptProperties()
  const calId = props.getProperty('CALENDAR_ID')
  const tz    = Session.getScriptTimeZone()

  const tomorrow    = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const tomorrowEnd = new Date(tomorrow)
  tomorrowEnd.setHours(23, 59, 59, 999)

  const events = CalendarApp.getCalendarById(calId).getEvents(tomorrow, tomorrowEnd)
  let count = 0
  events.forEach(e => {
    if (!e.getTitle().startsWith('🎾')) return
    schedulePostLessonTrigger(e)
    count++
  })
  console.log('Morning setup: scheduled', count, 'lessons for tomorrow')
}

// ── Daily 7pm: catch same-day last-minute additions ───────────────────────
function dailyEveningCheck() {
  const props = PropertiesService.getScriptProperties()
  const calId = props.getProperty('CALENDAR_ID')
  const now   = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)

  const events = CalendarApp.getCalendarById(calId).getEvents(todayStart, now)
  let fired = 0
  events.forEach(e => {
    if (!e.getTitle().startsWith('🎾')) return
    if (props.getProperty(eventKey(e.getId()))) return  // already handled
    if (e.getEndTime() <= now) {
      processEvent(e.getId())
      fired++
    } else {
      schedulePostLessonTrigger(e)  // ends later tonight
    }
  })
  console.log('Evening check: fired', fired, 'missed lessons')
}

// ── Web app: GET — fetch pending lesson data ──────────────────────────────
function doGet(e) {
  const respond = data =>
    ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON)

  const params = e.parameter || {}
  const secret = PropertiesService.getScriptProperties().getProperty('SERVER_SECRET')

  if (!params.id || params.s !== secret) return respond({ error: 'Unauthorized' })

  const lesson = getPendingLesson(params.id)
  if (!lesson) return respond({ error: 'Not found or expired' })

  return respond(lesson)
}

// ── Web app: POST — write confirmed lesson to sheet ───────────────────────
function doPost(e) {
  const respond = data =>
    ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON)

  let body
  try { body = JSON.parse(e.postData.contents) }
  catch (_) { return respond({ error: 'Invalid JSON' }) }

  const { s: secret, confirmed } = body
  const expectedSecret = PropertiesService.getScriptProperties().getProperty('SERVER_SECRET')

  if (secret !== expectedSecret) return respond({ error: 'Unauthorized' })
  if (!confirmed)                return respond({ error: 'Missing confirmed data' })

  try {
    writeToSheet(confirmed)
    return respond({ success: true })
  } catch (err) {
    console.error('Write error:', err)
    return respond({ error: err.message })
  }
}

// ── Write a confirmed lesson row ──────────────────────────────────────────
function writeToSheet(c) {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID')
  const sheet   = SpreadsheetApp.openById(sheetId).getSheetByName(SHEET_NAME)

  // Overflow split: if ongoing pack session would exceed pack limit, write two rows
  if (c.isPackage && !c.isFirstPackSession && c.lastSession !== undefined && c.packageSize) {
    const remaining   = c.packageSize - c.lastSession
    const lessonHours = c.durationMin / 60
    if (lessonHours > remaining && remaining > 0) {
      const overflowH = Math.round((lessonHours - remaining) * 100) / 100
      // Row 1: complete old pack (remaining hours, all court fee)
      writeSingleRow(sheet, { ...c, durationMin: Math.round(remaining * 60), packageSession: c.packageSize })
      // Row 2: start new pack (overflow hours, no extra court fee)
      writeSingleRow(sheet, {
        ...c,
        durationMin:      Math.round(overflowH * 60),
        packageSession:   overflowH,
        isFirstPackSession: true,
        lastSession:      0,
        payment:          'packOwes',   // owes new pack price until confirmed paid
        courtFeeYou:      0,
      })
      return
    }
  }

  writeSingleRow(sheet, c)
}

function writeSingleRow(sheet, c) {

  const date  = new Date(c.date + 'T12:00:00')
  const MONTHS = ['January','February','March','April','May','June','July',
                  'August','September','October','November','December']
  const month = MONTHS[date.getMonth()]
  const year  = date.getFullYear().toString()

  const hours             = c.durationMin / 60
  const numPeople         = c.people.length
  const isPackage         = c.payment === 'pack' || c.payment === 'packOwes' || !!c.isPackage
  const isFirstPackSession = !!c.isFirstPackSession
  const paidInFull        = c.payment === 'paid' || c.payment === 'pack'

  // K: use form-supplied totalDue when available, else compute
  const totalDue = c.totalDue != null
    ? c.totalDue
    : isFirstPackSession
      ? (c.packPrice != null ? c.packPrice : (c.packageSize - 1) * c.pricePerHour)
      : isPackage
        ? 0
        : Math.round(c.pricePerHour * hours * numPeople * 100) / 100

  // N / L: use form-computed amtTx / amtOwes when available (handles per-person splits)
  const amtTx  = c.amtTx  != null ? c.amtTx  : (paidInFull ? totalDue : 0)
  const owes   = c.amtOwes != null ? c.amtOwes : (paidInFull ? 0 : totalDue)
  const ctYou  = c.courtFeeYou || 0
  const profit = amtTx - ctYou
  const type   = c.type || (numPeople > 1 ? 'Group' : 'Individual')

  // M: Y/N for all rows — pack rows inherit from session 1; regular rows use payment state
  let packPaid
  if (isPackage) {
    if (isFirstPackSession) {
      packPaid = paidInFull ? 'Y' : 'N'
    } else {
      packPaid = getPackFirstSessionPaid(sheet, c.people[0], c.packageSize || 10)
    }
  } else {
    packPaid = amtTx >= totalDue ? 'Y' : 'N'
  }

  sheet.appendRow([
    month,                                    // A: Month
    String(date.getDate()),                   // B: Date
    type,                                     // C: Type
    c.people.join(', '),                      // D: Who
    isPackage ? 'Y' : '',                     // E: empty if no package
    isPackage ? (c.packageSession || '') : '', // F: Session #
    isPackage ? (c.packageSize    || '') : '', // G: Pack size
    c.pricePerHour,                           // H: Price/hr
    hours,                                    // I: Hours
    numPeople,                                // J: # People
    totalDue,                                 // K: Total due (pack price on session 1, else 0 or per-session)
    owes,                                     // L: Amount still owed
    packPaid,                                 // M: Pack paid? Y/N (pack rows only)
    amtTx,                                    // N: Amount transferred
    ctYou,                                    // O: Court fee (you pay)
    '',                                       // P: (unused)
    paidInFull ? 'Y' : 'N',                  // Q: Paid in full?
    profit,                                   // R: Total profit
    c.method   || '',                         // S: Method
    c.comments || '',                         // T: Comments
    year,                                     // U: Year
  ])

  const newRow  = sheet.getLastRow()
  const numCols = sheet.getLastColumn()
  if (newRow > 2 && numCols > 0) {
    const prevRow = sheet.getRange(newRow - 1, 1, 1, numCols)
    const curRow  = sheet.getRange(newRow,     1, 1, numCols)
    // Copy dropdown validation rules (doesn't touch values or formulas)
    prevRow.copyTo(curRow, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false)
    // Copy formulas for specific computed columns: L (12) and R (18)
    // These reference other cells in the same row (not data-entry columns)
    ;[12, 18].forEach(col => {
      const prevCell = sheet.getRange(newRow - 1, col)
      if (prevCell.getFormula()) {
        prevCell.copyTo(sheet.getRange(newRow, col),
                        SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false)
      }
    })
    // Copy formulas for all columns beyond our data range (col 22+)
    if (numCols > 21) {
      sheet.getRange(newRow - 1, 22, 1, numCols - 21)
           .copyTo(sheet.getRange(newRow, 22, 1, numCols - 21),
                   SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false)
    }
  }
}

// ── One-time setup: install daily triggers ────────────────────────────────
// Run this once from the Apps Script editor.
function installTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => ['dailyMorningSetup', 'dailyEveningCheck'].includes(t.getHandlerFunction()))
    .forEach(t => ScriptApp.deleteTrigger(t))

  ScriptApp.newTrigger('dailyMorningSetup').timeBased().everyDays(1).atHour(2).create()
  ScriptApp.newTrigger('dailyEveningCheck').timeBased().everyDays(1).atHour(19).create()
  console.log('✅ Triggers installed: dailyMorningSetup (2am), dailyEveningCheck (7pm)')
}

// ── Testing helpers ───────────────────────────────────────────────────────
function testTodaysLessons() {
  const calId = PropertiesService.getScriptProperties().getProperty('CALENDAR_ID')
  const now   = new Date()
  const start = new Date(now); start.setHours(0,0,0,0)
  const end   = new Date(now); end.setHours(23,59,59,999)

  CalendarApp.getCalendarById(calId).getEvents(start, end).forEach(e => {
    if (!e.getTitle().startsWith('🎾')) return
    console.log('Event:', e.getTitle(), '→ ends', e.getEndTime())
    console.log('Parsed:', JSON.stringify(parseCalendarEvent(e), null, 2))
  })
}

function testProcessTodaysLessons() {
  const calId = PropertiesService.getScriptProperties().getProperty('CALENDAR_ID')
  const now   = new Date()
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const end   = new Date(now); end.setHours(23, 59, 59, 999)

  const events = CalendarApp.getCalendarById(calId)
    .getEvents(start, end)
    .filter(e => e.getTitle().startsWith('🎾'))

  if (!events.length) { console.log('No tennis events today'); return }
  console.log('Processing', events.length, 'lesson(s) from today')
  events.forEach(e => {
    console.log('→', e.getTitle())
    processEvent(e.getId())
  })
}

function testProcessMostRecentLesson() {
  const calId  = PropertiesService.getScriptProperties().getProperty('CALENDAR_ID')
  const now    = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const events = CalendarApp.getCalendarById(calId)
    .getEvents(weekAgo, now)
    .filter(e => e.getTitle().startsWith('🎾'))
    .sort((a, b) => b.getEndTime() - a.getEndTime())

  if (!events.length) { console.log('No tennis events in last 7 days'); return }
  console.log('Processing:', events[0].getTitle())
  processEvent(events[0].getId())
}

// ── Debug: verify storage works ───────────────────────────────────────────
function testStorage() {
  const id = 'debug-test-' + Date.now()
  storePendingLesson(id, { test: true, name: 'debug' })
  const result = getPendingLesson(id)
  if (result && result.test) {
    console.log('✅ Storage works. Test ID:', id)
    deletePendingLesson(id)
  } else {
    console.log('❌ Storage FAILED — getPendingLesson returned:', JSON.stringify(result))
  }

  // Also log all lesson_* properties currently stored
  const all = PropertiesService.getScriptProperties().getProperties()
  const lessons = Object.keys(all).filter(k => k.startsWith('lesson_'))
  console.log('Pending lessons in storage:', lessons.length, '→', lessons.join(', '))
}
