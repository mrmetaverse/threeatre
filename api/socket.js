import { Server } from 'socket.io';

const rooms = new Map();

class Room {
    constructor(id) {
        this.id = id;
        this.users = new Map();
        this.host = null;
        this.seats = new Array(160).fill(null);
        this.screenSharing = false;
        this.streamHost = null;
    }
    
    addUser(userId, userData) {
        this.users.set(userId, {
            ...userData,
            socketId: null,
            seatIndex: null
        });
        
        if (this.users.size === 1) {
            this.host = userId;
        }
    }
    
    removeUser(userId) {
        const user = this.users.get(userId);
        if (user && user.seatIndex !== null) {
            this.seats[user.seatIndex] = null;
        }
        
        this.users.delete(userId);
        
        if (this.host === userId && this.users.size > 0) {
            this.host = this.users.keys().next().value;
        } else if (this.users.size === 0) {
            this.host = null;
            this.streamHost = null;
        }

        if (this.streamHost === userId) {
            this.screenSharing = false;
            this.streamHost = null;
        }
    }
    
    assignSeat(userId, seatIndex) {
        if (seatIndex < 0 || seatIndex >= this.seats.length) {
            return { success: false, reason: 'Invalid seat index' };
        }
        
        if (this.seats[seatIndex] !== null) {
            return { success: false, reason: 'Seat already occupied' };
        }
        
        const user = this.users.get(userId);
        if (!user) {
            return { success: false, reason: 'User not found' };
        }
        
        if (user.seatIndex !== null) {
            this.seats[user.seatIndex] = null;
        }
        
        this.seats[seatIndex] = userId;
        user.seatIndex = seatIndex;
        
        return { success: true, seatIndex };
    }
    
    updateUserPosition(userId, position) {
        const user = this.users.get(userId);
        if (user) {
            user.position = position;
        }
    }
    
    toJSON() {
        return {
            id: this.id,
            userCount: this.users.size,
            host: this.host,
            users: Array.from(this.users.values()),
            screenSharing: this.screenSharing,
            streamHost: this.streamHost
        };
    }
}

function findSocket(io, userId, roomId) {
    return [...io.sockets.sockets.values()]
        .find(s => s.userId === userId && s.currentRoom === roomId);
}

let io;

