import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class WearableManager {
    constructor(scene, avatarManager) {
        this.scene = scene;
        this.avatarManager = avatarManager;
        this.gltfLoader = new GLTFLoader();
        this.attachedWearables = new Map(); // slot -> wearable object
        this.wearableModels = new Map(); // model path -> loaded model cache
        
        // Attachment points for different body parts
        this.attachmentPoints = {
            head: { boneName: 'Head', offset: new THREE.Vector3(0, 0, 0), scale: 1 },
            face: { boneName: 'Head', offset: new THREE.Vector3(0, 0, 0.1), scale: 1 },
            eyes: { boneName: 'Head', offset: new THREE.Vector3(0, 0.05, 0.12), scale: 0.8 },
            ear: { boneName: 'Head', offset: new THREE.Vector3(0.08, 0, 0), scale: 0.6 },
            neck: { boneName: 'Neck', offset: new THREE.Vector3(0, 0, 0), scale: 0.8 },
            torso: { boneName: 'Spine', offset: new THREE.Vector3(0, 0, 0), scale: 1 },
            back: { boneName: 'Spine', offset: new THREE.Vector3(0, 0, -0.1), scale: 1 },
            hands: { boneName: 'RightHand', offset: new THREE.Vector3(0, 0, 0), scale: 0.8 },
            finger: { boneName: 'RightHand', offset: new THREE.Vector3(0, 0, 0.05), scale: 0.4 },
            legs: { boneName: 'Hips', offset: new THREE.Vector3(0, -0.5, 0), scale: 1 },
            feet: { boneName: 'RightFoot', offset: new THREE.Vector3(0, 0, 0), scale: 1 }
        };
    }
    
    async loadWearable(modelPath, slot) {
        // Check if model is already cached
        if (this.wearableModels.has(modelPath)) {
            return this.wearableModels.get(modelPath).clone();
        }
        
        try {
            // For now, create placeholder models since we don't have actual GLB files
            const wearable = this.createPlaceholderWearable(modelPath, slot);
            this.wearableModels.set(modelPath, wearable);
            return wearable.clone();
        } catch (error) {
            console.error(`Failed to load wearable model: ${modelPath}`, error);
            // Return a basic placeholder
            return this.createBasicPlaceholder(slot);
        }
    }
    
    createPlaceholderWearable(modelPath, slot) {
        const group = new THREE.Group();
        group.name = `wearable_${slot}`;
        
        let geometry, material, color;
        
        switch (slot) {
            case 'head':
                geometry = new THREE.SphereGeometry(0.3, 8, 6);
                color = modelPath.includes('crown') ? 0xffd700 : 
                       modelPath.includes('hat') ? 0x8B4513 : 0x666666;
                break;
                
            case 'face':
                geometry = new THREE.PlaneGeometry(0.4, 0.3);
                color = 0x444444;
                break;
                
            case 'eyes':
                geometry = new THREE.SphereGeometry(0.15, 6, 4);
                color = 0x00ffff;
                break;
                
            case 'ear':
                geometry = new THREE.SphereGeometry(0.1, 6, 4);
                color = 0xffd700;
                break;
                
            case 'neck':
                geometry = new THREE.TorusGeometry(0.2, 0.05, 6, 8);
                color = modelPath.includes('amulet') ? 0x8A2BE2 : 0xffd700;
                break;
                
            case 'back':
                if (modelPath.includes('wings')) {
                    // Create wing-like structure
                    geometry = new THREE.ConeGeometry(0.8, 1.5, 6);
                    color = modelPath.includes('void') ? 0x000000 : 0xffffff;
                } else {
                    geometry = new THREE.PlaneGeometry(1, 1.5);
                    color = 0x444444;
                }
                break;
                
            case 'hands':
                geometry = new THREE.BoxGeometry(0.3, 0.1, 0.4);
                color = 0x8A2BE2;
                break;
                
            case 'finger':
                geometry = new THREE.TorusGeometry(0.08, 0.02, 6, 8);
                color = 0xffd700;
                break;
                
            case 'feet':
                geometry = new THREE.BoxGeometry(0.4, 0.2, 0.6);
                color = 0x8B4513;
                break;
                
            default:
                geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
                color = 0x888888;
        }
        
        material = new THREE.MeshLambertMaterial({ 
            color: color,
            transparent: slot === 'face',
            opacity: slot === 'face' ? 0.8 : 1
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        
        // Add some glow effect for special items
        if (modelPath.includes('spectral') || modelPath.includes('phantom') || modelPath.includes('void')) {
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.3,
                side: THREE.BackSide
            });
            const glowMesh = new THREE.Mesh(geometry.clone(), glowMaterial);
            glowMesh.scale.multiplyScalar(1.1);
            group.add(glowMesh);
        }
        
        group.add(mesh);
        group.userData.slot = slot;
        group.userData.modelPath = modelPath;
        
        return group;
    }
    
    createBasicPlaceholder(slot) {
        const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.slot = slot;
        return mesh;
    }
    
    async attachWearable(wearable, slot) {
        if (!wearable) return;
        
        // Remove existing wearable in this slot
        if (this.attachedWearables.has(slot)) {
            await this.detachWearable(slot);
        }
        
        // Find the current player avatar
        const playerAvatar = this.getCurrentPlayerAvatar();
        if (!playerAvatar) {
            console.warn('No player avatar found to attach wearable to');
            return;
        }
        
        // Get attachment point
        const attachPoint = this.attachmentPoints[slot];
        if (!attachPoint) {
            console.warn(`No attachment point defined for slot: ${slot}`);
            return;
        }
        
        // Find the bone or attachment point
        let attachmentTarget = this.findAttachmentBone(playerAvatar, attachPoint.boneName);
        if (!attachmentTarget) {
            // Fallback to avatar root
            attachmentTarget = playerAvatar;
        }
        
        // Apply offset and scaling
        wearable.position.copy(attachPoint.offset);
        wearable.scale.setScalar(attachPoint.scale);
        
        // Attach to avatar
        attachmentTarget.add(wearable);
        this.attachedWearables.set(slot, wearable);
        
        console.log(`✨ Attached wearable to ${slot} on ${attachPoint.boneName}`);
    }
    
    async detachWearable(slot) {
        const wearable = this.attachedWearables.get(slot);
        if (wearable && wearable.parent) {
            wearable.parent.remove(wearable);
            this.attachedWearables.delete(slot);
            console.log(`🗑️ Detached wearable from ${slot}`);
        }
    }
    
    getCurrentPlayerAvatar() {
        // Try to find the player avatar in the scene
        if (this.avatarManager && this.avatarManager.avatars) {
            // Look for the main player avatar
            for (const [userId, avatarData] of this.avatarManager.avatars) {
                if (avatarData.scene && avatarData.scene.userData.isPlayer) {
                    return avatarData.scene;
                }
            }
            
            // Fallback to first avatar
            const firstAvatar = this.avatarManager.avatars.values().next().value;
            if (firstAvatar && firstAvatar.scene) {
                return firstAvatar.scene;
            }
        }
        
        // Last resort: search the scene for any avatar
        let foundAvatar = null;
        this.scene.traverse((child) => {
            if (child.name && child.name.includes('avatar') && !foundAvatar) {
                foundAvatar = child;
            }
        });
        
        return foundAvatar;
    }
    
    findAttachmentBone(avatar, boneName) {
        let targetBone = null;
        
        avatar.traverse((child) => {
            if (child.isBone && child.name === boneName) {
                targetBone = child;
            }
        });
        
        // If no bone found, try to find by partial name match
        if (!targetBone) {
            avatar.traverse((child) => {
                if (child.name && child.name.toLowerCase().includes(boneName.toLowerCase())) {
                    targetBone = child;
                }
            });
        }
        
        return targetBone || avatar; // Fallback to avatar root
    }
    
    getAllAttachedWearables() {
        return Array.from(this.attachedWearables.entries());
    }
    
    hasWearableInSlot(slot) {
        return this.attachedWearables.has(slot);
    }
    
    getWearableInSlot(slot) {
        return this.attachedWearables.get(slot);
    }
    
    clearAllWearables() {
        for (const slot of this.attachedWearables.keys()) {
            this.detachWearable(slot);
        }
    }
    
    // Animation support for wearables
    updateWearables(deltaTime) {
        const time = Date.now() * 0.001;
        
        for (const [slot, wearable] of this.attachedWearables) {
            if (!wearable) continue;
            
            // Add floating animation for special items
            if (wearable.userData.modelPath) {
                const modelPath = wearable.userData.modelPath;
                
                if (modelPath.includes('halo') || modelPath.includes('crown')) {
                    wearable.rotation.y = time * 0.5;
                }
                
                if (modelPath.includes('wings')) {
                    wearable.rotation.z = Math.sin(time * 2) * 0.1;
                }
                
                if (modelPath.includes('spectral') || modelPath.includes('phantom')) {
                    wearable.position.y += Math.sin(time * 3) * 0.01;
                }
            }
        }
    }
}
