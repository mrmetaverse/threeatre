import * as THREE from 'three';

export class RoguelikeWorld {
    constructor(scene, theatre) {
        this.scene = scene;
        this.theatre = theatre;
        this.isActive = false;
        this.walls = [];
        this.floors = [];
        this.ghosts = [];
        this.worldSize = 50;
        this.cellSize = 4;
        this.maze = [];
        this.player = null;
        this.exitPosition = new THREE.Vector3(0, 0, 25); // Back to theatre
        
        this.generateMaze();
    }
    
    generateMaze() {
        // Generate classic Doom-style maze using recursive backtracking
        const width = Math.floor(this.worldSize / this.cellSize);
        const height = Math.floor(this.worldSize / this.cellSize);
        
        // Initialize maze grid
        this.maze = Array(height).fill().map(() => Array(width).fill(1)); // 1 = wall, 0 = floor
        
        // Recursive backtracking maze generation
        const stack = [];
        const startX = 1;
        const startZ = 1;
        this.maze[startZ][startX] = 0;
        stack.push([startX, startZ]);
        
        while (stack.length > 0) {
            const [currentX, currentZ] = stack[stack.length - 1];
            const neighbors = this.getUnvisitedNeighbors(currentX, currentZ, width, height);
            
            if (neighbors.length > 0) {
                const [nextX, nextZ] = neighbors[Math.floor(Math.random() * neighbors.length)];
                
                // Remove wall between current and next
                const wallX = currentX + (nextX - currentX) / 2;
                const wallZ = currentZ + (nextZ - currentZ) / 2;
                this.maze[wallZ][wallX] = 0;
                this.maze[nextZ][nextX] = 0;
                
                stack.push([nextX, nextZ]);
            } else {
                stack.pop();
            }
        }
        
        // Create entrance and exit
        this.maze[1][0] = 0; // Entrance from theatre
        this.maze[height - 2][width - 1] = 0; // Exit (loop back)
        
        console.log('Doom-style maze generated:', width, 'x', height);
    }
    
    getUnvisitedNeighbors(x, z, width, height) {
        const neighbors = [];
        const directions = [[0, -2], [2, 0], [0, 2], [-2, 0]]; // Up, Right, Down, Left
        
        directions.forEach(([dx, dz]) => {
            const newX = x + dx;
            const newZ = z + dz;
            
            if (newX > 0 && newX < width - 1 && newZ > 0 && newZ < height - 1) {
                if (this.maze[newZ][newX] === 1) {
                    neighbors.push([newX, newZ]);
                }
            }
        });
        
        return neighbors;
    }
    
    buildWorld() {
        if (this.isActive) return;
        
        console.log('Building Doom-style roguelike world...');
        
        // Clear existing world
        this.clearWorld();
        
        // Build maze geometry
        this.buildMazeGeometry();
        
        // Spawn ghosts
        this.spawnGhosts();
        
        // Setup world lighting
        this.setupWorldLighting();
        
        this.isActive = true;
        console.log('Roguelike world built with', this.ghosts.length, 'ghosts');
    }
    
