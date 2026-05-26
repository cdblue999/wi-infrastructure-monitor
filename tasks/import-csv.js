// ── CLI CSV import tool ──────────────────────────────────────
// Usage: node tasks/import-csv.js --file path/to/file.csv

import { readFileSync } from 'fs'
import { parse } from 'papaparse'
import { getDatabase } from '../helpers/database.js'

const args = process.argv.slice(2)
const fileIndex = args.indexOf('--file')
if (fileIndex === -1 || !args[fileIndex + 1]) {
  console.error('Użycie: node tasks/import-csv.js --file <ścieżka>')
  process.exit(1)
}

const filePath = args[fileIndex + 1]
const content = readFileSync(filePath, 'utf-8')
const result = parse(content, { header: true, skipEmptyLines: true })

if (result.errors.length > 0) {
  console.error('Błędy parsowania CSV:', result.errors)
}

const db = getDatabase()
const now = Date.now()
let count = 0

const insertStmt = db.prepare(`
  INSERT INTO zadania_inwestycyjne
    (numer_pzp, nazwa_zadania, kategoria, typ_inwestycji, status,
     lokalizacja, budzet_miasto_pln, budzet_ue_pln, budzet_inne_pln,
     umowa_wykonawca, termin_umowny,
     record_create_user_name, record_create_time_millis,
     record_update_user_name, record_update_time_millis)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', ?, 'import', ?)
`)

for (const row of result.data) {
  try {
    insertStmt.bind([
      row.numer_pzp || null,
      row.nazwa_zadania || row.nazwa || '',
      row.kategoria || 'Inne',
      row.typ_inwestycji || row.typ || 'Kubaturowa',
      row.status || 'Koncepcja',
      row.lokalizacja || row.lokacja || null,
      parseFloat(row.budzet_miasto_pln) || 0,
      parseFloat(row.budzet_ue_pln) || 0,
      parseFloat(row.budzet_inne_pln) || 0,
      row.umowa_wykonawca || row.wykonawca || null,
      parseInt(row.termin_umowny) || null,
      now, now
    ])
    insertStmt.step()
    insertStmt.free()
    count++
  } catch (err) {
    console.error('Błąd importu wiersza:', err.message)
  }
}

console.log(`Zaimportowano ${count} z ${result.data.length} rekordów.`)
