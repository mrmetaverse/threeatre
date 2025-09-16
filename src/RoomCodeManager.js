export class RoomCodeManager {
    constructor(networkManager, licenseManager) {
        this.networkManager = networkManager;
        this.licenseManager = licenseManager;
        this.currentRoomCode = null;
        this.isHosting = false;
        
        this.init();
    }
    
    init() {
        this.createRoomCodeUI();
        this.setupEventListeners();
    }
    
    createRoomCodeUI() {
        // Add room code section to the room controls
        const roomControls = document.getElementById('room-controls');
        if (!roomControls) return;
        
        const roomCodeSection = document.createElement('div');
        roomCodeSection.id = 'room-code-section';
        roomCodeSection.style.cssText = `
            margin-top: 16px;
            padding: 12px;
            background: rgba(0, 255, 255, 0.1);
            border: 1px solid rgba(0, 255, 255, 0.2);
            border-radius: 8px;
        `;
        
        roomCodeSection.innerHTML = `
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <button id="create-room-btn" class="button" style="flex: 1; font-size: 12px;">🎯 Create Room</button>
                <button id="join-room-btn" class="button" style="flex: 1; font-size: 12px;">🚪 Join Room</button>
            </div>
            <div id="room-code-display" style="text-align: center; font-size: 18px; font-weight: bold; color: #00ffff; margin: 8px 0; display: none;">
                Room Code: <span id="current-room-code">----</span>
            </div>
            <div id="room-code-status" style="font-size: 11px; color: #ccc; text-align: center;"></div>
        `;
        
        roomControls.appendChild(roomCodeSection);
    }
    
    setupEventListeners() {
        // Wait for elements to be created
        setTimeout(() => {
            const createBtn = document.getElementById('create-room-btn');
            const joinBtn = document.getElementById('join-room-btn');
            
            if (createBtn) {
                createBtn.addEventListener('click', () => this.createRoom());
            }
            
            if (joinBtn) {
                joinBtn.addEventListener('click', () => this.showJoinRoomDialog());
            }
        }, 100);
    }
    
    createRoom() {
        if (!this.licenseManager.canHostRoom()) {
            this.showLicenseRequiredMessage();
            return;
        }
        
        // Generate 4-letter room code
        this.currentRoomCode = this.generateRoomCode();
        this.isHosting = true;
        
        // Update UI
        this.updateRoomCodeDisplay();
        
        // Update URL
        const url = new URL(window.location);
        url.searchParams.set('room', this.currentRoomCode);
        window.history.replaceState({}, '', url);
        
        // Notify network manager
        this.networkManager.roomId = this.currentRoomCode;
        this.networkManager.isHost = true;
        
        console.log('🎯 Created room with code:', this.currentRoomCode);
        this.showMessage(`Room created! Code: ${this.currentRoomCode}`, 'success');
    }
    
    generateRoomCode() {
        // Generate 4-letter code (avoiding confusing letters)
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I, O to avoid confusion
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
    
    showJoinRoomDialog() {
        const joinModal = document.createElement('div');
        joinModal.style.cssText = `
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
        
        joinModal.innerHTML = `
            <h3 style="color: #00ffff; margin-bottom: 20px;">🚪 Join Room</h3>
            <p style="margin-bottom: 16px; color: #ccc;">Enter the 4-letter room code:</p>
            <input type="text" id="room-code-input" placeholder="ABCD" maxlength="4" 
                   style="background: rgba(255, 255, 255, 0.1); border: 2px solid #00ffff; border-radius: 8px; padding: 16px; color: #fff; font-size: 24px; text-align: center; width: 120px; margin-bottom: 20px; letter-spacing: 4px; text-transform: uppercase;">
            <br>
            <button id="join-room-submit" style="background: #4CAF50; border: none; color: white; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold; margin-right: 12px;">Join Room</button>
            <button id="cancel-join" style="background: #666; border: none; color: white; padding: 12px 24px; border-radius: 8px; cursor: pointer;">Cancel</button>
        `;
        
        document.body.appendChild(joinModal);
        
        // Focus input and setup handlers
        const input = joinModal.querySelector('#room-code-input');
        input.focus();
        
        // Auto-uppercase and limit to letters
        input.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
        });
        
        // Submit on Enter
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && input.value.length === 4) {
                this.joinRoom(input.value);
                document.body.removeChild(joinModal);
            }
        });
        
        joinModal.querySelector('#join-room-submit').addEventListener('click', () => {
            if (input.value.length === 4) {
                this.joinRoom(input.value);
                document.body.removeChild(joinModal);
            } else {
                this.showMessage('Please enter a 4-letter room code', 'error');
            }
        });
        
        joinModal.querySelector('#cancel-join').addEventListener('click', () => {
            document.body.removeChild(joinModal);
        });
    }
    
    joinRoom(roomCode) {
        // Update URL and reload to join room
        const url = new URL(window.location);
        url.searchParams.set('room', roomCode);
        
        this.showMessage(`Joining room ${roomCode}...`, 'info');
        
        // Reload page with room code
        window.location.href = url.toString();
    }
    
    updateRoomCodeDisplay() {
        const display = document.getElementById('room-code-display');
        const codeSpan = document.getElementById('current-room-code');
        const status = document.getElementById('room-code-status');
        
        if (this.isHosting && this.currentRoomCode) {
            display.style.display = 'block';
            codeSpan.textContent = this.currentRoomCode;
            status.textContent = 'Share this code with friends to join!';
        } else {
            display.style.display = 'none';
            status.textContent = '';
        }
    }
    
    showLicenseRequiredMessage() {
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 165, 0, 0.2);
            border: 2px solid #ffa500;
            border-radius: 16px;
            padding: 24px;
            color: #ffa500;
            font-size: 16px;
            font-weight: 500;
            z-index: 2001;
            text-align: center;
            backdrop-filter: blur(10px);
        `;
        messageDiv.innerHTML = `
            🔓 License Required<br>
            <span style="font-size: 14px; opacity: 0.8;">You need a Threeatre license to host rooms</span><br>
            <button onclick="this.parentElement.remove()" style="margin-top: 12px; background: #4CAF50; border: none; color: white; padding: 8px 16px; border-radius: 6px; cursor: pointer;">OK</button>
        `;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            if (document.body.contains(messageDiv)) {
                document.body.removeChild(messageDiv);
            }
        }, 4000);
    }
    
    showMessage(message, type = 'info') {
        // Reuse the main message system
        if (this.networkManager && this.networkManager.app) {
            this.networkManager.app.showMessage(message, type);
        }
    }
    
    dispose() {
        const section = document.getElementById('room-code-section');
        if (section && section.parentNode) {
            section.parentNode.removeChild(section);
        }
    }
}
