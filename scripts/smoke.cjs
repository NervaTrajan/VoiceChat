const fs = require('fs')
const os = require('os')
const path = require('path')
const { startServer } = require('../electron/server.cjs')

async function run() {
  process.env.LIVEKIT_URL = 'wss://test.livekit.invalid'
  process.env.LIVEKIT_API_KEY = 'test_api_key_123456'
  process.env.LIVEKIT_API_SECRET = 'test_secret_that_is_long_enough_for_signing_123456'
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sohbet-test-'))
  const server = await startServer(tempDir)
  const authResponse = await fetch(`${server.url}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'test_user', password: 'secret123' }) })
  if (!authResponse.ok) throw new Error(`Kayıt başarısız: ${authResponse.status}`)
  const auth = await authResponse.json()
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` }
  const sentResponse = await fetch(`${server.url}/messages`, { method: 'POST', headers, body: JSON.stringify({ channel: 'genel', body: 'Merhaba Sohbet!' }) })
  if (!sentResponse.ok) throw new Error(`Mesaj gönderilemedi: ${sentResponse.status}`)
  const listResponse = await fetch(`${server.url}/messages?channel=genel`, { headers })
  const list = await listResponse.json()
  if (list.messages?.[0]?.body !== 'Merhaba Sohbet!') throw new Error('Mesaj veritabanından okunamadı')
  const voiceResponse = await fetch(`${server.url}/livekit/token`, { method: 'POST', headers, body: JSON.stringify({ room: 'Muhabbet' }) })
  const voice = await voiceResponse.json()
  if (!voiceResponse.ok || !voice.token || voice.room !== 'sohbet-muhabbet') throw new Error('LiveKit oda tokenı üretilemedi')
  await server.close()
  fs.rmSync(tempDir, { recursive: true, force: true })
  console.log('Kayıt, oturum, SQLite, mesaj API ve LiveKit token testi başarılı.')
}
run().catch(error => { console.error(error); process.exit(1) })
