import { Server } from 'socket.io';

// Store room data in memory (in production, you'd use a database)
const rooms = new Map();

// Room class to manage room state
class Room {
    constructor(id) {
        this.id = id;
        this.users = new Map();
        this.host = null;
        this.seats = new Array(160).fill(null); // 10 rows × 16 seats
        this.screenSharing = false;
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
        
        // If host left, assign new host
        if (this.host === userId && this.users.size > 0) {
            this.host = this.users.keys().next().value;
        } else if (this.users.size === 0) {
            this.host = null;
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
            screenSharing: this.screenSharing
        };
    }
}

let io;

export default function handler(req, res) {
    if (!io) {
        console.log('Initializing Socket.IO server...');
        
        io = new Server(res.socket.server, {
            cors: {
                origin: [
                    "http://localhost:3000",
                    "https://threeatre-fc2cgt3jg-jesse-altons-projects.vercel.app",
                    /^https:\/\/threeatre-.*\.vercel\.app$/,
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
                
                // Add user to room
                room.addUser(userData.id, userData);
                const user = room.users.get(userData.id);
                user.socketId = socket.id;
                
                // Send room data to user
                socket.emit('room-joined', {
                    ...room.toJSON(),
                    isHost: room.host === userData.id
                });
                
                // Notify other users
                socket.to(roomId).emit('user-joined', userData);
                socket.to(roomId).emit('user-count-update', room.users.size);
                
                console.log(`User ${userData.id} joined room ${roomId}`);
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
                        io.to(roomId).emit('seat-assigned', {
                            userId: socket.userId,
                            seatIndex: result.seatIndex
                        });
                        console.log(`User ${socket.userId} assigned to seat ${result.seatIndex} in room ${roomId}`);
                    } else {
                        socket.emit('seat-request-denied', {
                            reason: result.reason
                        });
                    }
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
                    console.log(`Chat message from ${socket.userId} in room ${roomId}: ${message}`);
                }
            });
            
            socket.on('disconnect', () => {
                console.log('User disconnected:', socket.id);
                
                if (socket.currentRoom && socket.userId) {
                    const room = rooms.get(socket.currentRoom);
                    if (room) {
                        room.removeUser(socket.userId);
                        
                        socket.to(socket.currentRoom).emit('user-left', socket.userId);
                        socket.to(socket.currentRoom).emit('user-count-update', room.users.size);
                        
                        // Clean up empty rooms
                        if (room.users.size === 0) {
                            rooms.delete(socket.currentRoom);
                            console.log(`Room ${socket.currentRoom} deleted (empty)`);
                        }
                    }
                }
            });
        });
        
        res.socket.server.io = io;
    }
    
    res.end();
}
