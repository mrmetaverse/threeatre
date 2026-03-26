import * as THREE from 'three';
import { AvatarManager } from './AvatarManager.js';
import { RoguelikeWorld } from './RoguelikeWorld.js';
import { setOMIPhysicsProfile } from './OMIPhysics.js';

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
        this.roguelikeWorld = new RoguelikeWorld(scene, this);
        this.camera = null; // Will be set by main app
        this.exitPortal = null;
        this.networkManager = null; // Will be set by main app
        this.app = null; // Reference to main app for bindle access
        this._streamCanvas = null;
        this._streamCtx = null;
        this._streamFrameIntervalMs = 1000 / 20;
        this._lastStreamFrameMs = 0;
        this._cullFrustum = new THREE.Frustum();
        this._cullProjScreen = new THREE.Matrix4();
        this._avatarCullDistance = 140;
        this._lastCullUpdateMs = 0;
        this._cullUpdateIntervalMs = 150;
        this._lastTransitionCheckPosition = null;
        this.theatreSpeakerAnchors = [];
        this.theatreSpeakerAudioNodes = [];
        this._theatreSpeakerAudioUnlocked = false;
        this._theatreSpeakerBaseVolume = 0.22;
        
        this.init();
    }
    
    init() {
        this.createTheatreGeometry();
        this.createSeats();
        this.createScreen();
        this.createLighting();
        this.createSurroundSpeakerFixtures();
        this.setupTheatreAudio();
    }

    createSurroundSpeakerFixtures() {
        const focusPoint = new THREE.Vector3(0, 6, -20);
        const speakerPositions = [
            // Left wall
            new THREE.Vector3(-45.2, 8, -38),
            new THREE.Vector3(-45.2, 10, -18),
            new THREE.Vector3(-45.2, 10, 4),
            new THREE.Vector3(-45.2, 8, 26),
            // Right wall
            new THREE.Vector3(45.2, 8, -38),
            new THREE.Vector3(45.2, 10, -18),
            new THREE.Vector3(45.2, 10, 4),
            new THREE.Vector3(45.2, 8, 26),
            // Rear wall
            new THREE.Vector3(-20, 9, 59),
            new THREE.Vector3(0, 10, 59),
            new THREE.Vector3(20, 9, 59)
        ];

        speakerPositions.forEach((position, index) => {
            const anchor = new THREE.Object3D();
            anchor.position.copy(position);
            anchor.lookAt(focusPoint);
            anchor.name = `theatre-speaker-${index}`;
            anchor.userData.noCollision = true;

            const cabinet = new THREE.Mesh(
                new THREE.BoxGeometry(1.6, 1.2, 1.1),
                new THREE.MeshLambertMaterial({ color: 0x111111 })
            );
            cabinet.castShadow = true;
            cabinet.receiveShadow = true;

            const cone = new THREE.Mesh(
                new THREE.CylinderGeometry(0.25, 0.3, 0.15, 18),
                new THREE.MeshLambertMaterial({ color: 0x2f2f2f })
            );
            cone.rotation.x = Math.PI / 2;
            cone.position.z = 0.55;

            const tweeter = new THREE.Mesh(
                new THREE.SphereGeometry(0.12, 12, 10),
                new THREE.MeshLambertMaterial({ color: 0x444444 })
            );
            tweeter.position.set(0, 0.25, 0.52);

            anchor.add(cabinet);
            anchor.add(cone);
            anchor.add(tweeter);
            this.scene.add(anchor);
            this.theatreSpeakerAnchors.push(anchor);
        });
    }

    clearTheatreSpeakerAudio() {
        this.theatreSpeakerAudioNodes.forEach((audioNode) => {
            if (!audioNode) return;
            try {
                audioNode.disconnect();
            } catch (e) {
                // no-op
            }
            if (audioNode.parent) {
                audioNode.parent.remove(audioNode);
            }
        });
        this.theatreSpeakerAudioNodes = [];
        this._theatreSpeakerAudioUnlocked = false;
    }

    setupTheatreSpeakerAudio(stream) {
        this.clearTheatreSpeakerAudio();

        const listener = this.avatarManager?.audioListener;
        if (!listener) return false;
        if (!stream || stream.getAudioTracks().length === 0) return false;
        if (this.theatreSpeakerAnchors.length === 0) return false;

        this.theatreSpeakerAnchors.forEach((anchor) => {
            const speakerAudio = new THREE.PositionalAudio(listener);
            speakerAudio.setMediaStreamSource(stream);
            speakerAudio.setDistanceModel('inverse');
            speakerAudio.setRefDistance(15);
            speakerAudio.setRolloffFactor(1.2);
            speakerAudio.setMaxDistance(160);
            speakerAudio.setDirectionalCone(65, 160, 0.25);
            speakerAudio.setVolume(0); // unlocked by user gesture
            anchor.add(speakerAudio);
            this.theatreSpeakerAudioNodes.push(speakerAudio);
        });

        return true;
    }

    async enableTheatreSpeakerAudio() {
        const listener = this.avatarManager?.audioListener;
        if (!listener || this.theatreSpeakerAudioNodes.length === 0) return false;

        const audioContext = listener.context;
        if (audioContext?.state === 'suspended') {
            try {
                await audioContext.resume();
            } catch (e) {
                // no-op
            }
        }

        this.theatreSpeakerAudioNodes.forEach((speakerAudio) => {
            speakerAudio.setVolume(this._theatreSpeakerBaseVolume);
        });
        this._theatreSpeakerAudioUnlocked = true;
        return true;
    }

    applyStaticOMICollider(object3D, collider = {}) {
        setOMIPhysicsProfile(object3D, {
            collider: {
                type: collider.type || 'box',
                size: collider.size || null,
                radius: collider.radius,
                height: collider.height,
                translation: collider.translation || [0, 0, 0],
                scale: collider.scale || [1, 1, 1],
                enabled: collider.enabled !== false,
                layers: ['world', 'player']
            },
            physics: {
                bodyType: 'static',
                friction: collider.friction ?? 0.9,
                restitution: collider.restitution ?? 0.02,
                mass: 0
            }
        });
    }
    
    createTheatreGeometry() {
        // Create massive main floor - 3x larger
        const mainFloorGeometry = new THREE.PlaneGeometry(90, 60);
        const floorMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x2a2a2a,
            side: THREE.DoubleSide 
        });
        const mainFloor = new THREE.Mesh(mainFloorGeometry, floorMaterial);
        mainFloor.rotation.x = -Math.PI / 2;
        mainFloor.position.z = 30;
        mainFloor.receiveShadow = true;
        this.scene.add(mainFloor);
        
        // Create massive recessed seating floor (lower level)
        const seatingFloorGeometry = new THREE.PlaneGeometry(84, 54);
        const seatingFloorMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x1a1a1a,
            side: THREE.DoubleSide 
        });
        const seatingFloor = new THREE.Mesh(seatingFloorGeometry, seatingFloorMaterial);
        seatingFloor.rotation.x = -Math.PI / 2;
        seatingFloor.position.set(0, -1.5, -15);
        seatingFloor.receiveShadow = true;
        this.scene.add(seatingFloor);
        
        // Create grand steps between levels
        for (let i = 0; i < 8; i++) {
            const stepGeometry = new THREE.BoxGeometry(84, 0.3, 3);
            const stepMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
            const step = new THREE.Mesh(stepGeometry, stepMaterial);
            step.position.set(0, -0.2 - (i * 0.2), 3 - (i * 3));
            step.receiveShadow = true;
            step.castShadow = true;
            this.scene.add(step);
            this.applyStaticOMICollider(step, { type: 'box', size: [84, 0.45, 3] });
        }
        
        // Create walls
        this.createWalls();
        
        // Create megalithic vaulted ceiling - much higher like ancient pyramid chambers
        this.createMegalithicCeiling();
        
        // Create massive elevated stage
        const stageGeometry = new THREE.BoxGeometry(90, 3.6, 18);
        const stageMaterial = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
        this.stage = new THREE.Mesh(stageGeometry, stageMaterial);
        this.stage.position.set(0, 1.8, -51);
        this.stage.castShadow = true;
        this.stage.receiveShadow = true;
        this.scene.add(this.stage);
        this.applyStaticOMICollider(this.stage, { type: 'box', size: [90, 3.6, 18] });
    }
    
    createWalls() {
        // Ancient stone wall material with texture-like appearance
        const stoneMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x4a3c2a
        });
        
        // Back wall - colossal stone blocks
        const backWallGeometry = new THREE.BoxGeometry(96, 60, 6);
        const backWall = new THREE.Mesh(backWallGeometry, stoneMaterial);
        backWall.position.set(0, 30, -63);
        backWall.receiveShadow = true;
        this.scene.add(backWall);
        this.walls.push(backWall);
        this.applyStaticOMICollider(backWall, { type: 'box', size: [96, 60, 6] });
        
        // Left wall - towering megalithic stones
        const leftWallGeometry = new THREE.BoxGeometry(6, 60, 132);
        const leftWall = new THREE.Mesh(leftWallGeometry, stoneMaterial);
        leftWall.position.set(-48, 30, 0);
        leftWall.receiveShadow = true;
        this.scene.add(leftWall);
        this.walls.push(leftWall);
        this.applyStaticOMICollider(leftWall, { type: 'box', size: [6, 60, 132] });
        
        // Right wall - towering megalithic stones
        const rightWallGeometry = new THREE.BoxGeometry(6, 60, 132);
        const rightWall = new THREE.Mesh(rightWallGeometry, stoneMaterial);
        rightWall.position.set(48, 30, 0);
        rightWall.receiveShadow = true;
        this.scene.add(rightWall);
        this.walls.push(rightWall);
        this.applyStaticOMICollider(rightWall, { type: 'box', size: [6, 60, 132] });
        
        // Front wall with exit door
        this.createFrontWallWithExit(stoneMaterial);
        
        // Add megalithic pillars for atmosphere
        this.createMegalithicPillars(stoneMaterial);
    }
    
    createFrontWallWithExit(stoneMaterial) {
        // Left part of massive front wall
        const frontLeftGeometry = new THREE.BoxGeometry(30, 60, 6);
        const frontLeft = new THREE.Mesh(frontLeftGeometry, stoneMaterial);
        frontLeft.position.set(-33, 30, 63);
        frontLeft.receiveShadow = true;
        this.scene.add(frontLeft);
        this.walls.push(frontLeft);
        this.applyStaticOMICollider(frontLeft, { type: 'box', size: [30, 60, 6] });
        
        // Right part of massive front wall
        const frontRightGeometry = new THREE.BoxGeometry(30, 60, 6);
        const frontRight = new THREE.Mesh(frontRightGeometry, stoneMaterial);
        frontRight.position.set(33, 30, 63);
        frontRight.receiveShadow = true;
        this.scene.add(frontRight);
        this.walls.push(frontRight);
        this.applyStaticOMICollider(frontRight, { type: 'box', size: [30, 60, 6] });
        
        // Top part above exit - grand archway
        const frontTopGeometry = new THREE.BoxGeometry(36, 24, 6);
        const frontTop = new THREE.Mesh(frontTopGeometry, stoneMaterial);
        frontTop.position.set(0, 48, 63);
        frontTop.receiveShadow = true;
        this.scene.add(frontTop);
        this.walls.push(frontTop);
        this.applyStaticOMICollider(frontTop, { type: 'box', size: [36, 24, 6] });
        
        // Massive exit door frame - ominous dark opening
        const doorFrameGeometry = new THREE.BoxGeometry(25.5, 37.5, 1.5);
        const doorFrameMaterial = new THREE.MeshLambertMaterial({ color: 0x2a1f15 });
        const doorFrame = new THREE.Mesh(doorFrameGeometry, doorFrameMaterial);
        doorFrame.position.set(0, 18, 62.25);
        doorFrame.userData.noCollision = true;
        this.scene.add(doorFrame);
        
        // Dark exit portal - imposing gateway
        const exitGeometry = new THREE.PlaneGeometry(21, 33);
        const exitMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x000000,
            transparent: true,
            opacity: 0.9
        });
        this.exitPortal = new THREE.Mesh(exitGeometry, exitMaterial);
        this.exitPortal.position.set(0, 18, 62.4);
        this.exitPortal.name = 'exit-portal';
        this.scene.add(this.exitPortal);
        
        // Warning signs near exit
        this.createExitWarning();
    }
    
    createExitWarning() {
        // Create massive warning text above exit
        const warningGeometry = new THREE.PlaneGeometry(18, 3);
        const warningMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000,
            transparent: true,
            opacity: 0.8
        });
        const warning = new THREE.Mesh(warningGeometry, warningMaterial);
        warning.position.set(0, 39, 61.5);
        this.scene.add(warning);
        
        // Add larger skull decorations
        for (let i = 0; i < 5; i++) {
            const skullGeometry = new THREE.SphereGeometry(0.9, 8, 6);
            const skullMaterial = new THREE.MeshLambertMaterial({ color: 0xccccaa });
            const skull = new THREE.Mesh(skullGeometry, skullMaterial);
            skull.position.set((i - 2) * 6, 40.5, 60.9);
            skull.castShadow = true;
            this.scene.add(skull);
        }
    }
    
    createMegalithicPillars(stoneMaterial) {
        // Colossal stone pillars supporting the massive ceiling (no middle pillars)
        const pillarPositions = [
            [-36, 0, -30], [36, 0, -30],
            [-36, 0, -15], [36, 0, -15],
            [-36, 0, 0], [36, 0, 0],
            [-36, 0, 15], [36, 0, 15],
            [-36, 0, 30], [36, 0, 30]
        ];
        
        pillarPositions.forEach(pos => {
            const pillarGeometry = new THREE.CylinderGeometry(1.2, 1.8, 54, 12);
            const pillar = new THREE.Mesh(pillarGeometry, stoneMaterial);
            pillar.position.set(pos[0], 27, pos[1]);
            pillar.castShadow = true;
            pillar.receiveShadow = true;
            this.scene.add(pillar);
            
            // Add elegant capital on top
            const capitalGeometry = new THREE.CylinderGeometry(2.4, 1.8, 3, 12);
            const capital = new THREE.Mesh(capitalGeometry, stoneMaterial);
            capital.position.set(pos[0], 55.5, pos[1]);
            capital.castShadow = true;
            this.scene.add(capital);
        });
    }
    
    createMegalithicCeiling() {
        const stoneMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x3a2f1f,
            side: THREE.DoubleSide 
        });
        
        // Create massive vaulted ceiling sections - pyramid chamber style
        const ceilingHeight = 75; // Much higher ceiling
        const segments = 12;
        
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const nextAngle = ((i + 1) / segments) * Math.PI * 2;
            
            // Create triangular ceiling sections
            const geometry = new THREE.BufferGeometry();
            const vertices = new Float32Array([
                // Triangle pointing to center peak
                0, ceilingHeight, 0,  // Peak
                Math.cos(angle) * 45, 54, Math.sin(angle) * 60,  // Edge 1
                Math.cos(nextAngle) * 45, 54, Math.sin(nextAngle) * 60   // Edge 2
            ]);
            
            geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            geometry.computeVertexNormals();
            
            const ceilingSection = new THREE.Mesh(geometry, stoneMaterial);
            ceilingSection.receiveShadow = true;
            this.scene.add(ceilingSection);
        }
        
        // Add ancient hieroglyphs on ceiling (simple geometric patterns)
        this.addCeilingDecorations();
    }
    
    addCeilingDecorations() {
        // Add mysterious glowing runes on the massive ceiling
        const runePositions = [
            [0, 66, -30], [0, 66, 0], [0, 66, 30],
            [-24, 60, -15], [24, 60, -15], [-24, 60, 15], [24, 60, 15],
            [-12, 58, -45], [12, 58, -45], [-12, 58, 45], [12, 58, 45]
        ];
        
        runePositions.forEach(pos => {
            const runeGeometry = new THREE.RingGeometry(0.9, 2.4, 8);
            const runeMaterial = new THREE.MeshBasicMaterial({ 
                color: 0x4444ff,
                transparent: true,
                opacity: 0.6,
                side: THREE.DoubleSide
            });
            const rune = new THREE.Mesh(runeGeometry, runeMaterial);
            rune.position.set(pos[0], pos[1], pos[2]);
            rune.rotation.x = -Math.PI / 2;
            this.scene.add(rune);
            
            // Make runes glow and pulse
            setInterval(() => {
                runeMaterial.opacity = 0.3 + Math.sin(Date.now() * 0.003 + pos[0]) * 0.3;
            }, 50);
        });
    }
    
    createSeats() {
        // 25% larger seats
        const seatGeometry = new THREE.BoxGeometry(1.5, 1.25, 1.25);
        const seatMaterial = new THREE.MeshLambertMaterial({ color: 0x8b0000 });
        const backrestGeometry = new THREE.BoxGeometry(1.5, 1.875, 0.25);
        
        const rows = 10; // Reduced from 15 to 10 rows
        const seatsPerRow = 16; // Reduced from 24 to 16 seats per row
        const seatSpacing = 4; // Increased spacing for larger seats
        const rowSpacing = 4.5; // Increased row spacing
        
        for (let row = 0; row < rows; row++) {
            for (let seatIndex = 0; seatIndex < seatsPerRow; seatIndex++) {
                const seatGroup = new THREE.Group();
                
                // Larger seat base
                const seat = new THREE.Mesh(seatGeometry, seatMaterial);
                seat.position.y = 0.625; // Adjusted for larger seat
                seat.castShadow = true;
                seatGroup.add(seat);
                
                // Larger seat backrest - positioned to face the screen
                const backrest = new THREE.Mesh(backrestGeometry, seatMaterial);
                backrest.position.set(0, 1.5625, 0.5); // Adjusted for larger seat
                backrest.castShadow = true;
                seatGroup.add(backrest);
                
                // Position seats in massive recessed area, facing the screen
                const x = (seatIndex - seatsPerRow / 2 + 0.5) * seatSpacing;
                const z = -42 + (row * rowSpacing); // Start from back, face forward
                const y = -1.5 + (row * 0.15); // In recessed floor with slight elevation
                
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
        // Create massive screen frame - 3x larger
        const frameGeometry = new THREE.BoxGeometry(72, 42, 1.5);
        const frameMaterial = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const frame = new THREE.Mesh(frameGeometry, frameMaterial);
        frame.position.set(0, 21, -58.5);
        frame.castShadow = true;
        this.scene.add(frame);
        
        // Create massive screen surface - 3x larger
        const screenGeometry = new THREE.PlaneGeometry(66, 36);
        const screenMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x111111,
            side: THREE.DoubleSide 
        });
        
        this.screen = new THREE.Mesh(screenGeometry, screenMaterial);
        this.screen.position.set(0, 21, -57);
        this.screen.name = 'theatre-screen';
        this.scene.add(this.screen);
    }
    
    createLighting() {
        // Massive dramatic screen lighting from high above
        const screenLight = new THREE.SpotLight(0xffffff, 1.2, 120, Math.PI / 10, 0.1);
        screenLight.position.set(0, 45, -45);
        screenLight.target = this.screen;
        screenLight.castShadow = true;
        this.scene.add(screenLight);
        
        // Additional screen lighting for the massive screen
        const screenLight2 = new THREE.SpotLight(0xffffff, 0.8, 100, Math.PI / 8, 0.2);
        screenLight2.position.set(-20, 35, -40);
        screenLight2.target = this.screen;
        this.scene.add(screenLight2);
        
        const screenLight3 = new THREE.SpotLight(0xffffff, 0.8, 100, Math.PI / 8, 0.2);
        screenLight3.position.set(20, 35, -40);
        screenLight3.target = this.screen;
        this.scene.add(screenLight3);
        
        // Mysterious ambient lighting from the runes - scaled up
        const runeLight1 = new THREE.PointLight(0x4444ff, 1.2, 75);
        runeLight1.position.set(0, 60, -30);
        this.scene.add(runeLight1);
        
        const runeLight2 = new THREE.PointLight(0x4444ff, 0.9, 60);
        runeLight2.position.set(-24, 54, 0);
        this.scene.add(runeLight2);
        
        const runeLight3 = new THREE.PointLight(0x4444ff, 0.9, 60);
        runeLight3.position.set(24, 54, 0);
        this.scene.add(runeLight3);
        
        // Ancient torch lighting on massive pillars (no middle torches)
        const torchPositions = [
            [-36, 45, -30], [36, 45, -30],
            [-36, 45, -15], [36, 45, -15],
            [-36, 45, 0], [36, 45, 0],
            [-36, 45, 15], [36, 45, 15],
            [-36, 45, 30], [36, 45, 30]
        ];
        
        torchPositions.forEach(pos => {
            const torchLight = new THREE.PointLight(0xff6600, 1.8, 45);
            torchLight.position.set(pos[0], pos[1], pos[2]);
            torchLight.castShadow = true;
            this.scene.add(torchLight);
            
            // Flickering effect
            setInterval(() => {
                torchLight.intensity = 1.2 + Math.random() * 1.2;
            }, 100 + Math.random() * 200);
        });
        
        // Ominous exit lighting - red and foreboding, scaled up
        const exitLight = new THREE.PointLight(0xff0000, 0.9, 36);
        exitLight.position.set(0, 24, 54);
        this.scene.add(exitLight);
        
        // Make exit light pulse ominously
        setInterval(() => {
            exitLight.intensity = 0.6 + Math.sin(Date.now() * 0.005) * 0.6;
        }, 50);
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
    
    setHostStream(stream, isLocalHost = false) {
        this.stopHostStream();
        this._streamFrameIntervalMs = isLocalHost ? (1000 / 12) : (1000 / 20);
        this._lastStreamFrameMs = 0;

        const video = document.createElement('video');
        this.hostVideo = video;

        video.autoplay = true;
        video.playsInline = true;
        video.disablePictureInPicture = true;
        video.muted = true;
        video.volume = 1.0;

        video.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
        document.body.appendChild(video);
        video.srcObject = stream;

        const hasAudio = stream.getAudioTracks().length > 0;
        const hasSpatialSpeakerRouting = hasAudio && this.setupTheatreSpeakerAudio(stream);

        video.addEventListener('loadedmetadata', () => {
            const w = video.videoWidth;
            const h = video.videoHeight;
            const ar = w / h;
            console.log('Stream:', w, 'x', h, '| audio tracks:', stream.getAudioTracks().length, '| local:', isLocalHost);

            this.adjustScreenToContent(ar);

            if (this.videoTexture) this.videoTexture.dispose();

            // Local host preview is intentionally lighter to avoid GPU spikes/crashes.
            const texW = Math.min(w, isLocalHost ? 960 : 1280);
            const texH = Math.round(texW / ar);

            this._streamCanvas = document.createElement('canvas');
            this._streamCanvas.width = texW;
            this._streamCanvas.height = texH;
            this._streamCtx = this._streamCanvas.getContext('2d', { alpha: false, willReadFrequently: false });

            this.videoTexture = new THREE.CanvasTexture(this._streamCanvas);
            this.videoTexture.minFilter = THREE.LinearFilter;
            this.videoTexture.magFilter = THREE.LinearFilter;
            this.videoTexture.generateMipmaps = false;
            this.videoTexture.colorSpace = THREE.SRGBColorSpace;

            this.screen.material.dispose();
            this.screen.material = new THREE.MeshBasicMaterial({
                map: this.videoTexture,
                side: THREE.DoubleSide,
                toneMapped: false
            });

            console.log('Stream texture:', texW, 'x', texH, '(canvas-based)');

            if (!isLocalHost && hasAudio) {
                this.showUnmuteOverlay(video);
            }
        });

        video.addEventListener('canplay', () => {
            video.play().catch(() => {});
        });

        if (!isLocalHost) {
            video.addEventListener('stalled', () => {
                setTimeout(() => { if (video.paused) video.play().catch(() => {}); }, 300);
            });
            video.addEventListener('waiting', () => {
                setTimeout(() => { if (video.paused) video.play().catch(() => {}); }, 200);
            });

            this.syncInterval = setInterval(() => {
                if (!video || video.paused || !video.buffered.length) return;
                try {
                    const end = video.buffered.end(video.buffered.length - 1);
                    const lag = end - video.currentTime;
                    if (lag > 1.5) {
                        video.currentTime = end - 0.1;
                    } else if (lag > 0.4) {
                        video.playbackRate = 1.05;
                    } else {
                        video.playbackRate = 1.0;
                    }
                } catch (e) { /* empty */ }
            }, 500);
        }

        stream.getTracks().forEach(track => {
            track.addEventListener('ended', () => this.stopHostStream());
        });

        // Keep direct video element muted; stream audio is routed through theatre speaker emitters.
        if (hasSpatialSpeakerRouting) {
            video.muted = true;
        }
    }

    showUnmuteOverlay(video) {
        this.removeUnmuteOverlay();

        const overlay = document.createElement('div');
        overlay.id = 'unmute-overlay';
        overlay.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);border:2px solid #00ffcc;border-radius:12px;padding:14px 28px;color:#00ffcc;font-size:16px;font-weight:bold;cursor:pointer;z-index:500;text-align:center;backdrop-filter:blur(10px);box-shadow:0 0 20px rgba(0,255,200,0.3);animation:unmutePulse 2s infinite;`;
        overlay.textContent = 'Click to enable theatre surround audio';

        if (!document.getElementById('unmute-pulse-style')) {
            const s = document.createElement('style');
            s.id = 'unmute-pulse-style';
            s.textContent = `@keyframes unmutePulse{0%,100%{box-shadow:0 0 20px rgba(0,255,200,0.3)}50%{box-shadow:0 0 35px rgba(0,255,200,0.6)}}`;
            document.head.appendChild(s);
        }

        overlay.addEventListener('click', () => {
            this.enableTheatreSpeakerAudio();
            this.removeUnmuteOverlay();
        });

        document.body.appendChild(overlay);
    }

    removeUnmuteOverlay() {
        const el = document.getElementById('unmute-overlay');
        if (el) el.remove();
    }
    
    adjustScreenToContent(aspectRatio) {
        // Maximum massive screen dimensions - 3x larger
        const maxWidth = 66;
        const maxHeight = 36;
        
        let screenWidth, screenHeight;
        
        if (aspectRatio > maxWidth / maxHeight) {
            // Video is wider - fit to max width
            screenWidth = maxWidth;
            screenHeight = maxWidth / aspectRatio;
        } else {
            // Video is taller - fit to max height
            screenHeight = maxHeight;
            screenWidth = maxHeight * aspectRatio;
        }
        
        // Update massive screen geometry
        this.screen.geometry.dispose();
        this.screen.geometry = new THREE.PlaneGeometry(screenWidth, screenHeight);
        
        console.log('Massive screen resized to:', screenWidth, 'x', screenHeight, 'for aspect ratio:', aspectRatio);
    }
    
    stopHostStream() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }

        this.removeUnmuteOverlay();
        this.clearTheatreSpeakerAudio();

        this._streamCanvas = null;
        this._streamCtx = null;
        this._lastStreamFrameMs = 0;

        if (this.hostVideo) {
            this.hostVideo.pause();
            this.hostVideo.playbackRate = 1.0;
            if (this.hostVideo.srcObject) {
                this.hostVideo.srcObject.getTracks().forEach(track => track.stop());
            }
            this.hostVideo.srcObject = null;
            this.hostVideo.remove();
            this.hostVideo = null;
        }

        if (this.videoTexture) {
            this.videoTexture.dispose();
            this.videoTexture = null;
        }

        if (this.screen) {
            this.screen.material.dispose();
            this.screen.material = new THREE.MeshBasicMaterial({
                color: 0x000000,
                side: THREE.DoubleSide
            });
        }
    }
    
    async addUser(userId, userData) {
        try {
            // Try to load default avatar (VRM or simple)
            const avatar = await this.avatarManager.loadDefaultAvatar(userId, userData);
            
            // Position avatar at a random entrance location to prevent z-fighting
            const spawnPosition = this.getRandomSpawnPosition();
            avatar.scene.position.copy(spawnPosition);
            
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
            const spawnPosition = this.getRandomSpawnPosition();
            avatar.scene.position.copy(spawnPosition);
            
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
    
    getRandomSpawnPosition() {
        // Create spawn positions in a circle around the entrance area
        const spawnRadius = 4; // Radius of spawn circle
        const centerX = 0;
        const centerZ = 15;
        const minDistance = 1.5; // Minimum distance between avatars
        
        let attempts = 0;
        let position;
        
        do {
            // Random angle for circular distribution
            const angle = Math.random() * Math.PI * 2;
            const distance = minDistance + Math.random() * (spawnRadius - minDistance);
            
            const x = centerX + Math.cos(angle) * distance;
            const z = centerZ + Math.sin(angle) * distance;
            const y = 0; // Ground level
            
            position = new THREE.Vector3(x, y, z);
            attempts++;
            
            // If we've tried many times, just accept the position
            if (attempts > 20) break;
            
        } while (this.isPositionTooClose(position, minDistance));
        
        return position;
    }
    
    isPositionTooClose(newPosition, minDistance) {
        // Check if the new position is too close to existing avatars
        for (const [userId, user] of this.users) {
            if (!user?.position) continue;
            const userPos = user.position?.isVector3
                ? user.position
                : new THREE.Vector3(
                    Number(user.position.x) || 0,
                    Number(user.position.y) || 0,
                    Number(user.position.z) || 0
                );
            if (userPos.distanceTo(newPosition) < minDistance) {
                return true;
            }
        }
        return false;
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

    clearUserSeat(userId) {
        const user = this.users.get(userId);
        if (!user || user.seatId === null || user.seatId === undefined) return;
        const seat = this.seats[user.seatId];
        if (seat) {
            seat.occupied = false;
            seat.userId = null;
        }
        user.seatId = null;
    }
    
    updateUserPosition(userId, position, rotation) {
        const user = this.users.get(userId);
        if (user) {
            const normalizedPosition = position
                ? (position.isVector3
                    ? position
                    : new THREE.Vector3(
                        Number(position.x) || 0,
                        Number(position.y) || 0,
                        Number(position.z) || 0
                    ))
                : null;

            // Update avatar using avatar manager
            this.avatarManager.updateAvatar(userId, normalizedPosition || position, rotation);
            
            // Update user info
            if (normalizedPosition) {
                user.position = normalizedPosition.clone();
            }
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
        seatPosition.y += user.avatarType === 'vrm' ? 0.95 : 1.15;
        
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
        if (this._streamCtx && this.hostVideo && this.hostVideo.readyState >= 2) {
            const now = performance.now();
            if ((now - this._lastStreamFrameMs) >= this._streamFrameIntervalMs) {
                this._streamCtx.drawImage(this.hostVideo, 0, 0,
                    this._streamCanvas.width, this._streamCanvas.height);
                this.videoTexture.needsUpdate = true;
                this._lastStreamFrameMs = now;
            }
        }

        const playerPosition = this.camera ? this.camera.position : null;
        const now = performance.now();
        if (playerPosition && (now - this._lastCullUpdateMs) >= this._cullUpdateIntervalMs) {
            this.updateAvatarCulling(playerPosition);
            this._lastCullUpdateMs = now;
        }
        
        // Update avatar manager
        this.avatarManager.update(deltaTime);
        
        // Update roguelike world
        this.roguelikeWorld.update(deltaTime, playerPosition);
        
        // Check for exit/return collisions
        if (playerPosition) {
            this.checkWorldTransitions(playerPosition);
        }
        
        // Update user avatars with simple idle animation
        this.users.forEach(user => {
            if (user.avatarType === 'simple' && user.avatar?.visible) {
                // Simple idle animation - slight bobbing for simple avatars
                const time = Date.now() * 0.001;
                const originalY = user.position.y;
                user.avatar.position.y = originalY + Math.sin(time + user.id.length) * 0.02;
            }
        });
    }

    updateAvatarCulling(playerPosition) {
        if (!this.camera) return;

        this.camera.updateMatrixWorld();
        this._cullProjScreen.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        this._cullFrustum.setFromProjectionMatrix(this._cullProjScreen);
        const intersectsAvatarSafe = (avatarObj) => {
            if (!avatarObj) return false;
            if (avatarObj.isMesh && avatarObj.geometry) {
                if (!avatarObj.geometry.boundingSphere) {
                    avatarObj.geometry.computeBoundingSphere();
                }
                return this._cullFrustum.intersectsObject(avatarObj);
            }
            const box = new THREE.Box3().setFromObject(avatarObj);
            if (box.isEmpty()) return false;
            return this._cullFrustum.intersectsBox(box);
        };

        this.users.forEach((user, userId) => {
            if (!user.avatar) return;

            const localNetworkUserId = this.networkManager?.userId;
            if (userId === 'local-player' || (localNetworkUserId && userId === localNetworkUserId)) {
                user.avatar.visible = false;
                this.avatarManager.setAvatarActive(userId, false);
                return;
            }

            const distance = playerPosition.distanceTo(user.avatar.position);
            const inRange = distance <= this._avatarCullDistance;
            const inFrustum = intersectsAvatarSafe(user.avatar);
            const isVisible = inRange && inFrustum;

            user.avatar.visible = isVisible;
            this.avatarManager.setAvatarActive(userId, isVisible);
        });
    }
    
    checkWorldTransitions(playerPosition) {
        if (!this.exitPortal || !playerPosition) return;
        const portalPos = this.exitPortal.position;
        const lastPos = this._lastTransitionCheckPosition || playerPosition.clone();

        const doorwayHalfWidth = 12.5;
        const doorwayMaxHeight = 24;
        const nearDoorwayNow = Math.abs(playerPosition.x - portalPos.x) <= doorwayHalfWidth && playerPosition.y <= doorwayMaxHeight;
        const nearDoorwayLast = Math.abs(lastPos.x - portalPos.x) <= doorwayHalfWidth && lastPos.y <= doorwayMaxHeight;
        const nearDoorway = nearDoorwayNow || nearDoorwayLast;

        const crossedOutward =
            nearDoorway
            && lastPos.z <= (portalPos.z + 0.8)
            && playerPosition.z > (portalPos.z + 2.2);

        const crossedInward =
            nearDoorway
            && lastPos.z >= (portalPos.z - 0.8)
            && playerPosition.z < (portalPos.z - 1.2);

        if (!this.roguelikeWorld.isActive && crossedOutward) {
            this.roguelikeWorld.enterWorld(playerPosition);
        } else if (this.roguelikeWorld.isActive && crossedInward) {
            this.roguelikeWorld.hideWorld();
        }

        this._lastTransitionCheckPosition = playerPosition.clone();
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
        
        // Dispose roguelike world
        this.roguelikeWorld.dispose();
    }
    
    // Set camera for OMI audio listener
    setCamera(camera) {
        this.camera = camera;
        
        // Attach OMI audio listener to camera for 3D surround sound
        if (this.avatarManager.audioListener) {
            camera.add(this.avatarManager.audioListener);
            console.log('OMI Audio: 3D audio listener attached to camera');
        }
    }
    
    // Set network manager for world transitions
    setNetworkManager(networkManager) {
        this.networkManager = networkManager;
    }
    
    // Set main app reference for bindle access
    setApp(app) {
        this.app = app;
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
