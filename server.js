import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);

// Configure CORS for Socket.IO
const io = new Server(server, {
    cors: {
        origin: [
            "http://localhost:3000", 
            "http://127.0.0.1:3000",
            "https://threeatre.vercel.app",
            /^https:\/\/.*\.vercel\.app$/
        ],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingInterval: 10000,
    pingTimeout: 15000,
    connectTimeout: 20000,
    maxHttpBufferSize: 1e6
});

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        rooms: rooms.size,
        totalUsers: Array.from(rooms.values()).reduce((total, room) => total + room.users.size, 0)
    });
});

// Store room data
const rooms = new Map();
const pendingDisconnects = new Map();

function getDisconnectKey(roomId, userId) {
    return `${roomId}:${userId}`;
}

function clearPendingDisconnect(roomId, userId) {
    const key = getDisconnectKey(roomId, userId);
    const timer = pendingDisconnects.get(key);
    if (timer) {
        clearTimeout(timer);
        pendingDisconnects.delete(key);
    }
}

// Room class to manage room state
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
        
        // If first user, make them host
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
        
        // Free previous seat if any
        if (user.seatIndex !== null) {
            this.seats[user.seatIndex] = null;
        }
        
        // Assign new seat
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

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('join-room', (data) => {
        const { roomId, userData } = data;
        
        // Get or create room
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Room(roomId));
        }
        
        const room = rooms.get(roomId);
        
        // Leave previous room if any
        if (socket.currentRoom) {
            socket.leave(socket.currentRoom);
            const oldRoom = rooms.get(socket.currentRoom);
            if (oldRoom) {
                oldRoom.removeUser(userData.id);
                socket.to(socket.currentRoom).emit('user-left', userData.id);
                socket.to(socket.currentRoom).emit('user-count-update', oldRoom.users.size);
            }
        }
        
        // Join new room
        socket.join(roomId);
        socket.currentRoom = roomId;
        socket.userId = userData.id;
        clearPendingDisconnect(roomId, userData.id);
        
        // Add or restore user in room
        const existingUser = room.users.get(userData.id);
        const isReconnection = !!existingUser;
        if (isReconnection) {
            existingUser.socketId = socket.id;
            existingUser.name = userData.name || existingUser.name;
            existingUser.color = userData.color || existingUser.color;
            existingUser.position = userData.position || existingUser.position;
        } else {
            room.addUser(userData.id, userData);
            const user = room.users.get(userData.id);
            user.socketId = socket.id;
        }
        
        // Send room data to user
        socket.emit('room-joined', {
            ...room.toJSON(),
            isHost: room.host === userData.id
        });
        
        // Notify other users
        if (!isReconnection) {
            socket.to(roomId).emit('user-joined', userData);
            socket.to(roomId).emit('user-count-update', room.users.size);
            console.log(`User ${userData.id} joined room ${roomId}`);
        } else {
            socket.to(roomId).emit('user-count-update', room.users.size);
            console.log(`User ${userData.id} reconnected to room ${roomId}`);
        }
    });
    
    socket.on('position-update', (data) => {
        const { roomId, position } = data;
        const room = rooms.get(roomId);
        
        if (room && socket.userId) {
            room.updateUserPosition(socket.userId, position);
            
            // Broadcast position to other users in room
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
                // Notify all users in room about seat assignment
                io.to(roomId).emit('seat-assigned', {
                    userId: socket.userId,
                    seatIndex: result.seatIndex
                });
                console.log(`User ${socket.userId} assigned to seat ${result.seatIndex} in room ${roomId}`);
            } else {
                // Notify user that seat request was denied
                socket.emit('seat-request-denied', {
                    reason: result.reason
                });
                console.log(`Seat request denied for user ${socket.userId}: ${result.reason}`);
            }
        }
    });
    
    socket.on('leave-seat', (data) => {
        const { roomId } = data;
        const room = rooms.get(roomId);
        
        if (room && socket.userId) {
            const user = room.users.get(socket.userId);
            if (user && user.seatIndex !== null) {
                // Free the seat
                room.seats[user.seatIndex] = null;
                user.seatIndex = null;
                
                // Notify all users
                io.to(roomId).emit('seat-left', {
                    userId: socket.userId
                });
                console.log(`User ${socket.userId} left their seat in room ${roomId}`);
            }
        }
    });
    
    socket.on('request-host', (data) => {
        const { roomId } = data;
        const room = rooms.get(roomId);
        
        if (room && socket.userId) {
            // For now, anyone can become host if no current host
            // In production, you might want more sophisticated logic
            if (!room.host || room.host === socket.userId) {
                room.host = socket.userId;
                io.to(roomId).emit('host-changed', socket.userId);
                console.log(`User ${socket.userId} became host of room ${roomId}`);
            }
        }
    });
    
    socket.on('start-screen-share', (data) => {
        const { roomId } = data;
        const room = rooms.get(roomId);
        
        if (room && socket.userId === room.host) {
            room.screenSharing = true;
            socket.to(roomId).emit('screen-share-started', {
                hostId: socket.userId
            });
            console.log(`Screen sharing started in room ${roomId}`);
        }
    });
    
    socket.on('stop-screen-share', (data) => {
        const { roomId } = data;
        const room = rooms.get(roomId);
        
        if (room && socket.userId === room.host) {
            room.screenSharing = false;
            socket.to(roomId).emit('screen-share-stopped');
            console.log(`Screen sharing stopped in room ${roomId}`);
        }
    });
    
    socket.on('start-stream', (data) => {
        const { roomId, hostId } = data;
        const room = rooms.get(roomId);
        
        if (room && socket.userId) {
            room.screenSharing = true;
            room.streamHost = socket.userId;
            socket.to(roomId).emit('stream-started', { hostId: socket.userId });
            console.log(`WebRTC stream started by ${socket.userId} in room ${roomId}`);
        }
    });
    
    socket.on('stop-stream', (data) => {
        const { roomId } = data;
        const room = rooms.get(roomId);
        
        if (room && socket.userId) {
            room.screenSharing = false;
            room.streamHost = null;
            socket.to(roomId).emit('stream-stopped');
            console.log(`WebRTC stream stopped in room ${roomId}`);
        }
    });
    
    socket.on('stream-offer', (data) => {
        const { roomId, targetUserId, offer } = data;
        const room = rooms.get(roomId);
        
        if (room && socket.userId) {
            const targetSocket = [...io.sockets.sockets.values()]
                .find(s => s.userId === targetUserId && s.currentRoom === roomId);
            
            if (targetSocket) {
                targetSocket.emit('stream-offer', {
                    fromUserId: socket.userId,
                    offer: offer
                });
            }
        }
    });
    
    socket.on('stream-answer', (data) => {
        const { roomId, targetUserId, answer } = data;
        const room = rooms.get(roomId);
        
        if (room && socket.userId) {
            const targetSocket = [...io.sockets.sockets.values()]
                .find(s => s.userId === targetUserId && s.currentRoom === roomId);
            
            if (targetSocket) {
                targetSocket.emit('stream-answer', {
                    fromUserId: socket.userId,
                    answer: answer
                });
            }
        }
    });
    
    socket.on('stream-ice-candidate', (data) => {
        const { roomId, targetUserId, candidate } = data;
        const room = rooms.get(roomId);
        
        if (room && socket.userId) {
            const targetSocket = [...io.sockets.sockets.values()]
                .find(s => s.userId === targetUserId && s.currentRoom === roomId);
            
            if (targetSocket) {
                targetSocket.emit('stream-ice-candidate', {
                    fromUserId: socket.userId,
                    candidate: candidate
                });
            }
        }
    });
    
    socket.on('avatar-changed', (data) => {
        const { roomId, userId } = data;
        const room = rooms.get(roomId);
        
        if (room && socket.userId === userId) {
            // Broadcast avatar change to other users in room
            socket.to(roomId).emit('avatar-changed', {
                userId: userId
            });
            console.log(`Avatar changed for user ${userId} in room ${roomId}`);
        }
    });
    
    socket.on('chat-message', (data) => {
        const { roomId, message, userName } = data;
        const room = rooms.get(roomId);
        
        if (room && socket.userId) {
            // Broadcast message to all users in room except sender
            socket.to(roomId).emit('chat-message', {
                userId: socket.userId,
                message: message,
                userName: userName,
                timestamp: Date.now()
            });
            console.log(`Chat message from ${socket.userId} in room ${roomId}: ${message}`);
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
            // Forward offer to target user
            const targetSocket = [...io.sockets.sockets.values()]
                .find(s => s.userId === targetUserId && s.currentRoom === roomId);
            
            if (targetSocket) {
                targetSocket.emit('voice-offer', {
                    fromUserId: socket.userId,
                    offer: offer
                });
            }
        }
    });
    
    socket.on('voice-answer', (data) => {
        const { roomId, targetUserId, answer } = data;
        const room = rooms.get(roomId);
        
        if (room && socket.userId) {
            // Forward answer to target user
            const targetSocket = [...io.sockets.sockets.values()]
                .find(s => s.userId === targetUserId && s.currentRoom === roomId);
            
            if (targetSocket) {
                targetSocket.emit('voice-answer', {
                    fromUserId: socket.userId,
                    answer: answer
                });
            }
        }
    });
    
    socket.on('voice-ice-candidate', (data) => {
        const { roomId, targetUserId, candidate } = data;
        const room = rooms.get(roomId);
        
        if (room && socket.userId) {
            // Forward ICE candidate to target user
            const targetSocket = [...io.sockets.sockets.values()]
                .find(s => s.userId === targetUserId && s.currentRoom === roomId);
            
            if (targetSocket) {
                targetSocket.emit('voice-ice-candidate', {
                    fromUserId: socket.userId,
                    candidate: candidate
                });
            }
        }
    });

    socket.on('client-heartbeat', () => {
        // Application-level keepalive to reduce idle disconnect churn.
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        if (socket.currentRoom && socket.userId) {
            const roomId = socket.currentRoom;
            const userId = socket.userId;
            const key = getDisconnectKey(roomId, userId);

            clearPendingDisconnect(roomId, userId);
            const timer = setTimeout(() => {
                pendingDisconnects.delete(key);

                const room = rooms.get(roomId);
                if (!room) return;
                const currentUser = room.users.get(userId);
                if (!currentUser) return;

                // User reconnected and replaced socket before timeout.
                if (currentUser.socketId && currentUser.socketId !== socket.id) return;

                const wasStreamHost = room.streamHost === userId;
                room.removeUser(userId);

                io.to(roomId).emit('user-left', userId);
                io.to(roomId).emit('user-count-update', room.users.size);

                if (room.host && room.host !== userId) {
                    io.to(roomId).emit('host-changed', room.host);
                }

                if (wasStreamHost) {
                    room.screenSharing = false;
                    room.streamHost = null;
                    io.to(roomId).emit('stream-stopped');
                }

                if (room.users.size === 0) {
                    rooms.delete(roomId);
                    console.log(`Room ${roomId} deleted (empty)`);
                }
            }, 25000);

            pendingDisconnects.set(key, timer);
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Theatre server running on port ${PORT}`);
    console.log(`Rooms will be accessible at: http://localhost:${PORT}`);
});

// Cleanup empty rooms periodically
setInterval(() => {
    for (const [roomId, room] of rooms.entries()) {
        if (room.users.size === 0) {
            rooms.delete(roomId);
            console.log(`Cleaned up empty room: ${roomId}`);
        }
    }
}, 300000); // Every 5 minutes
