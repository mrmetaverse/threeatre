export class ChatManager {
    constructor(networkManager, scene) {
        this.networkManager = networkManager;
        this.scene = scene;
        this.isVoiceChatEnabled = false;
        this.localStream = null;
        this.peerConnections = new Map();
        this.voiceUsers = new Map();
        this.isTyping = false;
        this.messageHistory = [];
        this.maxMessages = 100;
        this.fadeTimeout = null;
        this.userName = `Anon_${(this.networkManager?.userId || 'local').slice(-4)}`;

        this.init();
    }

    init() {
        this.createChatUI();
        this.createStyles();
        this.setupEventListeners();
        this.setupVoiceChat();
        this.addSystemMessage('Welcome to Threeatre. Press ENTER to chat.');
    }

    createStyles() {
        if (document.getElementById('chat-styles')) return;
        const style = document.createElement('style');
        style.id = 'chat-styles';
        style.textContent = `
            #game-chat { position:fixed; bottom:0; left:0; width:420px; max-width:45vw; z-index:300; pointer-events:none; font-family:'Consolas','Monaco','Courier New',monospace; }
            #game-chat * { pointer-events:auto; }
            #chat-log { max-height:220px; overflow-y:auto; padding:6px 10px; scrollbar-width:none; }
            #chat-log::-webkit-scrollbar { display:none; }
            #chat-log .msg { padding:2px 0; line-height:1.4; font-size:13px; text-shadow:1px 1px 2px rgba(0,0,0,0.9); transition:opacity 0.5s; }
            #chat-log .msg.faded { opacity:0.35; }
            #chat-input-row { display:none; padding:4px 8px 8px; }
            #chat-input-row.active { display:flex; gap:6px; align-items:center; }
            #chat-input-field { flex:1; background:rgba(0,0,0,0.7); border:1px solid rgba(255,255,255,0.25); border-radius:3px; padding:5px 8px; color:#fff; font-family:inherit; font-size:13px; outline:none; }
            #chat-input-field:focus { border-color:rgba(255,255,100,0.6); }
            #chat-input-label { color:#aaa; font-size:12px; white-space:nowrap; }
            #chat-hint { padding:2px 10px 6px; font-size:11px; color:rgba(255,255,255,0.3); }
            #chat-bg { position:absolute; bottom:0; left:0; width:100%; height:100%; background:linear-gradient(to top,rgba(0,0,0,0.55) 0%,rgba(0,0,0,0.3) 60%,transparent 100%); pointer-events:none; border-radius:0 8px 0 0; }
            #voice-btn { position:fixed; bottom:10px; left:430px; background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.2); border-radius:4px; color:#aaa; padding:4px 10px; font-size:12px; cursor:pointer; z-index:301; font-family:inherit; }
            #voice-btn:hover { border-color:rgba(255,255,255,0.5); color:#fff; }
            #voice-btn.active { color:#4f4; border-color:rgba(0,255,0,0.4); }
            @media (max-width:600px) { #game-chat { max-width:90vw; width:90vw; } #voice-btn { left:auto; right:10px; bottom:10px; } }
        `;
        document.head.appendChild(style);
    }

    createChatUI() {
        const existing = document.getElementById('chat-container');
        if (existing) existing.remove();
        const existingToggle = document.getElementById('chat-toggle');
        if (existingToggle) existingToggle.remove();

        const chat = document.createElement('div');
        chat.id = 'game-chat';
        chat.innerHTML = `
            <div id="chat-bg"></div>
            <div id="chat-log"></div>
            <div id="chat-input-row">
                <span id="chat-input-label">Say:</span>
                <input id="chat-input-field" type="text" maxlength="200" autocomplete="off" />
            </div>
            <div id="chat-hint">Press ENTER to chat</div>
        `;
        document.body.appendChild(chat);

        const voiceBtn = document.createElement('button');
        voiceBtn.id = 'voice-btn';
        voiceBtn.textContent = 'Voice Off';
        document.body.appendChild(voiceBtn);
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.isTyping) {
                    this.sendMessage();
                } else {
                    this.openInput();
                }
                return;
            }
            if (e.key === 'Escape' && this.isTyping) {
                e.preventDefault();
                this.closeInput();
                return;
            }
        });

        const input = document.getElementById('chat-input-field');
        input.addEventListener('blur', () => {
            setTimeout(() => this.closeInput(), 100);
        });

        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });
        input.addEventListener('keyup', (e) => {
            e.stopPropagation();
        });
        input.addEventListener('keypress', (e) => {
            e.stopPropagation();
        });

        document.getElementById('voice-btn').addEventListener('click', () => {
            this.toggleVoiceChat();
        });

        if (this.networkManager?.socket) {
            this.networkManager.socket.on('chat-message', (data) => {
                this.addMessage(data.message, data.userName || `Anon_${data.userId?.slice(-4) || '????'}`, '#6f6');
            });
            this.networkManager.socket.on('user-joined', (data) => {
                this.addSystemMessage(`${data.id?.slice(-4) || 'Someone'} entered the theatre.`);
            });
            this.networkManager.socket.on('user-left', (userId) => {
                this.addSystemMessage(`${userId?.slice(-4) || 'Someone'} left.`);
            });
            this.networkManager.socket.on('voice-offer', (data) => this.handleVoiceOffer(data));
            this.networkManager.socket.on('voice-answer', (data) => this.handleVoiceAnswer(data));
            this.networkManager.socket.on('voice-ice-candidate', (data) => this.handleIceCandidate(data));
        }
    }

    openInput() {
        this.isTyping = true;
        const row = document.getElementById('chat-input-row');
        const hint = document.getElementById('chat-hint');
        const field = document.getElementById('chat-input-field');
        row.classList.add('active');
        hint.style.display = 'none';
        field.value = '';
        field.focus();
        this.unfadeAll();
    }

    closeInput() {
        this.isTyping = false;
        const row = document.getElementById('chat-input-row');
        const hint = document.getElementById('chat-hint');
        row.classList.remove('active');
        hint.style.display = '';
        document.getElementById('chat-input-field').blur();
        this.scheduleFade();
    }

    sendMessage() {
        const field = document.getElementById('chat-input-field');
        const text = field.value.trim();
        this.closeInput();
        if (!text) return;

        if (text.startsWith('/name ')) {
            const newName = text.slice(6).trim().slice(0, 20);
            if (newName) {
                this.userName = newName;
                this.addSystemMessage(`Name changed to ${newName}`);
            }
            return;
        }

        this.addMessage(text, this.userName, '#ff0');

        if (this.networkManager?.socket) {
            this.networkManager.socket.emit('chat-message', {
                roomId: this.networkManager.roomId,
                message: text,
                userName: this.userName
            });
        }
    }

    addMessage(text, sender, senderColor = '#ccc') {
        const log = document.getElementById('chat-log');
        const div = document.createElement('div');
        div.className = 'msg';
        div.innerHTML = `<span style="color:${senderColor};font-weight:bold;">[${this.escapeHtml(sender)}]</span> ${this.escapeHtml(text)}`;
        log.appendChild(div);
        this.trimLog(log);
        log.scrollTop = log.scrollHeight;
        this.unfadeAll();
        this.scheduleFade();
    }

    addSystemMessage(text) {
        const log = document.getElementById('chat-log');
        const div = document.createElement('div');
        div.className = 'msg';
        div.innerHTML = `<span style="color:#888;font-style:italic;">${this.escapeHtml(text)}</span>`;
        log.appendChild(div);
        this.trimLog(log);
        log.scrollTop = log.scrollHeight;
        this.unfadeAll();
        this.scheduleFade();
    }

    trimLog(log) {
        while (log.children.length > this.maxMessages) {
            log.removeChild(log.firstChild);
        }
    }

    unfadeAll() {
        if (this.fadeTimeout) clearTimeout(this.fadeTimeout);
        document.querySelectorAll('#chat-log .msg').forEach(m => m.classList.remove('faded'));
    }

    scheduleFade() {
        if (this.fadeTimeout) clearTimeout(this.fadeTimeout);
        this.fadeTimeout = setTimeout(() => {
            if (this.isTyping) return;
            document.querySelectorAll('#chat-log .msg').forEach(m => m.classList.add('faded'));
        }, 8000);
    }

    escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    // --- Voice chat (kept from original) ---

    async setupVoiceChat() {
        if (!window.RTCPeerConnection) console.warn('WebRTC not supported');
    }

    async toggleVoiceChat() {
        const btn = document.getElementById('voice-btn');
        if (!this.isVoiceChatEnabled) {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
                this.isVoiceChatEnabled = true;
                btn.textContent = 'Voice ON';
                btn.classList.add('active');
                this.addSystemMessage('Voice chat enabled.');
                this.broadcastVoiceStatus(true);
            } catch (err) {
                this.addSystemMessage('Mic access denied.');
            }
        } else {
            if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; }
            this.peerConnections.forEach(pc => pc.close());
            this.peerConnections.clear();
            this.isVoiceChatEnabled = false;
            btn.textContent = 'Voice Off';
            btn.classList.remove('active');
            this.addSystemMessage('Voice chat disabled.');
            this.broadcastVoiceStatus(false);
        }
    }

    broadcastVoiceStatus(enabled) {
        this.networkManager?.socket?.emit('voice-status', { roomId: this.networkManager.roomId, enabled });
    }

    async createPeerConnection(userId) {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
        if (this.localStream) this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream));
        pc.ontrack = (e) => this.handleRemoteStream(userId, e.streams[0]);
        pc.onicecandidate = (e) => { if (e.candidate) this.networkManager.socket.emit('voice-ice-candidate', { roomId: this.networkManager.roomId, targetUserId: userId, candidate: e.candidate }); };
        this.peerConnections.set(userId, pc);
        return pc;
    }

    handleRemoteStream(userId, stream) {
        const audio = document.createElement('audio');
        audio.srcObject = stream;
        audio.autoplay = true;
        this.voiceUsers.set(userId, { element: audio });
    }

    async handleVoiceOffer(data) {
        if (!this.isVoiceChatEnabled) return;
        const pc = await this.createPeerConnection(data.fromUserId);
        await pc.setRemoteDescription(data.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.networkManager.socket.emit('voice-answer', { roomId: this.networkManager.roomId, targetUserId: data.fromUserId, answer });
    }

    async handleVoiceAnswer(data) {
        const pc = this.peerConnections.get(data.fromUserId);
        if (pc) await pc.setRemoteDescription(data.answer);
    }

    async handleIceCandidate(data) {
        const pc = this.peerConnections.get(data.fromUserId);
        if (pc) await pc.addIceCandidate(data.candidate);
    }

    async initiateVoiceCall(userId) {
        if (!this.isVoiceChatEnabled) return;
        const pc = await this.createPeerConnection(userId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.networkManager.socket.emit('voice-offer', { roomId: this.networkManager.roomId, targetUserId: userId, offer });
    }

    showChat() {
        this.openInput();
    }

    dispose() {
        if (this.localStream) this.localStream.getTracks().forEach(t => t.stop());
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
        const el = document.getElementById('game-chat');
        if (el) el.remove();
        const btn = document.getElementById('voice-btn');
        if (btn) btn.remove();
        const styles = document.getElementById('chat-styles');
        if (styles) styles.remove();
    }
}
