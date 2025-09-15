export class P2PSessionManager {
    constructor(app) {
        this.app = app;
        this.isHost = false;
        this.peers = new Map();
        this.dataChannels = new Map();
        this.sessionId = this.getSessionId();
        this.broadcastChannel = null;
        
        this.init();
    }
    
    init() {
        // Use BroadcastChannel for same-origin session discovery
        if ('BroadcastChannel' in window) {
            this.broadcastChannel = new BroadcastChannel('threeatre-session');
            this.setupBroadcastChannel();
        }
        
        // Check if we should become the session host
        this.checkSessionHost();
    }
    
    setupBroadcastChannel() {
        this.broadcastChannel.addEventListener('message', (event) => {
            const { type, data } = event.data;
            
            switch (type) {
                case 'session-announcement':
                    this.handleSessionAnnouncement(data);
                    break;
                case 'join-request':
                    this.handleJoinRequest(data);
                    break;
                case 'user-update':
                    this.handleUserUpdate(data);
                    break;
            }
        });
    }
    
    checkSessionHost() {
        // Announce our presence and check for existing host
        this.broadcastChannel?.postMessage({
            type: 'host-check',
            data: { userId: this.app.networkManager.userId }
        });
        
        // If no response in 2 seconds, become host
        setTimeout(() => {
            if (!this.isHost && this.peers.size === 0) {
                this.becomeSessionHost();
            }
        }, 2000);
    }
    
    becomeSessionHost() {
        this.isHost = true;
        this.app.networkManager.isSessionHost = true;
        
        console.log('🎭 Became session host for public theatre');
        
        // Announce we're hosting
        this.broadcastChannel?.postMessage({
            type: 'session-announcement',
            data: {
                hostId: this.app.networkManager.userId,
                sessionId: this.sessionId,
                timestamp: Date.now()
            }
        });
        
        // Update UI
        this.app.updatePrivacyUI();
        this.showHostMessage();
    }
    
    showHostMessage() {
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
            🎭 You are hosting the public session!<br>
            <span style="font-size: 12px; opacity: 0.8;">Others can join by visiting the same URL</span>
        `;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            if (document.body.contains(messageDiv)) {
                document.body.removeChild(messageDiv);
            }
        }, 4000);
    }
    
    handleSessionAnnouncement(data) {
        if (data.hostId !== this.app.networkManager.userId) {
            console.log('Found existing session host:', data.hostId);
            this.joinExistingSession(data);
        }
    }
    
    joinExistingSession(sessionData) {
        this.isHost = false;
        this.app.networkManager.isSessionHost = false;
        
        console.log('🎭 Joining existing public session');
        
        // Request to join
        this.broadcastChannel?.postMessage({
            type: 'join-request',
            data: {
                userId: this.app.networkManager.userId,
                userName: `User ${this.app.networkManager.userId.slice(-4)}`,
                timestamp: Date.now()
            }
        });
        
        // Update UI
        this.app.updatePrivacyUI();
        this.showJoinMessage();
    }
    
    showJoinMessage() {
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            position: fixed;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 255, 255, 0.2);
            border: 1px solid #00ffff;
            border-radius: 12px;
            padding: 16px 24px;
            color: #00ffff;
            font-size: 14px;
            z-index: 1000;
            text-align: center;
            backdrop-filter: blur(10px);
        `;
        messageDiv.innerHTML = `
            🎭 Joined public session!<br>
            <span style="font-size: 12px; opacity: 0.8;">You can now interact with other users</span>
        `;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            if (document.body.contains(messageDiv)) {
                document.body.removeChild(messageDiv);
            }
        }, 3000);
    }
    
    handleJoinRequest(data) {
        if (this.isHost) {
            console.log('User requesting to join session:', data.userId);
            
            // Accept join request
            this.broadcastChannel?.postMessage({
                type: 'join-accepted',
                data: {
                    userId: data.userId,
                    hostId: this.app.networkManager.userId
                }
            });
        }
    }
    
    handleUserUpdate(data) {
        // Handle user position updates, etc.
        if (data.type === 'position' && this.app.theatre) {
            this.app.theatre.updateUserPosition(data.userId, data.position);
        }
    }
    
    broadcastUserUpdate(type, data) {
        this.broadcastChannel?.postMessage({
            type: 'user-update',
            data: {
                type: type,
                userId: this.app.networkManager.userId,
                ...data,
                timestamp: Date.now()
            }
        });
    }
    
    getSessionId() {
        // Use URL or generate session ID
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('session') || 'public-session';
    }
    
    dispose() {
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
        }
        
        this.peers.forEach(peer => peer.close());
        this.peers.clear();
    }
}
