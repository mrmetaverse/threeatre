import * as THREE from 'three';

export class RoguelikeWorld {
    constructor(scene, theatre) {
        this.scene = scene;
        this.theatre = theatre;
        this.isActive = false;
        this.worldObjects = [];
        this.ghosts = [];
        this.temples = [];
        this.tomatoes = [];
        this.lastTomatoTime = 0;
        this.tomatoCooldown = 300;
        this.treasureChest = null;
        this.treasurePosition = null;
        this.treasureChests = [];
        this.playerScore = 0;
        this.landmarks = [];
        this.outdoorObjects = [];
        this.collectibles = [];
        this.discoveredLandmarks = new Set();
        this.savedFog = null;
        this.savedBg = null;
        this.worldLights = [];
        this.hiddenTheatreObjects = [];
        this.exitPosition = new THREE.Vector3(0, 1.6, 70);
        this.enterTimestamp = 0;
        this.returnCooldownMs = 2500;

        this.walls = [];
        this.floors = [];
        this.maze = [[0]];
    }

    buildWorld() {
        if (this.isActive) return;
        this.clearWorld();

        this.savedBg = this.scene.background?.clone();
        this.savedFog = this.scene.fog;

        this.scene.background = new THREE.Color(0x1a2740);
        this.scene.fog = new THREE.FogExp2(0x223557, 0.0015);

        this.buildGround();
        this.buildAtmosphere();
        this.buildReturnPortal();
        this.buildTemples();
        this.scatterSpookyDecor();
        this.spawnGhosts();
        this.setupWorldLighting();

        this.isActive = true;
        console.log('[RoguelikeWorld] Active:', {
            worldObjects: this.worldObjects.length,
            temples: this.temples.length,
            ghosts: this.ghosts.length
        });
    }

