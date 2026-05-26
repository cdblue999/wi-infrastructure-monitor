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
