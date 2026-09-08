/**
 * Reads the published Google Sheet CSV, transforms it to the new schema,
 * and writes a clean CSV ready to import into Google Sheets.
 *
 * New schema:
 *   A: Date | B: Month | C: Type | D: Who | E: Paid (€)
 *   F: Court fee | G: Court (I covered) | H: My profit
 *   I: Method | J: Package session | K: Notes
 */

import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQNWO-vZFhJ_r_dEwak4ZxpwcqWL7rTKIKh6LWhzEV7legy0bKjS6QBA0p9_-aBP7toiL3z8A5k1_Rn/pub?gid=753143375&single=true&output=csv'

// ── CSV parser ──────────────────────────────────────────────────────────────
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

// ── CSV serialiser ──────────────────────────────────────────────────────────
function toCsvRow(fields) {
  return fields.map(f => {
    const s = String(f ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }).join(',')
}

// ── Method field parser ──────────────────────────────────────────────────────
// The old Method column was used as a catch-all: payment method, package
// progress ("1/10 Revolut 10-pack"), debt notes ("owes 60"), etc.
// This function splits it into { method, pkgSession, extraNotes }.

const KNOWN_METHODS = /revolut|millenium|cash|mb\s*way|dolarapp|arq/i

function parseMethodField(raw, paidFull, oldPkgSession, oldComments) {
  raw = (raw || '').trim()
  const comments = (oldComments || '').trim()

  // Helper: try to pull a package session number out of any string
  function extractPkgSession(str) {
    const m = str.match(/(\d+(?:\.\d+)?)\s*(?:\/|de)\s*\d+/i)
    return m ? parseFloat(m[1]) : null
  }

  // "---" or blank
  if (!raw || raw === '---') {
    const method = paidFull ? 'Paid' : ''
    // Still check comments for pkg session
    const pkgFromComments = extractPkgSession(comments)
    return { method, pkgSession: pkgFromComments || oldPkgSession || null, extraNotes: comments }
  }

  // Package-progress patterns: "1/10 Revolut 10-pack", "4.5/11", "8 de 11", "11 de 11"
  const pkgMatch = raw.match(/^(\d+(?:\.\d+)?)\s*(?:\/|de)\s*\d+\s*(.*)$/i)
  if (pkgMatch) {
    const sess = parseFloat(pkgMatch[1])
    const rest = (pkgMatch[2] || '').trim()
    const mMatch = rest.match(KNOWN_METHODS)
    const method = mMatch
      ? mMatch[0].charAt(0).toUpperCase() + mMatch[0].slice(1).toLowerCase()
      : (paidFull ? 'Paid' : '')
    const extraNotes = [rest.replace(KNOWN_METHODS,'').trim(), comments].filter(Boolean).join(' | ')
    return { method, pkgSession: sess, extraNotes }
  }

  // Debt / unpaid notes: "owes X", "debe X", "+1 hr de..."
  if (raw.match(/^(owes|debe|\+)/i)) {
    return { method: '', pkgSession: oldPkgSession || null, extraNotes: [raw, comments].filter(Boolean).join(' | ') }
  }

  // Clean payment method line (may include extra info after the method keyword)
  const mMatch = raw.match(KNOWN_METHODS)
  if (mMatch) {
    const method = mMatch[0].charAt(0).toUpperCase() + mMatch[0].slice(1).toLowerCase()
    const extra  = raw.replace(KNOWN_METHODS, '').trim().replace(/^[-–,\s]+/, '')
    const pkgFromComments = extractPkgSession(comments)
    const extraNotes = [extra, comments].filter(Boolean).join(' | ')
    return { method, pkgSession: pkgFromComments || oldPkgSession || null, extraNotes }
  }

  // Fallback: keep raw in notes, check comments for pkg session
  const pkgFromComments = extractPkgSession(comments)
  return {
    method: paidFull ? 'Paid' : '',
    pkgSession: pkgFromComments || oldPkgSession || null,
    extraNotes: [raw, comments].filter(Boolean).join(' | ')
  }
}

// ── Old column indices (0-based) ────────────────────────────────────────────
// A=0 Month | B=1 Date | C=2 Type | D=3 Who | E=4 Package? | F=5 Pkg session#
// G=6 Price/pp | H=7 Amount transferred (often blank) | I=8 Court fee total (formula, often blank)
// J=9 Court fee student | K=10 Court fee you | L=11 # Hours
// M=12 Total profit | N=13 Paid in full? | O=14 Method | P=15 Comments
//
// Derivation:
//   Paid (€)        = M (profit) + K (court I covered)  — what students actually paid
//   Court fee       = J (court student) + K (court I covered) — total court cost
//   Court I covered = K
//   My profit       = M  (preserved as-is)

const OLD = {
  month:          0,
  date:           1,
  type:           2,
  who:            3,
  isPackage:      4,
  pkgSession:     5,
  courtStudent:   9,   // Court fee paid by student
  courtYou:      10,   // Court fee paid by you
  profit:        12,   // Total profit
  paidFull:      13,   // Paid in full? (Y/N)
  method:        14,
  comments:      15,
}

// ── Transform ───────────────────────────────────────────────────────────────
async function main() {
  console.log('Fetching sheet…')
  const res = await fetch(CSV_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  const rows = parseCsv(text)

  // Row 0 is headers — skip it
  const newRows = [
    ['Date', 'Month', 'Type', 'Who', 'Paid (€)', 'Court fee', 'Court (I covered)', 'My profit', 'Method', 'Package session', 'Notes']
  ]

  let currentMonth = ''

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.length === 0) continue

    const month = (r[OLD.month] || '').trim()
    const date  = (r[OLD.date]  || '').trim()
    const type  = (r[OLD.type]  || '').trim()
    const who   = (r[OLD.who]   || '').trim()

    // Section header row (e.g. "June") — track current month, skip the row
    if (month && !date && !type && !who) {
      currentMonth = month
      continue
    }

    // Fully blank row — skip
    if (!month && !date && !type && !who) continue

    // Forward-fill month
    if (month) currentMonth = month

    const paidFull     = (r[OLD.paidFull]     || '').trim().toUpperCase() === 'Y'
    const isPkgFlag    = (r[OLD.isPackage]    || '').trim().toUpperCase() === 'Y'
    const oldPkgSess   = isPkgFlag ? parseInt(r[OLD.pkgSession] || 0) || null : null
    const courtStudent = parseFloat(r[OLD.courtStudent] || 0) || 0
    const courtYou     = parseFloat(r[OLD.courtYou]     || 0) || 0
    const profit       = parseFloat(r[OLD.profit]       || 0) || 0
    const rawMethod    = (r[OLD.method]   || '').trim()
    const rawComments  = (r[OLD.comments] || '').trim()

    const { method, pkgSession, extraNotes } = parseMethodField(rawMethod, paidFull, oldPkgSess, rawComments)

    // Derived values
    const paid      = profit + courtYou          // what students actually paid
    const courtFee  = courtStudent + courtYou    // total court cost
    const isPackage = pkgSession != null

    newRows.push([
      date,                                // A: Date
      currentMonth,                        // B: Month
      type,                                // C: Type
      who,                                 // D: Who
      paid   > 0 ? paid   : '',            // E: Paid (€)  — blank for pkg sessions 2-10
      courtFee > 0 ? courtFee : '',        // F: Court fee
      courtYou > 0 ? courtYou : '',        // G: Court (I covered)
      profit !== 0 ? profit   : '',        // H: My profit
      method,                              // I: Method
      isPackage ? pkgSession : '',         // J: Package session
      extraNotes,                          // K: Notes
    ])
  }

  const csv = newRows.map(toCsvRow).join('\n')
  const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tennis-lessons-clean.csv')
  writeFileSync(outPath, csv, 'utf8')

  console.log(`\n✅ Done! ${newRows.length - 1} lesson rows written to:\n   ${outPath}`)
  console.log('\nNext steps:')
  console.log('  1. Open your Google Sheet')
  console.log('  2. File → Import → Upload → select tennis-lessons-clean.csv')
  console.log('  3. Choose "Replace current sheet"')
}

main().catch(e => { console.error(e); process.exit(1) })
