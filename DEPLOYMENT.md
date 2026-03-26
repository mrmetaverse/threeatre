# Threeatre Deployment Guide

> "Run your watch party, keep the stream alive... but don't you dare leave the theatre unless you're ready for what waits outside."

## Architecture

Threeatre uses a split deployment architecture:
- **Frontend**: Vite-built static site deployed to **Vercel**
- **Backend**: Socket.IO + Express server for real-time multiplayer on **Railway/Render**
- **Streaming**: WebRTC peer-to-peer (signaled through Socket.IO backend)
- **Adventure Layer**: Outdoor exploration with temples, treasure chests, ghost AI, and temple safe zones

## Quick Start

### Local Development

```bash
npm install
npm run dev
```

This starts both the Socket.IO backend (port 3001) and Vite dev server (port 3000).

### Deploy Frontend to Vercel

```bash
npx vercel
```

Or connect your GitHub repo at vercel.com. Vercel auto-detects Vite and builds with `npm run build`.

### Deploy Backend to Railway

1. Create a new project at railway.app
2. Connect your GitHub repository
3. Set the start command: `node server.js`
4. Set environment variable: `PORT=3001` (Railway sets this automatically)
5. Note the deployment URL (e.g., `https://threeatre-production.up.railway.app`)

### Connect Frontend to Backend

Set the `VITE_BACKEND_URL` environment variable in your Vercel project settings:

```
VITE_BACKEND_URL=https://your-backend.railway.app
```

Then redeploy the frontend. The `NetworkManager` reads this at build time.

## Environment Variables

### Frontend (Vercel)
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_BACKEND_URL` | For production | URL of the Socket.IO backend |

### Backend (Railway/Render)
| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Auto-set | Server port (default: 3001) |
| `NODE_ENV` | Optional | Environment mode |

## Deployment Options

### Backend

| Platform | Config File | Start Command |
|----------|-------------|---------------|
| Railway | `railway.json` | `node server.js` |
| Render | `render.yaml` | `node server.js` |

### Frontend

Vercel auto-detects Vite via `vercel.json`. The `api/socket.js` serverless function provides a fallback Socket.IO handler, but persistent backends (Railway/Render) are recommended for reliable WebSocket connections.

## How Streaming Works

1. **Host** clicks Start Hosting, which captures their screen via `getDisplayMedia`
2. **StreamManager** creates WebRTC peer connections to each viewer
3. **Signaling** (offer/answer/ICE) flows through the Socket.IO backend
4. **Viewers** receive the video stream and display it on the theatre screen as a `VideoTexture`

No media ever flows through the server - it is pure peer-to-peer via WebRTC.

## Fallback Modes

- If the backend is unreachable, the app falls back to **P2P mode** via `BroadcastChannel` (same-origin tabs only)
- Screen sharing still works locally (host sees their own screen on the theatre)
- Single-player exploration of the adventure world works fully offline
