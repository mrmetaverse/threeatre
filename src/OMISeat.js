import * as THREE from 'three';

export class OMISeat {
    constructor(theatre, camera) {
        this.theatre = theatre;
        this.camera = camera;
        this.isSeated = false;
        this.currentSeat = null;
        this.originalCameraState = null;
        this.seatTransition = null;
        this.seatLookTarget = null;
        this.localAvatarId = null;
    }
    
    sitInSeat(seatInfo) {
        if (this.isSeated) {
            this.standUp();
        }
        
        this.originalCameraState = {
            position: this.camera.position.clone(),
            yaw: this.camera.rotation.y,
            pitch: this.camera.rotation.x
        };
        
        this.localAvatarId = this.theatre?.networkManager?.userId || null;
        const seatPosition = this.getSeatedCameraAnchor(seatInfo);
        this.seatLookTarget = this.calculateSeatTarget(seatInfo);
        
        this.animateToSeat(seatPosition, this.seatLookTarget);
        
        this.isSeated = true;
        this.currentSeat = seatInfo;
        this.showSeatedFeedback(seatInfo);
        
        return true;
    }
    
    calculateSeatCameraPosition(seatInfo) {
        const seatPos = seatInfo.position.clone();
        seatPos.y += 1.4;
        seatPos.z += 0.3;
        return seatPos;
    }

    getLocalAvatarScene() {
        if (!this.localAvatarId) return null;
        const user = this.theatre?.users?.get(this.localAvatarId);
        return user?.avatar || null;
    }

    getAvatarEyePosition(avatarScene) {
        const eyePos = new THREE.Vector3();
        if (!avatarScene) return eyePos;

        let headBone = null;
        avatarScene.traverse((child) => {
            if (headBone) return;
            if (child.isBone && /head/i.test(child.name)) {
                headBone = child;
            }
        });

        if (headBone) {
            headBone.getWorldPosition(eyePos);
            eyePos.y += 0.08;
            return eyePos;
        }

        const box = new THREE.Box3().setFromObject(avatarScene);
        if (box.isEmpty()) {
            eyePos.copy(avatarScene.position);
            eyePos.y += 1.6;
            return eyePos;
        }

        eyePos.set(
            (box.min.x + box.max.x) * 0.5,
            box.max.y - 0.05,
            (box.min.z + box.max.z) * 0.5
        );
        return eyePos;
    }

    getSeatedCameraAnchor(seatInfo) {
        const avatarScene = this.getLocalAvatarScene();
        if (!avatarScene) {
            return this.calculateSeatCameraPosition(seatInfo);
        }

        const eyePos = this.getAvatarEyePosition(avatarScene);
        const toScreenDir = new THREE.Vector3(0, 21, -57).sub(eyePos).normalize();
        eyePos.addScaledVector(toScreenDir, -0.05);
        return eyePos;
    }
    
    calculateSeatTarget(seatInfo) {
        return new THREE.Vector3(0, 21, -57);
    }
    
    animateToSeat(targetPosition, targetLookAt) {
        if (this.seatTransition) {
            cancelAnimationFrame(this.seatTransition);
        }
        
        const startPosition = this.camera.position.clone();
        const duration = 1000;
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            
            this.camera.position.lerpVectors(startPosition, targetPosition, eased);
            this.camera.lookAt(targetLookAt);
            
            if (progress < 1) {
                this.seatTransition = requestAnimationFrame(animate);
            } else {
                this.seatTransition = null;
                this.camera.lookAt(targetLookAt);
            }
        };
        
        animate();
    }
    
    standUp() {
        if (!this.isSeated) return false;
        
        this.isSeated = false;
        this.seatLookTarget = null;
        
        if (this.originalCameraState) {
            const standingPosition = this.originalCameraState.position.clone();
            const groundHeight = this.getGroundHeight(standingPosition);
            standingPosition.y = groundHeight + 1.6;
            
            this.animateToStanding(standingPosition, this.originalCameraState.yaw, this.originalCameraState.pitch);
        }
        
        this.currentSeat = null;
        this.localAvatarId = null;
        this.hideSeatedFeedback();
        
        return true;
    }
    
    animateToStanding(targetPosition, targetYaw, targetPitch) {
        const startPosition = this.camera.position.clone();
        const duration = 800;
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            
            this.camera.position.lerpVectors(startPosition, targetPosition, eased);
            
            if (progress >= 1) {
                const euler = new THREE.Euler(targetPitch, targetYaw, 0, 'YXZ');
                this.camera.quaternion.setFromEuler(euler);
            }
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }
    
    getGroundHeight(position) {
        if (position.z < 3 && position.z > -45) {
            return -1.5 + Math.max(0, (position.z + 42) / 3.3) * 0.15;
        }
        if (position.z > 3 && position.z < 8) {
            return 0.3;
        }
        return 0;
    }
    
    showSeatedFeedback(seatInfo) {
        const seatedDiv = document.createElement('div');
        seatedDiv.id = 'seated-status';
        seatedDiv.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 255, 255, 0.2);
            border: 1px solid rgba(0, 255, 255, 0.3);
            border-radius: 12px;
            padding: 16px;
            color: #00ffff;
            font-size: 14px;
            backdrop-filter: blur(10px);
            z-index: 1000;
            text-align: center;
        `;
        seatedDiv.innerHTML = `
            Seated<br>
            <span style="font-size: 12px; opacity: 0.8;">Row ${seatInfo.row + 1}, Seat ${seatInfo.seat + 1}</span><br>
            <span style="font-size: 11px; opacity: 0.6;">Press ESC to stand</span>
        `;
        
        document.body.appendChild(seatedDiv);
    }
    
    hideSeatedFeedback() {
        const seatedDiv = document.getElementById('seated-status');
        if (seatedDiv) {
            document.body.removeChild(seatedDiv);
        }
    }
    
    handleKeyPress(event) {
        if (event.code === 'Escape' && this.isSeated) {
            const wasSeated = this.isSeated;
            this.standUp();

            if (wasSeated && this.theatre.networkManager) {
                this.theatre.networkManager.leaveSeat();
            }
        }
    }

    update() {
        if (!this.isSeated) return;
        const avatarScene = this.getLocalAvatarScene();
        if (!avatarScene) return;

        const eyePos = this.getAvatarEyePosition(avatarScene);
        this.camera.position.copy(eyePos);
        if (this.seatLookTarget) {
            this.camera.lookAt(this.seatLookTarget);
        }
    }
    
    dispose() {
        this.hideSeatedFeedback();
        if (this.seatTransition) {
            cancelAnimationFrame(this.seatTransition);
        }
    }
}
