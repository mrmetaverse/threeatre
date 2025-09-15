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
        this.tomatoes = [];
        this.lastTomatoTime = 0;
        this.tomatoCooldown = 300; // ms between tomatoes
        this.treasureChest = null;
        this.treasurePosition = null;
        this.playerScore = 0;
        
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
        
        // Add warning sign outside theatre
        this.createWarningSign();
        
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
    
    createWarningSign() {
        // Create warning sign post
        const postGeometry = new THREE.CylinderGeometry(0.2, 0.2, 4, 8);
        const postMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        const post = new THREE.Mesh(postGeometry, postMaterial);
        post.position.set(0, 2, 28); // Just outside theatre exit
        post.castShadow = true;
        this.scene.add(post);
        this.walls.push(post);
        
        // Create warning sign board
        const signGeometry = new THREE.PlaneGeometry(6, 3);
        const signMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x8B0000,
            side: THREE.DoubleSide
        });
        const sign = new THREE.Mesh(signGeometry, signMaterial);
        sign.position.set(0, 4, 28);
        this.scene.add(sign);
        this.walls.push(sign);
        
        // Add warning text (using simple geometry)
        this.createWarningText(sign);
        
        // Add skulls around the sign
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const skullGeometry = new THREE.SphereGeometry(0.3, 8, 6);
            const skullMaterial = new THREE.MeshLambertMaterial({ color: 0xccccaa });
            const skull = new THREE.Mesh(skullGeometry, skullMaterial);
            skull.position.set(
                Math.cos(angle) * 2,
                1 + Math.sin(i) * 0.5,
                28 + Math.sin(angle) * 1
            );
            skull.castShadow = true;
            this.scene.add(skull);
            this.walls.push(skull);
        }
        
        // Add ominous red lighting to sign
        const signLight = new THREE.PointLight(0xff0000, 0.8, 8);
        signLight.position.set(0, 4, 27);
        this.scene.add(signLight);
        
        // Make sign light pulse
        setInterval(() => {
            signLight.intensity = 0.6 + Math.sin(Date.now() * 0.008) * 0.4;
        }, 50);
    }
    
    createWarningText(signMesh) {
        // Create "BEWARE" text using simple geometry
        const textMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffff00,
            emissive: 0xffaa00,
            emissiveIntensity: 0.3
        });
        
        // Create letters using box geometry (simple but effective)
        const letterHeight = 0.8;
        const letterWidth = 0.4;
        const letterDepth = 0.1;
        
        // "BEWARE" - positioned on the sign
        const letters = [
            // B
            { x: -2.5, y: 0.3, shapes: [[0, 0], [0, 0.8], [0.3, 0.4], [0.3, 0]] },
            // E  
            { x: -1.8, y: 0.3, shapes: [[0, 0], [0, 0.8], [0.3, 0.8], [0.3, 0.4], [0.3, 0]] },
            // W
            { x: -1.1, y: 0.3, shapes: [[0, 0], [0, 0.8], [0.15, 0.4], [0.3, 0.8], [0.3, 0]] },
            // A
            { x: -0.4, y: 0.3, shapes: [[0, 0], [0, 0.8], [0.3, 0.8], [0.3, 0], [0.15, 0.4]] },
            // R
            { x: 0.3, y: 0.3, shapes: [[0, 0], [0, 0.8], [0.3, 0.8], [0.3, 0.4], [0, 0.4]] },
            // E
            { x: 1.0, y: 0.3, shapes: [[0, 0], [0, 0.8], [0.3, 0.8], [0.3, 0.4], [0.3, 0]] }
        ];
        
        letters.forEach(letter => {
            const letterGeometry = new THREE.BoxGeometry(letterWidth, letterHeight, letterDepth);
            const letterMesh = new THREE.Mesh(letterGeometry, textMaterial);
            letterMesh.position.set(letter.x, letter.y, 0.1);
            signMesh.add(letterMesh);
        });
        
        // "OF GHOSTS" text below
        const subTextGeometry = new THREE.BoxGeometry(4, 0.4, letterDepth);
        const subText = new THREE.Mesh(subTextGeometry, textMaterial);
        subText.position.set(0, -0.5, 0.1);
        signMesh.add(subText);
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
                    killRange: 1.5,
                    health: 2 + Math.floor(Math.random() * 3) // 2-4 health
                });
            }
        }
    }
    
    createGhost() {
        const ghostGroup = new THREE.Group();
        
        // Ominous glowing orb - much more visible and threatening
        const orbGeometry = new THREE.SphereGeometry(1.2, 16, 12);
        const orbMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffffff,
            emissive: 0xaaaaff,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.9
        });
        const orb = new THREE.Mesh(orbGeometry, orbMaterial);
        orb.position.y = 2;
        ghostGroup.add(orb);
        
        // Inner core - brighter center
        const coreGeometry = new THREE.SphereGeometry(0.6, 12, 8);
        const coreMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 1.2,
            transparent: true,
            opacity: 0.6
        });
        const core = new THREE.Mesh(coreGeometry, coreMaterial);
        core.position.y = 2;
        ghostGroup.add(core);
        
        // Glowing aura around the ghost
        const auraGeometry = new THREE.SphereGeometry(2, 12, 8);
        const auraMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x8888ff,
            transparent: true,
            opacity: 0.1,
            side: THREE.BackSide
        });
        const aura = new THREE.Mesh(auraGeometry, auraMaterial);
        aura.position.y = 2;
        ghostGroup.add(aura);
        
        // Add floating animation data
        ghostGroup.userData.floatOffset = Math.random() * Math.PI * 2;
        ghostGroup.userData.pulseOffset = Math.random() * Math.PI * 2;
        
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
        this.ghosts.forEach((ghost, index) => {
            if (ghost.health <= 0) {
                this.removeGhost(index);
                return;
            }
            this.updateGhost(ghost, deltaTime, playerPosition);
        });
        
        // Update tomatoes
        this.updateTomatoes(deltaTime);
        
        // Check tomato-ghost collisions
        this.checkTomatoCollisions();
        
        // Check treasure chest interaction
        if (playerPosition) {
            this.checkTreasureInteraction(playerPosition);
        }
    }
    
    updateMagicMissiles(deltaTime) {
        this.magicMissiles.forEach((missile, index) => {
            // Move missile forward
            missile.mesh.position.addScaledVector(missile.direction, missile.speed * deltaTime * 60);
            
            // Remove missiles that have traveled too far
            if (missile.mesh.position.distanceTo(missile.startPosition) > missile.range) {
                this.removeMagicMissile(index);
            }
        });
    }
    
    checkMissileCollisions() {
        this.magicMissiles.forEach((missile, missileIndex) => {
            this.ghosts.forEach((ghost, ghostIndex) => {
                const distance = missile.mesh.position.distanceTo(ghost.mesh.position);
                if (distance < 1.0) {
                    // Hit!
                    this.createHitEffect(missile.mesh.position);
                    this.removeMagicMissile(missileIndex);
                    
                    // Damage ghost
                    ghost.health -= 1;
                    if (ghost.health <= 0) {
                        this.createGhostDeathEffect(ghost.mesh.position);
                        console.log('👻 Ghost destroyed!');
                    }
                }
            });
        });
    }
    
    fireMagicMissile(origin, direction) {
        const now = Date.now();
        if (now - this.lastMissileTime < this.missileCooldown) return false;
        
        // Create magic missile
        const missileGeometry = new THREE.SphereGeometry(0.2, 8, 6);
        const missileMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x00ffff,
            emissive: 0x0088ff,
            emissiveIntensity: 0.8
        });
        const missile = new THREE.Mesh(missileGeometry, missileMaterial);
        missile.position.copy(origin);
        
        // Add glowing trail effect
        const trailGeometry = new THREE.ConeGeometry(0.1, 0.8, 6);
        const trailMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x0066ff,
            transparent: true,
            opacity: 0.6
        });
        const trail = new THREE.Mesh(trailGeometry, trailMaterial);
        trail.position.set(0, 0, -0.4);
        trail.rotation.x = Math.PI / 2;
        missile.add(trail);
        
        this.scene.add(missile);
        
        this.magicMissiles.push({
            mesh: missile,
            direction: direction.clone().normalize(),
            speed: 25,
            range: 30,
            startPosition: origin.clone()
        });
        
        this.lastMissileTime = now;
        console.log('🔮 Magic missile fired!');
        return true;
    }
    
    createHitEffect(position) {
        // Create explosion effect
        const particles = [];
        for (let i = 0; i < 10; i++) {
            const particleGeometry = new THREE.SphereGeometry(0.05, 4, 3);
            const particleMaterial = new THREE.MeshBasicMaterial({ 
                color: 0xffff00,
                emissive: 0xffaa00,
                emissiveIntensity: 1
            });
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            particle.position.copy(position);
            
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10
            );
            
            this.scene.add(particle);
            particles.push({ mesh: particle, velocity: velocity, life: 1.0 });
        }
        
        // Animate particles
        const animateParticles = () => {
            particles.forEach((particle, index) => {
                particle.mesh.position.add(particle.velocity.clone().multiplyScalar(0.02));
                particle.velocity.multiplyScalar(0.95); // Friction
                particle.life -= 0.05;
                
                if (particle.life <= 0) {
                    this.scene.remove(particle.mesh);
                    particles.splice(index, 1);
                } else {
                    particle.mesh.material.opacity = particle.life;
                }
            });
            
            if (particles.length > 0) {
                requestAnimationFrame(animateParticles);
            }
        };
        animateParticles();
    }
    
    createGhostDeathEffect(position) {
        // Create ghost death effect - white particles floating up
        const particles = [];
        for (let i = 0; i < 15; i++) {
            const particleGeometry = new THREE.SphereGeometry(0.1, 6, 4);
            const particleMaterial = new THREE.MeshBasicMaterial({ 
                color: 0xffffff,
                transparent: true,
                opacity: 0.8
            });
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            particle.position.copy(position);
            particle.position.add(new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                Math.random() * 2,
                (Math.random() - 0.5) * 2
            ));
            
            this.scene.add(particle);
            particles.push({ mesh: particle, life: 2.0 });
        }
        
        // Animate death particles floating upward
        const animateDeathParticles = () => {
            particles.forEach((particle, index) => {
                particle.mesh.position.y += 0.05;
                particle.life -= 0.02;
                
                if (particle.life <= 0) {
                    this.scene.remove(particle.mesh);
                    particles.splice(index, 1);
                } else {
                    particle.mesh.material.opacity = particle.life * 0.4;
                }
            });
            
            if (particles.length > 0) {
                requestAnimationFrame(animateDeathParticles);
            }
        };
        animateDeathParticles();
    }
    
    removeMagicMissile(index) {
        if (this.magicMissiles[index]) {
            this.scene.remove(this.magicMissiles[index].mesh);
            this.magicMissiles[index].mesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.magicMissiles.splice(index, 1);
        }
    }
    
    removeGhost(index) {
        if (this.ghosts[index]) {
            this.scene.remove(this.ghosts[index].mesh);
            this.ghosts[index].mesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.ghosts.splice(index, 1);
        }
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
