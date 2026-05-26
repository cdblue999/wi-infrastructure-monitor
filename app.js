import express from 'express'
import session from 'express-session'
import FileStore from 'session-file-store'
import cookieParser from 'cookie-parser'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getPropertyBoolean, getPropertyNumber, getPropertyString } from './helpers/configFunctions.js'
import { initDatabase, getDatabase, saveDatabase } from './helpers/database.js'
import { authenticate } from './helpers/pinAuthFunctions.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── View engine ──────────────────────────────────────────────
const app = express()
app.set('view engine', 'ejs')
app.set('views', join(__dirname, 'views'))

// ── Compression ──────────────────────────────────────────────
if (!getPropertyBoolean('reverseProxy.disableCompression')) {
  app.use(compression())
}

// ── Body parsing ─────────────────────────────────────────────
app.use(express.urlencoded({ extended: false }))
app.use(express.json())

// ── Cookie parser ────────────────────────────────────────────
app.use(cookieParser())

// ── Session ──────────────────────────────────────────────────
const FileStoreSession = FileStore(session)
app.use(session({
  store: new FileStoreSession({
    path: join(__dirname, 'data/sessions'),
    retries: 0
  }),
  name: getPropertyString('session.cookieName'),
  secret: getPropertyString('session.secret'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: getPropertyNumber('session.maxAge'),
    secure: false,
    httpOnly: true,
    sameSite: 'lax'
  }
}))

// ── Static files ─────────────────────────────────────────────
app.use(express.static(join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  etag: true
}))

// ── Rate limiting for login ─────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Zbyt wiele prób logowania' }
})

// ── Locals ───────────────────────────────────────────────────
app.use((req, res, next) => {
  res.locals.urlPrefix = getPropertyString('reverseProxy.urlPrefix')
  res.locals.user = req.session?.user || null
  res.locals.appName = getPropertyString('application.appName')
  next()
})

// ── Auth check ───────────────────────────────────────────────
app.use((req, res, next) => {
  const publicPaths = ['/login', '/api/login', '/api/health', '/api/ingest']
  if (publicPaths.includes(req.path) || req.path.startsWith('/stylesheets/') || req.path.startsWith('/javascripts/')) {
    return next()
  }
  if (!req.session?.user) {
    return req.path.startsWith('/api/')
      ? res.status(401).json({ error: 'Nieautoryzowany' })
      : res.redirect('/login')
  }
  next()
})

// ── Login ────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.session?.user) return res.redirect('/')
  res.render('login', { error: null })
})

app.post('/api/login', loginLimiter, (req, res) => {
  if (authenticate(req.body?.pin)) {
    req.session.user = { userName: 'user', canUpdate: true }
    return res.json({ success: true })
  }
  return res.status(401).json({ success: false, error: 'Nieprawidłowy kod dostępu' })
})

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }))
})

