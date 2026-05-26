#!/usr/bin/env node

import http from 'http'
import app from '../app.js'
import debugLib from 'debug'
import { initDatabase, closeDatabase } from '../helpers/database.js'

const log = debugLib('wi-infrastructure-monitor:www')

async function start() {
  // Initialize database
  await initDatabase()
  log('Database initialized')

  const port = normalizePort(process.env.PORT || 3000)
  app.set('port', port)

  const server = http.createServer(app)

  server.listen(port)
  server.on('error', onError)
  server.on('listening', () => {
    const addr = server.address()
    const bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port
    log('Listening on ' + bind)
    console.log('WI Infrastructure Monitor running on :' + (typeof addr === 'object' ? addr.port : '?'))
  })

  process.on('SIGTERM', () => {
    log('Shutting down...')
    closeDatabase()
    server.close()
  })
  process.on('SIGINT', () => {
    log('Shutting down...')
    closeDatabase()
    server.close()
    process.exit(0)
  })
}

function normalizePort(val) {
  const port = parseInt(val, 10)
  if (isNaN(port)) return val
  if (port >= 0) return port
  return false
}

function onError(error) {
  if (error.syscall !== 'listen') throw error
  const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges')
      process.exit(1)
    case 'EADDRINUSE':
      console.error(bind + ' is already in use')
      process.exit(1)
    default:
      throw error
  }
}

start().catch(err => {
  console.error('Failed to start:', err)
  process.exit(1)
})
