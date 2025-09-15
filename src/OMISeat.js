import * as THREE from 'three';

export class OMISeat {
    constructor(theatre, camera, orbitControls) {
        this.theatre = theatre;
        this.camera = camera;
        this.orbitControls = orbitControls;
        this.isSeated = false;
        this.currentSeat = null;
        this.originalCameraState = null;
        this.seatTransition = null;
        
        this.setupSeatSystem();
    }
    
    setupSeatSystem() {
        // OMI_seat protocol implementation
        console.log('OMI_seat: Seat system initialized');
    }
    
    sitInSeat(seatInfo) {
        if (this.isSeated) {
            this.standUp();
        }
        
        console.log('OMI_seat: Sitting in seat', seatInfo.row, seatInfo.seat);
        
        // Store original camera state
        this.originalCameraState = {
            position: this.camera.position.clone(),
            rotation: this.camera.rotation.clone(),
            target: this.orbitControls ? this.orbitControls.target.clone() : null
        };
        
        // Calculate optimal seating position and orientation
        const seatPosition = this.calculateSeatCameraPosition(seatInfo);
        const seatTarget = this.calculateSeatTarget(seatInfo);
        
        // Animate transition to seat
        this.animateToSeat(seatPosition, seatTarget);
        
        this.isSeated = true;
        this.currentSeat = seatInfo;
        
        // Configure orbit controls for seated experience
        if (this.orbitControls) {
            this.orbitControls.target.copy(seatTarget);
            this.orbitControls.enablePan = false;
            this.orbitControls.enableZoom = false;
            
            // Limit look around when seated - more realistic
            this.orbitControls.maxAzimuthAngle = Math.PI / 3; // 60 degrees left
            this.orbitControls.minAzimuthAngle = -Math.PI / 3; // 60 degrees right
            this.orbitControls.maxPolarAngle = Math.PI * 0.7; // Don't look too far up
            this.orbitControls.minPolarAngle = Math.PI * 0.3; // Don't look too far down
        }
        
        // Show seated UI feedback
        this.showSeatedFeedback(seatInfo);
        
        return true;
    }
    
    calculateSeatCameraPosition(seatInfo) {
        // Position camera slightly above and behind the seat for first-person view
        const seatPos = seatInfo.position.clone();
        seatPos.y += 1.4; // Eye level when seated
        seatPos.z += 0.3; // Slightly back from seat edge
        return seatPos;
    }
    
    calculateSeatTarget(seatInfo) {
        // Target the center of the massive screen
        const screenCenter = new THREE.Vector3(0, 21, -57);
        return screenCenter;
    }
    
    animateToSeat(targetPosition, targetLookAt) {
        if (this.seatTransition) {
            this.seatTransition.stop();
        }
        
        const startPosition = this.camera.position.clone();
        const startTarget = this.orbitControls ? this.orbitControls.target.clone() : targetLookAt;
        
        let progress = 0;
        const duration = 1000; // 1 second transition
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            progress = Math.min(elapsed / duration, 1);
            
            // Smooth easing function
            const eased = 1 - Math.pow(1 - progress, 3);
            
            // Interpolate position
            this.camera.position.lerpVectors(startPosition, targetPosition, eased);
            
            // Interpolate look target
            if (this.orbitControls) {
                this.orbitControls.target.lerpVectors(startTarget, targetLookAt, eased);
            }
            
            if (progress < 1) {
                this.seatTransition = requestAnimationFrame(animate);
            } else {
                this.seatTransition = null;
                console.log('OMI_seat: Seated transition complete');
            }
        };
        
        animate();
    }
    
    standUp() {
        if (!this.isSeated) return false;
        
        console.log('OMI_seat: Standing up from seat');
        
        // Restore orbit controls freedom
        if (this.orbitControls) {
            this.orbitControls.enablePan = false; // Keep pan disabled
            this.orbitControls.enableZoom = true;
            
            // Reset rotation limits
            this.orbitControls.maxAzimuthAngle = Infinity;
            this.orbitControls.minAzimuthAngle = -Infinity;
            this.orbitControls.maxPolarAngle = Math.PI * 0.8;
            this.orbitControls.minPolarAngle = Math.PI * 0.1;
        }
        
        // Animate back to standing position
        if (this.originalCameraState) {
            const standingPosition = this.originalCameraState.position.clone();
            standingPosition.y = this.getGroundHeight(standingPosition) + 1.6;
            
            this.animateToPosition(standingPosition, this.originalCameraState.target);
        }
        
        this.isSeated = false;
        this.currentSeat = null;
        this.hideSeatedFeedback();
        
        return true;
    }
    
    animateToPosition(targetPosition, targetLookAt) {
        const startPosition = this.camera.position.clone();
        const startTarget = this.orbitControls ? this.orbitControls.target.clone() : targetLookAt;
        
        let progress = 0;
        const duration = 800; // Slightly faster standing up
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            progress = Math.min(elapsed / duration, 1);
            
            const eased = 1 - Math.pow(1 - progress, 3);
            
            this.camera.position.lerpVectors(startPosition, targetPosition, eased);
            
            if (this.orbitControls && targetLookAt) {
                this.orbitControls.target.lerpVectors(startTarget, targetLookAt, eased);
            }
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }
    
    getGroundHeight(position) {
        // Simple ground height detection for the massive theatre
        // In recessed seating area
        if (position.z < 3 && position.z > -45) {
            return -1.5 + Math.max(0, (position.z + 42) / 3.3) * 0.15;
        }
        // On main floor
        return 0;
    }
    
    showSeatedFeedback(seatInfo) {
        // Create seated status overlay
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
            🪑 Seated<br>
            <span style="font-size: 12px; opacity: 0.8;">Row ${seatInfo.row + 1}, Seat ${seatInfo.seat + 1}</span><br>
            <span style="font-size: 11px; opacity: 0.6;">Click another seat or press ESC to stand</span>
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
            
            // Free up the seat
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
