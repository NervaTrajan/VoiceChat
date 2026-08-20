export type User = { id: number; username: string }
export type ApiMessage = { id: number; channel: string; body: string; createdAt: string; userId: number; username: string }

let baseUrl = ''
export async function initApi() { baseUrl = window.desktop ? await window.desktop.getApiUrl() : 'http://127.0.0.1:4174'; return baseUrl }
export const savedToken = () => localStorage.getItem('sohbet_token') || ''

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(baseUrl + path, { ...options, headers: { 'Content-Type': 'application/json', ...(savedToken() ? { Authorization: `Bearer ${savedToken()}` } : {}), ...options.headers } })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Bir hata oluştu.')
  return data
}
export const api = {
  auth: (mode: 'login'|'register', username: string, password: string) => request<{token:string,user:User}>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request<{user:User}>('/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  messages: (channel: string) => request<{messages:ApiMessage[]}>(`/messages?channel=${encodeURIComponent(channel)}`),
  send: (channel: string, body: string) => request<{message:ApiMessage}>('/messages', { method: 'POST', body: JSON.stringify({ channel, body }) }),
  voiceToken: (room: string) => request<{token:string;url:string;room:string}>('/livekit/token', { method: 'POST', body: JSON.stringify({ room }) }),
  socket: (onMessage: (message: ApiMessage) => void) => {
    const ws = new WebSocket(baseUrl.replace('http', 'ws') + `?token=${savedToken()}`)
    ws.onmessage = event => { const payload = JSON.parse(event.data); if (payload.type === 'message') onMessage(payload.message) }
    return ws
  }
}
