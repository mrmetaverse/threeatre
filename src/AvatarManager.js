import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm';

export class AvatarManager {
    constructor(scene) {
        this.scene = scene;
        this.gltfLoader = new GLTFLoader();
        this.avatars = new Map();
        this.defaultAvatarUrl = '/assets/default-avatar.vrm'; // We'll create this
        
        // Setup VRM loader plugin
        this.gltfLoader.register((parser) => {
            return new VRMLoaderPlugin(parser);
        });
        
        // OMI protocol handlers
        this.omiAudioNodes = new Map();
        this.omiColliders = new Map();
        
        this.init();
    }
    
    init() {
        // Initialize OMI protocol support
        this.setupOMIProtocols();
    }
    
    setupOMIProtocols() {
        // OMI_audio protocol setup - Enhanced for 3D surround sound
        this.audioContext = null;
        this.audioListener = null;
        this.masterGain = null;
        
        if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                // Create master gain node for overall volume control
                this.masterGain = this.audioContext.createGain();
                this.masterGain.connect(this.audioContext.destination);
                
                // Setup 3D audio listener - this will be attached to the camera
                this.audioListener = new THREE.AudioListener();
                
                console.log('OMI Audio: 3D audio context initialized');
            } catch (e) {
                console.warn('Web Audio API not supported:', e);
            }
        }
        
        // OMI_collider protocol setup - we'll use Three.js physics for basic collision detection
        this.collisionWorld = new Map();
        
        // OMI audio zones and reverb settings
        this.audioZones = new Map();
        this.reverbSettings = {
            theatre: {
                roomSize: 0.8,
                damping: 0.3,
                wetGain: 0.4,
                dryGain: 0.6
            }
        };
    }
    
    async loadDefaultAvatar(userId, userData = {}) {
        try {
            // Try to load a default VRM avatar first
            const vrm = await this.loadVRMAvatar(this.defaultAvatarUrl, userId, userData);
            return vrm;
        } catch (error) {
            console.warn('Default VRM not found, creating simple avatar:', error);
            // Fallback to simple geometric avatar
            return this.createSimpleAvatar(userId, userData);
        }
    }
    
    async loadVRMAvatar(url, userId, userData = {}) {
        return new Promise((resolve, reject) => {
            this.gltfLoader.load(
                url,
                (gltf) => {
                    const vrm = gltf.userData.vrm;
                    
                    if (!vrm) {
                        reject(new Error('No VRM data found in GLTF'));
                        return;
                    }
                    
                    // Setup VRM
                    this.setupVRMAvatar(vrm, userId, userData);
                    
                    // Process OMI extensions if present
                    this.processOMIExtensions(gltf, userId);
                    
                    // Add to scene
                    this.scene.add(vrm.scene);
                    this.avatars.set(userId, {
                        type: 'vrm',
                        vrm: vrm,
                        scene: vrm.scene,
                        userData: userData,
                        animations: gltf.animations || [],
                        mixer: new THREE.AnimationMixer(vrm.scene)
                    });
                    
                    console.log(`VRM avatar loaded for user ${userId}`);
                    resolve(vrm);
                },
                (progress) => {
                    console.log(`Loading VRM avatar: ${(progress.loaded / progress.total * 100)}%`);
                },
                (error) => {
                    console.error('Error loading VRM avatar:', error);
                    reject(error);
                }
            );
        });
    }
    
    setupVRMAvatar(vrm, userId, userData) {
        // Set avatar properties
        vrm.scene.name = `avatar_${userId}`;
        vrm.scene.userData.userId = userId;
        vrm.scene.userData.avatarData = userData;
        
        // Setup VRM-specific features
        if (vrm.expressionManager) {
            // Setup facial expressions
            this.setupVRMExpressions(vrm, userId);
        }
        
        if (vrm.lookAt) {
            // Setup look-at functionality
            vrm.lookAt.target = new THREE.Object3D();
            this.scene.add(vrm.lookAt.target);
        }
        
        // Apply user color tint if specified
        if (userData.color) {
            this.applyColorTint(vrm.scene, userData.color);
        }
        
        // Scale avatar appropriately
        vrm.scene.scale.setScalar(1);
        
        // Enable shadow casting and receiving
        vrm.scene.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
    }
    
    createSimpleAvatar(userId, userData = {}) {
        const avatarGroup = new THREE.Group();
        avatarGroup.name = `avatar_${userId}`;
        avatarGroup.userData.userId = userId;
        avatarGroup.userData.avatarData = userData;
        
        // Body
        const bodyGeometry = new THREE.CapsuleGeometry(0.3, 1.2, 4, 8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ 
            color: userData.color || 0x4CAF50 
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.9;
        body.castShadow = true;
        body.receiveShadow = true;
        avatarGroup.add(body);
        
        // Head
        const headGeometry = new THREE.SphereGeometry(0.25, 8, 6);
        const headMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xffdbac 
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.8;
        head.castShadow = true;
        head.receiveShadow = true;
        avatarGroup.add(head);
        
        // Simple eyes
        const eyeGeometry = new THREE.SphereGeometry(0.05, 6, 4);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.1, 1.85, 0.2);
        head.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.1, 1.85, 0.2);
        head.add(rightEye);
        
        // Add to scene and avatar map
        this.scene.add(avatarGroup);
        this.avatars.set(userId, {
            type: 'simple',
            scene: avatarGroup,
            userData: userData,
            animations: [],
            mixer: null
        });
        
        console.log(`Simple avatar created for user ${userId}`);
        return { scene: avatarGroup };
    }
    
    processOMIExtensions(gltf, userId) {
        if (!gltf.parser || !gltf.parser.json.extensions) return;
        
        const extensions = gltf.parser.json.extensions;
        
        // Process OMI_audio extension
        if (extensions.OMI_audio && this.audioContext) {
            this.processOMIAudio(extensions.OMI_audio, userId, gltf);
        }
        
        // Process OMI_collider extension
        if (extensions.OMI_collider) {
            this.processOMICollider(extensions.OMI_collider, userId, gltf);
        }
    }
    
    processOMIAudio(audioExtension, userId, gltf) {
        if (!audioExtension.sources || !this.audioContext || !this.audioListener) return;
        
        const audioNodes = [];
        
        audioExtension.sources.forEach((audioSource, index) => {
            if (audioSource.uri) {
                // Create enhanced OMI audio node with 3D surround sound
                const audio = new THREE.PositionalAudio(this.audioListener);
                
                // Apply OMI audio specifications
                const omiSettings = this.parseOMIAudioSettings(audioSource);
                
                // Load audio with enhanced processing
                const audioLoader = new THREE.AudioLoader();
                audioLoader.load(audioSource.uri, (buffer) => {
                    audio.setBuffer(buffer);
                    
                    // OMI Audio 3D positioning
                    audio.setRefDistance(omiSettings.refDistance);
                    audio.setRolloffFactor(omiSettings.rolloffFactor);
                    audio.setDistanceModel(omiSettings.distanceModel);
                    audio.setMaxDistance(omiSettings.maxDistance);
                    
                    // OMI Audio directional cone
                    audio.setDirectionalCone(
                        omiSettings.coneInnerAngle,
                        omiSettings.coneOuterAngle,
                        omiSettings.coneOuterGain
                    );
                    
                    // OMI Audio volume and loop settings
                    audio.setVolume(omiSettings.volume);
                    audio.setLoop(omiSettings.loop);
                    
                    // Apply theatre reverb for immersive experience
                    this.applyTheatreReverb(audio, omiSettings);
                    
                    // OMI Audio trigger conditions
                    if (omiSettings.autoplay) {
                        audio.play();
                    }
                    
                    console.log(`OMI Audio: Configured 3D audio for ${audioSource.uri}`, omiSettings);
                });
                
                // Attach to appropriate node in the scene
                const targetNode = this.findNodeByIndex(gltf.scene, audioSource.node || 0);
                if (targetNode) {
                    targetNode.add(audio);
                }
                
                audioNodes.push({
                    audio: audio,
                    source: audioSource,
                    node: targetNode,
                    omiSettings: omiSettings
                });
            }
        });
        
        if (audioNodes.length > 0) {
            this.omiAudioNodes.set(userId, audioNodes);
            console.log(`OMI_audio: Loaded ${audioNodes.length} 3D surround audio sources for user ${userId}`);
        }
    }
    
    parseOMIAudioSettings(audioSource) {
        // Parse OMI audio extension settings with proper defaults
        return {
            // OMI Audio 3D positioning
            refDistance: audioSource.refDistance || 1.0,
            rolloffFactor: audioSource.rolloffFactor || 1.0,
            maxDistance: audioSource.maxDistance || 10000,
            distanceModel: audioSource.distanceModel || 'inverse',
            
            // OMI Audio directional cone
            coneInnerAngle: audioSource.coneInnerAngle || 360,
            coneOuterAngle: audioSource.coneOuterAngle || 360,
            coneOuterGain: audioSource.coneOuterGain || 0.0,
            
            // OMI Audio playback
            volume: audioSource.volume || 1.0,
            loop: audioSource.loop || false,
            autoplay: audioSource.autoplay || false,
            
            // OMI Audio environmental
            reverbZone: audioSource.reverbZone || 'theatre',
            occlusionEnabled: audioSource.occlusionEnabled || true,
            dopplerEnabled: audioSource.dopplerEnabled || false,
            
            // OMI Audio triggers
            proximityTrigger: audioSource.proximityTrigger || false,
            proximityDistance: audioSource.proximityDistance || 2.0,
            
            // OMI Audio quality
            quality: audioSource.quality || 'high',
            compression: audioSource.compression || 'none'
        };
    }
    
    applyTheatreReverb(audio, omiSettings) {
        if (!this.audioContext) return;
        
        try {
            // Create convolution reverb for theatre acoustics
            const convolver = this.audioContext.createConvolver();
            const reverbSettings = this.reverbSettings[omiSettings.reverbZone] || this.reverbSettings.theatre;
            
            // Generate impulse response for theatre reverb
            this.generateTheatreImpulseResponse(convolver, reverbSettings);
            
            // Create wet/dry mix
            const wetGain = this.audioContext.createGain();
            const dryGain = this.audioContext.createGain();
            
            wetGain.gain.value = reverbSettings.wetGain;
            dryGain.gain.value = reverbSettings.dryGain;
            
            // Connect audio graph: source -> dry/wet -> master
            const source = audio.getOutput();
            source.connect(dryGain);
            source.connect(convolver);
            convolver.connect(wetGain);
            
            dryGain.connect(this.masterGain);
            wetGain.connect(this.masterGain);
            
            console.log('OMI Audio: Applied theatre reverb with settings:', reverbSettings);
        } catch (error) {
            console.warn('OMI Audio: Failed to apply reverb:', error);
        }
    }
    
    generateTheatreImpulseResponse(convolver, settings) {
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * 2; // 2 second reverb tail
        const impulse = this.audioContext.createBuffer(2, length, sampleRate);
        
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);
        
        for (let i = 0; i < length; i++) {
            const decay = Math.pow(1 - i / length, settings.damping * 10);
            const noise = (Math.random() * 2 - 1) * decay;
            
            // Apply room size characteristics
            const roomDelay = Math.floor(settings.roomSize * sampleRate * 0.1);
            const delayedNoise = i > roomDelay ? noise * 0.7 : noise;
            
            left[i] = delayedNoise;
            right[i] = delayedNoise * 0.8; // Slight stereo variation
        }
        
        convolver.buffer = impulse;
    }
    
    processOMICollider(colliderExtension, userId, gltf) {
        if (!colliderExtension.colliders) return;
        
        const colliders = [];
        
        colliderExtension.colliders.forEach((colliderData, index) => {
            const collider = this.createCollider(colliderData, gltf.scene);
            if (collider) {
                colliders.push(collider);
            }
        });
        
        if (colliders.length > 0) {
            this.omiColliders.set(userId, colliders);
            console.log(`OMI_collider: Created ${colliders.length} colliders for user ${userId}`);
        }
    }
    
    createCollider(colliderData, scene) {
        let geometry;
        
        switch (colliderData.type) {
            case 'box':
                geometry = new THREE.BoxGeometry(
                    colliderData.size?.[0] || 1,
                    colliderData.size?.[1] || 1,
                    colliderData.size?.[2] || 1
                );
                break;
            case 'sphere':
                geometry = new THREE.SphereGeometry(colliderData.radius || 0.5);
                break;
            case 'capsule':
                geometry = new THREE.CapsuleGeometry(
                    colliderData.radius || 0.5,
                    colliderData.height || 1
                );
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(
                    colliderData.radius || 0.5,
                    colliderData.radius || 0.5,
                    colliderData.height || 1
                );
                break;
            default:
                console.warn(`Unknown collider type: ${colliderData.type}`);
                return null;
        }
        
        // Create invisible collider mesh
        const material = new THREE.MeshBasicMaterial({ 
            transparent: true, 
            opacity: 0,
            visible: false 
        });
        const colliderMesh = new THREE.Mesh(geometry, material);
        
        // Position collider
        if (colliderData.node !== undefined) {
            const targetNode = this.findNodeByIndex(scene, colliderData.node);
            if (targetNode) {
                targetNode.add(colliderMesh);
            }
        }
        
        // Apply transform
        if (colliderData.translation) {
            colliderMesh.position.fromArray(colliderData.translation);
        }
        if (colliderData.rotation) {
            colliderMesh.quaternion.fromArray(colliderData.rotation);
        }
        if (colliderData.scale) {
            colliderMesh.scale.fromArray(colliderData.scale);
        }
        
        return {
            mesh: colliderMesh,
            type: colliderData.type,
            data: colliderData
        };
    }
    
    findNodeByIndex(scene, nodeIndex) {
        let currentIndex = 0;
        let foundNode = null;
        
        scene.traverse((child) => {
            if (currentIndex === nodeIndex) {
                foundNode = child;
                return;
            }
            currentIndex++;
        });
        
        return foundNode;
    }
    
    applyColorTint(object, color) {
        object.traverse((child) => {
            if (child.isMesh && child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(material => {
                        if (material.color) {
                            material.color.multiplyScalar(0.7).add(new THREE.Color(color).multiplyScalar(0.3));
                        }
                    });
                } else if (child.material.color) {
                    child.material.color.multiplyScalar(0.7).add(new THREE.Color(color).multiplyScalar(0.3));
                }
            }
        });
    }
    
    setupVRMExpressions(vrm, userId) {
        // Setup basic expressions for VRM
        const expressions = vrm.expressionManager;
        if (!expressions) return;
        
        // You can add automatic expressions here
        // For example, random blinking:
        setInterval(() => {
            if (expressions.getExpressionTrackName('blink')) {
                expressions.setValue('blink', 1.0);
                setTimeout(() => {
                    expressions.setValue('blink', 0.0);
                }, 150);
            }
        }, 3000 + Math.random() * 2000); // Random blink every 3-5 seconds
    }
    
    updateAvatar(userId, position, rotation) {
        const avatar = this.avatars.get(userId);
        if (!avatar) return;
        
        // Update position and rotation
        if (position) {
            avatar.scene.position.copy(position);
        }
        
        if (rotation) {
            avatar.scene.rotation.copy(rotation);
        }
        
        // Update VRM-specific features
        if (avatar.type === 'vrm' && avatar.vrm) {
            // Update VRM lookAt
            if (avatar.vrm.lookAt && avatar.vrm.lookAt.target) {
                // Make avatar look forward by default
                const lookAtTarget = avatar.scene.position.clone();
                lookAtTarget.z -= 1;
                avatar.vrm.lookAt.target.position.copy(lookAtTarget);
            }
            
            // Update VRM
            avatar.vrm.update(0.016); // Assume 60fps
        }
        
        // Update animation mixer
        if (avatar.mixer) {
            avatar.mixer.update(0.016);
        }
    }
    
    removeAvatar(userId) {
        const avatar = this.avatars.get(userId);
        if (!avatar) return;
        
        // Remove from scene
        this.scene.remove(avatar.scene);
        
        // Clean up VRM
        if (avatar.type === 'vrm' && avatar.vrm) {
            avatar.vrm.dispose();
        }
        
        // Clean up OMI audio
        const audioNodes = this.omiAudioNodes.get(userId);
        if (audioNodes) {
            audioNodes.forEach(audioNode => {
                if (audioNode.audio.isPlaying) {
                    audioNode.audio.stop();
                }
                audioNode.audio.disconnect();
            });
            this.omiAudioNodes.delete(userId);
        }
        
        // Clean up OMI colliders
        this.omiColliders.delete(userId);
        
        // Clean up geometry and materials
        avatar.scene.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(material => material.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
        
        this.avatars.delete(userId);
        console.log(`Avatar removed for user ${userId}`);
    }
    
    async uploadVRMAvatar(file, userId) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (event) => {
                try {
                    const arrayBuffer = event.target.result;
                    const blob = new Blob([arrayBuffer]);
                    const url = URL.createObjectURL(blob);
                    
                    // Remove old avatar
                    this.removeAvatar(userId);
                    
                    // Load new VRM avatar
                    const vrm = await this.loadVRMAvatar(url, userId);
                    
                    // Clean up blob URL
                    URL.revokeObjectURL(url);
                    
                    resolve(vrm);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => {
                reject(new Error('Failed to read VRM file'));
            };
            
            reader.readAsArrayBuffer(file);
        });
    }
    
    getAvatar(userId) {
        return this.avatars.get(userId);
    }
    
    getAllAvatars() {
        return this.avatars;
    }
    
    update(deltaTime) {
        // Update all avatars
        this.avatars.forEach((avatar, userId) => {
            if (avatar.type === 'vrm' && avatar.vrm) {
                avatar.vrm.update(deltaTime);
            }
            
            if (avatar.mixer) {
                avatar.mixer.update(deltaTime);
            }
        });
    }
    
    dispose() {
        // Clean up all avatars
        this.avatars.forEach((avatar, userId) => {
            this.removeAvatar(userId);
        });
        
        // Clean up audio context
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}
