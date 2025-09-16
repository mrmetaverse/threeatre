export class LicenseManager {
    constructor() {
        this.hasLicense = false;
        this.licenseKey = null;
        this.accountId = null;
        this.licenseType = 'free'; // 'free', 'basic', 'premium'
        
        this.init();
    }
    
    init() {
        this.checkExistingLicense();
        this.createLicenseUI();
    }
    
    checkExistingLicense() {
        // Check localStorage for existing license
        const storedLicense = localStorage.getItem('threeatre-license');
        if (storedLicense) {
            try {
                const licenseData = JSON.parse(storedLicense);
                this.validateLicense(licenseData);
            } catch (error) {
                console.warn('Invalid stored license data');
                localStorage.removeItem('threeatre-license');
            }
        }
    }
    
    async validateLicense(licenseData) {
        // In production, this would validate against your license server
        // For now, we'll do basic validation
        
        if (licenseData.key && licenseData.key.length === 16) {
            this.hasLicense = true;
            this.licenseKey = licenseData.key;
            this.accountId = licenseData.accountId;
            this.licenseType = licenseData.type || 'basic';
            
            console.log('✅ Valid license found:', this.licenseType);
            this.showLicenseStatus();
            return true;
        }
        
        return false;
    }
    
    createLicenseUI() {
        // License status in main UI
        const licenseStatus = document.createElement('div');
        licenseStatus.id = 'license-status';
        licenseStatus.style.cssText = `
            margin-top: 12px;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 12px;
            text-align: center;
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;
        
        // Insert after main controls
        const mainControls = document.getElementById('main-controls');
        if (mainControls) {
            mainControls.appendChild(licenseStatus);
        }
        
        this.updateLicenseStatusUI();
    }
    
    updateLicenseStatusUI() {
        const statusElement = document.getElementById('license-status');
        if (!statusElement) return;
        
        if (this.hasLicense) {
            statusElement.innerHTML = `
                ✅ Licensed (${this.licenseType})<br>
                <span style="opacity: 0.7;">Can host rooms</span>
            `;
            statusElement.style.background = 'rgba(0, 255, 0, 0.1)';
            statusElement.style.borderColor = 'rgba(0, 255, 0, 0.3)';
            statusElement.style.color = '#4CAF50';
        } else {
            statusElement.innerHTML = `
                🔓 Free Mode<br>
                <span style="opacity: 0.7;">Can join rooms only</span>
                <br><button id="get-license-btn" style="margin-top: 6px; background: rgba(0, 255, 255, 0.2); border: 1px solid rgba(0, 255, 255, 0.3); color: #00ffff; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 11px;">Get License</button>
            `;
            statusElement.style.background = 'rgba(255, 165, 0, 0.1)';
            statusElement.style.borderColor = 'rgba(255, 165, 0, 0.3)';
            statusElement.style.color = '#ffa500';
            
            // Add license purchase handler
            setTimeout(() => {
                const getLicenseBtn = document.getElementById('get-license-btn');
                if (getLicenseBtn) {
                    getLicenseBtn.addEventListener('click', () => this.showLicensePurchase());
                }
            }, 100);
        }
    }
    
    showLicensePurchase() {
        const purchaseModal = document.createElement('div');
        purchaseModal.id = 'license-purchase-modal';
        purchaseModal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            backdrop-filter: blur(10px);
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: rgba(0, 0, 0, 0.9);
            border: 2px solid #00ffff;
            border-radius: 16px;
            padding: 32px;
            max-width: 500px;
            text-align: center;
            color: #fff;
        `;
        
        modalContent.innerHTML = `
            <h2 style="color: #00ffff; margin-bottom: 20px;">🎭 Threeatre License</h2>
            
            <div style="margin-bottom: 24px;">
                <h3 style="color: #4CAF50;">Basic License - $19.99</h3>
                <ul style="text-align: left; margin: 16px 0; color: #ccc;">
                    <li>✅ Host unlimited rooms</li>
                    <li>✅ 4-letter room codes</li>
                    <li>✅ Up to 16 players per room</li>
                    <li>✅ Screen sharing hosting</li>
                    <li>✅ VRM avatar uploads</li>
                    <li>✅ Priority support</li>
                </ul>
            </div>
            
            <div style="margin-bottom: 24px;">
                <h3 style="color: #FFD700;">Premium License - $39.99</h3>
                <ul style="text-align: left; margin: 16px 0; color: #ccc;">
                    <li>✅ Everything in Basic</li>
                    <li>✅ Custom room themes</li>
                    <li>✅ Advanced avatar features</li>
                    <li>✅ Room recording</li>
                    <li>✅ White-label options</li>
                </ul>
            </div>
            
            <div style="display: flex; gap: 16px; justify-content: center;">
                <button id="purchase-basic" style="background: #4CAF50; border: none; color: white; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold;">Buy Basic License</button>
                <button id="purchase-premium" style="background: #FFD700; border: none; color: black; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold;">Buy Premium License</button>
            </div>
            
            <div style="margin-top: 20px;">
                <button id="enter-license" style="background: rgba(0, 255, 255, 0.2); border: 1px solid #00ffff; color: #00ffff; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Already have a license?</button>
            </div>
            
            <button id="close-license-modal" style="position: absolute; top: 16px; right: 16px; background: none; border: none; color: #ff6666; font-size: 24px; cursor: pointer;">×</button>
        `;
        
        purchaseModal.appendChild(modalContent);
        document.body.appendChild(purchaseModal);
        
        // Setup event listeners
        this.setupPurchaseListeners(purchaseModal);
    }
    
    setupPurchaseListeners(modal) {
        modal.querySelector('#close-license-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        modal.querySelector('#purchase-basic').addEventListener('click', () => {
            this.initiatePurchase('basic');
        });
        
        modal.querySelector('#purchase-premium').addEventListener('click', () => {
            this.initiatePurchase('premium');
        });
        
        modal.querySelector('#enter-license').addEventListener('click', () => {
            this.showLicenseEntry();
        });
    }
    
    initiatePurchase(licenseType) {
        // In production, this would integrate with Stripe, PayPal, etc.
        alert(`Purchase ${licenseType} license for ${licenseType === 'basic' ? '$19.99' : '$39.99'}.\n\nThis would redirect to payment processor.\n\nFor demo: Use license key "DEMO-${licenseType.toUpperCase()}-KEY1"`);
    }
    
    showLicenseEntry() {
        const entryModal = document.createElement('div');
        entryModal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.95);
            border: 2px solid #00ffff;
            border-radius: 16px;
            padding: 32px;
            z-index: 2001;
            text-align: center;
            color: #fff;
        `;
        
        entryModal.innerHTML = `
            <h3 style="color: #00ffff; margin-bottom: 20px;">Enter License Key</h3>
            <input type="text" id="license-key-input" placeholder="XXXX-XXXX-XXXX-XXXX" maxlength="19" 
                   style="background: rgba(255, 255, 255, 0.1); border: 1px solid #00ffff; border-radius: 8px; padding: 12px; color: #fff; font-size: 16px; text-align: center; width: 250px; margin-bottom: 16px;">
            <br>
            <button id="activate-license" style="background: #4CAF50; border: none; color: white; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold; margin-right: 12px;">Activate</button>
            <button id="cancel-license-entry" style="background: #666; border: none; color: white; padding: 12px 24px; border-radius: 8px; cursor: pointer;">Cancel</button>
        `;
        
        document.body.appendChild(entryModal);
        
        // Focus input
        const input = entryModal.querySelector('#license-key-input');
        input.focus();
        
        // Format license key as user types
        input.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^A-Z0-9]/g, '');
            value = value.match(/.{1,4}/g)?.join('-') || value;
            if (value.length > 19) value = value.substring(0, 19);
            e.target.value = value;
        });
        
        entryModal.querySelector('#activate-license').addEventListener('click', () => {
            this.activateLicense(input.value);
            document.body.removeChild(entryModal);
        });
        
        entryModal.querySelector('#cancel-license-entry').addEventListener('click', () => {
            document.body.removeChild(entryModal);
        });
        
        // Close on escape
        document.addEventListener('keydown', function escapeHandler(e) {
            if (e.key === 'Escape') {
                if (document.body.contains(entryModal)) {
                    document.body.removeChild(entryModal);
                }
                document.removeEventListener('keydown', escapeHandler);
            }
        });
    }
    
    activateLicense(licenseKey) {
        // Demo license keys for testing
        const demoKeys = {
            'DEMO-BASIC-KEY1': { type: 'basic', accountId: 'demo-basic-001' },
            'DEMO-PREMIUM-KEY1': { type: 'premium', accountId: 'demo-premium-001' }
        };
        
        if (demoKeys[licenseKey]) {
            const licenseData = {
                key: licenseKey,
                type: demoKeys[licenseKey].type,
                accountId: demoKeys[licenseKey].accountId,
                activatedAt: Date.now()
            };
            
            // Store license
            localStorage.setItem('threeatre-license', JSON.stringify(licenseData));
            
            // Activate license
            this.validateLicense(licenseData);
            
            this.showMessage(`✅ ${licenseData.type} license activated!`, 'success');
            
            // Close any open modals
            const modal = document.getElementById('license-purchase-modal');
            if (modal) document.body.removeChild(modal);
            
        } else {
            this.showMessage('❌ Invalid license key', 'error');
        }
    }
    
    showLicenseStatus() {
        this.updateLicenseStatusUI();
    }
    
    canHostRoom() {
        return this.hasLicense;
    }
    
    getMaxPlayers() {
        switch (this.licenseType) {
            case 'premium': return 32;
            case 'basic': return 16;
            default: return 0; // Free users can't host
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
            color: ${type === 'error' ? '#ff6666' : type === 'success' ? '#4CAF50' : '#00ffff'};
            padding: 16px 24px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 500;
            z-index: 2002;
            text-align: center;
            border: 1px solid ${type === 'error' ? '#ff6666' : type === 'success' ? '#4CAF50' : '#00ffff'};
            backdrop-filter: blur(10px);
        `;
        messageDiv.textContent = message;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            if (document.body.contains(messageDiv)) {
                document.body.removeChild(messageDiv);
            }
        }, 3000);
    }
    
    dispose() {
        const statusElement = document.getElementById('license-status');
        if (statusElement && statusElement.parentNode) {
            statusElement.parentNode.removeChild(statusElement);
        }
    }
}
