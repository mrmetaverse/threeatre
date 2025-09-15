import * as THREE from 'three';
import { Theatre } from './Theatre.js';
import { WebXRManager } from './WebXRManager.js';
import { NetworkManager } from './NetworkManager.js';

class TheatreApp {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.theatre = null;
        this.webxrManager = null;
        this.networkManager = null;
        this.isHost = false;
        this.users = new Map();
        this.controls = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            speed: 5
        };
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.init();
        this.setupEventListeners();
        this.setupControls();
    }
    
    async init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000011);
        
        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 2, 8); // Better view of the recessed seating
        
        // Create renderer (try WebGPU first, fallback to WebGL)
        await this.initRenderer();
        
        // Enable WebXR
        this.renderer.xr.enabled = true;
        
        // Create theatre
        this.theatre = new Theatre(this.scene);
        
        // Connect camera to theatre for OMI audio 3D surround sound
        this.theatre.setCamera(this.camera);
        
        // Create WebXR manager
        this.webxrManager = new WebXRManager(this.renderer);
        
        // Create network manager
        this.networkManager = new NetworkManager(this);
        
        // Setup lighting
        this.setupLighting();
        
        // Start animation loop
        this.renderer.setAnimationLoop(() => this.animate());
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    async initRenderer() {
        // Always use WebGL for now since WebGPU import path is not available in current Three.js version
        // WebGPU support can be added later when the proper import paths are available
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        console.log('Using WebGL renderer');
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        
        // Add renderer to DOM
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);
    }
    
    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
        this.scene.add(ambientLight);
        
        // Main directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -20;
        directionalLight.shadow.camera.right = 20;
        directionalLight.shadow.camera.top = 20;
        directionalLight.shadow.camera.bottom = -20;
        this.scene.add(directionalLight);
        
        // Fill light
        const fillLight = new THREE.DirectionalLight(0x4444ff, 0.3);
        fillLight.position.set(-5, 3, -5);
        this.scene.add(fillLight);
    }
    
    setupEventListeners() {
        // VR Button
        document.getElementById('vr-button').addEventListener('click', () => {
            this.webxrManager.enterVR();
        });
        
        // AR Button
        document.getElementById('ar-button').addEventListener('click', () => {
            this.webxrManager.enterAR();
        });
        
        // Host Button
        document.getElementById('host-button').addEventListener('click', () => {
            this.startHosting();
        });
        
        // Stop Host Button
        document.getElementById('stop-host-button').addEventListener('click', () => {
            this.stopHosting();
        });
        
        // Copy Room URL Button
        document.getElementById('copy-room-url').addEventListener('click', () => {
            this.copyRoomUrl();
        });
        
        // Avatar Upload Button
        document.getElementById('upload-avatar-button').addEventListener('click', () => {
            document.getElementById('avatar-upload').click();
        });
        
        // Avatar Upload Input
        document.getElementById('avatar-upload').addEventListener('change', (event) => {
            this.handleAvatarUpload(event);
        });
        
        // Reset Avatar Button
        document.getElementById('reset-avatar-button').addEventListener('click', () => {
            this.resetAvatar();
        });
    }
    
    async startHosting() {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { mediaSource: 'screen' },
                audio: true
            });
            
            this.theatre.setHostStream(stream);
            this.isHost = true;
            
            // Update UI
            document.getElementById('host-button').classList.add('hidden');
            document.getElementById('stop-host-button').classList.remove('hidden');
            document.getElementById('host-status').textContent = 'You';
            
            console.log('Started hosting screen share');
        } catch (error) {
            console.error('Error starting screen share:', error);
            alert('Could not start screen sharing. Please make sure you grant permission.');
        }
    }
    
    stopHosting() {
        this.theatre.stopHostStream();
        this.isHost = false;
        
        // Update UI
        document.getElementById('host-button').classList.remove('hidden');
        document.getElementById('stop-host-button').classList.add('hidden');
        document.getElementById('host-status').textContent = 'None';
        
        console.log('Stopped hosting screen share');
    }
    
    copyRoomUrl() {
        if (this.networkManager) {
            this.networkManager.copyRoomUrl();
            
            // Show feedback
            const button = document.getElementById('copy-room-url');
            const originalText = button.textContent;
            button.textContent = '✅ Copied!';
            button.style.background = '#4CAF50';
            
            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '';
            }, 2000);
        }
    }
    
    async handleAvatarUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Validate file type
        const validTypes = ['.vrm', '.glb', '.gltf'];
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!validTypes.includes(fileExtension)) {
            alert('Please upload a VRM, GLB, or GLTF file.');
            return;
        }
        
        // Validate file size (max 50MB)
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (file.size > maxSize) {
            alert('File is too large. Maximum size is 50MB.');
            return;
        }
        
        try {
            this.updateAvatarStatus('Uploading avatar...');
            
            // Get current user ID from network manager
            const userId = this.networkManager?.userId || 'local_user';
            
            // Upload avatar
            await this.theatre.uploadUserAvatar(userId, file);
            
            this.updateAvatarStatus('Avatar uploaded successfully!');
            
            // Clear the file input
            event.target.value = '';
            
            // Notify other users if connected
            if (this.networkManager) {
                this.networkManager.notifyAvatarChange(userId);
            }
            
        } catch (error) {
            console.error('Avatar upload failed:', error);
            this.updateAvatarStatus('Avatar upload failed. Please try again.');
            alert('Failed to upload avatar: ' + error.message);
        }
    }
    
    async resetAvatar() {
        try {
            this.updateAvatarStatus('Resetting avatar...');
            
            const userId = this.networkManager?.userId || 'local_user';
            
            // Remove current avatar
            this.theatre.removeUser(userId);
            
            // Add default avatar
            const userData = {
                id: userId,
                name: `User ${userId.slice(-4)}`,
                color: this.generateUserColor()
            };
            
            await this.theatre.addUser(userId, userData);
            
            this.updateAvatarStatus('Avatar reset to default');
            
            // Notify other users if connected
            if (this.networkManager) {
                this.networkManager.notifyAvatarChange(userId);
            }
            
        } catch (error) {
            console.error('Avatar reset failed:', error);
            this.updateAvatarStatus('Avatar reset failed');
        }
    }
    
    updateAvatarStatus(message) {
        const statusElement = document.getElementById('avatar-status');
        if (statusElement) {
            statusElement.textContent = message;
            
            // Clear status after 3 seconds
            setTimeout(() => {
                statusElement.textContent = '';
            }, 3000);
        }
    }
    
    generateUserColor() {
        const colors = [
            0x4CAF50, // Green
            0x2196F3, // Blue  
            0xFF9800, // Orange
            0x9C27B0, // Purple
            0xF44336, // Red
            0x00BCD4, // Cyan
            0x8BC34A, // Light Green
            0xFF5722, // Deep Orange
            0x3F51B5, // Indigo
            0xE91E63  // Pink
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    setupControls() {
        // Keyboard controls
        document.addEventListener('keydown', (event) => {
            if (!this.renderer.xr.isPresenting) {
                switch(event.code) {
                    case 'KeyW':
                    case 'ArrowUp':
                        this.controls.forward = true;
                        break;
                    case 'KeyS':
                    case 'ArrowDown':
                        this.controls.backward = true;
                        break;
                    case 'KeyA':
                    case 'ArrowLeft':
                        this.controls.left = true;
                        break;
                    case 'KeyD':
                    case 'ArrowRight':
                        this.controls.right = true;
                        break;
                }
            }
        });
        
        document.addEventListener('keyup', (event) => {
            switch(event.code) {
                case 'KeyW':
                case 'ArrowUp':
                    this.controls.forward = false;
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    this.controls.backward = false;
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.controls.left = false;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.controls.right = false;
                    break;
            }
        });
        
        // Mouse controls for seat selection
        this.renderer.domElement.addEventListener('click', (event) => this.onMouseClick(event));
        this.renderer.domElement.addEventListener('mousemove', (event) => this.onMouseMove(event));
        
        // Pointer lock for first-person controls
        this.renderer.domElement.addEventListener('click', () => {
            if (!this.renderer.xr.isPresenting && document.pointerLockElement !== this.renderer.domElement) {
                this.renderer.domElement.requestPointerLock();
            }
        });
        
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === this.renderer.domElement) {
                document.addEventListener('mousemove', this.onPointerMove.bind(this), false);
            } else {
                document.removeEventListener('mousemove', this.onPointerMove.bind(this), false);
            }
        });
    }
    
    onMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }
    
    onMouseClick(event) {
        if (this.renderer.xr.isPresenting) return;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Check for seat intersections - get all seat meshes
        const seatMeshes = [];
        this.theatre.seats.forEach((seat, index) => {
            seat.group.traverse((child) => {
                if (child.isMesh) {
                    child.userData.seatIndex = index; // Store seat index on mesh
                    seatMeshes.push(child);
                }
            });
        });
        
        const intersects = this.raycaster.intersectObjects(seatMeshes, false);
        
        if (intersects.length > 0) {
            const clickedMesh = intersects[0].object;
            const seatIndex = clickedMesh.userData.seatIndex;
            
            console.log('Clicked seat:', seatIndex);
            
            if (seatIndex !== undefined && this.networkManager) {
                this.networkManager.requestSeat(seatIndex);
            }
        }
    }
    
    onPointerMove(event) {
        if (!this.renderer.xr.isPresenting && document.pointerLockElement === this.renderer.domElement) {
            const sensitivity = 0.002;
            
            // Rotate camera based on mouse movement
            this.camera.rotation.y -= event.movementX * sensitivity;
            this.camera.rotation.x -= event.movementY * sensitivity;
            
            // Clamp vertical rotation
            this.camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.camera.rotation.x));
        }
    }
    
    updateMovement(deltaTime) {
        if (this.renderer.xr.isPresenting) return;
        
        const moveSpeed = this.controls.speed * deltaTime;
        const direction = new THREE.Vector3();
        
        if (this.controls.forward) direction.z -= 1;
        if (this.controls.backward) direction.z += 1;
        if (this.controls.left) direction.x -= 1;
        if (this.controls.right) direction.x += 1;
        
        if (direction.length() > 0) {
            direction.normalize();
            
            // Apply camera rotation to movement direction
            const cameraDirection = new THREE.Vector3();
            this.camera.getWorldDirection(cameraDirection);
            
            const right = new THREE.Vector3();
            right.crossVectors(cameraDirection, this.camera.up).normalize();
            
            const forward = new THREE.Vector3();
            forward.copy(cameraDirection);
            forward.y = 0;
            forward.normalize();
            
            const moveVector = new THREE.Vector3();
            moveVector.addScaledVector(forward, -direction.z);
            moveVector.addScaledVector(right, direction.x);
            moveVector.multiplyScalar(moveSpeed);
            
            this.camera.position.add(moveVector);
            
            // Send position update to network
            if (this.networkManager) {
                this.networkManager.updatePosition(this.camera.position);
            }
        }
    }
    
    animate() {
        const deltaTime = 0.016; // Approximate 60fps
        
        this.updateMovement(deltaTime);
        this.theatre.update();
        this.renderer.render(this.scene, this.camera);
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Start the application
new TheatreApp(); 