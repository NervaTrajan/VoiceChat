# Voxora Desktop

Voxora is a Discord-inspired desktop voice and community chat application built with Electron, React, TypeScript, SQLite, WebSocket, and LiveKit.

## Features

- Secure registration, login, and persistent sessions
- Persistent users and messages stored in SQLite
- Real-time text messaging over WebSocket
- LiveKit-powered voice channels
- Working microphone mute, deafen, friends panel, and settings
- Responsive Discord-inspired desktop interface
- Portable Windows executable packaging

## Development

Node.js 20 or newer is required.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Add your LiveKit project credentials to `.env`. Never commit that file.

## Build for Windows

```powershell
npm run dist:win
```

The portable executable is created in `release/`.

## Security note

The current embedded backend is suitable for local development and personal testing. Before distributing Voxora publicly, move token generation and persistent messaging to a separately hosted backend so the LiveKit API secret is never shipped inside the desktop package.
