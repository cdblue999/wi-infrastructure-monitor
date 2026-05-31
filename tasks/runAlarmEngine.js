/*
 * Copyright (C) 2026 ZMS
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
// ── Alarm Engine (runs via Windows Task Scheduler or node-cron) ──

import { getDatabase } from '../helpers/database.js'
import { getPropertyNumber, getPropertyBoolean, getPropertyString } from '../helpers/configFunctions.js'

async function processAlarms() {
  console.log('[WI Alarm Engine] Rozpoczęto przetwarzanie alarmów...')
  const db = getDatabase()
  const warningDays = getPropertyNumber('alarm.warningDays')
  const now = new Date()
  const todayInt = parseInt(now.toISOString().slice(0, 10).replace(/-/g, ''))
  const endDate = new Date(now.getTime() + warningDays * 86400000)
  const endInt = parseInt(endDate.toISOString().slice(0, 10).replace(/-/g, ''))

  // 1. Check expiring policies
  let stmt = db.prepare(`
    SELECT u.id, u.nr_polisy, u.data_waznosci, p.firma, z.nazwa_zadania
    FROM ubezpieczenia u
    JOIN podwykonawcy p ON u.podwykonawca_id = p.id
    JOIN zadania_inwestycyjne z ON p.zadanie_id = z.id
    WHERE u.data_waznosci BETWEEN ? AND ?
      AND u.data_waznosci > ?
      AND p.record_delete_time_millis IS NULL
      AND z.record_delete_time_millis IS NULL
  `)
  stmt.bind([todayInt, endInt, todayInt])
  while (stmt.step()) {
    const policy = stmt.getAsObject()
    const msg = `Polisa OC ${policy.nr_polisy} firmy "${policy.firma}" wygasa dnia ${policy.data_waznosci}! Inwestycja: ${policy.nazwa_zadania}`
    console.log('  [ALARM]', msg)
    db.run("INSERT INTO alarmy (typ, poziom, tresc, powiazany_typ, powiazane_id, utworzono_millis) VALUES (?,?,?,?,?,?)",
      ['wygasniecie_OC', 'warning', msg, 'ubezpieczenie', policy.id, Date.now()])
  }
  stmt.free()

  // 2. Check overdue milestones
  stmt = db.prepare(`
    SELECT e.id, e.nazwa_etapu, e.termin_aktualny, e.faza, z.nazwa_zadania
    FROM etapy e
    JOIN zadania_inwestycyjne z ON e.zadanie_id = z.id
    WHERE e.status IN ('oczekujacy','w_trakcie')
      AND e.termin_aktualny < ?
      AND e.termin_aktualny > 0
      AND z.record_delete_time_millis IS NULL
  `)
  stmt.bind([todayInt])
  while (stmt.step()) {
    const etap = stmt.getAsObject()
    const msg = `Opóźnienie etapu "${etap.nazwa_etapu}" (faza ${etap.faza}) w zadaniu "${etap.nazwa_zadania}". Termin upłynął: ${etap.termin_aktualny}`
    console.log('  [ALARM]', msg)
    db.run("INSERT INTO alarmy (typ, poziom, tresc, powiazany_typ, powiazane_id, utworzono_millis) VALUES (?,?,?,?,?,?)",
      ['opoznienie_etapu', 'critical', msg, 'etap', etap.id, Date.now()])
  }
  stmt.free()

  // 3. Send notifications
  await sendNotifications()

  console.log('[WI Alarm Engine] Zakończono.')
}

async function sendNotifications() {
  const db = getDatabase()
  const stmt = db.prepare("SELECT * FROM alarmy WHERE wylaczony = 0 ORDER BY utworzono_millis DESC LIMIT 10")
  const alarms = []
  while (stmt.step()) alarms.push(stmt.getAsObject())
  stmt.free()

  if (alarms.length === 0) return

  // Email
  if (getPropertyBoolean('notifications.email.enabled')) {
    try {
      const nodemailer = await import('nodemailer')
      const transporter = nodemailer.default.createTransport({
        host: getPropertyString('notifications.email.host'),
        port: getPropertyNumber('notifications.email.port'),
        secure: getPropertyBoolean('notifications.email.secure'),
        auth: {
          user: getPropertyString('notifications.email.user'),
          pass: getPropertyString('notifications.email.pass')
        }
      })
      await transporter.sendMail({
        from: getPropertyString('notifications.email.from'),
        to: getPropertyString('notifications.email.to'),
        subject: `[WI Monitor] ${alarms.length} aktywnych alarmów`,
        text: alarms.map(a => `[${a.poziom}] ${a.tresc}`).join('\n\n')
      })
      console.log('  [Email] Wysłano powiadomienie')
    } catch (err) {
      console.error('  [Email] Błąd:', err.message)
    }
  }

  // Teams
  if (getPropertyBoolean('notifications.teams.enabled')) {
    try {
      const webhookUrl = getPropertyString('notifications.teams.webhookUrl')
      if (webhookUrl) {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `WI Monitor — ${alarms.length} aktywnych alarmów`,
            text: alarms.map(a => `**${a.poziom}**: ${a.tresc}`).join('\n\n')
          })
        })
        console.log('  [Teams] Wysłano powiadomienie')
      }
    } catch (err) {
      console.error('  [Teams] Błąd:', err.message)
    }
  }

  // Toast
  if (getPropertyBoolean('notifications.toast.enabled')) {
    try {
      const notifier = await import('node-notifier')
      notifier.default.notify({
        title: `WI Monitor — ${alarms.length} alarmów`,
        message: alarms.slice(0, 3).map(a => a.tresc.substring(0, 80)).join('\n'),
        sound: true
      })
      console.log('  [Toast] Wysłano powiadomienie')
    } catch (err) {
      console.error('  [Toast] Błąd:', err.message)
    }
  }
}

processAlarms().catch(err => {
  console.error('[WI Alarm Engine] Błąd krytyczny:', err)
  process.exit(1)
})
