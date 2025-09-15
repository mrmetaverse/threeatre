# Threeatre Deployment Guide

## Architecture

Threeatre uses a split deployment architecture:
- **Frontend**: Static files deployed to Vercel
- **Backend**: Socket.IO server that needs persistent connections

## Current Deployment

### Frontend (Vercel)
- **URL**: https://threeatre-gc6sw3n1x-jesse-altons-projects.vercel.app
- **Status**: ✅ Deployed
- **Features**: Full 3D theatre, UI, and client-side functionality

### Backend (Needs Deployment)
- **Current**: Configured for Railway deployment
- **File**: `server.js` - Socket.IO server for real-time features
- **Port**: 3001 (configurable via PORT env var)

## Deployment Options

### Option 1: Railway (Recommended)
1. Create account at railway.app
2. Connect GitHub repository
3. Deploy `server.js` as Node.js service
4. Set environment variables if needed
5. Update `NetworkManager.js` with Railway URL

### Option 2: Render
1. Create account at render.com
2. Create new Web Service from GitHub
3. Build command: `npm install`
4. Start command: `node server.js`
5. Update client URL configuration

### Option 3: Heroku
1. Create Heroku app
2. Add Node.js buildpack
3. Set `npm start` to run `node server.js`
4. Deploy via Git push

## Environment Variables

### Backend Server
- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment (production/development)

### Frontend (Vercel)
- No environment variables needed
- Server URL is hardcoded in NetworkManager.js

## Current Status

- ✅ Frontend deployed to Vercel
- ❌ Backend needs deployment to persistent server
- 🔌 Offline mode works for single-player experience
- 🌐 Ready for backend deployment

## Quick Fix for Production

To enable multiplayer immediately:

1. Deploy backend to Railway/Render/Heroku
2. Update `NetworkManager.js` line 26 with your backend URL
3. Redeploy frontend to Vercel
4. Test with multiple users

The application gracefully falls back to offline mode if backend is unavailable.
