# 🎭 Threeatre

A collaborative WebXR movie theatre experience built with Three.js and Socket.IO. Created by [AltonTech, Inc.](https://altontech.com)

[![License: Custom](https://img.shields.io/badge/License-Custom-blue.svg)](LICENSE)
[![Built with Three.js](https://img.shields.io/badge/Built%20with-Three.js-orange.svg)](https://threejs.org/)
[![WebXR](https://img.shields.io/badge/WebXR-Compatible-green.svg)](https://immersiveweb.dev/)

## Features

- **3D Virtual Theatre**: Immersive theatre environment with seats and a large screen
- **WebXR Support**: Full VR and AR support for immersive experiences  
- **Real-time Collaboration**: Multiple users can join the same room and see each other as avatars
- **VRM Avatar Support**: Upload your own VRM avatars or use default geometric avatars
- **OMI Audio Protocol**: Full 3D surround sound with theatre reverb, positional audio, and environmental acoustics
- **Screen Sharing**: Host can share their screen for everyone to watch
- **Seat Selection**: Click on seats to sit down and claim your spot
- **Movement Controls**: WASD/Arrow keys for walking around, mouse look controls
- **Advanced Rendering**: WebGL rendering with shadow mapping and lighting
- **Room Sharing**: Generate shareable room URLs to invite friends

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start both server and client**:
   ```bash
   npm start
   ```

   Or run them separately:
   ```bash
   # Terminal 1 - Start the Socket.IO server
   npm run server

   # Terminal 2 - Start the Vite dev server  
   npm run dev
   ```

3. **Open your browser** and navigate to `https://localhost:3000`

4. **Accept the security certificate** (required for HTTPS and WebXR)

5. **Share your room** by clicking the "📋 Share Room" button to invite friends!

## Controls

- **🖱️ Mouse**: Look around (click to enable pointer lock)
- **⌨️ WASD / Arrow Keys**: Move around the theatre
- **🪑 Click Seats**: Sit down and claim a seat
- **🎬 Start Hosting**: Share your screen with everyone
- **👤 Upload VRM Avatar**: Upload your own VRM/GLB/GLTF avatar file
- **🔄 Reset Avatar**: Return to default geometric avatar
- **📱 VR/AR Buttons**: Enter immersive mode (requires compatible device)

## Architecture

- **Frontend**: Three.js + WebGL rendering with VRM avatar support
- **Backend**: Node.js + Express + Socket.IO for real-time communication
- **Avatar System**: @pixiv/three-vrm for VRM loading and OMI protocol support
- **WebXR**: Native VR/AR support for immersive experiences
- **Screen Sharing**: WebRTC getDisplayMedia API for host streaming

## Development

The project uses:
- **Vite** for fast development and building
- **Three.js** for 3D graphics and WebXR
- **@pixiv/three-vrm** for VRM avatar support
- **Socket.IO** for real-time networking
- **OMI Audio Protocol** for 3D surround sound and environmental acoustics

## Browser Requirements

- **WebXR**: Chrome 79+, Edge 79+, Firefox with WebXR enabled
- **VRM Avatars**: Modern browsers with WebGL 2.0 support
- **Screen Sharing**: Chrome 72+, Firefox 66+, Safari 13+
- **File Upload**: Modern browsers with File API support
- **Audio Context**: For OMI_audio protocol support

## Room System

Each room gets a unique ID and URL. Users can:
- Join existing rooms via URL parameters
- Create new rooms automatically
- See other users as colored avatars
- Claim seats by clicking on them
- Watch the host's shared screen

## WebXR Features

- **VR Mode**: Full 6DOF tracking with hand controllers
- **AR Mode**: Overlay the theatre in your real environment  
- **Fallback**: Desktop/mobile controls when XR unavailable
- **Cross-platform**: Works on Quest, PC VR, AR phones

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test in both desktop and WebXR modes
5. Submit a pull request

## License

This project is licensed under a custom license that allows free non-commercial use while restricting commercial use to AltonTech, Inc. See the [LICENSE](LICENSE) file for details.

- ✅ **Non-commercial use**: Personal projects, education, research, open source contributions
- ❌ **Commercial use**: Only permitted by AltonTech, Inc. or with explicit written permission
- 📧 **Commercial licensing**: Contact jesse@alton.tech

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. By contributing, you agree that your contributions will be licensed under the same license as the project.

## About AltonTech

[AltonTech, Inc.](https://altontech.com) specializes in AI enablement, product development, and immersive technologies. Founded by Jesse Alton, we focus on creating innovative solutions for the open metaverse.

## Deployment

This project is designed to be deployed on platforms like Vercel, Netlify, or similar. The build process creates static files that can be served from any modern web hosting platform.
