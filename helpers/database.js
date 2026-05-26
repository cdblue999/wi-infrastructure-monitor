import initSqlJs from 'sql.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { getPropertyString } from './configFunctions.js'

let db = null
let SQL = null

const dbPath = getPropertyString('database.path')

export async function initDatabase() {
  SQL = await initSqlJs()

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
    createSchema()
    saveDatabase()
  }

  db.run('PRAGMA foreign_keys = ON')
  db.run('PRAGMA journal_mode = WAL')
}

export function getDatabase() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

export function saveDatabase() {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  writeFileSync(dbPath, buffer)
}

export function closeDatabase() {
  if (db) {
    saveDatabase()
    db.close()
    db = null
  }
}

function createSchema() {
  if (!db) return
  db.run(`
    CREATE TABLE IF NOT EXISTS zadania_inwestycyjne (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numer_pzp TEXT,
      nazwa_zadania TEXT NOT NULL,
      kategoria TEXT NOT NULL DEFAULT 'Inne',
      typ_inwestycji TEXT NOT NULL DEFAULT 'Kubaturowa',
      status TEXT NOT NULL DEFAULT 'Koncepcja',
      lokalizacja TEXT,
      budzet_miasto_pln REAL DEFAULT 0,
      budzet_ue_pln REAL DEFAULT 0,
      budzet_inne_pln REAL DEFAULT 0,
      umowa_wykonawca TEXT,
      data_umowy INTEGER,
      termin_umowny INTEGER,
      termin_rzeczywisty INTEGER,
      record_create_user_name TEXT NOT NULL DEFAULT 'system',
      record_create_time_millis INTEGER NOT NULL,
      record_update_user_name TEXT,
      record_update_time_millis INTEGER,
      record_delete_user_name TEXT,
      record_delete_time_millis INTEGER
    );

    CREATE TABLE IF NOT EXISTS podwykonawcy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zadanie_id INTEGER NOT NULL REFERENCES zadania_inwestycyjne(id) ON DELETE CASCADE,
      firma TEXT NOT NULL,
      nip TEXT NOT NULL,
      zakres_robot TEXT NOT NULL,
      record_create_user_name TEXT NOT NULL DEFAULT 'system',
      record_create_time_millis INTEGER NOT NULL,
      record_delete_user_name TEXT,
      record_delete_time_millis INTEGER
    );

    CREATE TABLE IF NOT EXISTS ubezpieczenia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      podwykonawca_id INTEGER NOT NULL REFERENCES podwykonawcy(id) ON DELETE CASCADE,
      typ TEXT NOT NULL CHECK(typ IN ('OC','zabezpieczenie','gwarancja')),
      nr_polisy TEXT NOT NULL,
      data_waznosci INTEGER NOT NULL,
      kwota_pln REAL DEFAULT 0,
      record_create_user_name TEXT NOT NULL DEFAULT 'system',
      record_create_time_millis INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS etapy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zadanie_id INTEGER NOT NULL REFERENCES zadania_inwestycyjne(id) ON DELETE CASCADE,
      faza INTEGER NOT NULL CHECK(faza BETWEEN 1 AND 6),
      nazwa_etapu TEXT NOT NULL,
      termin_pierwotny INTEGER NOT NULL,
      termin_aktualny INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'oczekujacy' CHECK(status IN ('oczekujacy','w_trakcie','zakonczony','opozniony')),
      record_create_user_name TEXT NOT NULL DEFAULT 'system',
      record_create_time_millis INTEGER NOT NULL,
      record_update_user_name TEXT,
      record_update_time_millis INTEGER
    );

    CREATE TABLE IF NOT EXISTS aneksy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etap_id INTEGER NOT NULL REFERENCES etapy(id) ON DELETE CASCADE,
      poprzedni_termin INTEGER NOT NULL,
      nowy_termin INTEGER NOT NULL,
      przyczyna TEXT NOT NULL,
      data_podpisania INTEGER NOT NULL,
      record_create_user_name TEXT NOT NULL DEFAULT 'system',
      record_create_time_millis INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alarmy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      typ TEXT NOT NULL,
      poziom TEXT NOT NULL DEFAULT 'warning' CHECK(poziom IN ('info','warning','critical')),
      tresc TEXT NOT NULL,
      powiazany_typ TEXT,
      powiazane_id INTEGER,
      wylaczony INTEGER NOT NULL DEFAULT 0,
      utworzono_millis INTEGER NOT NULL
    );
  `)
}