    buildMazeGeometry() {
        const wallMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x444444,
            map: this.createBrickTexture()
        });
        const floorMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x222222 
        });
        
        const wallHeight = 6;
        
        for (let z = 0; z < this.maze.length; z++) {
            for (let x = 0; x < this.maze[z].length; x++) {
                const worldX = (x - this.maze[z].length / 2) * this.cellSize;
                const worldZ = (z - this.maze.length / 2) * this.cellSize + 30; // Offset from theatre
                
                if (this.maze[z][x] === 1) {
                    // Create wall
                    const wallGeometry = new THREE.BoxGeometry(this.cellSize, wallHeight, this.cellSize);
                    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
                    wall.position.set(worldX, wallHeight / 2, worldZ);
                    wall.castShadow = true;
                    wall.receiveShadow = true;
                    this.scene.add(wall);
                    this.walls.push(wall);
                } else {
                    // Create floor
                    const floorGeometry = new THREE.PlaneGeometry(this.cellSize, this.cellSize);
                    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
                    floor.rotation.x = -Math.PI / 2;
                    floor.position.set(worldX, 0, worldZ);
                    floor.receiveShadow = true;
                    this.scene.add(floor);
                    this.floors.push(floor);
                }
            }
        }
    }
    
    createBrickTexture() {
        // Create a simple brick pattern texture
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Draw brick pattern
        ctx.fillStyle = '#666666';
        ctx.fillRect(0, 0, 256, 256);
        
        ctx.fillStyle = '#444444';
        for (let y = 0; y < 256; y += 32) {
            for (let x = 0; x < 256; x += 64) {
                const offsetX = (y / 32) % 2 === 0 ? 0 : 32;
                ctx.fillRect(x + offsetX, y, 60, 28);
            }
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        
        return texture;
    }
    
    spawnGhosts() {
        const numGhosts = 5 + Math.floor(Math.random() * 5); // 5-10 ghosts
        
        for (let i = 0; i < numGhosts; i++) {
            const ghost = this.createGhost();
            const position = this.getRandomFloorPosition();
            if (position) {
                ghost.position.copy(position);
                ghost.position.y = 2;
                this.scene.add(ghost);
                this.ghosts.push({
                    mesh: ghost,
                    position: ghost.position.clone(),
                    target: null,
                    speed: 0.02 + Math.random() * 0.02,
                    lastPlayerDistance: Infinity,
                    aggroRange: 8,
                    killRange: 1.5
                });
            }
        }
    }
    
    createGhost() {
        const ghostGroup = new THREE.Group();
        
        // Ghost body - translucent and spooky
        const bodyGeometry = new THREE.ConeGeometry(0.8, 2.5, 8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xcccccc,
            transparent: true,
            opacity: 0.7
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 1.25;
        ghostGroup.add(body);
        
        // Ghost eyes - glowing red
        const eyeGeometry = new THREE.SphereGeometry(0.1, 6, 4);
        const eyeMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.5
        });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.3, 2, 0.3);
        ghostGroup.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.3, 2, 0.3);
        ghostGroup.add(rightEye);
        
        // Add floating animation
        ghostGroup.userData.floatOffset = Math.random() * Math.PI * 2;
        
        return ghostGroup;
    }
    
    getRandomFloorPosition() {
        const floorCells = [];
        
        for (let z = 0; z < this.maze.length; z++) {
            for (let x = 0; x < this.maze[z].length; x++) {
                if (this.maze[z][x] === 0) {
                    floorCells.push([x, z]);
                }
            }
        }
        
        if (floorCells.length === 0) return null;
        
        const [x, z] = floorCells[Math.floor(Math.random() * floorCells.length)];
        const worldX = (x - this.maze[0].length / 2) * this.cellSize;
        const worldZ = (z - this.maze.length / 2) * this.cellSize + 30;
        
        return new THREE.Vector3(worldX, 0, worldZ);
    }
    
    setupWorldLighting() {
        // Dim, spooky lighting for the roguelike world
        const ambientLight = new THREE.AmbientLight(0x404040, 0.2);
        this.scene.add(ambientLight);
        
        // Flickering torches at random positions
        for (let i = 0; i < 8; i++) {
            const torchPosition = this.getRandomFloorPosition();
            if (torchPosition) {
                this.createTorch(torchPosition);
            }
        }
    }
    
    createTorch(position) {
        // Torch post
        const postGeometry = new THREE.CylinderGeometry(0.1, 0.1, 3, 6);
        const postMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        const post = new THREE.Mesh(postGeometry, postMaterial);
        post.position.copy(position);
        post.position.y = 1.5;
        this.scene.add(post);
        this.walls.push(post);
        
        // Flickering light
        const torchLight = new THREE.PointLight(0xff6600, 0.8, 12);
        torchLight.position.copy(position);
        torchLight.position.y = 3;
        torchLight.castShadow = true;
        this.scene.add(torchLight);
        
        // Animate flickering
        setInterval(() => {
            torchLight.intensity = 0.6 + Math.random() * 0.4;
        }, 100 + Math.random() * 200);
    }
    
    update(deltaTime, playerPosition) {
        if (!this.isActive) return;
        
        // Update ghosts
        this.ghosts.forEach(ghost => {
            this.updateGhost(ghost, deltaTime, playerPosition);
        });
    }
    
    updateGhost(ghost, deltaTime, playerPosition) {
        // Floating animation
        const time = Date.now() * 0.001;
        ghost.mesh.position.y = 2 + Math.sin(time * 2 + ghost.mesh.userData.floatOffset) * 0.3;
        
        if (!playerPosition) return;
        
        const distanceToPlayer = ghost.position.distanceTo(playerPosition);
        
        // Check if player is in kill range
        if (distanceToPlayer < ghost.killRange) {
            this.killPlayer();
            return;
        }
        
        // Check if player is in aggro range
        if (distanceToPlayer < ghost.aggroRange) {
            // Chase player
            const direction = new THREE.Vector3();
            direction.subVectors(playerPosition, ghost.position).normalize();
            
            ghost.position.addScaledVector(direction, ghost.speed);
            ghost.mesh.position.copy(ghost.position);
            
            // Make ghost look at player
            ghost.mesh.lookAt(playerPosition);
            
            // Increase speed when chasing
            ghost.speed = Math.min(ghost.speed + 0.001, 0.08);
        } else {
            // Random wandering
            if (Math.random() < 0.02) { // 2% chance to change direction
                const randomDirection = new THREE.Vector3(
                    (Math.random() - 0.5) * 2,
                    0,
                    (Math.random() - 0.5) * 2
                ).normalize();
                
                ghost.position.addScaledVector(randomDirection, ghost.speed * 0.5);
                ghost.mesh.position.copy(ghost.position);
            }
            
            // Slow down when not chasing
            ghost.speed = Math.max(ghost.speed - 0.001, 0.01);
        }
        
        // Keep ghosts within bounds
        this.constrainGhostToBounds(ghost);
    }
    
    constrainGhostToBounds(ghost) {
        const halfSize = this.worldSize / 2;
        const offset = 30; // World offset from theatre
        
        ghost.position.x = Math.max(-halfSize, Math.min(halfSize, ghost.position.x));
        ghost.position.z = Math.max(offset - halfSize, Math.min(offset + halfSize, ghost.position.z));
        
        ghost.mesh.position.copy(ghost.position);
    }
    
    killPlayer() {
        console.log('💀 Ghost got you! Respawning in theatre...');
        
        // Flash red effect
        this.scene.background = new THREE.Color(0x660000);
        setTimeout(() => {
            this.scene.background = new THREE.Color(0x000011);
        }, 200);
        
        // Respawn player in theatre
        this.respawnInTheatre();
        
        // Show death message
        this.showDeathMessage();
    }
    
    respawnInTheatre() {
        // Hide roguelike world
        this.hideWorld();
        
        // Move player back to theatre entrance
        if (this.theatre.camera) {
            this.theatre.camera.position.set(0, 2, 18);
            this.theatre.camera.rotation.set(0, 0, 0);
        }
        
        // Notify network if connected
        if (this.theatre.networkManager) {
            this.theatre.networkManager.updatePosition(new THREE.Vector3(0, 2, 18));
        }
    }
    
    showDeathMessage() {
        // Create temporary death message overlay
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: #ff0000;
            padding: 20px;
            border-radius: 10px;
            font-size: 24px;
            font-weight: bold;
            z-index: 1000;
            text-align: center;
            border: 2px solid #ff0000;
        `;
        messageDiv.innerHTML = `
            💀 THE GHOSTS GOT YOU! 💀<br>
            <span style="font-size: 16px; color: #ccc;">You have been returned to the safety of the theatre</span>
        `;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            document.body.removeChild(messageDiv);
        }, 3000);
    }
    
    enterWorld(playerPosition) {
        console.log('🚪 Entering the dangerous outside world...');
        
        // Hide theatre elements
        this.hideTheatre();
        
        // Build and show roguelike world
        this.buildWorld();
        
        // Position player at entrance
        if (this.theatre.camera) {
            this.theatre.camera.position.set(0, 2, 35); // Just outside theatre
        }
        
        // Show warning message
        this.showWorldWarning();
    }
    
    showWorldWarning() {
        const warningDiv = document.createElement('div');
        warningDiv.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: #ffaa00;
            padding: 15px;
            border-radius: 8px;
            font-size: 16px;
            z-index: 1000;
            text-align: center;
            border: 2px solid #ffaa00;
        `;
        warningDiv.innerHTML = `
            ⚠️ DANGER: Ghosts roam these halls! ⚠️<br>
            <span style="font-size: 12px;">Stay in the theatre to be safe</span>
        `;
        
        document.body.appendChild(warningDiv);
        
        setTimeout(() => {
            if (document.body.contains(warningDiv)) {
                document.body.removeChild(warningDiv);
            }
        }, 5000);
    }
    
    hideTheatre() {
        // Make theatre elements invisible but keep them in scene
        this.theatre.seats.forEach(seat => {
            seat.group.visible = false;
        });
        
        if (this.theatre.screen) this.theatre.screen.visible = false;
        if (this.theatre.stage) this.theatre.stage.visible = false;
        
        this.theatre.walls.forEach(wall => {
            wall.visible = false;
        });
    }
    
    showTheatre() {
        // Make theatre elements visible again
        this.theatre.seats.forEach(seat => {
            seat.group.visible = true;
        });
        
        if (this.theatre.screen) this.theatre.screen.visible = true;
        if (this.theatre.stage) this.theatre.stage.visible = true;
        
        this.theatre.walls.forEach(wall => {
            wall.visible = true;
        });
    }
    
    hideWorld() {
        this.walls.forEach(wall => {
            wall.visible = false;
        });
        this.floors.forEach(floor => {
            floor.visible = false;
        });
        this.ghosts.forEach(ghost => {
            ghost.mesh.visible = false;
        });
        
        this.showTheatre();
        this.isActive = false;
    }
    
    clearWorld() {
        // Remove all world geometry
        this.walls.forEach(wall => {
            this.scene.remove(wall);
            if (wall.geometry) wall.geometry.dispose();
            if (wall.material) wall.material.dispose();
        });
        
        this.floors.forEach(floor => {
            this.scene.remove(floor);
            if (floor.geometry) floor.geometry.dispose();
            if (floor.material) floor.material.dispose();
        });
        
        this.ghosts.forEach(ghost => {
            this.scene.remove(ghost.mesh);
            ghost.mesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        });
        
        this.walls = [];
        this.floors = [];
        this.ghosts = [];
    }
    
    checkExitCollision(playerPosition) {
        // Check if player is near the exit portal
        if (this.theatre.exitPortal) {
            const distance = playerPosition.distanceTo(this.theatre.exitPortal.position);
            return distance < 2;
        }
        return false;
    }
    
    checkReturnCollision(playerPosition) {
        // Check if player wants to return to theatre from outside world
        if (this.isActive) {
            const returnDistance = playerPosition.distanceTo(this.exitPosition);
            return returnDistance < 3;
        }
        return false;
    }
    
    dispose() {
        this.clearWorld();
    }
}