export default function handler(req, res) {
    if (!io) {
        console.log('Initializing Socket.IO server...');
        
        io = new Server(res.socket.server, {
            cors: {
                origin: [
                    "http://localhost:3000",
                    /^https:\/\/.*\.vercel\.app$/
                ],
                methods: ["GET", "POST"],
                credentials: true
            },
            transports: ['websocket', 'polling'],
            path: '/socket.io/'
        });

        io.on('connection', (socket) => {
            console.log('User connected:', socket.id);
            
            socket.on('join-room', (data) => {
                const { roomId, userData } = data;
                
                if (!rooms.has(roomId)) {
                    rooms.set(roomId, new Room(roomId));
                }
                
                const room = rooms.get(roomId);
                
                if (socket.currentRoom) {
                    socket.leave(socket.currentRoom);
                    const oldRoom = rooms.get(socket.currentRoom);
                    if (oldRoom) {
                        oldRoom.removeUser(userData.id);
                        socket.to(socket.currentRoom).emit('user-left', userData.id);
                        socket.to(socket.currentRoom).emit('user-count-update', oldRoom.users.size);
                    }
                }
                
                socket.join(roomId);
                socket.currentRoom = roomId;
                socket.userId = userData.id;
                
                room.addUser(userData.id, userData);
                const user = room.users.get(userData.id);
                user.socketId = socket.id;
                
                socket.emit('room-joined', {
                    ...room.toJSON(),
                    isHost: room.host === userData.id
                });
                
                socket.to(roomId).emit('user-joined', userData);
                socket.to(roomId).emit('user-count-update', room.users.size);
                
                console.log(`User ${userData.id} joined room ${roomId}`);
            });
            
            socket.on('position-update', (data) => {
                const { roomId, position } = data;
                const room = rooms.get(roomId);
                
                if (room && socket.userId) {
                    room.updateUserPosition(socket.userId, position);
                    socket.to(roomId).emit('user-position-update', {
                        userId: socket.userId,
                        position: position
                    });
                }
            });
            
            socket.on('request-seat', (data) => {
                const { roomId, seatIndex } = data;
                const room = rooms.get(roomId);
                
                if (room && socket.userId) {
                    const result = room.assignSeat(socket.userId, seatIndex);
                    
                    if (result.success) {
                        io.to(roomId).emit('seat-assigned', {
                            userId: socket.userId,
                            seatIndex: result.seatIndex
                        });
                    } else {
                        socket.emit('seat-request-denied', {
                            reason: result.reason
                        });
                    }
                }
            });

            socket.on('leave-seat', (data) => {
                const { roomId } = data;
                const room = rooms.get(roomId);
                
                if (room && socket.userId) {
                    const user = room.users.get(socket.userId);
                    if (user && user.seatIndex !== null) {
                        room.seats[user.seatIndex] = null;
                        user.seatIndex = null;
                        io.to(roomId).emit('seat-left', { userId: socket.userId });
                    }
                }
            });

            socket.on('request-host', (data) => {
                const { roomId } = data;
                const room = rooms.get(roomId);
                
                if (room && socket.userId) {
                    if (!room.host || room.host === socket.userId) {
                        room.host = socket.userId;
                        io.to(roomId).emit('host-changed', socket.userId);
                    }
                }
            });

            socket.on('start-stream', (data) => {
                const { roomId } = data;
                const room = rooms.get(roomId);
                
                if (room && socket.userId) {
                    room.screenSharing = true;
                    room.streamHost = socket.userId;
                    socket.to(roomId).emit('stream-started', { hostId: socket.userId });
                }
            });

            socket.on('stop-stream', (data) => {
                const { roomId } = data;
                const room = rooms.get(roomId);
                
                if (room && socket.userId) {
                    room.screenSharing = false;
                    room.streamHost = null;
                    socket.to(roomId).emit('stream-stopped');
                }
            });

            socket.on('stream-offer', (data) => {
                const { roomId, targetUserId, offer } = data;
                const room = rooms.get(roomId);
                
                if (room && socket.userId) {
                    const target = findSocket(io, targetUserId, roomId);
                    if (target) {
                        target.emit('stream-offer', { fromUserId: socket.userId, offer });
                    }
                }
            });

            socket.on('stream-answer', (data) => {
                const { roomId, targetUserId, answer } = data;
                const room = rooms.get(roomId);
                
                if (room && socket.userId) {
                    const target = findSocket(io, targetUserId, roomId);
                    if (target) {
                        target.emit('stream-answer', { fromUserId: socket.userId, answer });
                    }
                }
            });

            socket.on('stream-ice-candidate', (data) => {
                const { roomId, targetUserId, candidate } = data;
                const room = rooms.get(roomId);
                
                if (room && socket.userId) {
                    const target = findSocket(io, targetUserId, roomId);
                    if (target) {
                        target.emit('stream-ice-candidate', { fromUserId: socket.userId, candidate });
                    }
                }
            });

            socket.on('avatar-changed', (data) => {
                const { roomId, userId } = data;
                const room = rooms.get(roomId);
                
                if (room && socket.userId === userId) {
                    socket.to(roomId).emit('avatar-changed', { userId });
                }
            });
            
            socket.on('chat-message', (data) => {
                const { roomId, message, userName } = data;
                const room = rooms.get(roomId);
                
                if (room && socket.userId) {
                    socket.to(roomId).emit('chat-message', {
                        userId: socket.userId,
                        message: message,
                        userName: userName,
                        timestamp: Date.now()
                    });
                }
            });

            socket.on('voice-status', (data) => {
                const { roomId, enabled } = data;
                const room = rooms.get(roomId);
                
                if (room && socket.userId) {
                    socket.to(roomId).emit('voice-status', {
                        userId: socket.userId,
                        enabled: enabled
                    });
                }
            });

            socket.on('voice-offer', (data) => {
                const { roomId, targetUserId, offer } = data;
                const room = rooms.get(roomId);
                
                if (room && socket.userId) {
                    const target = findSocket(io, targetUserId, roomId);
                    if (target) {
                        target.emit('voice-offer', { fromUserId: socket.userId, offer });
                    }
                }
            });

            socket.on('voice-answer', (data) => {
                const { roomId, targetUserId, answer } = data;
                const room = rooms.get(roomId);
                
                if (room && socket.userId) {
                    const target = findSocket(io, targetUserId, roomId);
                    if (target) {
                        target.emit('voice-answer', { fromUserId: socket.userId, answer });
                    }
                }
            });

            socket.on('voice-ice-candidate', (data) => {
                const { roomId, targetUserId, candidate } = data;
                const room = rooms.get(roomId);
                
                if (room && socket.userId) {
                    const target = findSocket(io, targetUserId, roomId);
                    if (target) {
                        target.emit('voice-ice-candidate', { fromUserId: socket.userId, candidate });
                    }
                }
            });
            
            socket.on('disconnect', () => {
                console.log('User disconnected:', socket.id);
                
                if (socket.currentRoom && socket.userId) {
                    const room = rooms.get(socket.currentRoom);
                    if (room) {
                        const wasStreamHost = room.streamHost === socket.userId;
                        room.removeUser(socket.userId);
                        
                        socket.to(socket.currentRoom).emit('user-left', socket.userId);
                        socket.to(socket.currentRoom).emit('user-count-update', room.users.size);
                        
                        if (room.host) {
                            socket.to(socket.currentRoom).emit('host-changed', room.host);
                        }

                        if (wasStreamHost) {
                            socket.to(socket.currentRoom).emit('stream-stopped');
                        }
                        
                        if (room.users.size === 0) {
                            rooms.delete(socket.currentRoom);
                        }
                    }
                }
            });
        });
        
        res.socket.server.io = io;
    }
    
    res.end();
}
