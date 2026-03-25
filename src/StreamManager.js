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
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ];

        this.targetBitrate = 6_000_000;
        this.maxBitrate = 10_000_000;
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
                setTimeout(() => this.sendOfferToViewer(userData.id), 1000);
            }
        });

        socket.on('user-left', (userId) => {
            this.closePeerConnection(userId);
        });
    }

    async startHosting() {
        try {
            this.hostStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always',
                    displaySurface: 'monitor',
                    width: { ideal: 1920, max: 2560 },
                    height: { ideal: 1080, max: 1440 },
                    frameRate: { ideal: 30, max: 60 }
                },
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 48000,
                    channelCount: 2
                },
                preferCurrentTab: false,
                selfBrowserSurface: 'exclude',
                systemAudio: 'include'
            });

            const videoTrack = this.hostStream.getVideoTracks()[0];
            if (videoTrack) {
                const capabilities = videoTrack.getCapabilities?.();
                const settings = videoTrack.getSettings();
                console.log('Capture resolution:', settings.width, 'x', settings.height, '@', settings.frameRate, 'fps');

                if (capabilities?.width?.max >= 1920) {
                    try {
                        await videoTrack.applyConstraints({
                            width: { ideal: 1920 },
                            height: { ideal: 1080 },
                            frameRate: { ideal: 30, max: 60 }
                        });
                    } catch (e) {
                        console.warn('Could not apply higher constraints:', e);
                    }
                }

                videoTrack.contentHint = 'detail';
            }

            const audioTrack = this.hostStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.contentHint = 'music';
            }

            this.isHost = true;
            this.theatre.setHostStream(this.hostStream, true);

            videoTrack?.addEventListener('ended', () => {
                this.stopHosting();
            });

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
            this.hostStream.getTracks().forEach(track => track.stop());
            this.hostStream = null;
        }

        if (this.bitrateInterval) {
            clearInterval(this.bitrateInterval);
            this.bitrateInterval = null;
        }

        this.peerConnections.forEach((pc) => pc.close());
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

            const offer = await pc.createOffer();
            const boostedSdp = this.boostSdpBitrate(offer.sdp);
            await pc.setLocalDescription({ type: offer.type, sdp: boostedSdp });

            const socket = this.networkManager?.socket;
            if (socket) {
                socket.emit('stream-offer', {
                    roomId: this.networkManager.roomId,
                    targetUserId: viewerId,
                    offer: { type: offer.type, sdp: boostedSdp }
                });
            }
        } catch (error) {
            console.error('Failed to create offer for viewer:', viewerId, error);
        }
    }

    async configureVideoSender(sender) {
        if (!sender || sender.track?.kind !== 'video') return;

        await new Promise(r => setTimeout(r, 500));

        try {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
                params.encodings = [{}];
            }

            params.encodings[0].maxBitrate = this.maxBitrate;
            params.encodings[0].maxFramerate = 60;
            params.encodings[0].networkPriority = 'high';
            params.encodings[0].priority = 'high';

            if (params.encodings[0].scaleResolutionDownBy !== undefined) {
                params.encodings[0].scaleResolutionDownBy = 1.0;
            }

            params.degradationPreference = 'maintain-resolution';

            await sender.setParameters(params);
            console.log('Video sender configured: maxBitrate', this.maxBitrate / 1e6, 'Mbps');
        } catch (e) {
            console.warn('Could not configure sender params:', e);
        }
    }

    boostSdpBitrate(sdp) {
        const bitrateKbps = Math.floor(this.maxBitrate / 1000);

        sdp = sdp.replace(/b=AS:\d+/g, `b=AS:${bitrateKbps}`);

        if (!sdp.includes('b=AS:')) {
            sdp = sdp.replace(/(m=video.*\r\n)/g, `$1b=AS:${bitrateKbps}\r\n`);
        }

        sdp = sdp.replace(/b=TIAS:\d+/g, `b=TIAS:${this.maxBitrate}`);
        if (!sdp.includes('b=TIAS:')) {
            sdp = sdp.replace(/(m=video.*\r\n)/g, `$1b=TIAS:${this.maxBitrate}\r\n`);
        }

        return sdp;
    }

    async handleStreamOffer(data) {
        const { fromUserId, offer } = data;

        try {
            const pc = this.createPeerConnection(fromUserId);

            pc.ontrack = (event) => {
                const remoteStream = event.streams[0];
                if (remoteStream) {
                    this.theatre.setHostStream(remoteStream, false);
                    console.log('Receiving host stream via WebRTC');
                }
            };

            await pc.setRemoteDescription(new RTCSessionDescription(offer));

            if (this.pendingCandidates.has(fromUserId)) {
                for (const candidate of this.pendingCandidates.get(fromUserId)) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                this.pendingCandidates.delete(fromUserId);
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            const socket = this.networkManager?.socket;
            if (socket) {
                socket.emit('stream-answer', {
                    roomId: this.networkManager.roomId,
                    targetUserId: fromUserId,
                    answer: { type: answer.type, sdp: answer.sdp }
                });
            }
        } catch (error) {
            console.error('Failed to handle stream offer:', error);
        }
    }

    async handleStreamAnswer(data) {
        const { fromUserId, answer } = data;
        const pc = this.peerConnections.get(fromUserId);

        if (pc && pc.signalingState === 'have-local-offer') {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));

                if (this.pendingCandidates.has(fromUserId)) {
                    for (const candidate of this.pendingCandidates.get(fromUserId)) {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    }
                    this.pendingCandidates.delete(fromUserId);
                }

                this.startBitrateMonitoring(pc, fromUserId);
            } catch (error) {
                console.error('Failed to handle stream answer:', error);
            }
        }
    }

    startBitrateMonitoring(pc, userId) {
        if (this.bitrateInterval) clearInterval(this.bitrateInterval);

        let lastBytesSent = 0;
        let lastTimestamp = Date.now();

        this.bitrateInterval = setInterval(async () => {
            try {
                const stats = await pc.getStats();
                stats.forEach(report => {
                    if (report.type === 'outbound-rtp' && report.kind === 'video') {
                        const now = Date.now();
                        const elapsed = (now - lastTimestamp) / 1000;
                        if (elapsed > 0 && lastBytesSent > 0) {
                            const bitrate = ((report.bytesSent - lastBytesSent) * 8) / elapsed;
                            const mbps = (bitrate / 1e6).toFixed(2);
                            console.log(`Stream bitrate: ${mbps} Mbps | ${report.framesPerSecond || '?'} fps | ${report.frameWidth}x${report.frameHeight}`);
                        }
                        lastBytesSent = report.bytesSent;
                        lastTimestamp = now;
                    }
                });
            } catch (e) { /* stats unavailable */ }
        }, 5000);
    }

    async handleIceCandidate(data) {
        const { fromUserId, candidate } = data;
        const pc = this.peerConnections.get(fromUserId);

        if (pc && pc.remoteDescription) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error('Failed to add ICE candidate:', error);
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
            this.peerConnections.forEach((pc) => pc.close());
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
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                const socket = this.networkManager?.socket;
                if (socket) {
                    socket.emit('stream-ice-candidate', {
                        roomId: this.networkManager.roomId,
                        targetUserId: userId,
                        candidate: {
                            candidate: event.candidate.candidate,
                            sdpMid: event.candidate.sdpMid,
                            sdpMLineIndex: event.candidate.sdpMLineIndex
                        }
                    });
                }
            }
        };

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            if (state === 'failed') {
                console.warn(`Peer ${userId} failed, attempting reconnect...`);
                this.closePeerConnection(userId);
                if (this.isHost && this.hostStream) {
                    setTimeout(() => this.sendOfferToViewer(userId), 2000);
                }
            }
            if (state === 'disconnected') {
                setTimeout(() => {
                    if (pc.connectionState === 'disconnected') {
                        this.closePeerConnection(userId);
                    }
                }, 5000);
            }
            if (state === 'connected') {
                console.log(`Stream connected with ${userId}`);
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
