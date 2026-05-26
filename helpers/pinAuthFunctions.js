// ── PIN authentication ───────────────────────────────────────

import { getPropertyString } from './configFunctions.js'

export function authenticate(pin) {
  const storedPin = getPropertyString('application.pin')
  return pin === storedPin
}
