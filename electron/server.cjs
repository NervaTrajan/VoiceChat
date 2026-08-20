const http = require('http')
const path = require('path')
const crypto = require('crypto')
const { DatabaseSync } = require('node:sqlite')
const { WebSocketServer } = require('ws')
const livekitSdk = import('livekit-server-sdk')

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(body))
}
const readBody = req => new Promise((resolve, reject) => {
  let raw = ''
  req.on('data', chunk => { raw += chunk; if (raw.length > 1_000_000) reject(new Error('İstek çok büyük')) })
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch { reject(new Error('Geçersiz JSON')) } })
})
const token = () => crypto.randomBytes(32).toString('hex')
const hashPassword = password => {
  const salt = crypto.randomBytes(16)
  return `${salt.toString('hex')}:${crypto.scryptSync(password, salt, 64).toString('hex')}`
}
const verifyPassword = (password, saved) => {
  const [saltHex, hashHex] = saved.split(':')
  const expected = Buffer.from(hashHex, 'hex')
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64)
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

function setupDb(dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'sohbet.sqlite'))
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, channel TEXT NOT NULL, user_id INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id));
  `)
  return db
}

function startServer(dataDir) {
  return new Promise(resolve => {
    const db = setupDb(dataDir)
    const userFor = req => {
      const auth = req.headers.authorization || ''
      const sessionToken = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      return db.prepare('SELECT users.id, users.username FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token=?').get(sessionToken)
    }
    const server = http.createServer(async (req, res) => {
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' }); return res.end() }
      const url = new URL(req.url, 'http://localhost')
      try {
        if (req.method === 'POST' && url.pathname === '/auth/register') {
          const { username = '', password = '' } = await readBody(req)
          const cleanName = username.trim()
          if (cleanName.length < 3 || cleanName.length > 24) return json(res, 400, { error: 'Kullanıcı adı 3–24 karakter olmalı.' })
          if (password.length < 6) return json(res, 400, { error: 'Şifre en az 6 karakter olmalı.' })
          let result
          try { result = db.prepare('INSERT INTO users (username,password_hash) VALUES (?,?)').run(cleanName, hashPassword(password)) }
          catch { return json(res, 409, { error: 'Bu kullanıcı adı zaten alınmış.' }) }
          const sessionToken = token(); db.prepare('INSERT INTO sessions (token,user_id) VALUES (?,?)').run(sessionToken, result.lastInsertRowid)
          return json(res, 201, { token: sessionToken, user: { id: Number(result.lastInsertRowid), username: cleanName } })
        }
        if (req.method === 'POST' && url.pathname === '/auth/login') {
          const { username = '', password = '' } = await readBody(req)
          const user = db.prepare('SELECT id,username,password_hash FROM users WHERE username=?').get(username.trim())
          if (!user || !verifyPassword(password, user.password_hash)) return json(res, 401, { error: 'Kullanıcı adı veya şifre hatalı.' })
          const sessionToken = token(); db.prepare('INSERT INTO sessions (token,user_id) VALUES (?,?)').run(sessionToken, user.id)
          return json(res, 200, { token: sessionToken, user: { id: user.id, username: user.username } })
        }
        if (req.method === 'GET' && url.pathname === '/me') {
          const user = userFor(req); return user ? json(res, 200, { user }) : json(res, 401, { error: 'Oturum geçersiz.' })
        }
        if (req.method === 'POST' && url.pathname === '/auth/logout') {
          const auth = req.headers.authorization || ''; if (auth.startsWith('Bearer ')) db.prepare('DELETE FROM sessions WHERE token=?').run(auth.slice(7))
          return json(res, 200, { ok: true })
        }
        if (url.pathname === '/messages' && req.method === 'GET') {
          if (!userFor(req)) return json(res, 401, { error: 'Oturum gerekli.' })
          const channel = url.searchParams.get('channel') || 'genel'
          const rows = db.prepare('SELECT messages.id,messages.channel,messages.body,messages.created_at AS createdAt,users.id AS userId,users.username FROM messages JOIN users ON users.id=messages.user_id WHERE channel=? ORDER BY messages.id DESC LIMIT 100').all(channel).reverse()
          return json(res, 200, { messages: rows })
        }
        if (url.pathname === '/messages' && req.method === 'POST') {
          const user = userFor(req); if (!user) return json(res, 401, { error: 'Oturum gerekli.' })
          const { channel = 'genel', body = '' } = await readBody(req); const clean = body.trim()
          if (!clean || clean.length > 2000) return json(res, 400, { error: 'Mesaj 1–2000 karakter olmalı.' })
          const result = db.prepare('INSERT INTO messages (channel,user_id,body) VALUES (?,?,?)').run(channel, user.id, clean)
          const message = db.prepare('SELECT messages.id,messages.channel,messages.body,messages.created_at AS createdAt,users.id AS userId,users.username FROM messages JOIN users ON users.id=messages.user_id WHERE messages.id=?').get(result.lastInsertRowid)
          broadcast({ type: 'message', message }); return json(res, 201, { message })
        }
        if (url.pathname === '/livekit/token' && req.method === 'POST') {
          const user = userFor(req); if (!user) return json(res, 401, { error: 'Oturum gerekli.' })
          if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return json(res, 503, { error: 'LiveKit yapılandırması eksik.' })
          const { room = '' } = await readBody(req)
          const roomName = `sohbet-${String(room).toLocaleLowerCase('tr').replace(/[^a-z0-9-]/g, '-')}`
          if (roomName.length < 8 || roomName.length > 80) return json(res, 400, { error: 'Geçersiz oda adı.' })
          const { AccessToken } = await livekitSdk
          const accessToken = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { identity: `user-${user.id}`, name: user.username, ttl: '2h' })
          accessToken.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true })
          return json(res, 200, { token: await accessToken.toJwt(), url: process.env.LIVEKIT_URL, room: roomName })
        }
        json(res, 404, { error: 'Bulunamadı.' })
      } catch (error) { json(res, 500, { error: error.message || 'Sunucu hatası.' }) }
    })
    const wss = new WebSocketServer({ noServer: true })
    const broadcast = payload => { const data = JSON.stringify(payload); wss.clients.forEach(client => { if (client.readyState === 1) client.send(data) }) }
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url, 'http://localhost'); const sessionToken = url.searchParams.get('token')
      const valid = db.prepare('SELECT 1 FROM sessions WHERE token=?').get(sessionToken)
      if (!valid) return socket.destroy()
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
    })
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise(done => server.close(() => { wss.close(); db.close(); done() }))
    }))
  })
}

module.exports = { startServer }
