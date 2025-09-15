import { io } from 'socket.io-client';

export class NetworkManager {
    constructor(app) {
        this.app = app;
        this.socket = null;
        this.userId = this.generateUserId();
        this.roomId = this.getRoomIdFromUrl() || this.generateRoomId();
        this.isConnected = false;
        this.isHost = false;
        this.lastPositionUpdate = 0;
        this.positionUpdateThrottle = 100; // ms
        
        this.init();
    }
    
    init() {
        // Use environment-specific server URLs
        let serverUrl;
        
        if (window.location.hostname === 'localhost') {
            // Local development
            serverUrl = 'http://localhost:3001';
        } else {
            // Production - use Railway backend
            serverUrl = 'https://threeatre-backend-production.up.railway.app';
        }
        
        this.socket = io(serverUrl, {
            transports: ['websocket', 'polling'],
            upgrade: true,
            rememberUpgrade: true
        });
        
        this.setupEventListeners();
        this.updateUrl();
        this.updateRoomIdDisplay();
    }
    
    setupEventListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.isConnected = true;
            this.joinRoom();
            this.updateConnectionStatus('Connected');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.isConnected = false;
            this.updateConnectionStatus('Disconnected');
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.updateConnectionStatus('Offline Mode');
            this.enableOfflineMode();
        });
        
        this.socket.on('room-joined', (data) => {
            console.log('Joined room:', data);
            this.isHost = data.isHost;
            this.updateUserCount(data.userCount);
            
            // Add local user to the scene first
            const localUserData = {
                id: this.userId,
                name: `User ${this.userId.slice(-4)}`,
                color: this.generateUserColor(),
                position: { x: 0, y: 1.6, z: 15 }
            };
            
            this.addRemoteUser(localUserData);
            
            // Add existing users to the scene
            if (data.users) {
                data.users.forEach(user => {
                    if (user.id !== this.userId) {
                        this.addRemoteUser(user);
                    }
                });
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
                if (result.success) {
                    console.log('You were assigned seat:', data.seatIndex);
                } else {
                    console.error('Failed to assign your seat:', result.reason);
                }
            } else {
                console.log('User', data.userId, 'assigned to seat:', data.seatIndex);
            }
        });
        
        this.socket.on('seat-request-denied', (data) => {
            console.log('Seat request denied:', data.reason);
            alert(`Cannot sit there: ${data.reason}`);
        });
        
        this.socket.on('host-changed', (hostId) => {
            this.updateHostStatus(hostId);
        });
        
        this.socket.on('screen-share-started', (data) => {
            console.log('Screen share started by:', data.hostId);
            // In a real implementation, you'd handle WebRTC here
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
            // In a real implementation, you might want to reload the user's avatar
            // For now, just log the change
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
            console.log('Adding remote user:', userData);
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
                // Count local users if no count provided
                userCountElement.textContent = this.app.theatre.users.size + 1; // +1 for self
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
            0x4CAF50, // Green
            0x2196F3, // Blue  
            0xFF9800, // Orange
            0x9C27B0, // Purple
            0xF44336, // Red
            0x00BCD4, // Cyan
            0x8BC34A, // Light Green
            0xFF5722, // Deep Orange
            0x3F51B5, // Indigo
            0xE91E63  // Pink
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
            // You could show a toast notification here
        }).catch(err => {
            console.error('Failed to copy room URL:', err);
        });
    }
    
    enableOfflineMode() {
        console.log('Enabling offline mode - single player experience');
        
        // Simulate being connected for single player
        this.isConnected = false;
        this.isHost = true;
        
        // Add local user to scene
        const localUserData = {
            id: this.userId,
            name: `User ${this.userId.slice(-4)}`,
            color: this.generateUserColor(),
            position: { x: 0, y: 6, z: 24 }
        };
        
        // Add user to theatre
        if (this.app && this.app.theatre) {
            this.app.theatre.addUser(localUserData.id, localUserData);
        }
        
        // Update UI for offline mode
        this.updateUserCount(1);
        this.updateHostStatus(this.userId);
        this.updateRoomIdDisplay();
        
        // Show offline mode message
        this.showOfflineMessage();
    }
    
    showOfflineMessage() {
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            position: fixed;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255, 165, 0, 0.2);
            border: 1px solid #ffa500;
            border-radius: 12px;
            padding: 16px 24px;
            color: #ffa500;
            font-size: 14px;
            z-index: 1000;
            text-align: center;
            backdrop-filter: blur(10px);
        `;
        messageDiv.innerHTML = `
            🔌 Offline Mode<br>
            <span style="font-size: 12px; opacity: 0.8;">Enjoying single-player theatre experience</span>
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