    buildGround() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#2a2f3a';
        ctx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 8000; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const shade = Math.floor(42 + Math.random() * 20);
            ctx.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 8})`;
            ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(40, 40);

        const geo = new THREE.PlaneGeometry(600, 600);
        const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
        const ground = new THREE.Mesh(geo, mat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, -0.05, 180);
        ground.receiveShadow = true;
        this.scene.add(ground);
        this.worldObjects.push(ground);
    }

    buildAtmosphere() {
        const particleCount = 300;
        const positions = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 400;
            positions[i * 3 + 1] = 0.5 + Math.random() * 4;
            positions[i * 3 + 2] = 70 + Math.random() * 250;
        }
        const fogGeo = new THREE.BufferGeometry();
        fogGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const fogMat = new THREE.PointsMaterial({
            color: 0x9aa9c0,
            size: 1.3,
            transparent: true,
            opacity: 0.06,
            depthWrite: false
        });
        const fogParticles = new THREE.Points(fogGeo, fogMat);
        fogParticles.userData.isAtmosphere = true;
        this.scene.add(fogParticles);
        this.worldObjects.push(fogParticles);
    }

    buildReturnPortal() {
        const portalGeo = new THREE.TorusGeometry(3, 0.4, 16, 32);
        const portalMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.6 });
        const portal = new THREE.Mesh(portalGeo, portalMat);
        portal.position.set(0, 3, 70);
        portal.rotation.y = Math.PI;
        this.scene.add(portal);
        this.worldObjects.push(portal);

        const portalLight = new THREE.PointLight(0x00ffcc, 2, 20);
        portalLight.position.set(0, 3, 70);
        this.scene.add(portalLight);
        this.worldLights.push(portalLight);

        const signGeo = new THREE.PlaneGeometry(5, 1.5);
        const signMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
        const sign = new THREE.Mesh(signGeo, signMat);
        sign.position.set(0, 7, 70);
        this.scene.add(sign);
        this.worldObjects.push(sign);
    }

    buildTemples() {
        const templeConfigs = [
            { pos: new THREE.Vector3(0, 0, 102), color: 0xff6600, name: 'Ember Shrine', beaconColor: 0xff4400, dist: 'near' },
            { pos: new THREE.Vector3(-45, 0, 150), color: 0x44aaff, name: 'Frost Sanctum', beaconColor: 0x2288ff, dist: 'mid' },
            { pos: new THREE.Vector3(55, 0, 170), color: 0xaa44ff, name: 'Void Temple', beaconColor: 0x8822ff, dist: 'far' },
            { pos: new THREE.Vector3(-20, 0, 220), color: 0xffdd00, name: 'Golden Ziggurat', beaconColor: 0xffaa00, dist: 'far' },
        ];

        templeConfigs.forEach(cfg => {
            this.buildTemple(cfg);
        });
    }

    buildTemple(cfg) {
        const { pos, color, name, beaconColor, dist } = cfg;
        const group = new THREE.Group();
        group.position.copy(pos);

        const islandGeo = new THREE.CylinderGeometry(12, 16, 2, 24);
        const islandMat = new THREE.MeshLambertMaterial({ color: 0x2a2a20 });
        const island = new THREE.Mesh(islandGeo, islandMat);
        island.position.y = -1;
        island.castShadow = true;
        island.receiveShadow = true;
        group.add(island);

        const stepsCount = 4;
        for (let i = 0; i < stepsCount; i++) {
            const r = 8 - i * 1.5;
            const h = 0.6;
            const stepGeo = new THREE.CylinderGeometry(r, r + 0.3, h, 16);
            const stepMat = new THREE.MeshLambertMaterial({ color: 0x444438 });
            const step = new THREE.Mesh(stepGeo, stepMat);
            step.position.y = i * h;
            step.castShadow = true;
            group.add(step);
        }

        const pillarCount = dist === 'far' ? 8 : 6;
        const pillarRadius = dist === 'far' ? 6 : 5;
        const pillarHeight = dist === 'far' ? 10 : 7;
        for (let i = 0; i < pillarCount; i++) {
            const angle = (i / pillarCount) * Math.PI * 2;
            const pGeo = new THREE.CylinderGeometry(0.4, 0.5, pillarHeight, 8);
            const pMat = new THREE.MeshLambertMaterial({ color: 0x555550 });
            const pillar = new THREE.Mesh(pGeo, pMat);
            pillar.position.set(Math.cos(angle) * pillarRadius, pillarHeight / 2 + stepsCount * 0.6 - 0.6, Math.sin(angle) * pillarRadius);
            pillar.castShadow = true;
            group.add(pillar);
        }

        const altarGeo = new THREE.BoxGeometry(2.5, 1.5, 2.5);
        const altarMat = new THREE.MeshLambertMaterial({ color: 0x3a3a32 });
        const altar = new THREE.Mesh(altarGeo, altarMat);
        altar.position.y = stepsCount * 0.6 + 0.75;
        altar.castShadow = true;
        group.add(altar);

        const orbGeo = new THREE.SphereGeometry(0.6, 16, 12);
        const orbMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.y = stepsCount * 0.6 + 2.2;
        group.add(orb);

        const beaconLight = new THREE.PointLight(beaconColor, 3, 80);
        beaconLight.position.y = stepsCount * 0.6 + 4;
        group.add(beaconLight);
        this.worldLights.push(beaconLight);

        const pillarLight = new THREE.PointLight(color, 1.5, 25);
        pillarLight.position.y = 2;
        group.add(pillarLight);
        this.worldLights.push(pillarLight);

        const beamGeo = new THREE.CylinderGeometry(0.1, 0.8, 30, 8, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({ color: beaconColor, transparent: true, opacity: 0.08, side: THREE.DoubleSide });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.y = stepsCount * 0.6 + 17;
        group.add(beam);

        this.scene.add(group);
        this.worldObjects.push(group);

        const chestPos = pos.clone();
        chestPos.y = stepsCount * 0.6 + 1.5;
        const chest = this.createTreasureChest(chestPos);
        this.scene.add(chest);
        this.treasureChests.push({ mesh: chest, position: chestPos, opened: false });

        this.temples.push({ group, orb, beaconLight, beam, name, position: pos, color, beaconColor });
        this.landmarks.push({ name, position: pos, radius: 14, discovered: false, orb, light: beaconLight });
    }

    scatterSpookyDecor() {
        for (let i = 0; i < 60; i++) {
            const x = (Math.random() - 0.5) * 350;
            const z = 80 + Math.random() * 230;
            const height = 1 + Math.random() * 3;

            if (Math.random() < 0.5) {
                const rockGeo = new THREE.DodecahedronGeometry(0.5 + Math.random() * 1.5, 0);
                const rockMat = new THREE.MeshLambertMaterial({ color: 0x333330 });
                const rock = new THREE.Mesh(rockGeo, rockMat);
                rock.position.set(x, (0.5 + Math.random() * 1.5) * 0.4, z);
                rock.rotation.set(Math.random(), Math.random(), Math.random());
                rock.castShadow = true;
                this.scene.add(rock);
                this.worldObjects.push(rock);
            } else {
                const trunkGeo = new THREE.CylinderGeometry(0.1, 0.15, height, 6);
                const trunkMat = new THREE.MeshLambertMaterial({ color: 0x2a1f15 });
                const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                trunk.position.set(x, height / 2, z);
                trunk.rotation.z = (Math.random() - 0.5) * 0.2;
                trunk.castShadow = true;
                this.scene.add(trunk);
                this.worldObjects.push(trunk);

                for (let b = 0; b < 2 + Math.floor(Math.random() * 3); b++) {
                    const bLen = 0.5 + Math.random() * 1;
                    const bGeo = new THREE.CylinderGeometry(0.03, 0.06, bLen, 4);
                    const branch = new THREE.Mesh(bGeo, trunkMat);
                    branch.position.set(x, height * 0.4 + Math.random() * height * 0.5, z);
                    branch.rotation.z = (Math.random() - 0.5) * 1.5;
                    branch.rotation.y = Math.random() * Math.PI * 2;
                    this.scene.add(branch);
                    this.worldObjects.push(branch);
                }
            }
        }

        for (let i = 0; i < 8; i++) {
            const x = (Math.random() - 0.5) * 300;
            const z = 90 + Math.random() * 200;
            const skullGeo = new THREE.SphereGeometry(0.25, 8, 6);
            const skullMat = new THREE.MeshLambertMaterial({ color: 0xccccaa });
            const skull = new THREE.Mesh(skullGeo, skullMat);
            skull.position.set(x, 0.25, z);
            skull.castShadow = true;
            this.scene.add(skull);
            this.worldObjects.push(skull);
        }
    }

    setupWorldLighting() {
        const moonLight = new THREE.DirectionalLight(0x9ec2ff, 1.35);
        moonLight.position.set(50, 80, 200);
        moonLight.castShadow = true;
        moonLight.shadow.mapSize.width = 2048;
        moonLight.shadow.mapSize.height = 2048;
        moonLight.shadow.camera.near = 1;
        moonLight.shadow.camera.far = 300;
        moonLight.shadow.camera.left = -150;
        moonLight.shadow.camera.right = 150;
        moonLight.shadow.camera.top = 150;
        moonLight.shadow.camera.bottom = -150;
        this.scene.add(moonLight);
        this.worldLights.push(moonLight);

        const ambient = new THREE.AmbientLight(0x405b8f, 1.2);
        this.scene.add(ambient);
        this.worldLights.push(ambient);

        const hemiLight = new THREE.HemisphereLight(0xa5b9e8, 0x344928, 1.0);
        this.scene.add(hemiLight);
        this.worldLights.push(hemiLight);

        // Strong guide light so the outdoor objective is always visible.
        const guideLight = new THREE.PointLight(0xffaa44, 7, 280);
        guideLight.position.set(0, 14, 102);
        this.scene.add(guideLight);
        this.worldLights.push(guideLight);

        const guideBeam = new THREE.Mesh(
            new THREE.CylinderGeometry(0.6, 2.5, 60, 12, 1, true),
            new THREE.MeshBasicMaterial({
                color: 0xffaa44,
                transparent: true,
                opacity: 0.12,
                side: THREE.DoubleSide
            })
        );
        guideBeam.position.set(0, 30, 102);
        this.scene.add(guideBeam);
        this.worldObjects.push(guideBeam);

        const spawnFill = new THREE.PointLight(0x88aaff, 3.5, 140);
        spawnFill.position.set(0, 8, 90);
        this.scene.add(spawnFill);
        this.worldLights.push(spawnFill);

        const moonGeo = new THREE.SphereGeometry(8, 32, 32);
        const moonMat = new THREE.MeshBasicMaterial({ color: 0xddeeff });
        const moon = new THREE.Mesh(moonGeo, moonMat);
        moon.position.set(50, 80, 200);
        this.scene.add(moon);
        this.worldObjects.push(moon);

        const moonGlowGeo = new THREE.SphereGeometry(12, 32, 32);
        const moonGlowMat = new THREE.MeshBasicMaterial({ color: 0x556688, transparent: true, opacity: 0.15, side: THREE.BackSide });
        const moonGlow = new THREE.Mesh(moonGlowGeo, moonGlowMat);
        moonGlow.position.copy(moon.position);
        this.scene.add(moonGlow);
        this.worldObjects.push(moonGlow);
    }

    spawnGhosts() {
        for (let i = 0; i < 12; i++) {
            const ghost = this.createGhost();
            const nearSpawn = i < 5;
            const x = nearSpawn ? (Math.random() - 0.5) * 60 : (Math.random() - 0.5) * 250;
            const z = nearSpawn ? 100 + Math.random() * 50 : 120 + Math.random() * 200;
            ghost.position.set(x, 2, z);
            this.scene.add(ghost);
            this.ghosts.push({
                mesh: ghost,
                position: ghost.position.clone(),
                target: null,
                speed: 0.015 + Math.random() * 0.02,
                lastPlayerDistance: Infinity,
                aggroRange: 45 + Math.random() * 30,
                killRange: 1.8,
                health: 2 + Math.floor(Math.random() * 3)
            });
        }
    }

    createGhost() {
        const ghostGroup = new THREE.Group();
        const ghostType = Math.random();
        let color, emissiveColor;

        if (ghostType < 0.3) {
            color = 0xccddff; emissiveColor = 0x8899cc;
        } else if (ghostType < 0.6) {
            color = 0xffaaaa; emissiveColor = 0xff4444;
        } else {
            color = 0xccaaff; emissiveColor = 0x7733cc;
        }

        const bodyGeo = new THREE.SphereGeometry(0.8, 12, 10);
        const bodyMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 1.8;
        body.scale.set(1, 1.3, 1);
        ghostGroup.add(body);

        const coreGeo = new THREE.SphereGeometry(0.35, 10, 8);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.y = 1.8;
        ghostGroup.add(core);

        const eyeMat = new THREE.MeshBasicMaterial({ color: emissiveColor });
        const eyeGeo = new THREE.SphereGeometry(0.12, 8, 6);
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.2, 2.0, 0.6);
        ghostGroup.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.2, 2.0, 0.6);
        ghostGroup.add(rightEye);

        const auraGeo = new THREE.SphereGeometry(2.5, 12, 8);
        const auraMat = new THREE.MeshBasicMaterial({ color: emissiveColor, transparent: true, opacity: 0.06, side: THREE.BackSide });
        const aura = new THREE.Mesh(auraGeo, auraMat);
        aura.position.y = 1.8;
        ghostGroup.add(aura);

        const ghostLight = new THREE.PointLight(emissiveColor, 0.8, 12);
        ghostLight.position.y = 2;
        ghostGroup.add(ghostLight);

        const tailCount = 5;
        for (let i = 0; i < tailCount; i++) {
            const tailGeo = new THREE.SphereGeometry(0.2 - i * 0.03, 6, 4);
            const tailMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 - i * 0.05 });
            const tail = new THREE.Mesh(tailGeo, tailMat);
            tail.position.set(0, 1.2 - i * 0.25, -0.3 - i * 0.15);
            ghostGroup.add(tail);
        }

        ghostGroup.userData.floatOffset = Math.random() * Math.PI * 2;
        ghostGroup.userData.pulseOffset = Math.random() * Math.PI * 2;
        ghostGroup.userData.ghostType = ghostType;
        ghostGroup.userData.emissiveColor = emissiveColor;

        return ghostGroup;
    }

    update(deltaTime, playerPosition) {
        if (!this.isActive) return;

        const time = Date.now() * 0.001;

        this.ghosts.forEach((ghost, index) => {
            if (ghost.health <= 0) { this.removeGhost(index); return; }
            this.updateGhost(ghost, deltaTime, playerPosition);
        });

        this.updateTomatoes(deltaTime);
        this.checkTomatoCollisions();

        if (playerPosition) {
            this.checkMultipleTreasures(playerPosition);
            this.checkLandmarkDiscovery(playerPosition);
        }

        this.treasureChests.forEach(tc => {
            if (!tc.opened && tc.mesh.userData.glowAnimation) tc.mesh.userData.glowAnimation();
        });

        this.temples.forEach(t => {
            t.orb.position.y = (t.group.children[0] ? 0 : 0) + 2.4 + 2.2 + Math.sin(time + t.position.x) * 0.5;
            t.orb.rotation.y += 0.01;
            t.beaconLight.intensity = 2.5 + Math.sin(time * 1.5 + t.position.z) * 1;
            t.beam.material.opacity = 0.05 + Math.sin(time * 0.5 + t.position.x) * 0.03;
        });

        this.worldObjects.forEach(obj => {
            if (obj.userData?.isAtmosphere) {
                const positions = obj.geometry.attributes.position.array;
                for (let i = 0; i < positions.length; i += 3) {
                    positions[i] += Math.sin(time + i) * 0.02;
                    positions[i + 1] += Math.sin(time * 0.5 + i * 0.3) * 0.005;
                }
                obj.geometry.attributes.position.needsUpdate = true;
            }
        });
    }

    updateGhost(ghost, deltaTime, playerPosition) {
        const time = Date.now() * 0.001;
        ghost.mesh.position.y = ghost.position.y + Math.sin(time * 2 + ghost.mesh.userData.floatOffset) * 0.4;

        const pulse = 0.5 + Math.sin(time * 3 + ghost.mesh.userData.pulseOffset) * 0.3;
        ghost.mesh.children.forEach(child => {
            if (child.isPointLight) child.intensity = 0.5 + pulse * 0.5;
        });

        if (!playerPosition) return;
        const dist = ghost.position.distanceTo(playerPosition);

        if (dist < ghost.killRange) { this.killPlayer(); return; }

        if (dist < ghost.aggroRange) {
            const dir = new THREE.Vector3().subVectors(playerPosition, ghost.position).normalize();
            const chaseSpeed = ghost.speed * (1 + (1 - dist / ghost.aggroRange) * 0.5);
            ghost.position.addScaledVector(dir, chaseSpeed);
            ghost.mesh.position.x = ghost.position.x;
            ghost.mesh.position.z = ghost.position.z;
            ghost.mesh.lookAt(playerPosition.x, ghost.mesh.position.y, playerPosition.z);
            ghost.speed = Math.min(ghost.speed + 0.0005, 0.08);
        } else {
            if (Math.random() < 0.02) {
                const wander = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                ghost.position.addScaledVector(wander, ghost.speed * 0.3);
                ghost.mesh.position.x = ghost.position.x;
                ghost.mesh.position.z = ghost.position.z;
            }
            ghost.speed = Math.max(ghost.speed - 0.0005, 0.015);
        }

        ghost.position.x = Math.max(-180, Math.min(180, ghost.position.x));
        ghost.position.z = Math.max(80, Math.min(320, ghost.position.z));
        ghost.mesh.position.x = ghost.position.x;
        ghost.mesh.position.z = ghost.position.z;
    }

    checkMultipleTreasures(playerPosition) {
        this.treasureChests.forEach(tc => {
            if (tc.opened) return;
            const dist = playerPosition.distanceTo(tc.position);
            if (dist < 5 && !document.getElementById('treasure-prompt')) this.showTreasurePrompt();
            else if (dist >= 5) this.hideTreasurePrompt();
            tc.mesh.userData.canInteract = dist < 3;
        });
    }

    checkLandmarkDiscovery(playerPosition) {
        this.landmarks.forEach(lm => {
            if (lm.discovered) return;
            if (playerPosition.distanceTo(lm.position) < lm.radius) {
                lm.discovered = true;
                this.discoveredLandmarks.add(lm.name);
                this.showLandmarkDiscovery(lm.name);
                this.playerScore += 5;
                this.updateScoreDisplay();
            }
        });
    }

    showLandmarkDiscovery(name) {
        const div = document.createElement('div');
        div.style.cssText = `position:fixed;top:30%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.9);border:2px solid #FFD700;border-radius:16px;padding:24px 40px;color:#FFD700;font-size:22px;font-weight:bold;z-index:1000;text-align:center;backdrop-filter:blur(10px);box-shadow:0 0 40px rgba(255,215,0,0.3);`;
        div.innerHTML = `<div style="font-size:36px;margin-bottom:8px;">&#x1F3DB;</div><div>TEMPLE DISCOVERED</div><div style="font-size:28px;margin-top:8px;">${name}</div><div style="font-size:14px;color:#ccc;margin-top:8px;">+5 score</div><div style="font-size:12px;color:#888;margin-top:4px;">${this.discoveredLandmarks.size}/${this.temples.length} discovered</div>`;
        document.body.appendChild(div);
        setTimeout(() => { if (document.body.contains(div)) document.body.removeChild(div); }, 3500);
    }

    createTreasureChest(position) {
        const g = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1.5), new THREE.MeshLambertMaterial({ color: 0x8B4513 }));
        base.position.y = 0.5; base.castShadow = true; g.add(base);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.3, 1.6), new THREE.MeshLambertMaterial({ color: 0x654321 }));
        lid.position.y = 1.15; lid.castShadow = true; g.add(lid);
        for (let i = 0; i < 3; i++) {
            const band = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xFFD700 }));
            band.position.set(0, 0.3 + i * 0.3, 0.8); g.add(band);
        }
        const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8), new THREE.MeshBasicMaterial({ color: 0xFFD700 }));
        lock.position.set(0, 0.8, 0.8); lock.rotation.x = Math.PI / 2; g.add(lock);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), new THREE.MeshBasicMaterial({ color: 0xFFD700, transparent: true, opacity: 0.08, side: THREE.BackSide }));
        glow.position.y = 1; g.add(glow);
        const chestLight = new THREE.PointLight(0xFFD700, 1, 15);
        chestLight.position.y = 2; g.add(chestLight);

        g.position.copy(position);
        g.name = 'treasure-chest';
        g.userData.glowAnimation = () => {
            const t = Date.now() * 0.003;
            glow.material.opacity = 0.05 + Math.sin(t) * 0.04;
            chestLight.intensity = 0.8 + Math.sin(t * 1.5) * 0.4;
        };
        return g;
    }

    openTreasureChest() {
        const tc = this.treasureChests.find(t => !t.opened && t.mesh.userData.canInteract);
        if (!tc) return false;
        tc.opened = true;
        this.playerScore += 1;
        this.updateScoreDisplay();
        const loot = this.generateTreasureLoot();
        if (this.theatre.app?.bindle) this.theatre.app.bindle.addLoot(loot);
        this.createTreasureEffect(tc.position);
        this.scene.remove(tc.mesh);
        this.hideTreasurePrompt();
        this.showTreasureVictory(loot);
        return true;
    }

    showTreasurePrompt() {
        if (document.getElementById('treasure-prompt')) return;
        const d = document.createElement('div');
        d.id = 'treasure-prompt';
        d.style.cssText = `position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);border:2px solid #FFD700;border-radius:12px;padding:14px 24px;color:#FFD700;font-size:16px;font-weight:bold;z-index:1000;text-align:center;backdrop-filter:blur(10px);`;
        d.textContent = 'Click to open the treasure chest!';
        document.body.appendChild(d);
    }
    hideTreasurePrompt() { const p = document.getElementById('treasure-prompt'); if (p) p.remove(); }

    createTreasureEffect(pos) {
        if (!pos) return;
        const particles = [];
        for (let i = 0; i < 20; i++) {
            const p = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xFFD700, transparent: true, opacity: 1 }));
            p.position.copy(pos); p.position.y += 1;
            this.scene.add(p);
            particles.push({ mesh: p, velocity: new THREE.Vector3((Math.random() - 0.5) * 12, Math.random() * 8 + 4, (Math.random() - 0.5) * 12), life: 2 });
        }
        const animate = () => {
            particles.forEach((p, i) => {
                p.mesh.position.add(p.velocity.clone().multiplyScalar(0.016));
                p.velocity.y -= 0.2; p.life -= 0.025; p.mesh.material.opacity = p.life / 2;
                if (p.life <= 0) { this.scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); particles.splice(i, 1); }
            });
            if (particles.length > 0) requestAnimationFrame(animate);
        };
        animate();
    }

    showTreasureVictory(loot) {
        const rarityColors = { common: '#ffffff', uncommon: '#1eff00', rare: '#0070dd', epic: '#a335ee', legendary: '#ff8000', mythic: '#e6cc80' };
        const rc = rarityColors[loot?.rarity] || '#FFD700';
        const d = document.createElement('div');
        d.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.95);border:3px solid ${rc};border-radius:20px;padding:30px;color:${rc};font-size:24px;font-weight:bold;z-index:1000;text-align:center;backdrop-filter:blur(15px);box-shadow:0 0 50px ${rc}80;`;
        d.innerHTML = `<div style="font-size:48px;margin-bottom:15px;">${loot?.type === 'wearable' ? '&#x1F3AD;' : '&#x1F3C6;'}</div><div style="font-size:28px;margin-bottom:10px;">TREASURE FOUND!</div><div style="font-size:32px;margin:15px 0;">${loot?.icon || '&#x1F48E;'} ${loot?.name || 'Mystery Item'}</div><div style="font-size:14px;color:#ccc;text-transform:uppercase;">${loot?.rarity || 'Common'} ${loot?.type === 'wearable' ? 'Wearable' : 'Item'}</div><div style="font-size:12px;color:#aaa;margin:10px 0;font-style:italic;">${loot?.description || ''}</div><div style="font-size:16px;margin-top:15px;color:#FFD700;">Score: ${this.playerScore}</div>`;
        document.body.appendChild(d);
        setTimeout(() => { if (document.body.contains(d)) d.remove(); }, 5000);
    }

    updateScoreDisplay() {
        const el = document.getElementById('treasure-score');
        if (el) { el.textContent = this.playerScore; el.style.textShadow = '0 0 10px #FFD700'; setTimeout(() => { el.style.textShadow = 'none'; }, 1000); }
    }

    updateTomatoes(deltaTime) {
        this.tomatoes.forEach((t, i) => {
            t.velocity.y -= 15 * deltaTime;
            t.mesh.position.add(t.velocity.clone().multiplyScalar(deltaTime));
            t.mesh.rotation.x += 0.2; t.mesh.rotation.z += 0.15;
            if (t.mesh.position.y < 0 || t.mesh.position.distanceTo(t.startPosition) > t.range) this.removeTomato(i);
        });
    }

    checkTomatoCollisions() {
        this.tomatoes.forEach((t, ti) => {
            this.ghosts.forEach((g) => {
                if (t.mesh.position.distanceTo(g.mesh.position) < 2) {
                    this.createTomatoHitEffect(t.mesh.position);
                    this.removeTomato(ti);
                    g.health -= 1;
                    if (g.health <= 0) this.createGhostDeathEffect(g.mesh.position);
                }
            });
        });
    }

    fireTomato(origin, direction, powerMultiplier = 1) {
        const now = Date.now();
        if (now - this.lastTomatoTime < this.tomatoCooldown) return false;
        const tomato = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshLambertMaterial({ color: 0xff4444, emissive: 0x441111, emissiveIntensity: 0.2 }));
        tomato.position.copy(origin);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.1, 6), new THREE.MeshLambertMaterial({ color: 0x228B22 }));
        stem.position.set(0, 0.12, 0); tomato.add(stem);
        this.scene.add(tomato);
        this.tomatoes.push({ mesh: tomato, direction: direction.clone().normalize(), speed: 20 * powerMultiplier, range: 30 * powerMultiplier, startPosition: origin.clone(), velocity: direction.clone().multiplyScalar(20 * powerMultiplier) });
        this.lastTomatoTime = now;
        return true;
    }

    removeTomato(i) {
        if (!this.tomatoes[i]) return;
        this.scene.remove(this.tomatoes[i].mesh);
        this.tomatoes[i].mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
        this.tomatoes.splice(i, 1);
    }

    createTomatoHitEffect(pos) {
        for (let i = 0; i < 6; i++) {
            const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 3), new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 1 }));
            p.position.copy(pos); this.scene.add(p);
            const v = new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
            let life = 1;
            const anim = () => { p.position.add(v.clone().multiplyScalar(0.02)); v.multiplyScalar(0.95); life -= 0.05; p.material.opacity = life; if (life <= 0) { this.scene.remove(p); p.geometry.dispose(); p.material.dispose(); } else requestAnimationFrame(anim); };
            anim();
        }
    }

    createGhostDeathEffect(pos) {
        for (let i = 0; i < 12; i++) {
            const p = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
            p.position.copy(pos); p.position.add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2));
            this.scene.add(p);
            let life = 2;
            const anim = () => { p.position.y += 0.04; life -= 0.02; p.material.opacity = life * 0.4; if (life <= 0) { this.scene.remove(p); p.geometry.dispose(); p.material.dispose(); } else requestAnimationFrame(anim); };
            anim();
        }
    }

    removeGhost(i) {
        if (!this.ghosts[i]) return;
        this.scene.remove(this.ghosts[i].mesh);
        this.ghosts[i].mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
        this.ghosts.splice(i, 1);
    }

    killPlayer() {
        this.scene.background = new THREE.Color(0x660000);
        setTimeout(() => { if (this.scene.background) this.scene.background = new THREE.Color(0x000011); }, 300);
        this.respawnInTheatre();
        this.showDeathMessage();
    }

    respawnInTheatre() {
        this.hideWorld();
        if (this.theatre.camera) { this.theatre.camera.position.set(0, 2, 18); }
        if (this.theatre.networkManager) this.theatre.networkManager.updatePosition(new THREE.Vector3(0, 2, 18));
    }

    showDeathMessage() {
        const d = document.createElement('div');
        d.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.95);color:#ff0000;padding:30px 40px;border-radius:16px;font-size:28px;font-weight:bold;z-index:1000;text-align:center;border:2px solid #ff0000;box-shadow:0 0 40px rgba(255,0,0,0.4);`;
        d.innerHTML = `<div style="font-size:48px;margin-bottom:10px;">&#x1F480;</div>THE GHOSTS GOT YOU!<br><span style="font-size:16px;color:#ccc;">Returned to the safety of the theatre</span>`;
        document.body.appendChild(d);
        setTimeout(() => { if (document.body.contains(d)) d.remove(); }, 3000);
    }

    enterWorld(playerPosition) {
        this.hideTheatre();
        this.buildWorld();
        this.enterTimestamp = Date.now();
        if (this.theatre.camera) this.theatre.camera.position.set(0, 1.6, 88);
        if (this.theatre.networkManager && this.theatre.camera) {
            this.theatre.networkManager.updatePosition(this.theatre.camera.position);
        }
        this.showWorldWarning();
    }

    showWorldWarning() {
        const d = document.createElement('div');
        d.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#ffaa00;padding:16px 28px;border-radius:12px;font-size:16px;z-index:1000;text-align:center;border:2px solid #ffaa00;backdrop-filter:blur(10px);`;
        d.innerHTML = `<div style="font-size:20px;margin-bottom:6px;">BEWARE THE DARKNESS</div><span style="font-size:13px;color:#ccc;">Temples glow in the distance... reach them for treasure, but ghosts guard the way.<br>Throw tomatoes (T) to fight back. Sprint (Shift) to run.</span>`;
        document.body.appendChild(d);
        setTimeout(() => { if (document.body.contains(d)) d.remove(); }, 6000);
    }

    hideTheatre() {
        // Hide all current theatre renderables/lights except avatar objects.
        this.hiddenTheatreObjects = [];
        this.scene.traverse((obj) => {
            const isAvatarObject = !!obj.userData?.userId || (typeof obj.name === 'string' && obj.name.startsWith('avatar_'));
            const canHide = obj.visible !== undefined && (obj.isMesh || obj.isPoints || obj.isLine || obj.isLight);
            if (canHide && !isAvatarObject) {
                this.hiddenTheatreObjects.push(obj);
                obj.visible = false;
            }
        });
    }

    showTheatre() {
        this.hiddenTheatreObjects.forEach((obj) => {
            obj.visible = true;
        });
        this.hiddenTheatreObjects = [];
    }

    hideWorld() {
        this.worldObjects.forEach(o => { if (o.visible !== undefined) o.visible = false; this.scene.remove(o); });
        this.ghosts.forEach(g => { g.mesh.visible = false; this.scene.remove(g.mesh); });
        this.treasureChests.forEach(tc => { tc.mesh.visible = false; this.scene.remove(tc.mesh); });
        this.worldLights.forEach(l => this.scene.remove(l));

        if (this.savedBg) this.scene.background = this.savedBg;
        else this.scene.background = new THREE.Color(0x000011);
        this.scene.fog = this.savedFog || null;

        this.showTheatre();
        this.isActive = false;
    }

    clearWorld() {
        const dispose = (obj) => {
            this.scene.remove(obj);
            if (obj.traverse) obj.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
        };
        this.worldObjects.forEach(dispose);
        this.ghosts.forEach(g => dispose(g.mesh));
        this.tomatoes.forEach(t => dispose(t.mesh));
        this.treasureChests.forEach(tc => dispose(tc.mesh));
        this.worldLights.forEach(l => this.scene.remove(l));

        this.worldObjects = []; this.ghosts = []; this.tomatoes = [];
        this.treasureChests = []; this.temples = []; this.landmarks = [];
        this.worldLights = []; this.discoveredLandmarks.clear();
        this.walls = []; this.floors = []; this.outdoorObjects = []; this.collectibles = [];
        this.hideTreasurePrompt();
    }

    checkExitCollision(playerPosition) {
        if (!this.theatre.exitPortal) return false;
        const portalPos = this.theatre.exitPortal.position;
        const dx = playerPosition.x - portalPos.x;
        const dz = playerPosition.z - portalPos.z;
        const xzDist = Math.sqrt(dx * dx + dz * dz);
        return xzDist < 6 && playerPosition.z > 55;
    }

    checkReturnCollision(playerPosition) {
        if (!this.isActive) return false;
        if (Date.now() - this.enterTimestamp < this.returnCooldownMs) return false;
        const dx = playerPosition.x - this.exitPosition.x;
        const dz = playerPosition.z - this.exitPosition.z;
        return Math.sqrt(dx * dx + dz * dz) < 3.5;
    }

    getRandomFloorPosition() { return new THREE.Vector3((Math.random() - 0.5) * 200, 0, 90 + Math.random() * 200); }
    getRandomTreasurePosition() { return this.getRandomFloorPosition(); }

    generateTreasureLoot() {
        const lootTable = [
            { type: 'consumable', name: 'Golden Tomato', icon: '&#x1F947;', description: 'A magical golden tomato with extra power', stackable: true, quantity: 3, rarity: 'uncommon' },
            { type: 'consumable', name: 'Courage Potion', icon: '&#x1F9EA;', description: 'Temporarily increases all stats', stackable: true, quantity: 1, rarity: 'rare' },
            { type: 'wearable', name: 'Ghost Ward Ring', icon: '&#x1F48D;', description: 'Protects against ghost attacks', slot: 'finger', stats: { protection: 1 }, rarity: 'rare', model: 'ring_ghost_ward.glb' },
            { type: 'wearable', name: 'Ancient Amulet', icon: '&#x1F52E;', description: 'Mysterious powers from the temple', slot: 'neck', stats: { power: 2, luck: 1 }, rarity: 'legendary', model: 'amulet_ancient.glb' },
            { type: 'wearable', name: 'Shadow Pendant', icon: '&#x1F319;', description: 'Grants stealth in darkness', slot: 'neck', stats: { stealth: 3 }, rarity: 'epic', model: 'pendant_shadow.glb' },
            { type: 'wearable', name: 'Crystal Earrings', icon: '&#x1F48E;', description: 'Enhances magical abilities', slot: 'ear', stats: { magic: 2 }, rarity: 'rare', model: 'earrings_crystal.glb' },
            { type: 'wearable', name: 'Treasure Hunter Hat', icon: '&#x1F3A9;', description: 'Increases treasure finding luck', slot: 'head', stats: { luck: 3 }, rarity: 'rare', model: 'hat_treasure_hunter.glb' },
            { type: 'wearable', name: 'Spectral Crown', icon: '&#x1F451;', description: 'Crown of the ghost realm', slot: 'head', stats: { power: 3, protection: 2 }, rarity: 'legendary', model: 'crown_spectral.glb' },
            { type: 'wearable', name: 'Phantom Mask', icon: '&#x1F3AD;', description: 'Conceals your identity from spirits', slot: 'face', stats: { stealth: 4 }, rarity: 'epic', model: 'mask_phantom.glb' },
            { type: 'wearable', name: 'Phantom Cloak', icon: '&#x1F9E5;', description: 'Reduces ghost detection range', slot: 'back', stats: { stealth: 3, protection: 1 }, rarity: 'epic', model: 'cloak_phantom.glb' },
            { type: 'wearable', name: 'Spectral Boots', icon: '&#x1F47B;', description: 'Walk silently through the night', slot: 'feet', stats: { stealth: 2, speed: 1 }, rarity: 'epic', model: 'boots_spectral.glb' },
            { type: 'wearable', name: 'Wings of the Void', icon: '&#x1F5A4;', description: 'Grants the power of flight', slot: 'back', stats: { flight: true, speed: 5 }, rarity: 'mythic', model: 'wings_void.glb' },
            { type: 'wearable', name: 'Halo of Spirits', icon: '&#x1F607;', description: 'Blessed by ancient souls', slot: 'head', stats: { protection: 5, magic: 3 }, rarity: 'mythic', model: 'halo_spirits.glb' },
            { type: 'wearable', name: 'Demon Horns', icon: '&#x1F608;', description: 'Channel dark powers', slot: 'head', stats: { power: 4, intimidation: 3 }, rarity: 'mythic', model: 'horns_demon.glb' }
        ];
        const weights = { common: 40, uncommon: 30, rare: 20, epic: 8, legendary: 1.8, mythic: 0.2 };
        const total = Object.values(weights).reduce((s, w) => s + w, 0);
        let r = Math.random() * total;
        for (const item of lootTable) { r -= weights[item.rarity] || 1; if (r <= 0) return { ...item, id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) }; }
        return { ...lootTable[0], id: 'item_' + Date.now() };
    }

    dispose() { this.clearWorld(); }
}
