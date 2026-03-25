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
        
        const seatPosition = this.calculateSeatCameraPosition(seatInfo);
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
            this.standUp();
            
            if (this.currentSeat && this.theatre.networkManager) {
                this.theatre.networkManager.leaveSeat();
            }
        }
    }
    
    dispose() {
        this.hideSeatedFeedback();
        if (this.seatTransition) {
            cancelAnimationFrame(this.seatTransition);
        }
    }
}
