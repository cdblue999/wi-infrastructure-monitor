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
// ── Config accessor ─────────────────────────────────────────

import config from '../data/config.js'

const fallbacks = {
  'application.httpPort': 3000,
  'application.pin': '1234',
  'application.appName': 'WI Monitor',
  'session.cookieName': 'wi-monitor',
  'session.secret': 'wi-monitor-secret-change-me',
  'session.maxAge': 86400000,
  'database.path': 'data/wi.db',
  'reverseProxy.disableCompression': false,
  'reverseProxy.urlPrefix': '',
  'notifications.email.enabled': false,
  'notifications.email.host': '',
  'notifications.email.port': 587,
  'notifications.email.secure': false,
  'notifications.email.user': '',
  'notifications.email.pass': '',
  'notifications.email.from': '',
  'notifications.email.to': '',
  'notifications.teams.enabled': false,
  'notifications.teams.webhookUrl': '',
  'notifications.toast.enabled': true,
  'alarm.warningDays': 30
}

export function getProperty(propertyName) {
  const value = propertyName.split('.').reduce((obj, key) => {
    if (obj && typeof obj === 'object' && key in obj) {
      return obj[key]
    }
    return undefined
  }, config)

  return value !== undefined ? value : fallbacks[propertyName]
}

export function getPropertyString(propertyName) {
  const v = getProperty(propertyName)
  return v !== undefined ? String(v) : ''
}

export function getPropertyNumber(propertyName) {
  const v = getProperty(propertyName)
  return v !== undefined ? Number(v) : 0
}

export function getPropertyBoolean(propertyName) {
  const v = getProperty(propertyName)
  return v !== undefined ? Boolean(v) : false
}

Object.freeze(config)
