import * as THREE from 'three';
import { setOMIPhysicsProfile } from './OMIPhysics.js';

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
        this.ghostGracePeriodMs = 7000;
        this.templeSafeRadius = 18;
        this.lastSafeZoneMessageAt = 0;
        this.templeCellSize = 250;
        this.templeGenerationRadius = 1;
        this.templeDespawnDistance = 980;
        this.templeCellMap = new Map();
        this.templeNameSeedsA = ['Ember', 'Frost', 'Void', 'Golden', 'Ashen', 'Storm', 'Moon', 'Dread', 'Ancient', 'Whispering'];
        this.templeNameSeedsB = ['Shrine', 'Sanctum', 'Temple', 'Citadel', 'Ziggurat', 'Bastion', 'Spire', 'Vault', 'Monastery', 'Cathedral'];
        this.theatreLandmarkPosition = new THREE.Vector3(0, 0, 70);
        this.groundTileSize = 320;
        this.groundTileRadius = 2;
        this.groundTiles = new Map();
        this.groundTexture = null;
        this._outsideCullFrustum = new THREE.Frustum();
        this._outsideCullProjScreen = new THREE.Matrix4();
        this._lastOutsideCullMs = 0;
        this._outsideCullIntervalMs = 150;
        this.spookyAudioEmitters = [];
        this._spookyAudioReady = false;

        this.walls = [];
        this.floors = [];
        this.maze = [[0]];
    }

    applyStaticOMICollider(object3D, collider = {}) {
        if (!object3D || object3D.userData?.noCollision) return;
        setOMIPhysicsProfile(object3D, {
            collider: {
                type: collider.type || 'box',
                size: collider.size || null,
                radius: collider.radius,
                height: collider.height,
                translation: collider.translation || [0, 0, 0],
                scale: collider.scale || [1, 1, 1],
                enabled: collider.enabled !== false,
                layers: ['world', 'player']
            },
            physics: {
                bodyType: 'static',
                friction: collider.friction ?? 0.85,
                restitution: collider.restitution ?? 0.04,
                mass: 0
            }
        });
    }

    buildWorld() {
        if (this.isActive) return;
        this.clearWorld();

        this.savedBg = this.scene.background?.clone();
        this.savedFog = this.scene.fog;

        this.scene.background = new THREE.Color(0x101a2e);
        this.scene.fog = new THREE.FogExp2(0x1b2742, 0.0018);

        this.buildGround();
        this.buildAtmosphere();
        this.buildNearSpawnLandmarks();
        this.buildReturnTheatreLandmark();
        this.buildTemplesNearPosition(this.theatre?.camera?.position || new THREE.Vector3(0, 1.6, 88), true);
        this.scatterSpookyDecor();
        this.spawnGhosts();
        this.setupWorldLighting();
        this.setupSpookySpatialAudio();

        this.isActive = true;
        console.log('[RoguelikeWorld] Active:', {
            worldObjects: this.worldObjects.length,
            temples: this.temples.length,
            ghosts: this.ghosts.length
        });
        this.showWorldDebugOverlay();
        this.showOutsideStateOverlay();
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
        this.groundTexture = new THREE.CanvasTexture(canvas);
        this.groundTexture.wrapS = THREE.RepeatWrapping;
        this.groundTexture.wrapT = THREE.RepeatWrapping;
        this.groundTexture.repeat.set(20, 20);

        const initialPos = this.theatre?.camera?.position || new THREE.Vector3(0, 1.6, 88);
        this.buildGroundTilesNearPosition(initialPos);
    }

    getGroundTileKey(tileX, tileZ) {
        return `${tileX}:${tileZ}`;
    }

    createGroundTile(tileX, tileZ) {
        const geo = new THREE.PlaneGeometry(this.groundTileSize, this.groundTileSize);
        const mat = new THREE.MeshLambertMaterial({ map: this.groundTexture, side: THREE.DoubleSide });
        const tile = new THREE.Mesh(geo, mat);
        tile.rotation.x = -Math.PI / 2;
        tile.position.set(tileX * this.groundTileSize, -0.05, tileZ * this.groundTileSize);
        tile.receiveShadow = true;
        tile.userData.isGroundTile = true;
        this.scene.add(tile);
        this.worldObjects.push(tile);
        return tile;
    }

    buildGroundTilesNearPosition(position) {
        const tileX = Math.round(position.x / this.groundTileSize);
        const tileZ = Math.round(position.z / this.groundTileSize);

        for (let dx = -this.groundTileRadius; dx <= this.groundTileRadius; dx++) {
            for (let dz = -this.groundTileRadius; dz <= this.groundTileRadius; dz++) {
                const gx = tileX + dx;
                const gz = tileZ + dz;
                const key = this.getGroundTileKey(gx, gz);
                if (!this.groundTiles.has(key)) {
                    this.groundTiles.set(key, this.createGroundTile(gx, gz));
                }
            }
        }

        const remove = [];
        for (const [key, tile] of this.groundTiles.entries()) {
            const tx = Math.round(tile.position.x / this.groundTileSize);
            const tz = Math.round(tile.position.z / this.groundTileSize);
            if (Math.abs(tx - tileX) > this.groundTileRadius + 1 || Math.abs(tz - tileZ) > this.groundTileRadius + 1) {
                remove.push(key);
            }
        }
        remove.forEach((key) => {
            const tile = this.groundTiles.get(key);
            if (!tile) return;
            this.scene.remove(tile);
            if (tile.geometry) tile.geometry.dispose();
            if (tile.material) tile.material.dispose();
            this.worldObjects = this.worldObjects.filter((obj) => obj !== tile);
            this.groundTiles.delete(key);
        });
    }

    buildAtmosphere() {
        const particleCount = 220;
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

        const starsGeo = new THREE.BufferGeometry();
        const starCount = 1300;
        const starPositions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 280 + Math.random() * 320;
            const y = 55 + Math.random() * 180;
            starPositions[i * 3] = Math.cos(angle) * radius;
            starPositions[i * 3 + 1] = y;
            starPositions[i * 3 + 2] = 70 + Math.sin(angle) * radius;
        }
        starsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        const starsMat = new THREE.PointsMaterial({
            color: 0xbfd2ff,
            size: 1.25,
            transparent: true,
            opacity: 0.78,
            depthWrite: false
        });
        const stars = new THREE.Points(starsGeo, starsMat);
        stars.userData.isStars = true;
        this.scene.add(stars);
        this.worldObjects.push(stars);
    }

    buildReturnTheatreLandmark() {
        // Keep the real theatre visible; only add subtle return beacons outside the door.
        const theatreLandmark = new THREE.Group();
        theatreLandmark.position.set(0, 0, 70);
        theatreLandmark.name = 'outside-theatre-landmark';
        theatreLandmark.userData.noCollision = true;

        const portalRing = new THREE.Mesh(
            new THREE.TorusGeometry(4.2, 0.5, 16, 36),
            new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.6 })
        );
        portalRing.position.set(0, 3.4, -6);
        portalRing.rotation.x = Math.PI / 2;
        portalRing.userData.noCollision = true;
        theatreLandmark.add(portalRing);

        const returnBeacon = new THREE.Mesh(
            new THREE.CylinderGeometry(0.9, 2.2, 50, 10, 1, true),
            new THREE.MeshBasicMaterial({
                color: 0x00ffcc,
                transparent: true,
                opacity: 0.09,
                side: THREE.DoubleSide
            })
        );
        returnBeacon.position.set(0, 25, -6);
        returnBeacon.userData.noCollision = true;
        theatreLandmark.add(returnBeacon);

        this.scene.add(theatreLandmark);
        this.worldObjects.push(theatreLandmark);

        const portalLight = new THREE.PointLight(0x00ffcc, 2.3, 60);
        portalLight.position.set(0, 7, 64);
        this.scene.add(portalLight);
        this.worldLights.push(portalLight);

        const theatreTopLight = new THREE.PointLight(0x88ccff, 2.0, 90);
        theatreTopLight.position.set(0, 24, 60);
        this.scene.add(theatreTopLight);
        this.worldLights.push(theatreTopLight);
    }

    hash2D(x, z) {
        const s = Math.sin((x * 127.1) + (z * 311.7)) * 43758.5453123;
        return s - Math.floor(s);
    }

    seededRange(x, z, salt, min, max) {
        const v = this.hash2D(x + (salt * 17.13), z - (salt * 9.73));
        return min + (max - min) * v;
    }

    getTempleCellKey(cellX, cellZ) {
        return `${cellX}:${cellZ}`;
    }

    createTempleConfigForCell(cellX, cellZ) {
        const centerX = cellX * this.templeCellSize;
        const centerZ = cellZ * this.templeCellSize;
        const jitterX = this.seededRange(cellX, cellZ, 1, -52, 52);
        const jitterZ = this.seededRange(cellX, cellZ, 2, -52, 52);
        const pos = new THREE.Vector3(centerX + jitterX, 0, centerZ + jitterZ);
        if (pos.z < 95) {
            pos.z = 95 + this.seededRange(cellX, cellZ, 3, 0, 40);
        }

        const palette = [
            { color: 0xff6600, beaconColor: 0xff4400 },
            { color: 0x44aaff, beaconColor: 0x2288ff },
            { color: 0xaa44ff, beaconColor: 0x8822ff },
            { color: 0xffdd00, beaconColor: 0xffaa00 },
            { color: 0x66ffbb, beaconColor: 0x33ffaa },
            { color: 0xff6677, beaconColor: 0xff3344 }
        ];
        const paletteIndex = Math.floor(this.seededRange(cellX, cellZ, 4, 0, palette.length - 0.0001));
        const style = palette[paletteIndex];

        const nameA = this.templeNameSeedsA[Math.floor(this.seededRange(cellX, cellZ, 5, 0, this.templeNameSeedsA.length - 0.0001))];
        const nameB = this.templeNameSeedsB[Math.floor(this.seededRange(cellX, cellZ, 6, 0, this.templeNameSeedsB.length - 0.0001))];
        const name = `${nameA} ${nameB}`;

        return {
            pos,
            color: style.color,
            beaconColor: style.beaconColor,
            name,
            dist: 'grand',
            cellKey: this.getTempleCellKey(cellX, cellZ)
        };
    }

    shouldSpawnTempleInCell(cellX, cellZ, isCenterCell = false) {
        if (isCenterCell) return true;
        const densityRoll = this.hash2D(cellX + 19.7, cellZ - 12.1);
        return densityRoll > 0.58;
    }

    buildTemplesNearPosition(position, force = false) {
        if (!position) return;
        const cellX = Math.floor(position.x / this.templeCellSize);
        const cellZ = Math.floor(position.z / this.templeCellSize);

        let spawnedInRing = 0;
        for (let dx = -this.templeGenerationRadius; dx <= this.templeGenerationRadius; dx++) {
            for (let dz = -this.templeGenerationRadius; dz <= this.templeGenerationRadius; dz++) {
                const cx = cellX + dx;
                const cz = cellZ + dz;
                const key = this.getTempleCellKey(cx, cz);
                if (!force && this.templeCellMap.has(key)) continue;
                const isCenterCell = dx === 0 && dz === 0;
                if (!force && !this.shouldSpawnTempleInCell(cx, cz, isCenterCell)) continue;
                const cfg = this.createTempleConfigForCell(cx, cz);
                const temple = this.buildTemple(cfg);
                if (temple) {
                    this.templeCellMap.set(key, temple);
                    spawnedInRing++;
                }
            }
        }

        // Guarantee at least one nearby temple without overcrowding.
        if (!force && spawnedInRing === 0) {
            const fallbackKey = this.getTempleCellKey(cellX, cellZ);
            if (!this.templeCellMap.has(fallbackKey)) {
                const fallbackCfg = this.createTempleConfigForCell(cellX, cellZ);
                const fallbackTemple = this.buildTemple(fallbackCfg);
                if (fallbackTemple) {
                    this.templeCellMap.set(fallbackKey, fallbackTemple);
                }
            }
        }

        this.pruneFarTemples(position);
    }

    pruneFarTemples(playerPosition) {
        const removeKeys = [];
        for (const [cellKey, temple] of this.templeCellMap.entries()) {
            if (!temple?.position) {
                removeKeys.push(cellKey);
                continue;
            }
            if (temple.position.distanceTo(playerPosition) > this.templeDespawnDistance) {
                removeKeys.push(cellKey);
            }
        }

        removeKeys.forEach((cellKey) => {
            const temple = this.templeCellMap.get(cellKey);
            if (!temple) {
                this.templeCellMap.delete(cellKey);
                return;
            }

            if (temple.group) {
                this.scene.remove(temple.group);
                temple.group.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) child.material.forEach((m) => m?.dispose && m.dispose());
                        else child.material.dispose();
                    }
                });
            }
            if (temple.chest) {
                this.scene.remove(temple.chest);
                temple.chest.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) child.material.forEach((m) => m?.dispose && m.dispose());
                        else child.material.dispose();
                    }
                });
            }
            if (temple.beaconLight) {
                const idx = this.worldLights.indexOf(temple.beaconLight);
                if (idx >= 0) this.worldLights.splice(idx, 1);
                this.scene.remove(temple.beaconLight);
            }
            if (temple.pillarLight) {
                const idx = this.worldLights.indexOf(temple.pillarLight);
                if (idx >= 0) this.worldLights.splice(idx, 1);
                this.scene.remove(temple.pillarLight);
            }

            this.worldObjects = this.worldObjects.filter((obj) => obj !== temple.group && obj !== temple.chest);
            this.temples = this.temples.filter((t) => t !== temple);
            this.landmarks = this.landmarks.filter((lm) => lm.name !== temple.name || !lm.position.equals(temple.position));
            this.treasureChests = this.treasureChests.filter((tc) => tc.mesh !== temple.chest);
            this.templeCellMap.delete(cellKey);
        });
    }

    buildNearSpawnLandmarks() {
        // Guaranteed visible objectives close to spawn so the world never feels blank.
        const center = new THREE.Vector3(0, 0, 88);
        const ringRadius = 9;
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const x = center.x + Math.cos(angle) * ringRadius;
            const z = center.z + Math.sin(angle) * ringRadius;

            const monolith = new THREE.Mesh(
                new THREE.BoxGeometry(2, 9, 2),
                new THREE.MeshLambertMaterial({ color: 0x5a4b35 })
            );
            monolith.position.set(x, 4.5, z);
            monolith.castShadow = true;
            this.scene.add(monolith);
            this.worldObjects.push(monolith);

            const torch = new THREE.PointLight(0xffaa55, 2.5, 36);
            torch.position.set(x, 8.5, z);
            this.scene.add(torch);
            this.worldLights.push(torch);
        }

        // Emergency guaranteed-visible markers right around spawn.
        const markerMat = new THREE.MeshBasicMaterial({ color: 0xff3355 });
        const markerA = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4, 1.4), markerMat);
        markerA.position.set(0, 2, 82);
        this.scene.add(markerA);
        this.worldObjects.push(markerA);

        const markerB = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4, 1.4), markerMat);
        markerB.position.set(0, 2, 94);
        this.scene.add(markerB);
        this.worldObjects.push(markerB);
    }

    buildTemple(cfg) {
        const { pos, color, name, beaconColor, dist } = cfg;
        const group = new THREE.Group();
        group.position.copy(pos);
        group.userData.isTemple = true;
        const isGrand = dist === 'grand';

        const islandGeo = new THREE.CylinderGeometry(isGrand ? 22 : 12, isGrand ? 30 : 16, isGrand ? 3 : 2, 28);
        const islandMat = new THREE.MeshLambertMaterial({ color: 0x2a2a20 });
        const island = new THREE.Mesh(islandGeo, islandMat);
        island.position.y = isGrand ? -1.5 : -1;
        island.castShadow = true;
        island.receiveShadow = true;
        group.add(island);

        const stepsCount = isGrand ? 7 : 4;
        for (let i = 0; i < stepsCount; i++) {
            const r = (isGrand ? 15 : 8) - i * (isGrand ? 1.6 : 1.5);
            const h = isGrand ? 0.95 : 0.6;
            const stepGeo = new THREE.CylinderGeometry(r, r + 0.3, h, 16);
            const stepMat = new THREE.MeshLambertMaterial({ color: 0x444438 });
            const step = new THREE.Mesh(stepGeo, stepMat);
            step.position.y = i * h;
            step.castShadow = true;
            group.add(step);
        }

        const pillarCount = isGrand ? 14 : (dist === 'far' ? 8 : 6);
        const pillarRadius = isGrand ? 13 : (dist === 'far' ? 6 : 5);
        const pillarHeight = isGrand ? 18 : (dist === 'far' ? 10 : 7);
        for (let i = 0; i < pillarCount; i++) {
            const angle = (i / pillarCount) * Math.PI * 2;
            const pGeo = new THREE.CylinderGeometry(isGrand ? 0.75 : 0.4, isGrand ? 1.0 : 0.5, pillarHeight, 10);
            const pMat = new THREE.MeshLambertMaterial({ color: 0x555550 });
            const pillar = new THREE.Mesh(pGeo, pMat);
            const stepHeight = isGrand ? 0.95 : 0.6;
            pillar.position.set(Math.cos(angle) * pillarRadius, pillarHeight / 2 + stepsCount * stepHeight - stepHeight, Math.sin(angle) * pillarRadius);
            pillar.castShadow = true;
            group.add(pillar);
        }

        const altarGeo = new THREE.BoxGeometry(isGrand ? 5.2 : 2.5, isGrand ? 2.8 : 1.5, isGrand ? 5.2 : 2.5);
        const altarMat = new THREE.MeshLambertMaterial({ color: 0x3a3a32 });
        const altar = new THREE.Mesh(altarGeo, altarMat);
        altar.position.y = stepsCount * (isGrand ? 0.95 : 0.6) + (isGrand ? 1.4 : 0.75);
        altar.castShadow = true;
        group.add(altar);

        const orbGeo = new THREE.SphereGeometry(isGrand ? 1.2 : 0.6, 16, 12);
        const orbMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.y = stepsCount * (isGrand ? 0.95 : 0.6) + (isGrand ? 4.2 : 2.2);
        group.add(orb);

        const beaconLight = new THREE.PointLight(beaconColor, isGrand ? 6 : 3, isGrand ? 150 : 80);
        beaconLight.position.y = stepsCount * (isGrand ? 0.95 : 0.6) + (isGrand ? 8 : 4);
        group.add(beaconLight);
        this.worldLights.push(beaconLight);

        const pillarLight = new THREE.PointLight(color, isGrand ? 2.7 : 1.5, isGrand ? 55 : 25);
        pillarLight.position.y = 2;
        group.add(pillarLight);
        this.worldLights.push(pillarLight);

        const beamGeo = new THREE.CylinderGeometry(isGrand ? 0.35 : 0.1, isGrand ? 1.8 : 0.8, isGrand ? 52 : 30, 8, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({ color: beaconColor, transparent: true, opacity: 0.08, side: THREE.DoubleSide });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.y = stepsCount * (isGrand ? 0.95 : 0.6) + (isGrand ? 30 : 17);
        group.add(beam);

        // Temple safe zone ring: entering this area protects player from ghost kills.
        const safeRing = new THREE.Mesh(
            new THREE.RingGeometry(this.templeSafeRadius - 0.6, this.templeSafeRadius, 48),
            new THREE.MeshBasicMaterial({
                color: 0x66ffcc,
                transparent: true,
                opacity: 0.22,
                side: THREE.DoubleSide
            })
        );
        safeRing.rotation.x = -Math.PI / 2;
        safeRing.position.y = 0.08;
        group.add(safeRing);

        this.scene.add(group);
        this.worldObjects.push(group);
        this.applyStaticOMICollider(group, { type: 'cylinder', radius: isGrand ? 24 : 14, height: isGrand ? 28 : 14, translation: [0, 10, 0] });

        const chestPos = pos.clone();
        chestPos.y = stepsCount * (isGrand ? 0.95 : 0.6) + (isGrand ? 2.6 : 1.5);
        const chest = this.createTreasureChest(chestPos);
        this.scene.add(chest);
        this.applyStaticOMICollider(chest, { type: 'box', size: [2.4, 1.8, 2.0] });
        this.treasureChests.push({ mesh: chest, position: chestPos, opened: false });

        const templeData = {
            group,
            orb,
            beaconLight,
            pillarLight,
            beam,
            chest,
            name,
            position: pos,
            color,
            beaconColor,
            cellKey: cfg.cellKey || null
        };
        this.temples.push(templeData);
        this.landmarks.push({ name, position: pos, radius: 14, discovered: false, orb, light: beaconLight });
        return templeData;
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

        const ambient = new THREE.AmbientLight(0x33466f, 0.92);
        this.scene.add(ambient);
        this.worldLights.push(ambient);

        const hemiLight = new THREE.HemisphereLight(0x7f95cb, 0x243822, 0.75);
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

        const spawnFill = new THREE.PointLight(0x88aaff, 2.6, 140);
        spawnFill.position.set(0, 8, 90);
        this.scene.add(spawnFill);
        this.worldLights.push(spawnFill);

        const eerieRed = new THREE.PointLight(0x7a2a3f, 1.4, 150);
        eerieRed.position.set(-90, 12, 190);
        this.scene.add(eerieRed);
        this.worldLights.push(eerieRed);

        const eerieBlue = new THREE.PointLight(0x2a3f7a, 1.6, 170);
        eerieBlue.position.set(95, 14, 240);
        this.scene.add(eerieBlue);
        this.worldLights.push(eerieBlue);

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

    createNoiseBuffer(audioContext, durationSeconds = 8, gain = 0.2) {
        const sampleRate = audioContext.sampleRate;
        const length = Math.floor(sampleRate * durationSeconds);
        const buffer = audioContext.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        let previous = 0;
        for (let i = 0; i < length; i++) {
            const white = (Math.random() * 2 - 1);
            previous = (previous * 0.98) + (white * 0.02);
            data[i] = previous * gain;
        }
        return buffer;
    }

    createCricketBuffer(audioContext, durationSeconds = 6) {
        const sampleRate = audioContext.sampleRate;
        const length = Math.floor(sampleRate * durationSeconds);
        const buffer = audioContext.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            const burst = ((Math.sin(t * Math.PI * 2 * 3.6) + 1) * 0.5) ** 8;
            const carrier = Math.sin(t * Math.PI * 2 * 5200);
            const flutter = Math.sin(t * Math.PI * 2 * 48);
            data[i] = carrier * burst * (0.05 + flutter * 0.01);
        }
        return buffer;
    }

    createOwlBuffer(audioContext, durationSeconds = 10) {
        const sampleRate = audioContext.sampleRate;
        const length = Math.floor(sampleRate * durationSeconds);
        const buffer = audioContext.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            const phase = t % 5;
            let v = 0;
            if (phase < 1.8) {
                const env = Math.max(0, 1 - (phase / 1.8));
                const freq = 420 - (phase * 80);
                v = Math.sin(t * Math.PI * 2 * freq) * env * 0.14;
            }
            data[i] = v;
        }
        return buffer;
    }

    createSpatialEmitter(position, options = {}) {
        const listener = this.theatre?.avatarManager?.audioListener;
        const audioContext = this.theatre?.avatarManager?.audioContext;
        if (!listener || !audioContext) return null;

        const anchor = new THREE.Object3D();
        anchor.position.copy(position);
        anchor.userData.noCollision = true;
        this.scene.add(anchor);
        this.worldObjects.push(anchor);

        const audio = new THREE.PositionalAudio(listener);
        const refDistance = options.refDistance ?? 45;
        const maxDistance = options.maxDistance ?? 260;
        const rolloffFactor = options.rolloffFactor ?? 1.2;
        audio.setRefDistance(refDistance);
        audio.setMaxDistance(maxDistance);
        audio.setRolloffFactor(rolloffFactor);
        audio.setDistanceModel('exponential');
        audio.setLoop(options.loop !== false);
        audio.setVolume(options.volume ?? 0.35);
        if (options.cone) {
            audio.setDirectionalCone(options.cone.inner, options.cone.outer, options.cone.gain);
        }

        const type = options.type || 'noise';
        let buffer = null;
        if (type === 'cricket') buffer = this.createCricketBuffer(audioContext, options.duration ?? 6);
        else if (type === 'owl') buffer = this.createOwlBuffer(audioContext, options.duration ?? 10);
        else buffer = this.createNoiseBuffer(audioContext, options.duration ?? 8, options.noiseGain ?? 0.2);

        audio.setBuffer(buffer);
        anchor.add(audio);

        const emitter = { anchor, audio, options };
        this.spookyAudioEmitters.push(emitter);
        return emitter;
    }

    ensureSpookyAudioStarted() {
        if (this._spookyAudioReady) return;
        const audioContext = this.theatre?.avatarManager?.audioContext;
        if (!audioContext) return;

        const startAll = () => {
            if (audioContext.state === 'suspended') {
                audioContext.resume().catch(() => {});
            }
            this.spookyAudioEmitters.forEach((emitter) => {
                if (!emitter.audio.isPlaying) {
                    try { emitter.audio.play(); } catch (e) { /* empty */ }
                }
            });
            this._spookyAudioReady = true;
        };

        if (audioContext.state === 'running') {
            startAll();
            return;
        }

        const onceStart = () => {
            startAll();
            document.removeEventListener('click', onceStart);
            document.removeEventListener('keydown', onceStart);
            document.removeEventListener('touchstart', onceStart);
        };
        document.addEventListener('click', onceStart);
        document.addEventListener('keydown', onceStart);
        document.addEventListener('touchstart', onceStart);
    }

    setupSpookySpatialAudio() {
        this.clearSpookySpatialAudio();

        const spawn = this.theatre?.camera?.position?.clone() || new THREE.Vector3(0, 1.6, 88);
        const templeHints = this.temples.slice(0, 4);

        // Wide ambient wind beds
        this.createSpatialEmitter(new THREE.Vector3(spawn.x - 120, 14, spawn.z + 120), {
            type: 'wind',
            duration: 9,
            noiseGain: 0.15,
            volume: 0.35,
            refDistance: 80,
            maxDistance: 500,
            rolloffFactor: 0.9
        });
        this.createSpatialEmitter(new THREE.Vector3(spawn.x + 140, 20, spawn.z + 220), {
            type: 'wind',
            duration: 11,
            noiseGain: 0.13,
            volume: 0.3,
            refDistance: 95,
            maxDistance: 540,
            rolloffFactor: 0.85
        });

        // Localized cricket beds near floor/brush
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const radius = 90 + (i % 3) * 26;
            const pos = new THREE.Vector3(
                spawn.x + Math.cos(angle) * radius,
                1.4 + (i % 2) * 0.6,
                spawn.z + Math.sin(angle) * radius + 70
            );
            this.createSpatialEmitter(pos, {
                type: 'cricket',
                duration: 6.2,
                volume: 0.44,
                refDistance: 28,
                maxDistance: 210,
                rolloffFactor: 1.3
            });
        }

        // Sparse owl hoots from high positions.
        templeHints.forEach((temple, idx) => {
            const pos = temple.position.clone();
            pos.y = 18 + (idx % 2) * 6;
            pos.x += (idx % 2 === 0 ? 16 : -18);
            pos.z += (idx % 2 === 0 ? -12 : 14);
            this.createSpatialEmitter(pos, {
                type: 'owl',
                duration: 10,
                volume: 0.28,
                refDistance: 70,
                maxDistance: 460,
                rolloffFactor: 0.9
            });
        });

        this.ensureSpookyAudioStarted();
    }

    clearSpookySpatialAudio() {
        this.spookyAudioEmitters.forEach((emitter) => {
            if (emitter.audio?.isPlaying) {
                emitter.audio.stop();
            }
            if (emitter.anchor?.parent) {
                emitter.anchor.parent.remove(emitter.anchor);
            }
        });
        this.spookyAudioEmitters = [];
        this._spookyAudioReady = false;
    }

    spawnGhosts() {
        const camPos = this.theatre?.camera?.position?.clone() || new THREE.Vector3(0, 1.6, 88);

        // Guaranteed nearby pressure right after exiting the theatre.
        for (let i = 0; i < 2; i++) {
            const ghost = this.createGhost();
            const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.3;
            const radius = 12 + Math.random() * 10;
            const x = camPos.x + Math.cos(angle) * radius;
            const z = camPos.z + Math.sin(angle) * radius + 10;
            const baseSpeed = 2.6 + Math.random() * 1.4; // units/sec
            ghost.position.set(x, 2, z);
            this.scene.add(ghost);
            this.ghosts.push({
                mesh: ghost,
                position: ghost.position.clone(),
                target: null,
                speed: baseSpeed,
                baseSpeed: baseSpeed,
                lastPlayerDistance: Infinity,
                aggroRange: 85 + Math.random() * 35,
                killRange: 2.0,
                health: 2 + Math.floor(Math.random() * 3),
                alerted: true
            });
        }

        for (let i = 0; i < 6; i++) {
            const ghost = this.createGhost();
            const nearSpawn = i < 2;
            const x = nearSpawn ? (Math.random() - 0.5) * 60 : (Math.random() - 0.5) * 250;
            const z = nearSpawn ? 100 + Math.random() * 50 : 120 + Math.random() * 200;
            const baseSpeed = 2.2 + Math.random() * 1.5; // units/sec
            ghost.position.set(x, 2, z);
            this.scene.add(ghost);
            this.ghosts.push({
                mesh: ghost,
                position: ghost.position.clone(),
                target: null,
                speed: baseSpeed,
                baseSpeed: baseSpeed,
                lastPlayerDistance: Infinity,
                aggroRange: 70 + Math.random() * 35,
                killRange: 2.0,
                health: 2 + Math.floor(Math.random() * 3),
                alerted: nearSpawn
            });
        }
    }

    getSafeTempleForPosition(position) {
        if (!position || this.temples.length === 0) return null;
        for (const temple of this.temples) {
            if (position.distanceTo(temple.position) <= this.templeSafeRadius) {
                return temple;
            }
        }
        return null;
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
        const dt = Math.min(0.05, Math.max(0.008, deltaTime || 0.016));

        // Pack alert: once one ghost spots the player, nearby ghosts aggro too.
        if (playerPosition) {
            this.ghosts.forEach((ghost) => {
                if (ghost.position.distanceTo(playerPosition) < ghost.aggroRange) {
                    ghost.alerted = true;
                    this.ghosts.forEach((other) => {
                        if (other.position.distanceTo(ghost.position) < 55) {
                            other.alerted = true;
                        }
                    });
                }
            });
        }

        this.ghosts.forEach((ghost, index) => {
            if (ghost.health <= 0) { this.removeGhost(index); return; }
            this.updateGhost(ghost, dt, playerPosition);
        });

        this.updateTomatoes(deltaTime);
        this.checkTomatoCollisions();

        if (playerPosition) {
            this.checkMultipleTreasures(playerPosition);
            this.checkLandmarkDiscovery(playerPosition);
            this.buildTemplesNearPosition(playerPosition);
            this.buildGroundTilesNearPosition(playerPosition);
            this.updateTheatreCompass(playerPosition);
            this.updateWorldCulling(playerPosition);
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
            if (obj.userData?.isStars && obj.material) {
                obj.material.opacity = 0.62 + Math.sin(time * 0.6) * 0.16;
            }
        });
    }

    updateWorldCulling(playerPosition) {
        const now = performance.now();
        if ((now - this._lastOutsideCullMs) < this._outsideCullIntervalMs) return;
        this._lastOutsideCullMs = now;

        const cam = this.theatre?.camera;
        if (!cam) return;
        cam.updateMatrixWorld();
        this._outsideCullProjScreen.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        this._outsideCullFrustum.setFromProjectionMatrix(this._outsideCullProjScreen);

        const maxDecorDistance = 420;
        const maxTempleDistance = 720;
        const intersectsFrustumSafe = (obj) => {
            if (!obj || !obj.visible) return false;
            if (obj.isMesh && obj.geometry) {
                if (!obj.geometry.boundingSphere) {
                    obj.geometry.computeBoundingSphere();
                }
                return this._outsideCullFrustum.intersectsObject(obj);
            }
            const box = new THREE.Box3().setFromObject(obj);
            if (box.isEmpty()) return false;
            return this._outsideCullFrustum.intersectsBox(box);
        };

        this.temples.forEach((temple) => {
            if (!temple?.group) return;
            const dist = temple.position.distanceTo(playerPosition);
            const inFrustum = intersectsFrustumSafe(temple.group);
            const visible = dist <= maxTempleDistance && inFrustum;
            temple.group.visible = visible;
            if (temple.chest) temple.chest.visible = visible;
        });

        this.worldObjects.forEach((obj) => {
            if (!obj?.isObject3D) return;
            if (obj.userData?.isAtmosphere || obj.userData?.isStars || obj.name === 'outside-theatre-landmark') {
                obj.visible = true;
                return;
            }
            if (obj.userData?.isTemple) {
                return;
            }
            if (obj.userData?.isGroundTile) {
                obj.visible = true;
                return;
            }
            const dist = obj.position ? obj.position.distanceTo(playerPosition) : 0;
            const inFrustum = intersectsFrustumSafe(obj);
            obj.visible = dist <= maxDecorDistance && inFrustum;
        });

        this.ghosts.forEach((ghost) => {
            if (!ghost?.mesh) return;
            const dist = ghost.position.distanceTo(playerPosition);
            const inFrustum = intersectsFrustumSafe(ghost.mesh);
            ghost.mesh.visible = dist <= 260 && inFrustum;
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
        const inGraceWindow = (Date.now() - this.enterTimestamp) < this.ghostGracePeriodMs;
        const safeTemple = this.getSafeTempleForPosition(playerPosition);
        const playerInSafeZone = !!safeTemple;
        const playerBonuses = this.theatre?.app?.itemBonuses || {};
        const protectionBonus = Math.max(0, Number(playerBonuses.protection || 0));
        const stealthBonus = Math.max(0, Number(playerBonuses.stealth || 0));
        const adjustedAggroRange = Math.max(12, ghost.aggroRange - (stealthBonus * 3));
        const adjustedKillRange = Math.max(1.2, ghost.killRange - (protectionBonus * 0.15));

        if (playerInSafeZone && (Date.now() - this.lastSafeZoneMessageAt) > 2500) {
            this.lastSafeZoneMessageAt = Date.now();
            this.showSafeZoneMessage(safeTemple.name);
        }

        if (!inGraceWindow && !playerInSafeZone && dist < adjustedKillRange) {
            const resistChance = Math.min(0.45, protectionBonus * 0.08);
            if (Math.random() > resistChance) {
                this.killPlayer();
                return;
            }
        }

        const shouldChase = !playerInSafeZone && (ghost.alerted || dist < adjustedAggroRange);

        if (shouldChase) {
            const dir = new THREE.Vector3().subVectors(playerPosition, ghost.position).normalize();
            const norm = 1 - Math.min(dist, adjustedAggroRange) / adjustedAggroRange;
            const graceMultiplier = inGraceWindow ? 0.38 : 1.0;
            const chaseSpeed = ghost.speed * (1 + norm * 1.2) * graceMultiplier;
            ghost.position.addScaledVector(dir, chaseSpeed * deltaTime);
            ghost.mesh.position.x = ghost.position.x;
            ghost.mesh.position.z = ghost.position.z;
            ghost.mesh.lookAt(playerPosition.x, ghost.mesh.position.y, playerPosition.z);
            ghost.speed = Math.min(5.2, ghost.speed + 0.55 * deltaTime);
        } else {
            if (playerInSafeZone) {
                // Repel ghosts away from temple safe area edge while player is safe.
                const retreatDir = new THREE.Vector3().subVectors(ghost.position, safeTemple.position).normalize();
                ghost.position.addScaledVector(retreatDir, Math.max(2.0, ghost.baseSpeed) * deltaTime);
                ghost.mesh.position.x = ghost.position.x;
                ghost.mesh.position.z = ghost.position.z;
                ghost.mesh.lookAt(safeTemple.position.x, ghost.mesh.position.y, safeTemple.position.z);
            }
            if (Math.random() < 0.02) {
                const wander = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                ghost.position.addScaledVector(wander, ghost.baseSpeed * 0.45 * deltaTime);
                ghost.mesh.position.x = ghost.position.x;
                ghost.mesh.position.z = ghost.position.z;
            }
            ghost.speed = Math.max(ghost.baseSpeed, ghost.speed - 0.7 * deltaTime);
            if (dist > adjustedAggroRange * 1.8) {
                ghost.alerted = false;
            }
        }

        ghost.position.x = Math.max(-180, Math.min(180, ghost.position.x));
        ghost.position.z = Math.max(80, Math.min(320, ghost.position.z));
        ghost.mesh.position.x = ghost.position.x;
        ghost.mesh.position.z = ghost.position.z;
    }

    showSafeZoneMessage(templeName) {
        const id = 'temple-safe-zone-message';
        const existing = document.getElementById(id);
        if (existing) existing.remove();
        const d = document.createElement('div');
        d.id = id;
        d.style.cssText = 'position:fixed;top:74px;left:50%;transform:translateX(-50%);background:rgba(0,40,30,0.86);border:2px solid #66ffcc;border-radius:10px;padding:8px 14px;color:#aaffee;font-size:13px;z-index:1300;';
        d.textContent = `${templeName} safe zone: ghosts cannot kill you here`;
        document.body.appendChild(d);
        setTimeout(() => {
            if (document.body.contains(d)) d.remove();
        }, 2200);
    }

    checkMultipleTreasures(playerPosition) {
        this.treasureChests.forEach(tc => {
            if (tc.opened) return;
            const dist = playerPosition.distanceTo(tc.position);
            if (dist < 9 && !document.getElementById('treasure-prompt')) this.showTreasurePrompt();
            else if (dist >= 9) this.hideTreasurePrompt();
            tc.mesh.userData.canInteract = dist < 7;
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
        g.userData.isTempleChest = true;
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

    findTreasureByObject(clickedObject) {
        if (!clickedObject) return null;
        return this.treasureChests.find((tc) => {
            if (tc.opened) return false;
            let obj = clickedObject;
            while (obj) {
                if (obj === tc.mesh) return true;
                obj = obj.parent;
            }
            return false;
        }) || null;
    }

    openTreasureChest(clickedObject = null, playerPosition = null) {
        let tc = this.findTreasureByObject(clickedObject);
        if (!tc) {
            tc = this.treasureChests.find(t => !t.opened && t.mesh.userData.canInteract);
        }
        if (!tc) return false;
        if (playerPosition && playerPosition.distanceTo(tc.position) > 8) {
            return false;
        }
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
        if (this.worldObjects.length === 0) {
            this.buildWorld();
        }
        this.isActive = true;
        this.enterTimestamp = Date.now();
        this.showOutsideStateOverlay();
        this.showTheatreCompass();
        this.setupSpookySpatialAudio();
        this.showWorldWarning();
    }

    showWorldWarning() {
        const d = document.createElement('div');
        d.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#ffaa00;padding:16px 28px;border-radius:12px;font-size:16px;z-index:1000;text-align:center;border:2px solid #ffaa00;backdrop-filter:blur(10px);`;
        d.innerHTML = `<div style="font-size:20px;margin-bottom:6px;">BEWARE THE DARKNESS</div><span style="font-size:13px;color:#ccc;">Temples glow in the distance... reach them for treasure, but ghosts guard the way.<br>Throw tomatoes (T) to fight back. Sprint (Shift) to run.</span>`;
        document.body.appendChild(d);
        setTimeout(() => { if (document.body.contains(d)) d.remove(); }, 6000);
    }

    showWorldDebugOverlay() {
        const existing = document.getElementById('world-debug-overlay');
        if (existing) existing.remove();
        const d = document.createElement('div');
        d.id = 'world-debug-overlay';
        d.style.cssText = 'position:fixed;top:16px;right:16px;background:rgba(0,0,0,0.75);color:#7dff9a;border:1px solid #2a7f44;border-radius:8px;padding:8px 10px;font-size:12px;z-index:1200;';
        d.textContent = `world active | temples:${this.temples.length} | ghosts:${this.ghosts.length} | lights:${this.worldLights.length}`;
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 8000);
    }

    showOutsideStateOverlay() {
        const existing = document.getElementById('outside-state-overlay');
        if (existing) existing.remove();
        const d = document.createElement('div');
        d.id = 'outside-state-overlay';
        d.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);background:rgba(120,20,20,0.85);color:#fff;border:2px solid #ff6666;border-radius:10px;padding:8px 14px;font-size:13px;z-index:1300;';
        d.textContent = `OUTSIDE ACTIVE | temples:${this.temples.length} ghosts:${this.ghosts.length}`;
        document.body.appendChild(d);
    }

    showTheatreCompass() {
        if (document.getElementById('theatre-compass-overlay')) return;
        const d = document.createElement('div');
        d.id = 'theatre-compass-overlay';
        d.style.cssText = 'position:fixed;top:52px;left:50%;transform:translateX(-50%);background:rgba(8,16,24,0.88);color:#ccf6ff;border:2px solid #40d8ff;border-radius:10px;padding:8px 12px;font-size:13px;z-index:1300;min-width:280px;text-align:center;box-shadow:0 0 18px rgba(64,216,255,0.28);';
        d.innerHTML = '<span id="theatre-compass-arrow">▲</span> <strong>THEATRE</strong> <span id="theatre-compass-distance">--m</span>';
        document.body.appendChild(d);
    }

    hideTheatreCompass() {
        const el = document.getElementById('theatre-compass-overlay');
        if (el) el.remove();
    }

    updateTheatreCompass(playerPosition) {
        if (!this.isActive || !playerPosition || !this.theatre?.camera) {
            this.hideTheatreCompass();
            return;
        }
        this.showTheatreCompass();

        const toTheatre = new THREE.Vector3().subVectors(this.theatreLandmarkPosition, playerPosition);
        const flatToTheatre = new THREE.Vector3(toTheatre.x, 0, toTheatre.z);
        const distance = Math.max(0, Math.round(flatToTheatre.length()));
        if (flatToTheatre.lengthSq() < 0.0001) {
            const distanceEl = document.getElementById('theatre-compass-distance');
            if (distanceEl) distanceEl.textContent = '0m';
            return;
        }

        const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.theatre.camera.quaternion);
        const flatForward = new THREE.Vector3(cameraForward.x, 0, cameraForward.z).normalize();
        const dir = flatToTheatre.normalize();

        const crossY = (flatForward.x * dir.z) - (flatForward.z * dir.x);
        const dot = THREE.MathUtils.clamp(flatForward.dot(dir), -1, 1);
        const angle = Math.acos(dot);
        const signedAngle = crossY < 0 ? -angle : angle;
        const deg = Math.round(THREE.MathUtils.radToDeg(signedAngle));

        const arrowEl = document.getElementById('theatre-compass-arrow');
        const distanceEl = document.getElementById('theatre-compass-distance');
        const containerEl = document.getElementById('theatre-compass-overlay');
        if (!arrowEl || !distanceEl || !containerEl) return;

        arrowEl.style.display = 'inline-block';
        arrowEl.style.transform = `rotate(${deg}deg)`;
        arrowEl.style.transition = 'transform 80ms linear';
        distanceEl.textContent = `${distance}m`;

        if (distance < 45) {
            containerEl.style.borderColor = '#00ffb3';
            containerEl.style.boxShadow = '0 0 18px rgba(0,255,179,0.35)';
        } else {
            containerEl.style.borderColor = '#40d8ff';
            containerEl.style.boxShadow = '0 0 18px rgba(64,216,255,0.28)';
        }
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
        this.clearSpookySpatialAudio();
        const outside = document.getElementById('outside-state-overlay');
        if (outside) outside.remove();
        this.hideTheatreCompass();

        if (this.savedBg) this.scene.background = this.savedBg;
        else this.scene.background = new THREE.Color(0x000011);
        this.scene.fog = this.savedFog || null;

        this.isActive = false;
    }

    clearWorld() {
        this.clearSpookySpatialAudio();
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
        this.templeCellMap.clear();
        this.groundTiles.clear();
        if (this.groundTexture) {
            this.groundTexture.dispose();
            this.groundTexture = null;
        }
        this.walls = []; this.floors = []; this.outdoorObjects = []; this.collectibles = [];
        this.hideTreasurePrompt();
        this.hideTheatreCompass();
    }

    checkExitCollision(playerPosition) {
        if (!this.theatre.exitPortal) return false;
        const portalPos = this.theatre.exitPortal.position;
        const dx = Math.abs(playerPosition.x - portalPos.x);
        const nearDoorX = dx < 10.5;
        const nearDoorHeight = playerPosition.y < 24;
        const justPastDoor = playerPosition.z > (portalPos.z + 1.8);
        return nearDoorX && nearDoorHeight && justPastDoor;
    }

    checkInteriorCollision(playerPosition) {
        if (!this.theatre.exitPortal) return false;
        const portalPos = this.theatre.exitPortal.position;
        const dx = Math.abs(playerPosition.x - portalPos.x);
        const nearDoorX = dx < 10.5;
        const nearDoorHeight = playerPosition.y < 24;
        const backInside = playerPosition.z < (portalPos.z - 2.2);
        return nearDoorX && nearDoorHeight && backInside;
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
