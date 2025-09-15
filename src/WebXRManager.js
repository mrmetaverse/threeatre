import * as THREE from 'three';

export class WebXRManager {
    constructor(renderer) {
        this.renderer = renderer;
        this.isSupported = false;
        this.currentSession = null;
        
        this.checkSupport();
        this.setupButtons();
    }
    
    async checkSupport() {
        const xrButton = document.getElementById('xr-button');
        const xrStatus = document.getElementById('xr-status');
        
        if ('xr' in navigator) {
            try {
                const isVRSupported = await navigator.xr.isSessionSupported('immersive-vr');
                
                this.isSupported = isVRSupported;
                
                if (isVRSupported) {
                    xrButton.disabled = false;
                    xrStatus.textContent = 'XR Ready - VR headset detected';
                    xrStatus.style.color = '#4CAF50';
                } else {
                    xrButton.disabled = true;
                    xrButton.textContent = '🥽 XR Not Available';
                    xrStatus.textContent = 'No VR headset detected. Connect a headset and try again.';
                    xrStatus.style.color = '#ff9800';
                }
                
                console.log('WebXR Support:', { vr: isVRSupported });
            } catch (error) {
                console.error('Error checking WebXR support:', error);
                this.disableButton('Error checking XR support');
            }
        } else {
            console.log('WebXR not available');
            this.disableButton('Browser does not support WebXR');
        }
    }
    
    disableButton(reason) {
        const xrButton = document.getElementById('xr-button');
        const xrStatus = document.getElementById('xr-status');
        
        xrButton.disabled = true;
        xrButton.textContent = '🥽 XR Not Available';
        xrStatus.textContent = reason;
        xrStatus.style.color = '#f44336';
    }
    
    setupButtons() {
        // The buttons are set up in the main app, but we can add session event listeners here
        this.renderer.xr.addEventListener('sessionstart', () => {
            console.log('XR Session started');
            this.currentSession = this.renderer.xr.getSession();
            this.updateUI(true);
        });
        
        this.renderer.xr.addEventListener('sessionend', () => {
            console.log('XR Session ended');
            this.currentSession = null;
            
            // Reset button status
            const xrButton = document.getElementById('xr-button');
            const xrStatus = document.getElementById('xr-status');
            xrButton.textContent = '🥽 Enter XR';
            xrStatus.textContent = 'XR Ready - VR headset detected';
            xrStatus.style.color = '#4CAF50';
            
            this.updateUI(false);
        });
    }
    
    updateUI(inSession) {
        const ui = document.getElementById('ui');
        if (inSession) {
            ui.style.display = 'none';
        } else {
            ui.style.display = 'block';
        }
    }
    
    async enterXR() {
        if (!this.isSupported) {
            const xrStatus = document.getElementById('xr-status');
            alert('XR is not supported: ' + xrStatus.textContent);
            return;
        }
        
        try {
            const sessionInit = {
                optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
            };
            
            const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
            await this.renderer.xr.setSession(session);
            
            // Update button status
            const xrButton = document.getElementById('xr-button');
            const xrStatus = document.getElementById('xr-status');
            xrButton.textContent = '🥽 Exit XR';
            xrStatus.textContent = 'XR Session Active';
            xrStatus.style.color = '#4CAF50';
            
            console.log('Entered XR mode');
        } catch (error) {
            console.error('Error entering XR:', error);
            alert('Could not enter XR mode. Make sure your headset is connected and try again.');
        }
    }
    
    
    exitSession() {
        if (this.currentSession) {
            this.currentSession.end();
        }
    }
    
    isPresenting() {
        return this.renderer.xr.isPresenting;
    }
    
    getSession() {
        return this.currentSession;
    }
} 