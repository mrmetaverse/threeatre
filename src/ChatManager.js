export class ChatManager {
    constructor(networkManager, scene) {
        this.networkManager = networkManager;
        this.scene = scene;
        this.isVoiceChatEnabled = false;
        this.localStream = null;
        this.peerConnections = new Map();
        this.voiceUsers = new Map();
        this.chatVisible = false;
        
        this.init();
    }
    
    init() {
        this.createChatUI();
        this.setupEventListeners();
        this.setupVoiceChat();
    }
    
    createChatUI() {
        // Create chat container
        const chatContainer = document.createElement('div');
        chatContainer.id = 'chat-container';
        chatContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 320px;
            height: 200px;
            background: rgba(0, 0, 0, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            backdrop-filter: blur(20px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            display: flex;
            flex-direction: column;
            transform: translateY(100%);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 200;
        `;
        
        // Chat header
        const chatHeader = document.createElement('div');
        chatHeader.style.cssText = `
            padding: 12px 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            color: #00ffff;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        chatHeader.innerHTML = `
            💬 Theatre Chat
            <div>
                <button id="voice-toggle" style="background: none; border: 1px solid rgba(0, 255, 255, 0.3); color: #00ffff; padding: 4px 8px; border-radius: 6px; cursor: pointer; margin-right: 8px;">🎤</button>
                <button id="chat-close" style="background: none; border: none; color: #ff6666; cursor: pointer; font-size: 16px;">×</button>
            </div>
        `;
        
        // Chat messages area
        const chatMessages = document.createElement('div');
        chatMessages.id = 'chat-messages';
        chatMessages.style.cssText = `
            flex: 1;
            padding: 12px;
            overflow-y: auto;
            font-size: 13px;
            color: #e0e0e0;
            scrollbar-width: thin;
            scrollbar-color: rgba(0, 255, 255, 0.3) transparent;
        `;
        
        // Chat input area
        const chatInputArea = document.createElement('div');
        chatInputArea.style.cssText = `
            padding: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            gap: 8px;
        `;
        
        const chatInput = document.createElement('input');
        chatInput.id = 'chat-input';
        chatInput.type = 'text';
        chatInput.placeholder = 'Type a message...';
        chatInput.style.cssText = `
            flex: 1;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            padding: 8px 12px;
            color: #fff;
            font-size: 13px;
            outline: none;
        `;
        
        const sendButton = document.createElement('button');
        sendButton.id = 'chat-send';
        sendButton.textContent = '→';
        sendButton.style.cssText = `
            background: rgba(0, 255, 255, 0.2);
            border: 1px solid rgba(0, 255, 255, 0.3);
            border-radius: 8px;
            color: #00ffff;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
        `;
        
        chatInputArea.appendChild(chatInput);
        chatInputArea.appendChild(sendButton);
        
        chatContainer.appendChild(chatHeader);
        chatContainer.appendChild(chatMessages);
        chatContainer.appendChild(chatInputArea);
        
        // Chat toggle button
        const chatToggle = document.createElement('button');
        chatToggle.id = 'chat-toggle';
        chatToggle.textContent = '💬';
        chatToggle.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            background: rgba(0, 255, 255, 0.2);
            border: 1px solid rgba(0, 255, 255, 0.3);
            border-radius: 50%;
            color: #00ffff;
            font-size: 20px;
            cursor: pointer;
            z-index: 201;
            transition: all 0.3s ease;
            backdrop-filter: blur(10px);
        `;
        
        document.body.appendChild(chatContainer);
        document.body.appendChild(chatToggle);
        
        // Add welcome message
        this.addSystemMessage('Welcome to Threeatre! Use voice or text to chat with others.');
    }
    
    setupEventListeners() {
        // Chat toggle
        document.getElementById('chat-toggle').addEventListener('click', () => {
            this.toggleChat();
        });
        
        // Chat close
        document.getElementById('chat-close').addEventListener('click', () => {
            this.hideChat();
        });
        
        // Send message
        document.getElementById('chat-send').addEventListener('click', () => {
            this.sendMessage();
        });
        
        // Enter key to send
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
        
        // Voice toggle
        document.getElementById('voice-toggle').addEventListener('click', () => {
            this.toggleVoiceChat();
        });
        
        // Network message handlers
        if (this.networkManager && this.networkManager.socket) {
            this.networkManager.socket.on('chat-message', (data) => {
                this.addMessage(data.userId, data.message, data.userName);
            });
            
            this.networkManager.socket.on('voice-offer', (data) => {
                this.handleVoiceOffer(data);
            });
            
            this.networkManager.socket.on('voice-answer', (data) => {
                this.handleVoiceAnswer(data);
            });
            
            this.networkManager.socket.on('voice-ice-candidate', (data) => {
                this.handleIceCandidate(data);
            });
        }
    }
    
    toggleChat() {
        const container = document.getElementById('chat-container');
        const toggle = document.getElementById('chat-toggle');
        
        this.chatVisible = !this.chatVisible;
        
        if (this.chatVisible) {
            container.style.transform = 'translateY(0)';
            toggle.style.opacity = '0.5';
        } else {
            container.style.transform = 'translateY(100%)';
            toggle.style.opacity = '1';
        }
    }
    
    hideChat() {
        this.chatVisible = false;
        document.getElementById('chat-container').style.transform = 'translateY(100%)';
        document.getElementById('chat-toggle').style.opacity = '1';
    }
    
    sendMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        
        if (!message) return;
        
        // Send to network
        if (this.networkManager && this.networkManager.socket) {
            this.networkManager.socket.emit('chat-message', {
                roomId: this.networkManager.roomId,
                message: message,
                userName: `User ${this.networkManager.userId.slice(-4)}`
            });
        }
        
        // Add to local chat
        this.addMessage(this.networkManager.userId, message, 'You', true);
        
        input.value = '';
    }
    
    addMessage(userId, message, userName = null, isLocal = false) {
        const messagesContainer = document.getElementById('chat-messages');
        
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            margin-bottom: 8px;
            padding: 6px 10px;
            border-radius: 8px;
            background: ${isLocal ? 'rgba(0, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)'};
            border-left: 3px solid ${isLocal ? '#00ffff' : '#4CAF50'};
        `;
        
        const displayName = userName || `User ${userId.slice(-4)}`;
        const timestamp = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        messageDiv.innerHTML = `
            <div style="font-size: 11px; opacity: 0.7; margin-bottom: 2px;">
                <span style="color: ${isLocal ? '#00ffff' : '#4CAF50'};">${displayName}</span>
                <span style="float: right;">${timestamp}</span>
            </div>
            <div>${this.escapeHtml(message)}</div>
        `;
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Limit message history
        while (messagesContainer.children.length > 50) {
            messagesContainer.removeChild(messagesContainer.firstChild);
        }
    }
    
    addSystemMessage(message) {
        const messagesContainer = document.getElementById('chat-messages');
        
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            margin-bottom: 8px;
            padding: 6px 10px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.02);
            border-left: 3px solid #666;
            font-style: italic;
            opacity: 0.8;
            font-size: 12px;
        `;
        
        messageDiv.textContent = message;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    async setupVoiceChat() {
        try {
            // Check if WebRTC is supported
            if (!window.RTCPeerConnection) {
                console.warn('WebRTC not supported');
                return;
            }
            
            console.log('Voice chat system initialized');
        } catch (error) {
            console.error('Error setting up voice chat:', error);
        }
    }
    
    async toggleVoiceChat() {
        const voiceButton = document.getElementById('voice-toggle');
        
        if (!this.isVoiceChatEnabled) {
            try {
                // Request microphone access
                this.localStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    } 
                });
                
                this.isVoiceChatEnabled = true;
                voiceButton.style.background = 'rgba(0, 255, 0, 0.3)';
                voiceButton.style.borderColor = 'rgba(0, 255, 0, 0.5)';
                voiceButton.textContent = '🎤';
                
                this.addSystemMessage('Voice chat enabled - you can now talk to others!');
                
                // Notify other users
                this.broadcastVoiceStatus(true);
                
            } catch (error) {
                console.error('Error accessing microphone:', error);
                this.addSystemMessage('Could not access microphone. Please check permissions.');
            }
        } else {
            // Disable voice chat
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }
            
            // Close all peer connections
            this.peerConnections.forEach(pc => pc.close());
            this.peerConnections.clear();
            
            this.isVoiceChatEnabled = false;
            voiceButton.style.background = 'rgba(255, 255, 255, 0.1)';
            voiceButton.style.borderColor = 'rgba(0, 255, 255, 0.3)';
            voiceButton.textContent = '🎤';
            
            this.addSystemMessage('Voice chat disabled');
            this.broadcastVoiceStatus(false);
        }
    }
    
    broadcastVoiceStatus(enabled) {
        if (this.networkManager && this.networkManager.socket) {
            this.networkManager.socket.emit('voice-status', {
                roomId: this.networkManager.roomId,
                enabled: enabled
            });
        }
    }
    
    async createPeerConnection(userId) {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        
        // Add local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }
        
        // Handle remote stream
        pc.ontrack = (event) => {
            const remoteStream = event.streams[0];
            this.handleRemoteStream(userId, remoteStream);
        };
        
        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.networkManager.socket.emit('voice-ice-candidate', {
                    roomId: this.networkManager.roomId,
                    targetUserId: userId,
                    candidate: event.candidate
                });
            }
        };
        
        this.peerConnections.set(userId, pc);
        return pc;
    }
    
    handleRemoteStream(userId, stream) {
        // Create 3D positional audio for the user
        if (!this.scene) return;
        
        const audio = document.createElement('audio');
        audio.srcObject = stream;
        audio.autoplay = true;
        
        // Find user avatar for positional audio
        const userAvatar = this.findUserAvatar(userId);
        if (userAvatar) {
            // Create Three.js positional audio
            const listener = this.scene.getObjectByName('audio-listener');
            if (listener) {
                const positionalAudio = new THREE.PositionalAudio(listener);
                positionalAudio.setMediaElementSource(audio);
                positionalAudio.setRefDistance(5);
                positionalAudio.setRolloffFactor(2);
                
                userAvatar.add(positionalAudio);
                
                this.voiceUsers.set(userId, {
                    audio: positionalAudio,
                    element: audio
                });
                
                console.log(`Voice chat connected with user ${userId}`);
            }
        }
    }
    
    findUserAvatar(userId) {
        // Find the user's avatar in the scene
        let foundAvatar = null;
        this.scene.traverse((child) => {
            if (child.userData && child.userData.userId === userId) {
                foundAvatar = child;
            }
        });
        return foundAvatar;
    }
    
    async handleVoiceOffer(data) {
        if (!this.isVoiceChatEnabled) return;
        
        const pc = await this.createPeerConnection(data.fromUserId);
        
        await pc.setRemoteDescription(data.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        this.networkManager.socket.emit('voice-answer', {
            roomId: this.networkManager.roomId,
            targetUserId: data.fromUserId,
            answer: answer
        });
    }
    
    async handleVoiceAnswer(data) {
        const pc = this.peerConnections.get(data.fromUserId);
        if (pc) {
            await pc.setRemoteDescription(data.answer);
        }
    }
    
    async handleIceCandidate(data) {
        const pc = this.peerConnections.get(data.fromUserId);
        if (pc) {
            await pc.addIceCandidate(data.candidate);
        }
    }
    
    async initiateVoiceCall(userId) {
        if (!this.isVoiceChatEnabled) return;
        
        const pc = await this.createPeerConnection(userId);
        
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        this.networkManager.socket.emit('voice-offer', {
            roomId: this.networkManager.roomId,
            targetUserId: userId,
            offer: offer
        });
    }
    
    showChat() {
        this.chatVisible = true;
        document.getElementById('chat-container').style.transform = 'translateY(0)';
        document.getElementById('chat-toggle').style.opacity = '0.5';
        
        // Focus input
        setTimeout(() => {
            document.getElementById('chat-input').focus();
        }, 300);
    }
    
    dispose() {
        // Clean up voice chat
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
        
        // Remove UI elements
        const chatContainer = document.getElementById('chat-container');
        const chatToggle = document.getElementById('chat-toggle');
        
        if (chatContainer) document.body.removeChild(chatContainer);
        if (chatToggle) document.body.removeChild(chatToggle);
    }
}