// ── DB helpers ───────────────────────────────────────────────
function query(sql, params = []) {
  const db = getDatabase()
  const stmt = db.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

function queryOne(sql, params = []) {
  const rows = query(sql, params)
  return rows.length > 0 ? rows[0] : null
}

function execute(sql, params = []) {
  const db = getDatabase()
  db.run(sql, params)
  saveDatabase()
  return { changes: db.getRowsModified() }
}

// ── Dashboard ────────────────────────────────────────────────
app.get('/', (req, res) => {
  const allZadania = query('SELECT * FROM zadania_inwestycyjne WHERE record_delete_time_millis IS NULL')
  const active = allZadania.filter(z => z.status !== 'Zakończone' && z.status !== 'Rękojmia')
  const totalBudget = active.reduce((s, z) => s + (z.budzet_miasto_pln || 0) + (z.budzet_ue_pln || 0) + (z.budzet_inne_pln || 0), 0)

  const today = new Date()
  const todayInt = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
  const endInt = new Date(today.getTime() + getPropertyNumber('alarm.warningDays') * 86400000)
    .toISOString().slice(0, 10).replace(/-/g, '')

  const expiring = query(`
    SELECT u.*, p.firma, z.nazwa_zadania
    FROM ubezpieczenia u
    JOIN podwykonawcy p ON u.podwykonawca_id = p.id
    JOIN zadania_inwestycyjne z ON p.zadanie_id = z.id
    WHERE u.data_waznosci BETWEEN ? AND ?
      AND u.data_waznosci > ?
      AND p.record_delete_time_millis IS NULL
      AND z.record_delete_time_millis IS NULL
    ORDER BY u.data_waznosci ASC
    LIMIT 5
  `, [todayInt, parseInt(endInt), todayInt])

  const alarms = query('SELECT * FROM alarmy WHERE wylaczony = 0')

  const catStats = {}
  for (const z of active) {
    catStats[z.kategoria] = (catStats[z.kategoria] || 0) + 1
  }

  res.render('dashboard', {
    activeCount: active.length,
    totalZadania: allZadania.length,
    totalBudget,
    expiringCount: expiring.length,
    alarmCount: alarms.length,
    categoryStats: catStats,
    expiringPolicies: expiring
  })
})

// ── Zadania API ──────────────────────────────────────────────
app.get('/zadania', (req, res) => res.render('zadania'))

app.get('/api/zadania', (req, res) => {
  const { kategoria, status, search } = req.query
  let sql = 'SELECT * FROM zadania_inwestycyjne WHERE record_delete_time_millis IS NULL'
  const params = []
  if (kategoria) { sql += ' AND kategoria = ?'; params.push(kategoria) }
  if (status) { sql += ' AND status = ?'; params.push(status) }
  if (search) { sql += ' AND (nazwa_zadania LIKE ? OR numer_pzp LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  sql += ' ORDER BY record_create_time_millis DESC'
  res.json(query(sql, params))
})

app.get('/api/zadania/:id', (req, res) => {
  const z = queryOne('SELECT * FROM zadania_inwestycyjne WHERE id = ?', [req.params.id])
  if (!z) return res.status(404).json({ error: 'Nie znaleziono' })
  res.json(z)
})

app.post('/api/zadania/add', (req, res) => {
  const now = Date.now()
  const d = req.body
  execute(`
    INSERT INTO zadania_inwestycyjne
      (numer_pzp, nazwa_zadania, kategoria, typ_inwestycji, status,
       lokalizacja, budzet_miasto_pln, budzet_ue_pln, budzet_inne_pln,
       umowa_wykonawca, data_umowy, termin_umowny,
       record_create_user_name, record_create_time_millis,
       record_update_user_name, record_update_time_millis)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'user', ?, 'user', ?)
  `, [d.numerPzp, d.nazwaZadania, d.kategoria, d.typInwestycji, d.status,
      d.lokalizacja, d.budzetMiastoPln||0, d.budzetUePln||0, d.budzetInnePln||0,
      d.umowaWykonawca, d.dataUmowy||null, d.terminUmowny||null, now, now])

  const last = queryOne('SELECT MAX(id) as id FROM zadania_inwestycyjne')
  res.json({ success: true, id: last?.id })
})

app.post('/api/zadania/:id', (req, res) => {
  const d = req.body
  const now = Date.now()
  execute(`
    UPDATE zadania_inwestycyjne SET
      nazwa_zadania=?, kategoria=?, typ_inwestycji=?, status=?,
      lokalizacja=?, budzet_miasto_pln=?, budzet_ue_pln=?, budzet_inne_pln=?,
      umowa_wykonawca=?, data_umowy=?, termin_umowny=?,
      record_update_user_name='user', record_update_time_millis=?
    WHERE id=?
  `, [d.nazwaZadania, d.kategoria, d.typInwestycji, d.status,
      d.lokalizacja, d.budzetMiastoPln||0, d.budzetUePln||0, d.budzetInnePln||0,
      d.umowaWykonawca, d.dataUmowy||null, d.terminUmowny||null, now, req.params.id])
  res.json({ success: true })
})

app.post('/api/zadania/:id/delete', (req, res) => {
  const now = Date.now()
  execute('UPDATE zadania_inwestycyjne SET record_delete_user_name=?, record_delete_time_millis=? WHERE id=?',
    ['user', now, req.params.id])
  res.json({ success: true })
})

// ── Podwykonawcy ─────────────────────────────────────────────
app.get('/api/zadania/:id/podwykonawcy', (req, res) => {
  res.json(query('SELECT * FROM podwykonawcy WHERE zadanie_id = ? AND record_delete_time_millis IS NULL', [req.params.id]))
})

app.post('/api/podwykonawcy/add', (req, res) => {
  const d = req.body
  execute('INSERT INTO podwykonawcy (zadanie_id, firma, nip, zakres_robot, record_create_user_name, record_create_time_millis) VALUES (?,?,?,?,?,?)',
    [d.zadanieId, d.firma, d.nip, d.zakresRobot, 'user', Date.now()])
  const last = queryOne('SELECT MAX(id) as id FROM podwykonawcy')
  res.json({ success: true, id: last?.id })
})

app.post('/api/podwykonawcy/:id/compliance', (req, res) => {
  const today = parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, ''))
  const policies = query('SELECT * FROM ubezpieczenia WHERE podwykonawca_id = ?', [req.params.id])
  const hasValidOC = policies.some(p => p.typ === 'OC' && p.data_waznosci >= today)
  const hasValidBond = policies.some(p => (p.typ === 'zabezpieczenie' || p.typ === 'gwarancja') && p.data_waznosci >= today)
  res.json({ hasValidOC, hasValidBond, policies })
})

// ── Ubezpieczenia ────────────────────────────────────────────
app.post('/api/ubezpieczenia/add', (req, res) => {
  const d = req.body
  execute('INSERT INTO ubezpieczenia (podwykonawca_id, typ, nr_polisy, data_waznosci, kwota_pln, record_create_user_name, record_create_time_millis) VALUES (?,?,?,?,?,?,?)',
    [d.podwykonawcaId, d.typ, d.nrPolisy, d.dataWaznosci, d.kwotaPln||0, 'user', Date.now()])
  const last = queryOne('SELECT MAX(id) as id FROM ubezpieczenia')
  res.json({ success: true, id: last?.id })
})

