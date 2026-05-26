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
