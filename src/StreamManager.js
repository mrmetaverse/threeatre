export class StreamManager {
    constructor(networkManager, theatre) {
        this.networkManager = networkManager;
        this.theatre = theatre;
        this.isHost = false;
        this.hostStream = null;
        this.peerConnections = new Map();
        this.pendingCandidates = new Map();

        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
        ];

        this.maxBitrate = 4_000_000;
        this.bitrateInterval = null;

        this.setupSignaling();
    }

    setupSignaling() {
        const socket = this.networkManager?.socket;
        if (!socket) return;

        socket.on('stream-offer', (data) => this.handleStreamOffer(data));
        socket.on('stream-answer', (data) => this.handleStreamAnswer(data));
        socket.on('stream-ice-candidate', (data) => this.handleIceCandidate(data));
        socket.on('stream-started', (data) => this.handleStreamStarted(data));
        socket.on('stream-stopped', () => this.handleStreamStopped());

        socket.on('user-joined', (userData) => {
            if (this.isHost && this.hostStream) {
                setTimeout(() => this.sendOfferToViewer(userData.id), 1500);
            }
        });

        socket.on('user-left', (userId) => {
            this.closePeerConnection(userId);
        });
    }

    async startHosting() {
        try {
            try {
                this.hostStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        cursor: 'always',
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        frameRate: { ideal: 30 }
                    },
                    audio: true,
                    systemAudio: 'include'
                });
            } catch (e1) {
                this.hostStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });
            }

            const vt = this.hostStream.getVideoTracks()[0];
            if (vt) {
                vt.contentHint = 'detail';
                const s = vt.getSettings();
                console.log('Capture:', s.width, 'x', s.height, '@', s.frameRate, 'fps');
            }

            const at = this.hostStream.getAudioTracks()[0];
            if (at) {
                at.contentHint = 'music';
                console.log('Audio track:', at.label);
            } else {
                console.warn('No audio captured - check browser audio sharing option');
            }

            this.isHost = true;
            this.theatre.setHostStream(this.hostStream, true);

            vt?.addEventListener('ended', () => this.stopHosting());

            const socket = this.networkManager?.socket;
            if (socket && this.networkManager.isConnected) {
                socket.emit('start-stream', {
                    roomId: this.networkManager.roomId,
                    hostId: this.networkManager.userId
                });
            }

            return true;
        } catch (error) {
            console.error('Failed to start hosting:', error);
            return false;
        }
    }

    stopHosting() {
        if (this.hostStream) {
            this.hostStream.getTracks().forEach(t => t.stop());
            this.hostStream = null;
        }

        if (this.bitrateInterval) {
            clearInterval(this.bitrateInterval);
            this.bitrateInterval = null;
        }

        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
        this.pendingCandidates.clear();

        this.isHost = false;
        this.theatre.stopHostStream();

        const socket = this.networkManager?.socket;
        if (socket && this.networkManager.isConnected) {
            socket.emit('stop-stream', { roomId: this.networkManager.roomId });
        }
    }

    async sendOfferToViewer(viewerId) {
        if (!this.isHost || !this.hostStream) return;

        try {
            const pc = this.createPeerConnection(viewerId);

            this.hostStream.getTracks().forEach(track => {
                const sender = pc.addTrack(track, this.hostStream);
                if (track.kind === 'video') {
                    this.configureVideoSender(sender);
                }
            });

            const offer = await pc.createOffer({ iceRestart: false });
            await pc.setLocalDescription(offer);

            this.networkManager?.socket?.emit('stream-offer', {
                roomId: this.networkManager.roomId,
                targetUserId: viewerId,
                offer: { type: offer.type, sdp: offer.sdp }
            });
        } catch (error) {
            console.error('Offer failed for', viewerId, error);
        }
    }

    async iceRestart(userId) {
        const pc = this.peerConnections.get(userId);
        if (!pc || !this.isHost || !this.hostStream) return;

        try {
            console.log('ICE restart for', userId);
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);

            this.networkManager?.socket?.emit('stream-offer', {
                roomId: this.networkManager.roomId,
                targetUserId: userId,
                offer: { type: offer.type, sdp: offer.sdp }
            });
        } catch (e) {
            console.warn('ICE restart failed, doing full reconnect for', userId);
            this.closePeerConnection(userId);
            setTimeout(() => this.sendOfferToViewer(userId), 1000);
        }
    }

    async configureVideoSender(sender) {
        if (!sender || sender.track?.kind !== 'video') return;

        await new Promise(r => setTimeout(r, 800));

        try {
            const params = sender.getParameters();
            if (!params.encodings?.length) params.encodings = [{}];

            params.encodings[0].maxBitrate = this.maxBitrate;
            params.encodings[0].maxFramerate = 30;
            params.encodings[0].networkPriority = 'high';
            params.encodings[0].priority = 'high';
            params.degradationPreference = 'balanced';

            await sender.setParameters(params);
            console.log('Sender configured:', this.maxBitrate / 1e6, 'Mbps max');
        } catch (e) {
            console.warn('Could not set sender params:', e.message);
        }
    }

    async handleStreamOffer(data) {
        const { fromUserId, offer } = data;

        try {
            let pc = this.peerConnections.get(fromUserId);
            const isRenegotiation = pc && pc.signalingState !== 'closed';

            if (!isRenegotiation) {
                pc = this.createPeerConnection(fromUserId);
            }

            pc.ontrack = (event) => {
                const remoteStream = event.streams[0];
                if (remoteStream) {
                    this.theatre.setHostStream(remoteStream, false);
                    console.log('Receiving stream via WebRTC');
                }
            };

            await pc.setRemoteDescription(new RTCSessionDescription(offer));

            if (this.pendingCandidates.has(fromUserId)) {
                for (const c of this.pendingCandidates.get(fromUserId)) {
                    await pc.addIceCandidate(new RTCIceCandidate(c));
                }
                this.pendingCandidates.delete(fromUserId);
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.networkManager?.socket?.emit('stream-answer', {
                roomId: this.networkManager.roomId,
                targetUserId: fromUserId,
                answer: { type: answer.type, sdp: answer.sdp }
            });
        } catch (error) {
            console.error('Stream offer handling failed:', error);
        }
    }

    async handleStreamAnswer(data) {
        const { fromUserId, answer } = data;
        const pc = this.peerConnections.get(fromUserId);

        if (pc && pc.signalingState === 'have-local-offer') {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));

                if (this.pendingCandidates.has(fromUserId)) {
                    for (const c of this.pendingCandidates.get(fromUserId)) {
                        await pc.addIceCandidate(new RTCIceCandidate(c));
                    }
                    this.pendingCandidates.delete(fromUserId);
                }
            } catch (error) {
                console.error('Stream answer failed:', error);
            }
        }
    }

    async handleIceCandidate(data) {
        const { fromUserId, candidate } = data;
        const pc = this.peerConnections.get(fromUserId);

        if (pc && pc.remoteDescription) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.warn('ICE candidate failed:', e.message);
            }
        } else {
            if (!this.pendingCandidates.has(fromUserId)) {
                this.pendingCandidates.set(fromUserId, []);
            }
            this.pendingCandidates.get(fromUserId).push(candidate);
        }
    }

    handleStreamStarted(data) {
        console.log('Stream started by host:', data.hostId);
    }

    handleStreamStopped() {
        if (!this.isHost) {
            this.theatre.stopHostStream();
            this.peerConnections.forEach(pc => pc.close());
            this.peerConnections.clear();
            this.pendingCandidates.clear();
        }
    }

    createPeerConnection(userId) {
        if (this.peerConnections.has(userId)) {
            this.peerConnections.get(userId).close();
        }

        const pc = new RTCPeerConnection({
            iceServers: this.iceServers,
            iceCandidatePoolSize: 5,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            iceTransportPolicy: 'all'
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.networkManager?.socket?.emit('stream-ice-candidate', {
                    roomId: this.networkManager.roomId,
                    targetUserId: userId,
                    candidate: {
                        candidate: event.candidate.candidate,
                        sdpMid: event.candidate.sdpMid,
                        sdpMLineIndex: event.candidate.sdpMLineIndex
                    }
                });
            }
        };

        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            console.log(`ICE [${userId.slice(-4)}]: ${state}`);

            if (state === 'disconnected') {
                if (this.isHost) {
                    setTimeout(() => {
                        if (pc.iceConnectionState === 'disconnected') {
                            this.iceRestart(userId);
                        }
                    }, 3000);
                }
            }

            if (state === 'failed') {
                if (this.isHost) {
                    this.iceRestart(userId);
                }
            }
        };

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            if (state === 'connected') {
                console.log(`Stream live with ${userId.slice(-4)}`);
            }
            if (state === 'failed') {
                console.warn(`Peer ${userId.slice(-4)} connection failed`);
                this.closePeerConnection(userId);
                if (this.isHost && this.hostStream) {
                    setTimeout(() => this.sendOfferToViewer(userId), 2000);
                }
            }
        };

        this.peerConnections.set(userId, pc);
        return pc;
    }

    closePeerConnection(userId) {
        const pc = this.peerConnections.get(userId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(userId);
        }
        this.pendingCandidates.delete(userId);
    }

    dispose() {
        this.stopHosting();
    }
}