// ── Etapy / Aneksy ───────────────────────────────────────────
app.get('/api/zadania/:id/etapy', (req, res) => {
  const etapy = query('SELECT * FROM etapy WHERE zadanie_id = ? ORDER BY faza', [req.params.id])
  const result = etapy.map(e => {
    const aneksy = query('SELECT * FROM aneksy WHERE etap_id = ? ORDER BY data_podpisania DESC', [e.id])
    return { ...e, aneksy }
  })
  res.json(result)
})

app.post('/api/aneksy/add', (req, res) => {
  const d = req.body
  const now = Date.now()
  execute('INSERT INTO aneksy (etap_id, poprzedni_termin, nowy_termin, przyczyna, data_podpisania, record_create_user_name, record_create_time_millis) VALUES (?,?,?,?,?,?,?)',
    [d.etapId, d.poprzedniTermin, d.nowyTermin, d.przyczyna, d.dataPodpisania, 'user', now])
  execute('UPDATE etapy SET termin_aktualny=?, record_update_user_name=?, record_update_time_millis=? WHERE id=?',
    [d.nowyTermin, 'user', now, d.etapId])
  const last = queryOne('SELECT MAX(id) as id FROM aneksy')
  res.json({ success: true, id: last?.id })
})

// ── Alarmy ───────────────────────────────────────────────────
app.get('/alarmy', (req, res) => res.render('alarmy'))

app.get('/api/alarmy', (req, res) => {
  const { typ, wylaczony } = req.query
  let sql = 'SELECT * FROM alarmy WHERE 1=1'
  const params = []
  if (typ) { sql += ' AND typ = ?'; params.push(typ) }
  if (wylaczony === '0') { sql += ' AND wylaczony = 0' }
  else if (wylaczony === '1') { sql += ' AND wylaczony = 1' }
  sql += ' ORDER BY utworzono_millis DESC LIMIT 100'
  res.json(query(sql, params))
})

app.post('/api/alarmy/:id/dismiss', (req, res) => {
  execute('UPDATE alarmy SET wylaczony = 1 WHERE id = ?', [req.params.id])
  res.json({ success: true })
})

// ── Settings ─────────────────────────────────────────────────
app.get('/ustawienia', (req, res) => {
  res.render('settings', {
    config: {
      emailEnabled: getPropertyBoolean('notifications.email.enabled'),
      emailHost: getPropertyString('notifications.email.host'),
      emailPort: getPropertyNumber('notifications.email.port'),
      emailSecure: getPropertyBoolean('notifications.email.secure'),
      emailFrom: getPropertyString('notifications.email.from'),
      emailTo: getPropertyString('notifications.email.to'),
      teamsEnabled: getPropertyBoolean('notifications.teams.enabled'),
      teamsWebhookUrl: getPropertyString('notifications.teams.webhookUrl'),
      toastEnabled: getPropertyBoolean('notifications.toast.enabled'),
      warningDays: getPropertyNumber('alarm.warningDays')
    }
  })
})

// ── Import ───────────────────────────────────────────────────
app.get('/import', (req, res) => res.render('import'))

// ── AI ingestion endpoint ────────────────────────────────────
app.post('/api/ingest', (req, res) => {
  const { document_type, ...payload } = req.body
  try {
    let recordId = 0

    if (document_type === 'polisa_OC') {
      execute('INSERT INTO ubezpieczenia (podwykonawca_id, typ, nr_polisy, data_waznosci, kwota_pln, record_create_user_name, record_create_time_millis) VALUES (?,?,?,?,?,?,?)',
        [payload.subcontractor_id, 'OC', payload.policy_number, payload.expiration_date, payload.amount_pln||0, 'ai', Date.now()])
      const last = queryOne('SELECT MAX(id) as id FROM ubezpieczenia')
      recordId = last?.id || 0
    } else if (document_type === 'aneks') {
      execute('INSERT INTO aneksy (etap_id, poprzedni_termin, nowy_termin, przyczyna, data_podpisania, record_create_user_name, record_create_time_millis) VALUES (?,?,?,?,?,?,?)',
        [payload.milestone_id, payload.previous_deadline, payload.new_deadline, payload.reason, payload.signed_date, 'ai', Date.now()])
      const last = queryOne('SELECT MAX(id) as id FROM aneksy')
      recordId = last?.id || 0
    } else {
      res.json({ success: false, error: 'Unknown document type' })
      return
    }

    res.json({ success: true, recordId })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// ── Health ───────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'WI Infrastructure Monitor' })
})

// ── 404 ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error', { message: 'Nie znaleziono strony', error: { status: 404, stack: '' } })
})

// ── Error handler ────────────────────────────────────────────
app.use((err, req, res, _next) => {
  const status = err.status || 500
  console.error(`[${status}] ${req.method} ${req.path}:`, err.message)
  if (req.path.startsWith('/api/')) {
    res.status(status).json({ error: status >= 500 ? 'Błąd serwera' : err.message })
  } else {
    res.status(status).render('error', {
      message: status >= 500 ? 'Błąd serwera' : err.message,
      error: { status, stack: process.env.NODE_ENV === 'production' ? '' : err.stack }
    })
  }
})

export default app
