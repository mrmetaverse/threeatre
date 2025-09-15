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
        if ('xr' in navigator) {
            try {
                const isVRSupported = await navigator.xr.isSessionSupported('immersive-vr');
                const isARSupported = await navigator.xr.isSessionSupported('immersive-ar');
                
                this.isSupported = isVRSupported || isARSupported;
                
                // Update button states
                document.getElementById('vr-button').disabled = !isVRSupported;
                document.getElementById('ar-button').disabled = !isARSupported;
                
                if (!isVRSupported) {
                    document.getElementById('vr-button').textContent = 'VR Not Supported';
                }
                
                if (!isARSupported) {
                    document.getElementById('ar-button').textContent = 'AR Not Supported';
                }
                
                console.log('WebXR Support:', { vr: isVRSupported, ar: isARSupported });
            } catch (error) {
                console.error('Error checking WebXR support:', error);
                this.disableButtons();
            }
        } else {
            console.log('WebXR not available');
            this.disableButtons();
        }
    }
    
    disableButtons() {
        document.getElementById('vr-button').disabled = true;
        document.getElementById('ar-button').disabled = true;
        document.getElementById('vr-button').textContent = 'WebXR Not Available';
        document.getElementById('ar-button').textContent = 'WebXR Not Available';
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
    
    async enterVR() {
        if (!this.isSupported) {
            alert('WebXR VR is not supported on this device');
            return;
        }
        
        try {
            const sessionInit = {
                optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
            };
            
            const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
            await this.renderer.xr.setSession(session);
            
            console.log('Entered VR mode');
        } catch (error) {
            console.error('Error entering VR:', error);
            alert('Could not enter VR mode. Please check your headset connection.');
        }
    }
    
    async enterAR() {
        if (!this.isSupported) {
            alert('WebXR AR is not supported on this device');
            return;
        }
        
        try {
            const sessionInit = {
                requiredFeatures: ['local'],
                optionalFeatures: ['dom-overlay', 'hand-tracking'],
                domOverlay: { root: document.body }
            };
            
            const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
            await this.renderer.xr.setSession(session);
            
            console.log('Entered AR mode');
        } catch (error) {
            console.error('Error entering AR:', error);
            alert('Could not enter AR mode. Please check your device compatibility.');
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