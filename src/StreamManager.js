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
            { urls: 'stun:stun3.l.google.com:19302' }
        ];

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
                    displaySurface: 'monitor'
                },
                audio: true
            });

            this.isHost = true;
            this.theatre.setHostStream(this.hostStream);

            this.hostStream.getVideoTracks()[0].addEventListener('ended', () => {
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

        this.peerConnections.forEach((pc, userId) => {
            pc.close();
        });
        this.peerConnections.clear();
        this.pendingCandidates.clear();

        this.isHost = false;
        this.theatre.stopHostStream();

        const socket = this.networkManager?.socket;
        if (socket && this.networkManager.isConnected) {
            socket.emit('stop-stream', {
                roomId: this.networkManager.roomId
            });
        }
    }

    async sendOfferToViewer(viewerId) {
        if (!this.isHost || !this.hostStream) return;

        try {
            const pc = this.createPeerConnection(viewerId);

            this.hostStream.getTracks().forEach(track => {
                pc.addTrack(track, this.hostStream);
            });

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const socket = this.networkManager?.socket;
            if (socket) {
                socket.emit('stream-offer', {
                    roomId: this.networkManager.roomId,
                    targetUserId: viewerId,
                    offer: { type: offer.type, sdp: offer.sdp }
                });
            }
        } catch (error) {
            console.error('Failed to create offer for viewer:', viewerId, error);
        }
    }

    async handleStreamOffer(data) {
        const { fromUserId, offer } = data;

        try {
            const pc = this.createPeerConnection(fromUserId);

            pc.ontrack = (event) => {
                const remoteStream = event.streams[0];
                if (remoteStream) {
                    this.theatre.setHostStream(remoteStream);
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
            } catch (error) {
                console.error('Failed to handle stream answer:', error);
            }
        }
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

        const pc = new RTCPeerConnection({ iceServers: this.iceServers });

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
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                console.warn(`Peer connection ${userId} state: ${pc.connectionState}`);
                this.closePeerConnection(userId);
            }
            if (pc.connectionState === 'connected') {
                console.log(`Stream connection established with ${userId}`);
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
