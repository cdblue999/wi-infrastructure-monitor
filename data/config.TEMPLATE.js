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
// ── Config file ──────────────────────────────────────────────
// Edit this file and restart the server for changes to take effect.

const config = {
  application: {
    httpPort: 3000,
    pin: '1234',                    // ← Change this!
    appName: 'WI Monitor'
  },

  session: {
    cookieName: 'wi-monitor',
    secret: 'change-this-secret',
    maxAge: 86400000               // 24 hours
  },

  database: {
    path: 'data/wi.db'
  },

  reverseProxy: {
    disableCompression: false,
    urlPrefix: ''
  },

  notifications: {
    email: {
      enabled: false,
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: '',
      pass: '',
      from: 'monitor@wi.wroc.pl',
      to: 'biuro@wi.wroc.pl'
    },
    teams: {
      enabled: false,
      webhookUrl: ''
    },
    toast: {
      enabled: true
    }
  },

  alarm: {
    warningDays: 30
  }
}

export default config
