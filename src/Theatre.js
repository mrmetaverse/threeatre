import * as THREE from 'three';
import { AvatarManager } from './AvatarManager.js';

export class Theatre {
    constructor(scene) {
        this.scene = scene;
        this.screen = null;
        this.seats = [];
        this.stage = null;
        this.walls = [];
        this.hostVideo = null;
        this.videoTexture = null;
        this.users = new Map();
        this.avatarManager = new AvatarManager(scene);
        this.camera = null; // Will be set by main app
        
        this.init();
    }
    
    init() {
        this.createTheatreGeometry();
        this.createSeats();
        this.createScreen();
        this.createLighting();
        this.setupTheatreAudio();
    }
    
    createTheatreGeometry() {
        // Create main floor
        const mainFloorGeometry = new THREE.PlaneGeometry(30, 20);
        const floorMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x2a2a2a,
            side: THREE.DoubleSide 
        });
        const mainFloor = new THREE.Mesh(mainFloorGeometry, floorMaterial);
        mainFloor.rotation.x = -Math.PI / 2;
        mainFloor.position.z = 10;
        mainFloor.receiveShadow = true;
        this.scene.add(mainFloor);
        
        // Create recessed seating floor (lower level)
        const seatingFloorGeometry = new THREE.PlaneGeometry(28, 18);
        const seatingFloorMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x1a1a1a,
            side: THREE.DoubleSide 
        });
        const seatingFloor = new THREE.Mesh(seatingFloorGeometry, seatingFloorMaterial);
        seatingFloor.rotation.x = -Math.PI / 2;
        seatingFloor.position.set(0, -0.5, -5);
        seatingFloor.receiveShadow = true;
        this.scene.add(seatingFloor);
        
        // Create steps between levels
        for (let i = 0; i < 3; i++) {
            const stepGeometry = new THREE.BoxGeometry(28, 0.2, 1);
            const stepMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
            const step = new THREE.Mesh(stepGeometry, stepMaterial);
            step.position.set(0, -0.1 - (i * 0.15), 1 - (i * 1));
            step.receiveShadow = true;
            step.castShadow = true;
            this.scene.add(step);
        }
        
        // Create walls
        this.createWalls();
        
        // Create ceiling
        const ceilingGeometry = new THREE.PlaneGeometry(30, 40);
        const ceilingMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x1a1a1a,
            side: THREE.DoubleSide 
        });
        const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
        ceiling.position.y = 8;
        ceiling.rotation.x = Math.PI / 2;
        this.scene.add(ceiling);
        
        // Create elevated stage
        const stageGeometry = new THREE.BoxGeometry(30, 1.2, 6);
        const stageMaterial = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
        this.stage = new THREE.Mesh(stageGeometry, stageMaterial);
        this.stage.position.set(0, 0.6, -17);
        this.stage.castShadow = true;
        this.stage.receiveShadow = true;
        this.scene.add(this.stage);
    }
    
    createWalls() {
        const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
        
        // Back wall
        const backWallGeometry = new THREE.PlaneGeometry(30, 8);
        const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
        backWall.position.set(0, 4, -20);
        this.scene.add(backWall);
        this.walls.push(backWall);
        
        // Left wall
        const leftWallGeometry = new THREE.PlaneGeometry(40, 8);
        const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
        leftWall.position.set(-15, 4, 0);
        leftWall.rotation.y = Math.PI / 2;
        this.scene.add(leftWall);
        this.walls.push(leftWall);
        
        // Right wall
        const rightWallGeometry = new THREE.PlaneGeometry(40, 8);
        const rightWall = new THREE.Mesh(rightWallGeometry, wallMaterial);
        rightWall.position.set(15, 4, 0);
        rightWall.rotation.y = -Math.PI / 2;
        this.scene.add(rightWall);
        this.walls.push(rightWall);
        
        // Front wall (with entrance)
        const frontWallGeometry = new THREE.PlaneGeometry(30, 8);
        const frontWall = new THREE.Mesh(frontWallGeometry, wallMaterial);
        frontWall.position.set(0, 4, 20);
        frontWall.rotation.y = Math.PI;
        this.scene.add(frontWall);
        this.walls.push(frontWall);
    }
    
    createSeats() {
        const seatGeometry = new THREE.BoxGeometry(1.2, 1, 1);
        const seatMaterial = new THREE.MeshLambertMaterial({ color: 0x8b0000 });
        const backrestGeometry = new THREE.BoxGeometry(1.2, 1.5, 0.2);
        
        const rows = 8;
        const seatsPerRow = 12;
        const seatSpacing = 2;
        const rowSpacing = 2.2;
        
        for (let row = 0; row < rows; row++) {
            for (let seatIndex = 0; seatIndex < seatsPerRow; seatIndex++) {
                const seatGroup = new THREE.Group();
                
                // Seat base
                const seat = new THREE.Mesh(seatGeometry, seatMaterial);
                seat.position.y = 0.5;
                seat.castShadow = true;
                seatGroup.add(seat);
                
                // Seat backrest - positioned to face the screen
                const backrest = new THREE.Mesh(backrestGeometry, seatMaterial);
                backrest.position.set(0, 1.25, 0.4); // Moved to back of seat
                backrest.castShadow = true;
                seatGroup.add(backrest);
                
                // Position seats in recessed area, facing the screen
                const x = (seatIndex - seatsPerRow / 2 + 0.5) * seatSpacing;
                const z = -14 + (row * rowSpacing); // Start from back, face forward
                const y = -0.5 + (row * 0.25); // In recessed floor with slight elevation
                
                seatGroup.position.set(x, y, z);
                
                // Store seat info
                const seatInfo = {
                    group: seatGroup,
                    row: row,
                    seat: seatIndex,
                    position: seatGroup.position.clone(),
                    occupied: false,
                    userId: null
                };
                
                this.seats.push(seatInfo);
                this.scene.add(seatGroup);
            }
        }
    }
    
    createScreen() {
        // Create larger screen frame
        const frameGeometry = new THREE.BoxGeometry(24, 14, 0.5);
        const frameMaterial = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const frame = new THREE.Mesh(frameGeometry, frameMaterial);
        frame.position.set(0, 7, -19.5);
        frame.castShadow = true;
        this.scene.add(frame);
        
        // Create larger screen surface
        const screenGeometry = new THREE.PlaneGeometry(22, 12);
        const screenMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x111111,
            side: THREE.DoubleSide 
        });
        
        this.screen = new THREE.Mesh(screenGeometry, screenMaterial);
        this.screen.position.set(0, 7, -19);
        this.screen.name = 'theatre-screen';
        this.scene.add(this.screen);
    }
    
    createLighting() {
        // Screen lighting
        const screenLight = new THREE.SpotLight(0xffffff, 0.5, 30, Math.PI / 6, 0.1);
        screenLight.position.set(0, 10, -15);
        screenLight.target = this.screen;
        screenLight.castShadow = true;
        this.scene.add(screenLight);
        
        // Ambient theatre lighting
        const theatreLight1 = new THREE.PointLight(0xff6b35, 0.3, 20);
        theatreLight1.position.set(-10, 6, 10);
        this.scene.add(theatreLight1);
        
        const theatreLight2 = new THREE.PointLight(0xff6b35, 0.3, 20);
        theatreLight2.position.set(10, 6, 10);
        this.scene.add(theatreLight2);
        
        // Exit lighting
        const exitLight = new THREE.PointLight(0x00ff00, 0.2, 10);
        exitLight.position.set(0, 3, 18);
        this.scene.add(exitLight);
    }
    
    setupTheatreAudio() {
        // Setup ambient theatre audio using OMI audio system
        if (!this.avatarManager.audioListener || !this.avatarManager.audioContext) {
            console.log('OMI Audio: Audio system not available, skipping ambient audio');
            return;
        }
        
        try {
            // Create subtle ambient theatre sounds
            this.createAmbientAudio();
            console.log('OMI Audio: Theatre ambient audio initialized');
        } catch (error) {
            console.warn('OMI Audio: Failed to setup theatre audio:', error);
        }
    }
    
    createAmbientAudio() {
        // Create subtle air conditioning/ventilation sound
        const ambientSound = new THREE.Audio(this.avatarManager.audioListener);
        
        // Generate subtle ambient noise buffer
        const buffer = this.avatarManager.audioContext.createBuffer(
            1, 
            this.avatarManager.audioContext.sampleRate * 10, // 10 seconds
            this.avatarManager.audioContext.sampleRate
        );
        
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            // Create subtle pink noise for ambient sound
            data[i] = (Math.random() * 2 - 1) * 0.02; // Very quiet
        }
        
        ambientSound.setBuffer(buffer);
        ambientSound.setLoop(true);
        ambientSound.setVolume(0.1);
        
        // Add to scene
        this.scene.add(ambientSound);
        
        // Auto-play ambient sound when user interacts
        document.addEventListener('click', () => {
            if (this.avatarManager.audioContext.state === 'suspended') {
                this.avatarManager.audioContext.resume().then(() => {
                    ambientSound.play();
                    console.log('OMI Audio: Ambient theatre audio started');
                });
            }
        }, { once: true });
    }
    
    setHostStream(stream) {
        if (this.hostVideo) {
            this.hostVideo.srcObject = null;
        }
        
        this.hostVideo = document.createElement('video');
        this.hostVideo.srcObject = stream;
        this.hostVideo.autoplay = true;
        this.hostVideo.muted = true;
        this.hostVideo.playsInline = true;
        
        // Wait for video to load before creating texture
        this.hostVideo.addEventListener('loadedmetadata', () => {
            console.log('Video loaded, dimensions:', this.hostVideo.videoWidth, 'x', this.hostVideo.videoHeight);
            
            // Create video texture
            this.videoTexture = new THREE.VideoTexture(this.hostVideo);
            this.videoTexture.minFilter = THREE.LinearFilter;
            this.videoTexture.magFilter = THREE.LinearFilter;
            this.videoTexture.format = THREE.RGBAFormat;
            this.videoTexture.flipY = true; // Fix upside-down display
            
            // Update screen material
            this.screen.material.dispose(); // Clean up old material
            this.screen.material = new THREE.MeshBasicMaterial({
                map: this.videoTexture,
                side: THREE.DoubleSide
            });
            
            console.log('Video texture applied to screen');
        });
        
        this.hostVideo.addEventListener('canplay', () => {
            console.log('Video can play');
            this.hostVideo.play().catch(e => console.error('Error playing video:', e));
        });
        
        // Handle stream end
        stream.getTracks().forEach(track => {
            track.addEventListener('ended', () => {
                this.stopHostStream();
            });
        });
        
        console.log('Host stream set on theatre screen');
    }
    
    stopHostStream() {
        if (this.hostVideo) {
            if (this.hostVideo.srcObject) {
                this.hostVideo.srcObject.getTracks().forEach(track => track.stop());
            }
            this.hostVideo.srcObject = null;
            this.hostVideo = null;
        }
        
        if (this.videoTexture) {
            this.videoTexture.dispose();
            this.videoTexture = null;
        }
        
        // Reset screen to black
        this.screen.material = new THREE.MeshBasicMaterial({ 
            color: 0x000000,
            side: THREE.DoubleSide 
        });
        
        console.log('Host stream stopped');
    }
    
    async addUser(userId, userData) {
        try {
            // Try to load default avatar (VRM or simple)
            const avatar = await this.avatarManager.loadDefaultAvatar(userId, userData);
            
            // Position avatar at entrance
            avatar.scene.position.set(0, 0, 15);
            
            const userInfo = {
                id: userId,
                avatar: avatar.scene,
                position: avatar.scene.position.clone(),
                seatId: null,
                data: userData,
                avatarType: avatar.type || 'simple'
            };
            
            this.users.set(userId, userInfo);
            
            return userInfo;
        } catch (error) {
            console.error('Failed to add user avatar:', error);
            // Fallback to simple avatar if VRM fails
            const avatar = this.avatarManager.createSimpleAvatar(userId, userData);
            avatar.scene.position.set(0, 0, 15);
            
            const userInfo = {
                id: userId,
                avatar: avatar.scene,
                position: avatar.scene.position.clone(),
                seatId: null,
                data: userData,
                avatarType: 'simple'
            };
            
            this.users.set(userId, userInfo);
            return userInfo;
        }
    }
    
    removeUser(userId) {
        const user = this.users.get(userId);
        if (user) {
            // Free up seat if occupied
            if (user.seatId !== null) {
                const seat = this.seats[user.seatId];
                if (seat) {
                    seat.occupied = false;
                    seat.userId = null;
                }
            }
            
            // Remove avatar using avatar manager
            this.avatarManager.removeAvatar(userId);
            
            this.users.delete(userId);
        }
    }
    
    updateUserPosition(userId, position, rotation) {
        const user = this.users.get(userId);
        if (user) {
            // Update avatar using avatar manager
            this.avatarManager.updateAvatar(userId, position, rotation);
            
            // Update user info
            user.position = position;
            if (rotation) {
                user.rotation = rotation;
            }
        }
    }
    
    assignSeat(userId, seatIndex) {
        const user = this.users.get(userId);
        const seat = this.seats[seatIndex];
        
        console.log('Assigning seat:', { userId, seatIndex, user: !!user, seat: !!seat, occupied: seat?.occupied });
        
        if (!user) {
            console.error('User not found:', userId);
            return { success: false, reason: 'User not found' };
        }
        
        if (!seat) {
            console.error('Seat not found:', seatIndex);
            return { success: false, reason: 'Seat not found' };
        }
        
        if (seat.occupied) {
            console.error('Seat already occupied:', seatIndex);
            return { success: false, reason: 'Seat already occupied' };
        }
        
        // Free previous seat if any
        if (user.seatId !== null && user.seatId !== undefined) {
            const oldSeat = this.seats[user.seatId];
            if (oldSeat) {
                oldSeat.occupied = false;
                oldSeat.userId = null;
                console.log('Freed previous seat:', user.seatId);
            }
        }
        
        // Assign new seat
        seat.occupied = true;
        seat.userId = userId;
        user.seatId = seatIndex;
        
        // Move avatar to seat
        const seatPosition = seat.position.clone();
        seatPosition.y += 1.6; // Sitting height
        
        // Update avatar using avatar manager
        this.avatarManager.updateAvatar(userId, seatPosition);
        user.position = seatPosition;
        
        console.log('Seat assigned successfully:', { userId, seatIndex, position: seatPosition });
        return { success: true, seatIndex };
    }
    
    getAvailableSeats() {
        return this.seats.filter(seat => !seat.occupied);
    }
    
    update(deltaTime = 0.016) {
        // Update video texture if playing
        if (this.videoTexture && this.hostVideo && this.hostVideo.readyState >= 2) {
            this.videoTexture.needsUpdate = true;
        }
        
        // Update avatar manager
        this.avatarManager.update(deltaTime);
        
        // Update user avatars with simple idle animation
        this.users.forEach(user => {
            if (user.avatarType === 'simple') {
                // Simple idle animation - slight bobbing for simple avatars
                const time = Date.now() * 0.001;
                const originalY = user.position.y;
                user.avatar.position.y = originalY + Math.sin(time + user.id.length) * 0.02;
            }
        });
    }
    
    dispose() {
        // Clean up resources
        this.stopHostStream();
        
        // Remove all users
        this.users.forEach((user, userId) => {
            this.removeUser(userId);
        });
        
        // Dispose avatar manager
        this.avatarManager.dispose();
    }
    
    // Set camera for OMI audio listener
    setCamera(camera) {
        this.camera = camera;
        
        // Attach OMI audio listener to camera for 3D surround sound
        if (this.avatarManager.audioListener) {
            camera.add(this.avatarManager.audioListener);
            console.log('OMI Audio: 3D audio listener attached to camera');
        }
        
        // Clean up geometry and materials
        this.scene.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(material => material.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }
    
    // New method for VRM avatar upload
    async uploadUserAvatar(userId, file) {
        try {
            const vrm = await this.avatarManager.uploadVRMAvatar(file, userId);
            
            // Update user info
            const user = this.users.get(userId);
            if (user) {
                user.avatar = vrm.scene;
                user.avatarType = 'vrm';
                
                // Maintain current position if user was already in scene
                if (user.position) {
                    vrm.scene.position.copy(user.position);
                }
                
                // Maintain seat assignment
                if (user.seatId !== null) {
                    const seat = this.seats[user.seatId];
                    if (seat) {
                        const seatPosition = seat.position.clone();
                        seatPosition.y += 1.6;
                        vrm.scene.position.copy(seatPosition);
                    }
                }
            }
            
            return vrm;
        } catch (error) {
            console.error('Failed to upload VRM avatar:', error);
            throw error;
        }
    }
}
