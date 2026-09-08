const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQNWO-vZFhJ_r_dEwak4ZxpwcqWL7rTKIKh6LWhzEV7legy0bKjS6QBA0p9_-aBP7toiL3z8A5k1_Rn/pub?gid=753143375&single=true&output=csv'

// Column indices (0-based):
// A=0  Month
// B=1  Date
// C=2  Type
// D=3  Who
// E=4  Package? (Y/N)
// F=5  Package session #
// G=6  Package size  (blank = 10)
// H=7  Price per person/hr
// I=8  # Hours
// J=9  # People
// K=10 Total due  (formula)
// L=11 Owes       (formula)
// M=12 (unused / blank)
// N=13 Amount transferred
// O=14 Court fee paid by student
// P=15 Court fee paid by you
// Q=16 Paid in full?
// R=17 Total profit (formula)
// S=18 Method
// T=19 Comments
// U=20 Year

function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else field += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { row.push(field); field = '' }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(field); field = ''
        rows.push(row); row = []
        if (ch === '\r') i++
      } else field += ch
    }
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

function num(v) { const n = parseFloat(v); return isNaN(n) ? null : n }
function bool(v) { return (v || '').trim().toUpperCase() === 'Y' }

function parseRows(rows) {
  const lessons = []
  let currentMonth = ''
  let currentYear  = ''
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.length === 0) continue

    // Column A acts as a section header: when non-blank, update the running month/year
    // and apply it to this row and all rows below until the next header.
    const rawMonth = (r[0] || '').trim()
    const rawYear  = (r[20] || '').trim()
    if (rawMonth) currentMonth = rawMonth
    if (rawYear)  currentYear  = rawYear

    const month = currentMonth
    const year  = currentYear
    const date  = (r[1] || '').trim()
    const type  = (r[2] || '').trim()
    const who   = (r[3] || '').trim()
    if (!date && !type && !who) continue   // skip pure header / blank rows

    const pkgSession = (r[5] || '').trim()
    const pkgSize    = num(r[6]) || 10   // default 10 if blank
    const people     = who.split(/[,]+/).map(p => p.trim()).filter(Boolean)

    lessons.push({
      month,
      date,
      type,
      who,
      people:            people.length,
      isPackage:         bool(r[4]),
      packageSession:    pkgSession ? parseInt(pkgSession) : null,
      packageSize:       pkgSize,
      pricePerHour:      num(r[7]),
      hours:             num(r[8]),
      numPeople:         num(r[9]),
      totalDue:          num(r[10]),
      owes:              num(r[11]),
      amountTransferred: num(r[13]),
      courtFeeTotal:     num(r[13]),
      courtFeeStudent:   num(r[14]),
      courtFeeYou:       num(r[15]),
      paidInFull:        bool(r[16]),
      totalProfit:       num(r[17]),
      method:            (r[18] || '').trim(),
      comments:          (r[19] || '').trim(),
      year,
    })
  }
  return lessons
}

export default async function handler(req, res) {
  try {
    const response = await fetch(CSV_URL)
    if (!response.ok) throw new Error(`Failed to fetch sheet: ${response.status}`)
    const text = await response.text()
    const rows = parseCsv(text)
    const lessons = parseRows(rows)
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(lessons)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
