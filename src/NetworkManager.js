import { io } from 'socket.io-client';

export class NetworkManager {
    constructor(app) {
        this.app = app;
        this.socket = null;
        this.userId = this.generateUserId();
        this.roomId = this.getRoomIdFromUrl() || 'public-session';
        this.isConnected = false;
        this.isHost = false;
        this.isSessionHost = false;
        this.sessionMode = 'public';
        this.lastPositionUpdate = 0;
        this.positionUpdateThrottle = 100;
        this.serverUrl = null;
        
        this.detectSessionMode();
        this.init();
    }
    
    init() {
        this.serverUrl = this.resolveServerUrl();
        
        this.socket = io(this.serverUrl, {
            path: '/socket.io/',
            transports: ['websocket', 'polling'],
            upgrade: true,
            rememberUpgrade: true,
            timeout: 20000,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000
        });
        
        this.setupEventListeners();
        this.updateUrl();
        this.updateRoomIdDisplay();
        this.updateSessionStatus();
    }

    resolveServerUrl() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3001';
        }

        const envUrl = import.meta.env?.VITE_BACKEND_URL;
        if (envUrl) {
            return envUrl;
        }

        return window.location.origin;
    }
    
    setupEventListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server:', this.serverUrl);
            this.isConnected = true;
            this.joinRoom();
            this.updateConnectionStatus('Connected');
            
            const offlineMsg = document.querySelector('[data-offline-message]');
            if (offlineMsg) offlineMsg.remove();
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.isConnected = false;
            this.updateConnectionStatus('Disconnected');
        });
        
        this.socket.on('connect_error', (error) => {
            console.warn('Connection error:', error.message);
            this.updateConnectionStatus('Reconnecting...');
        });

        this.socket.io.on('reconnect', () => {
            console.log('Reconnected to server');
            this.isConnected = true;
            this.joinRoom();
            this.updateConnectionStatus('Connected');
        });

        this.socket.io.on('reconnect_failed', () => {
            console.log('All reconnect attempts failed, falling back to P2P');
            this.updateConnectionStatus('P2P Mode');
            this.enableP2PMode();
        });
        
        this.socket.on('room-joined', (data) => {
            console.log('Joined room:', data);
            this.isHost = data.isHost;
            this.updateUserCount(data.userCount);
            
            const localUserData = {
                id: this.userId,
                name: `User ${this.userId.slice(-4)}`,
                color: this.generateUserColor(),
                position: { x: 0, y: 1.6, z: 15 }
            };
            
            this.addRemoteUser(localUserData);
            
            if (data.users) {
                data.users.forEach(user => {
                    if (user.id !== this.userId) {
                        this.addRemoteUser(user);
                    }
                });
            }

            if (data.screenSharing && data.streamHost && data.streamHost !== this.userId) {
                console.log('Room has active stream from:', data.streamHost);
            }
        });
        
        this.socket.on('user-joined', (userData) => {
            console.log('User joined:', userData);
            this.addRemoteUser(userData);
            this.updateUserCount();
        });
        
        this.socket.on('user-left', (userId) => {
            console.log('User left:', userId);
            this.removeRemoteUser(userId);
            this.updateUserCount();
        });
        
        this.socket.on('user-position-update', (data) => {
            this.updateRemoteUserPosition(data.userId, data.position);
        });
        
        this.socket.on('seat-assigned', (data) => {
            console.log('Seat assigned:', data);
            const result = this.app.theatre.assignSeat(data.userId, data.seatIndex);
            if (data.userId === this.userId) {
                if (!result.success) {
                    console.error('Failed to assign your seat:', result.reason);
                }
            }
        });
        
        this.socket.on('seat-request-denied', (data) => {
            console.log('Seat request denied:', data.reason);
            this.app.showMessage(`Cannot sit there: ${data.reason}`, 'error');
        });
        
        this.socket.on('host-changed', (hostId) => {
            this.updateHostStatus(hostId);
        });
        
        this.socket.on('screen-share-started', (data) => {
            console.log('Screen share started by:', data.hostId);
        });
        
        this.socket.on('screen-share-stopped', () => {
            console.log('Screen share stopped');
            if (!this.isHost) {
                this.app.theatre.stopHostStream();
            }
        });
        
        this.socket.on('user-count-update', (count) => {
            this.updateUserCount(count);
        });
        
        this.socket.on('avatar-changed', (data) => {
            console.log('User avatar changed:', data.userId);
        });
    }
    
    joinRoom() {
        if (this.socket && this.isConnected) {
            const userData = {
                id: this.userId,
                name: `User ${this.userId.slice(-4)}`,
                color: this.generateUserColor(),
                position: { x: 0, y: 1.6, z: 15 }
            };
            
            this.socket.emit('join-room', {
                roomId: this.roomId,
                userData: userData
            });
        }
    }
    
    updatePosition(position) {
        const now = Date.now();
        if (now - this.lastPositionUpdate > this.positionUpdateThrottle && this.socket && this.isConnected) {
            this.socket.emit('position-update', {
                roomId: this.roomId,
                position: { x: position.x, y: position.y, z: position.z }
            });
            this.lastPositionUpdate = now;
        }
    }
    
    requestSeat(seatIndex) {
        if (this.socket && this.isConnected) {
            this.socket.emit('request-seat', {
                roomId: this.roomId,
                seatIndex: seatIndex
            });
        }
    }
    
    leaveSeat() {
        if (this.socket && this.isConnected) {
            this.socket.emit('leave-seat', {
                roomId: this.roomId
            });
        }
    }
    
    requestHost() {
        if (this.socket && this.isConnected) {
            this.socket.emit('request-host', {
                roomId: this.roomId
            });
        }
    }
    
    startScreenShare() {
        if (this.socket && this.isConnected && this.isHost) {
            this.socket.emit('start-screen-share', {
                roomId: this.roomId
            });
        }
    }
    
    stopScreenShare() {
        if (this.socket && this.isConnected && this.isHost) {
            this.socket.emit('stop-screen-share', {
                roomId: this.roomId
            });
        }
    }
    
    notifyAvatarChange(userId) {
        if (this.socket && this.isConnected) {
            this.socket.emit('avatar-changed', {
                roomId: this.roomId,
                userId: userId
            });
        }
    }
    
    async addRemoteUser(userData) {
        if (!this.app.theatre.users.has(userData.id)) {
            try {
                await this.app.theatre.addUser(userData.id, userData);
                if (userData.position) {
                    this.app.theatre.updateUserPosition(userData.id, userData.position);
                }
            } catch (error) {
                console.error('Failed to add remote user:', error);
            }
        }
    }
    
    removeRemoteUser(userId) {
        this.app.theatre.removeUser(userId);
    }
    
    updateRemoteUserPosition(userId, position) {
        this.app.theatre.updateUserPosition(userId, position);
    }
    
    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.style.color = status === 'Connected' ? '#4CAF50' : '#f44336';
        }
    }
    
    updateUserCount(count) {
        const userCountElement = document.getElementById('user-count');
        if (userCountElement) {
            if (count !== undefined) {
                userCountElement.textContent = count;
            } else {
                userCountElement.textContent = this.app.theatre.users.size + 1;
            }
        }
    }
    
    updateHostStatus(hostId) {
        const hostStatusElement = document.getElementById('host-status');
        if (hostStatusElement) {
            if (hostId === this.userId) {
                hostStatusElement.textContent = 'You';
                this.isHost = true;
            } else {
                hostStatusElement.textContent = hostId ? `User ${hostId.slice(-4)}` : 'None';
                this.isHost = false;
            }
        }
    }
    
    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }
    
    generateRoomId() {
        return 'room_' + Math.random().toString(36).substr(2, 9);
    }
    
    generateUserColor() {
        const colors = [
            0x4CAF50, 0x2196F3, 0xFF9800, 0x9C27B0, 0xF44336,
            0x00BCD4, 0x8BC34A, 0xFF5722, 0x3F51B5, 0xE91E63
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    getRoomIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('room');
    }
    
    updateUrl() {
        const url = new URL(window.location);
        url.searchParams.set('room', this.roomId);
        window.history.replaceState({}, '', url);
    }
    
    updateRoomIdDisplay() {
        const roomIdElement = document.getElementById('room-id');
        if (roomIdElement) {
            roomIdElement.textContent = this.roomId.replace('room_', '').toUpperCase();
        }
    }
    
    getRoomUrl() {
        const url = new URL(window.location);
        url.searchParams.set('room', this.roomId);
        return url.toString();
    }
    
    copyRoomUrl() {
        const roomUrl = this.getRoomUrl();
        navigator.clipboard.writeText(roomUrl).then(() => {
            console.log('Room URL copied to clipboard');
        }).catch(err => {
            console.error('Failed to copy room URL:', err);
        });
    }
    
    enableP2PMode() {
        import('./P2PSessionManager.js').then(({ P2PSessionManager }) => {
            this.p2pManager = new P2PSessionManager(this.app);
        });
        
        this.isConnected = false;
        this.isHost = true;
        
        const localUserData = {
            id: this.userId,
            name: `User ${this.userId.slice(-4)}`,
            color: this.generateUserColor(),
            position: { x: 0, y: 6, z: 24 }
        };
        
        if (this.app && this.app.theatre) {
            this.app.theatre.addUser(localUserData.id, localUserData);
        }
        
        this.updateUserCount(1);
        this.updateHostStatus(this.userId);
        this.updateRoomIdDisplay();
        this.showP2PMessage();
    }
    
    detectSessionMode() {
        if (window.location.hostname === 'localhost') {
            this.sessionMode = 'local';
        } else if (this.getRoomIdFromUrl() && this.getRoomIdFromUrl() !== 'public-session') {
            this.sessionMode = 'private';
        } else {
            this.sessionMode = 'public';
        }
    }
    
    updateSessionStatus() {
        const statusElement = document.getElementById('privacy-status');
        if (!statusElement) return;
        
        switch (this.sessionMode) {
            case 'local':
                statusElement.textContent = 'Local network session';
                statusElement.style.color = '#00ffff';
                break;
            case 'private':
                statusElement.textContent = 'Private room - invite only';
                statusElement.style.color = '#ffa500';
                break;
            case 'public':
                statusElement.textContent = this.isSessionHost ? 'Hosting public session' : 'Joined public session';
                statusElement.style.color = '#4CAF50';
                break;
        }
    }
    
    showP2PMessage() {
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            position: fixed;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 255, 0, 0.2);
            border: 1px solid #4CAF50;
            border-radius: 12px;
            padding: 16px 24px;
            color: #4CAF50;
            font-size: 14px;
            z-index: 1000;
            text-align: center;
            backdrop-filter: blur(10px);
        `;
        messageDiv.innerHTML = `
            P2P Session Mode<br>
            <span style="font-size: 12px; opacity: 0.8;">Share this URL for friends to join your session!</span><br>
            <span style="font-size: 11px; opacity: 0.6;">Direct peer-to-peer connection</span>
        `;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            if (document.body.contains(messageDiv)) {
                document.body.removeChild(messageDiv);
            }
        }, 5000);
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.isConnected = false;
        }
    }
}
