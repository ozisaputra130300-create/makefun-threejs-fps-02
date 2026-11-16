// Movement: acceleration, friction, gravity, crouch and jump, resolved as a box
// against the world's colliders one axis at a time, so a wall never swallows a
// body. Bots move through the same helper, so they obey the same map.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.5;
const SNEAK_SPEED = 3.1;
const GROUND_ACCEL = 44;
const AIR_ACCEL = 10;
const FRICTION = 9.5;
const GRAVITY = 20;
const JUMP_SPEED = 6.4;

// Move a body (position Vector3, velocity Vector3, height) one step. `wish` is a
// unit x/z direction or zero; `speed` is the target horizontal speed. Returns
// whether the body stands on something.
export function moveBody(body, colliders, dt, wishX, wishZ, speed) {
  const probe = moveBody.probe || (moveBody.probe = new THREE.Box3());
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }
  const blend = Math.min(1, ((body.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt) / Math.max(speed, 0.01));
  body.velocity.x += (wishX * speed - body.velocity.x) * blend;
  body.velocity.z += (wishZ * speed - body.velocity.z) * blend;
  if (body.onGround && wishX === 0 && wishZ === 0) {
    const damp = Math.max(0, 1 - FRICTION * dt);
    body.velocity.x *= damp;
    body.velocity.z *= damp;
  }
  body.velocity.y -= GRAVITY * dt;

  const nextX = body.position.x + body.velocity.x * dt;
  if (!overlaps(nextX, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nextX;
  else body.velocity.x = 0;
  const nextZ = body.position.z + body.velocity.z * dt;
  if (!overlaps(body.position.x, body.position.y, nextZ, body.height, 0.04)) body.position.z = nextZ;
  else body.velocity.z = 0;

  body.position.y += body.velocity.y * dt;
  body.onGround = false;
  const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - body.height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  }
  body.velocity.y = Math.max(-30, body.velocity.y);
  return body.onGround;
}

export function createPlayer(colliders, spawn) {
  const player = {
    position: new THREE.Vector3(spawn.x, 0, spawn.z),
    velocity: new THREE.Vector3(),
    yaw: spawn.yaw,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    sneaking: false,
    height: STAND_HEIGHT,
    health: 100,
  };

  function look(dx, dy, sensitivity = 0.0021) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    player.sneaking = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching) {
      const probe = new THREE.Box3(
        new THREE.Vector3(player.position.x - RADIUS, player.position.y, player.position.z - RADIUS),
        new THREE.Vector3(player.position.x + RADIUS, player.position.y + STAND_HEIGHT, player.position.z + RADIUS),
      );
      const blocked = colliders.some((c) => probe.intersectsBox(c));
      if (!blocked) {
        player.crouching = false;
        player.height = STAND_HEIGHT;
      }
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    let wishX = 0;
    let wishZ = 0;
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      const len = Math.hypot(forward, strafe) || 1;
      wishX = (-sin * forward + cos * strafe) / len;
      wishZ = (-cos * forward - sin * strafe) / len;
    }
    const speed = player.crouching ? CROUCH_SPEED : player.sneaking ? SNEAK_SPEED : WALK_SPEED;
    if (keys.has('Space') && player.onGround) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
    }
    moveBody(player, colliders, dt, wishX, wishZ, speed);
  }

  function reset() {
    player.position.set(spawn.x, 0, spawn.z);
    player.velocity.set(0, 0, 0);
    player.yaw = spawn.yaw;
    player.pitch = 0;
    player.eye = STAND_EYE;
    player.crouching = false;
    player.height = STAND_HEIGHT;
    player.health = 100;
    player.onGround = true;
  }

  return {
    state: player,
    step,
    look,
    recoil,
    reset,
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
  };
}
