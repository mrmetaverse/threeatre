import * as THREE from 'three';

function toArrayVec3(value, fallback = [0, 0, 0]) {
    if (!Array.isArray(value) || value.length < 3) return fallback;
    return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0];
}

function toArrayQuat(value, fallback = [0, 0, 0, 1]) {
    if (!Array.isArray(value) || value.length < 4) return fallback;
    return [
        Number(value[0]) || 0,
        Number(value[1]) || 0,
        Number(value[2]) || 0,
        Number(value[3]) || 1
    ];
}

export function setOMIPhysicsProfile(object3D, {
    collider = {},
    physics = {}
} = {}) {
    if (!object3D.userData) object3D.userData = {};
    if (!object3D.userData.extensions) object3D.userData.extensions = {};

    object3D.userData.extensions.OMI_collider = {
        type: collider.type || 'box',
        size: collider.size || [1, 1, 1],
        radius: collider.radius,
        height: collider.height,
        translation: collider.translation || [0, 0, 0],
        rotation: collider.rotation || [0, 0, 0, 1],
        scale: collider.scale || [1, 1, 1],
        enabled: collider.enabled !== false,
        layers: collider.layers || ['world']
    };

    object3D.userData.extensions.OMI_physics = {
        bodyType: physics.bodyType || 'static',
        mass: Number(physics.mass ?? 0),
        friction: Number(physics.friction ?? 0.8),
        restitution: Number(physics.restitution ?? 0.05),
        linearDamping: Number(physics.linearDamping ?? 0),
        angularDamping: Number(physics.angularDamping ?? 0),
        gravityScale: Number(physics.gravityScale ?? 1)
    };
}

export function getOMIColliderExtension(object3D) {
    return object3D?.userData?.extensions?.OMI_collider || object3D?.userData?.OMI_collider || null;
}

function buildLocalColliderSize(collider, object3D) {
    const type = collider.type || 'box';
    if (type === 'sphere') {
        const radius = Number(collider.radius ?? 0.5);
        const d = radius * 2;
        return new THREE.Vector3(d, d, d);
    }
    if (type === 'capsule') {
        const radius = Number(collider.radius ?? 0.4);
        const height = Number(collider.height ?? 1.2);
        const d = radius * 2;
        return new THREE.Vector3(d, height + d, d);
    }
    if (type === 'cylinder') {
        const radius = Number(collider.radius ?? 0.5);
        const height = Number(collider.height ?? 1.0);
        const d = radius * 2;
        return new THREE.Vector3(d, height, d);
    }
    if (Array.isArray(collider.size) && collider.size.length >= 3) {
        const [x, y, z] = toArrayVec3(collider.size, [1, 1, 1]);
        return new THREE.Vector3(Math.abs(x), Math.abs(y), Math.abs(z));
    }

    const fallback = new THREE.Box3().setFromObject(object3D);
    if (fallback.isEmpty()) return new THREE.Vector3(1, 1, 1);
    const size = new THREE.Vector3();
    fallback.getSize(size);
    return size;
}

function composeOffsetMatrix(collider) {
    const [tx, ty, tz] = toArrayVec3(collider.translation, [0, 0, 0]);
    const [qx, qy, qz, qw] = toArrayQuat(collider.rotation, [0, 0, 0, 1]);
    const [sx, sy, sz] = toArrayVec3(collider.scale, [1, 1, 1]);

    const pos = new THREE.Vector3(tx, ty, tz);
    const quat = new THREE.Quaternion(qx, qy, qz, qw).normalize();
    const scl = new THREE.Vector3(
        Math.abs(sx) > 0 ? Math.abs(sx) : 1,
        Math.abs(sy) > 0 ? Math.abs(sy) : 1,
        Math.abs(sz) > 0 ? Math.abs(sz) : 1
    );
    return new THREE.Matrix4().compose(pos, quat, scl);
}

export function computeOMIColliderAABB(object3D, collider = null) {
    const ext = collider || getOMIColliderExtension(object3D);
    if (!ext || ext.enabled === false) return null;

    object3D.updateWorldMatrix(true, true);
    const localSize = buildLocalColliderSize(ext, object3D);
    const offsetMatrix = composeOffsetMatrix(ext);
    const worldMatrix = new THREE.Matrix4().multiplyMatrices(object3D.matrixWorld, offsetMatrix);

    const hx = localSize.x * 0.5;
    const hy = localSize.y * 0.5;
    const hz = localSize.z * 0.5;
    const corners = [
        new THREE.Vector3(-hx, -hy, -hz), new THREE.Vector3(hx, -hy, -hz),
        new THREE.Vector3(-hx, hy, -hz), new THREE.Vector3(hx, hy, -hz),
        new THREE.Vector3(-hx, -hy, hz), new THREE.Vector3(hx, -hy, hz),
        new THREE.Vector3(-hx, hy, hz), new THREE.Vector3(hx, hy, hz)
    ];
    const box = new THREE.Box3();
    corners.forEach((corner, index) => {
        corner.applyMatrix4(worldMatrix);
        if (index === 0) box.min.copy(corner), box.max.copy(corner);
        else box.expandByPoint(corner);
    });
    return box;
}
