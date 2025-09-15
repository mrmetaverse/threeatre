import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Theatre } from './Theatre.js';
import { WebXRManager } from './WebXRManager.js';
import { NetworkManager } from './NetworkManager.js';
import { OMISeat } from './OMISeat.js';
import { ChatManager } from './ChatManager.js';
import { Bindle } from './Bindle.js';

class TheatreApp {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.theatre = null;
        this.webxrManager = null;
        this.networkManager = null;
        this.orbitControls = null;
        this.omiSeat = null;
        this.chatManager = null;
        this.bindle = null;
        this.isHost = false;
        this.users = new Map();
        this.controls = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            sprint: false,
            speed: 8, // Base speed for larger space
            sprintSpeed: 16 // Sprint speed
        };
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.gravity = -9.8;
        this.velocity = new THREE.Vector3();
        this.isOnGround = true;
        this.isFlying = false;
        this.jumpPower = 12;
        this.lastJumpTime = 0;
        this.jumpCooldown = 200; // ms between jumps
        this.flySpeed = 10;
        this.tomatoCharging = false;
        this.tomatoChargeStart = 0;
        this.tomatoPower = 0;
        this.maxTomatoPower = 3.0;
        this.isPrivateRoom = false;
        
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
        this.camera.position.set(0, 6, 24); // Better view of the massive recessed seating
        
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
        
        // Connect network manager to theatre
        this.theatre.setNetworkManager(this.networkManager);
        
        // Connect main app reference to theatre
        this.theatre.setApp(this);
        
        // Setup orbit controls for better camera movement
        this.setupOrbitControls();
        
        // Setup OMI seat system
        this.omiSeat = new OMISeat(this.theatre, this.camera, this.orbitControls);
        
        // Setup chat system
        this.chatManager = new ChatManager(this.networkManager, this.scene);
        
        // Setup bindle inventory system
        this.bindle = new Bindle(this.networkManager);
        
        // Setup lighting
        this.setupLighting();
        
        // Start animation loop
        this.renderer.setAnimationLoop(() => this.animate());
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
        
        // Initialize privacy UI
        setTimeout(() => this.updatePrivacyUI(), 1000);
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
        // XR Button
        document.getElementById('xr-button').addEventListener('click', () => {
            if (this.renderer.xr.isPresenting) {
                this.webxrManager.exitSession();
            } else {
                this.webxrManager.enterXR();
            }
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
        
        // UI Toggle Button
        document.getElementById('toggle-ui').addEventListener('click', () => {
            this.toggleUI();
        });
        
        // Privacy Toggle Button
        document.getElementById('privacy-toggle').addEventListener('click', () => {
            this.togglePrivacy();
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
    
    throwTomato() {
        const origin = this.camera.position.clone();
        origin.y += 0.5; // Throw from slightly above camera
        
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        
        // Always allow tomato throwing - in theatre or outside world
        if (this.theatre.roguelikeWorld.isActive) {
            // In dangerous world, tomatoes can hurt ghosts
            const fired = this.theatre.roguelikeWorld.fireTomato(origin, direction);
            if (fired) {
                this.createTomatoThrowEffect();
            }
        } else {
            // In theatre, just throw tomatoes for fun
            this.throwTheatreTomato(origin, direction);
        }
    }
    
    throwTheatreTomato(origin, direction, speed = 15, arc = 3) {
        // Create fun tomato in the theatre
        const tomatoGeometry = new THREE.SphereGeometry(0.15, 8, 6);
        const tomatoMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xff4444,
            emissive: 0x441111,
            emissiveIntensity: 0.2
        });
        const tomato = new THREE.Mesh(tomatoGeometry, tomatoMaterial);
        tomato.position.copy(origin);
        
        // Add green stem
        const stemGeometry = new THREE.CylinderGeometry(0.02, 0.03, 0.1, 6);
        const stemMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
        const stem = new THREE.Mesh(stemGeometry, stemMaterial);
        stem.position.set(0, 0.12, 0);
        tomato.add(stem);
        
        this.scene.add(tomato);
        
        // Animate tomato throw with physics based on charge power
        const velocity = direction.clone().multiplyScalar(speed);
        velocity.y += arc; // Arc trajectory based on power
        
        const animate = () => {
            velocity.y -= 0.3; // Gravity
            tomato.position.add(velocity.clone().multiplyScalar(0.016));
            tomato.rotation.x += 0.2;
            tomato.rotation.z += 0.15;
            
            // Remove when it hits the ground or goes too far
            const maxDistance = 20 + (speed * 2); // Further throws go further
            if (tomato.position.y < 0 || tomato.position.distanceTo(origin) > maxDistance) {
                this.scene.remove(tomato);
                if (tomato.position.y < 0) {
                    this.createTomatoSplat(tomato.position);
                }
                return;
            }
            
            requestAnimationFrame(animate);
        };
        
        animate();
        
        const powerPercent = ((speed / 12 - 0.5) / 1.5 * 100).toFixed(0);
        console.log(`🍅 Tomato thrown in theatre with ${powerPercent}% power!`);
    }
    
    createTomatoThrowEffect() {
        console.log('🍅 Tomato thrown at ghosts!');
    }
    
    createTomatoSplat(position) {
        // Create tomato splat effect
        const splatGeometry = new THREE.CircleGeometry(0.5, 8);
        const splatMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff2222,
            transparent: true,
            opacity: 0.8
        });
        const splat = new THREE.Mesh(splatGeometry, splatMaterial);
        splat.position.copy(position);
        splat.position.y = 0.01; // Just above ground
        splat.rotation.x = -Math.PI / 2;
        
        this.scene.add(splat);
        
        // Fade out splat over time
        let opacity = 0.8;
        const fadeOut = () => {
            opacity -= 0.02;
            splatMaterial.opacity = opacity;
            
            if (opacity > 0) {
                requestAnimationFrame(fadeOut);
            } else {
                this.scene.remove(splat);
                splatMaterial.dispose();
                splatGeometry.dispose();
            }
        };
        
        setTimeout(fadeOut, 1000); // Start fading after 1 second
    }
    
    handleJump() {
        const now = Date.now();
        
        // Check for double jump (flying toggle)
        if (now - this.lastJumpTime < 300) { // Double jump window
            this.toggleFlying();
            return;
        }
        
        // Regular jump
        if (this.isOnGround && !this.isFlying) {
            this.velocity.y = this.jumpPower;
            this.isOnGround = false;
            console.log('🦘 Jump!');
        }
        
        this.lastJumpTime = now;
    }
    
    toggleFlying() {
        this.isFlying = !this.isFlying;
        
        if (this.isFlying) {
            this.velocity.y = 0; // Stop falling
            console.log('✈️ Flying mode enabled!');
            this.showMessage('Flying mode enabled - double jump again to land', 'info');
        } else {
            console.log('🚶 Flying mode disabled');
            this.showMessage('Flying mode disabled', 'info');
        }
    }
    
    startChargingTomato() {
        if (this.tomatoCharging) return;
        
        this.tomatoCharging = true;
        this.tomatoChargeStart = Date.now();
        this.tomatoPower = 0;
        
        console.log('🍅 Charging tomato throw...');
        this.showTomatoChargeMeter();
        
        // Update charge power
        this.updateTomatoCharge();
    }
    
    updateTomatoCharge() {
        if (!this.tomatoCharging) return;
        
        const elapsed = Date.now() - this.tomatoChargeStart;
        this.tomatoPower = Math.min(elapsed / 2000, this.maxTomatoPower); // 2 seconds for max power
        
        // Update charge meter
        this.updateTomatoChargeMeter();
        
        if (this.tomatoCharging) {
            requestAnimationFrame(() => this.updateTomatoCharge());
        }
    }
    
    throwChargedTomato() {
        if (!this.tomatoCharging) return;
        
        this.tomatoCharging = false;
        this.hideTomatoChargeMeter();
        
        const origin = this.camera.position.clone();
        origin.y += 0.5;
        
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        
        // Calculate power-based parameters
        const powerMultiplier = 0.5 + (this.tomatoPower * 1.5); // 0.5x to 2x power
        const speed = 12 * powerMultiplier;
        const arc = 2 + (this.tomatoPower * 3); // Higher arc for more power
        
        console.log(`🍅 Throwing tomato with ${(this.tomatoPower * 100).toFixed(0)}% power!`);
        
        if (this.theatre.roguelikeWorld.isActive) {
            this.theatre.roguelikeWorld.fireTomato(origin, direction, powerMultiplier);
        } else {
            this.throwTheatreTomato(origin, direction, speed, arc);
        }
        
        this.tomatoPower = 0;
    }
    
    showTomatoChargeMeter() {
        const meterDiv = document.createElement('div');
        meterDiv.id = 'tomato-charge-meter';
        meterDiv.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            width: 200px;
            height: 20px;
            background: rgba(0, 0, 0, 0.8);
            border: 2px solid #ff4444;
            border-radius: 12px;
            padding: 4px;
            z-index: 1000;
        `;
        
        const meterFill = document.createElement('div');
        meterFill.id = 'tomato-charge-fill';
        meterFill.style.cssText = `
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #ffaa00, #ff4444, #ff0000);
            border-radius: 8px;
            transition: width 0.1s ease;
        `;
        
        meterDiv.appendChild(meterFill);
        document.body.appendChild(meterDiv);
        
        // Add charge text
        const chargeText = document.createElement('div');
        chargeText.style.cssText = `
            position: fixed;
            bottom: 130px;
            left: 50%;
            transform: translateX(-50%);
            color: #ff4444;
            font-size: 14px;
            font-weight: bold;
            z-index: 1000;
            text-align: center;
        `;
        chargeText.textContent = '🍅 Hold T to charge throw power!';
        chargeText.id = 'tomato-charge-text';
        document.body.appendChild(chargeText);
    }
    
    updateTomatoChargeMeter() {
        const fill = document.getElementById('tomato-charge-fill');
        if (fill) {
            const percentage = (this.tomatoPower / this.maxTomatoPower) * 100;
            fill.style.width = percentage + '%';
            
            // Change color based on power
            if (percentage < 33) {
                fill.style.background = 'linear-gradient(90deg, #ffaa00, #ff6600)';
            } else if (percentage < 66) {
                fill.style.background = 'linear-gradient(90deg, #ff6600, #ff4444)';
            } else {
                fill.style.background = 'linear-gradient(90deg, #ff4444, #ff0000)';
                fill.style.boxShadow = '0 0 10px #ff0000';
            }
        }
    }
    
    hideTomatoChargeMeter() {
        const meter = document.getElementById('tomato-charge-meter');
        const text = document.getElementById('tomato-charge-text');
        
        if (meter) document.body.removeChild(meter);
        if (text) document.body.removeChild(text);
    }
    
    togglePrivacy() {
        if (this.networkManager.sessionMode === 'local') {
            // Local mode - toggle between local and attempting public
            if (this.isPrivateRoom) {
                // Switch to public attempt
                this.isPrivateRoom = false;
                this.showMessage('Attempting to join public session...', 'info');
                // Reload to try connecting to public session
                window.location.search = '';
            } else {
                // Switch to private local
                this.isPrivateRoom = true;
                this.showMessage('Switched to private local session', 'info');
            }
        } else {
            // Production mode - create private room
            this.isPrivateRoom = !this.isPrivateRoom;
            
            if (this.isPrivateRoom) {
                // Generate new private room
                const privateRoomId = this.networkManager.generateRoomId();
                window.location.search = `?room=${privateRoomId}`;
            } else {
                // Go back to public session
                window.location.search = '';
            }
        }
        
        this.updatePrivacyUI();
    }
    
    updatePrivacyUI() {
        const button = document.getElementById('privacy-toggle');
        const status = document.getElementById('privacy-status');
        
        if (this.networkManager.sessionMode === 'local') {
            button.textContent = '🏠 Local';
            button.style.background = 'linear-gradient(135deg, rgba(0, 255, 255, 0.2), rgba(0, 150, 255, 0.3))';
            status.textContent = 'Local network session';
            status.style.color = '#00ffff';
        } else if (this.isPrivateRoom) {
            button.textContent = '🔒 Private';
            button.style.background = 'linear-gradient(135deg, rgba(255, 165, 0, 0.2), rgba(255, 140, 0, 0.3))';
            status.textContent = 'Private room - share URL to invite';
            status.style.color = '#ffa500';
        } else {
            button.textContent = '🌐 Public';
            button.style.background = 'linear-gradient(135deg, rgba(0, 255, 0, 0.2), rgba(0, 200, 0, 0.3))';
            status.textContent = this.networkManager.isSessionHost ? 'Hosting public session' : 'Joined public session';
            status.style.color = '#4CAF50';
        }
    }
    
    toggleUI() {
        const ui = document.getElementById('ui');
        const toggleButton = document.getElementById('toggle-ui');
        
        console.log('Toggling UI, current state:', ui.classList.contains('hidden'));
        
        ui.classList.toggle('hidden');
        
        // Update toggle button icon
        if (ui.classList.contains('hidden')) {
            toggleButton.textContent = '›';
            console.log('UI hidden, showing expand button');
        } else {
            toggleButton.textContent = '‹';
            console.log('UI shown, showing collapse button');
        }
    }
    
    showMessage(message, type = 'info') {
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: ${type === 'error' ? '#ff6666' : '#00ffff'};
            padding: 16px 24px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 500;
            z-index: 1000;
            text-align: center;
            border: 1px solid ${type === 'error' ? '#ff6666' : '#00ffff'};
            backdrop-filter: blur(10px);
        `;
        messageDiv.textContent = message;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            if (document.body.contains(messageDiv)) {
                document.body.removeChild(messageDiv);
            }
        }, 2000);
    }
    
    setupOrbitControls() {
        this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
        
        // Configure for theatre experience with gravity
        this.orbitControls.enableDamping = true;
        this.orbitControls.dampingFactor = 0.05;
        this.orbitControls.enableZoom = true;
        this.orbitControls.enablePan = false; // Disable panning to prevent floating
        
        // Set limits for more natural movement
        this.orbitControls.maxPolarAngle = Math.PI * 0.8; // Prevent looking too far up
        this.orbitControls.minPolarAngle = Math.PI * 0.1; // Prevent looking too far down
        this.orbitControls.maxDistance = 100; // Allow zooming out to see the massive space
        this.orbitControls.minDistance = 2;
        
        // Set target to the center of the theatre
        this.orbitControls.target.set(0, 10, -20);
        
        // Disable orbit controls when in VR/AR
        this.orbitControls.enabled = !this.renderer.xr.isPresenting;
        
        console.log('Orbit controls configured for massive theatre');
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
                    case 'Space':
                        event.preventDefault();
                        this.handleJump();
                        break;
                    case 'KeyT':
                        event.preventDefault();
                        this.startChargingTomato();
                        break;
                    case 'Escape':
                        event.preventDefault();
                        if (this.omiSeat) {
                            this.omiSeat.handleKeyPress(event);
                        }
                        break;
                    case 'ShiftLeft':
                    case 'ShiftRight':
                        this.controls.sprint = true;
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
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.controls.sprint = false;
                    break;
                case 'KeyT':
                    this.throwChargedTomato();
                    break;
            }
        });
        
        // Mouse controls for seat selection
        this.renderer.domElement.addEventListener('click', (event) => this.onMouseClick(event));
        this.renderer.domElement.addEventListener('mousemove', (event) => this.onMouseMove(event));
        
        // Double-click for pointer lock (to avoid conflicts with seat selection)
        this.renderer.domElement.addEventListener('dblclick', () => {
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
        
        // Prevent seat clicking when UI is being clicked
        if (event.target.closest('#ui')) return;
        
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
        
        // Check for treasure chest click first (if in dangerous world)
        if (this.theatre.roguelikeWorld.isActive && this.theatre.roguelikeWorld.treasureChest) {
            const treasureIntersects = this.raycaster.intersectObjects([this.theatre.roguelikeWorld.treasureChest], true);
            if (treasureIntersects.length > 0) {
                const opened = this.theatre.roguelikeWorld.openTreasureChest();
                if (opened) {
                    return; // Don't process other clicks
                }
            }
        }
        
        // Check for seat clicks (only in theatre)
        if (!this.theatre.roguelikeWorld.isActive) {
            const intersects = this.raycaster.intersectObjects(seatMeshes, false);
            
            if (intersects.length > 0) {
                const clickedMesh = intersects[0].object;
                const seatIndex = clickedMesh.userData.seatIndex;
                
                console.log('Clicked seat:', seatIndex);
                
                // Check if seat is available
                const seatInfo = this.theatre.seats[seatIndex];
                if (seatInfo && !seatInfo.occupied) {
                    // Use OMI_seat to sit down locally first
                    this.omiSeat.sitInSeat(seatInfo);
                    
                    // Then request seat from server
                    if (this.networkManager) {
                        this.networkManager.requestSeat(seatIndex);
                    }
                } else if (seatInfo && seatInfo.occupied) {
                    console.log('Seat is occupied by:', seatInfo.userId);
                    this.showMessage('Seat is occupied', 'error');
                }
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
        
        // Update orbit controls
        if (this.orbitControls) {
            this.orbitControls.update();
        }
        
        const moveSpeed = (this.controls.sprint ? this.controls.sprintSpeed : this.controls.speed) * deltaTime;
        const direction = new THREE.Vector3();
        
        if (this.controls.forward) direction.z -= 1;
        if (this.controls.backward) direction.z += 1;
        if (this.controls.left) direction.x -= 1;
        if (this.controls.right) direction.x += 1;
        
        if (direction.length() > 0) {
            direction.normalize();
            
            // Get the camera's forward and right vectors
            const cameraDirection = new THREE.Vector3();
            this.camera.getWorldDirection(cameraDirection);
            
            const right = new THREE.Vector3();
            right.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0)).normalize();
            
            const forward = new THREE.Vector3();
            forward.copy(cameraDirection);
            forward.y = 0; // Keep movement horizontal
            forward.normalize();
            
            // Calculate movement vector
            const moveVector = new THREE.Vector3();
            moveVector.addScaledVector(forward, -direction.z);
            moveVector.addScaledVector(right, direction.x);
            moveVector.multiplyScalar(moveSpeed);
            
            let newPosition = this.camera.position.clone().add(moveVector);
            
            if (this.isFlying) {
                // Flying mode - free movement in 3D space
                if (this.controls.forward || this.controls.backward) {
                    // Move in camera direction when flying
                    const flyDirection = new THREE.Vector3();
                    this.camera.getWorldDirection(flyDirection);
                    flyDirection.multiplyScalar(direction.z * this.flySpeed * deltaTime);
                    newPosition.add(flyDirection);
                }
                
                // No gravity when flying
                this.velocity.y = 0;
                this.isOnGround = false;
            } else {
                // Normal walking mode with gravity
                this.velocity.y += this.gravity * deltaTime;
                newPosition.y += this.velocity.y * deltaTime;
                
                // Ground collision detection
                const groundHeight = this.getGroundHeight(newPosition);
                if (newPosition.y <= groundHeight + 1.6) {
                    newPosition.y = groundHeight + 1.6; // Eye height
                    this.velocity.y = 0;
                    this.isOnGround = true;
                } else {
                    this.isOnGround = false;
                }
            }
            
            this.camera.position.copy(newPosition);
            
            // Update orbit controls target to follow player
            if (this.orbitControls) {
                this.orbitControls.target.copy(this.camera.position);
                this.orbitControls.target.y = this.camera.position.y;
                this.orbitControls.target.addScaledVector(cameraDirection, 5);
            }
            
            // Send position update to network
            if (this.networkManager) {
                this.networkManager.updatePosition(this.camera.position);
            }
        }
    }
    
    getGroundHeight(position) {
        // Simple ground height detection for the theatre
        // In recessed seating area
        if (position.z < 3 && position.z > -45) {
            return -1.5 + Math.max(0, (position.z + 42) / 3.3) * 0.15;
        }
        // On main floor
        return 0;
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