// The Wardens: four defender bots. They hold their site, patrol between cover,
// investigate gunfire, and react to what they see — with a human-ish reaction
// delay and aim that worsens with distance, so a careful player wins the duel.
// When the spike is planted they rush the site and try to defuse it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { moveBody } from './player.js';
import { mulberry32 } from './rng.js';

const HEALTH = 100;
const WALK_SPEED = 3.6;
const RUSH_SPEED = 4.7;
const ENGAGE_SPEED = 1.8;
const DEFUSE_SECONDS = 5;
const REACTION_MIN = 0.35;
const REACTION_MAX = 0.65;

const HOLD_NODES = {
  A: ['a1', 'a2', 'w3', 'c3'],
  B: ['b1', 'b2', 'e3', 'c4'],
};

export function createBots(scene, map, playerHitMeshes, onBotShot) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5d6a7a'), roughness: 0.55, metalness: 0.3 });
  const visorMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.cyan), roughness: 0.3, emissive: new THREE.Color(PALETTE.cyan), emissiveIntensity: 1.4 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#22262c'), roughness: 0.8 });
  const torsoGeo = new THREE.BoxGeometry(0.56, 0.8, 0.32);
  const headGeo = new THREE.SphereGeometry(0.16, 14, 10);
  const legGeo = new THREE.BoxGeometry(0.2, 0.75, 0.2);
  const gunGeo = new THREE.BoxGeometry(0.08, 0.1, 0.6);

  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const bots = [];
  const shootables = map.shootables;

  function makeBot(index, spawn) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    const head = new THREE.Mesh(headGeo, visorMat);
    head.position.y = 1.62;
    head.castShadow = true;
    const legL = new THREE.Mesh(legGeo, darkMat);
    legL.position.set(-0.14, 0.38, 0);
    const legR = new THREE.Mesh(legGeo, darkMat);
    legR.position.set(0.14, 0.38, 0);
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.28, 1.1, -0.25);
    group.add(torso, head, legL, legR, gun);
    group.position.set(spawn.x, 0, spawn.z);
    scene.add(group);
    const bot = {
      index,
      site: spawn.site,
      group, torso, head,
      position: group.position,
      velocity: new THREE.Vector3(),
      yaw: spawn.site === 'A' ? Math.PI / 2 : -Math.PI / 2,
      height: 1.72,
      onGround: true,
      health: HEALTH,
      alive: true,
      state: 'hold',
      holdNode: HOLD_NODES[spawn.site][index % 2],
      path: [],
      pathIndex: 0,
      waitLeft: 0,
      lastSeen: null,
      lastSeenAt: -99,
      hearPos: null,
      hearAt: -99,
      aimTime: 0,
      reactionLeft: 0,
      burstLeft: 0,
      burstGap: 0,
      defuseLeft: 0,
      fall: 0,
      random: mulberry32(1234 + index * 777),
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    bots.push(bot);
    return bot;
  }

  map.botSpawns.forEach((spawn, i) => makeBot(i, spawn));

  function reset() {
    bots.forEach((bot, i) => {
      const spawn = map.botSpawns[i];
      bot.position.set(spawn.x, 0, spawn.z);
      bot.velocity.set(0, 0, 0);
      bot.yaw = spawn.site === 'A' ? Math.PI / 2 : -Math.PI / 2;
      bot.health = HEALTH;
      bot.alive = true;
      bot.state = 'hold';
      bot.holdNode = HOLD_NODES[spawn.site][i % 2];
      bot.path = [];
      bot.waitLeft = 0;
      bot.lastSeen = null;
      bot.hearPos = null;
      bot.aimTime = 0;
      bot.burstLeft = 0;
      bot.defuseProgress = 0;
      bot.defuseDone = false;
      bot.fall = 0;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.group.position.y = 0;
    });
  }

  function canSee(bot, playerPos, eyeHeight) {
    const from = new THREE.Vector3(bot.position.x, bot.position.y + 1.55, bot.position.z);
    const to = new THREE.Vector3(playerPos.x, playerPos.y + eyeHeight, playerPos.z);
    const dir = to.clone().sub(from);
    const dist = dir.length();
    if (dist > 48) return { seen: false, dist };
    dir.normalize();
    raycaster.set(from, dir);
    raycaster.far = dist + 0.5;
    const hits = raycaster.intersectObjects(shootables, false);
    if (hits.length > 0 && hits[0].distance < dist - 0.4) return { seen: false, dist };
    return { seen: true, dist };
  }

  function setPath(bot, targetId) {
    const from = map.nearestNode(bot.position.x, bot.position.z);
    const path = map.findPath(from.id, targetId);
    bot.path = path.slice(1);
    bot.pathIndex = 0;
  }

  function followPath(bot, dt, speed) {
    if (bot.pathIndex >= bot.path.length) return true;
    const node = bot.path[bot.pathIndex];
    const dx = node.x - bot.position.x;
    const dz = node.z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) {
      bot.pathIndex += 1;
      return bot.pathIndex >= bot.path.length;
    }
    const wishX = dx / dist;
    const wishZ = dz / dist;
    moveBody(bot, map.colliders, dt, wishX, wishZ, speed);
    const targetYaw = Math.atan2(-wishX, -wishZ);
    let dy = targetYaw - bot.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    bot.yaw += dy * Math.min(1, dt * 6);
    return false;
  }

  function step(bot, dt, time, player, spike, phase) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    const playerPos = player.state.position;
    const eye = player.state.eye;
    // During the buy phase the Wardens hold their ground and never engage.
    const seen = phase === 'buy' ? { seen: false, dist: 0 } : canSee(bot, playerPos, eye);
    if (seen.seen) {
      bot.lastSeen = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
      bot.lastSeenAt = time;
    }

    // The spike rules the round: a planted spike pulls every living bot to it.
    if (spike.state === 'planted') {
      if (bot.state !== 'defuse' && bot.state !== 'rush') {
        bot.state = 'rush';
        setPath(bot, spike.site === 'A' ? 'a1' : 'b1');
      }
      const site = map.sites[spike.site];
      const dSite = Math.hypot(site.plant.x - bot.position.x, site.plant.z - bot.position.z);
      if (dSite < 2.4 && !seen.seen) {
        bot.state = 'defuse';
        bot.defuseProgress = (bot.defuseProgress || 0) + dt;
        bot.group.rotation.y = bot.yaw;
        if (bot.defuseProgress >= DEFUSE_SECONDS) bot.defuseDone = true;
        return;
      }
      bot.defuseProgress = 0;
    } else if (bot.state === 'rush' || bot.state === 'defuse') {
      bot.state = 'hold';
      bot.defuseLeft = 0;
    }

    if (seen.seen && bot.lastSeen) {
      // Engage: face the player, aim, then fire in bursts.
      const dx = bot.lastSeen.x - bot.position.x;
      const dz = bot.lastSeen.z - bot.position.z;
      const targetYaw = Math.atan2(-dx, -dz);
      let dy = targetYaw - bot.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      bot.yaw += dy * Math.min(1, dt * 10);
      bot.group.rotation.y = bot.yaw;
      if (Math.abs(dy) < 0.25) {
        if (bot.state !== 'engage') {
          bot.state = 'engage';
          bot.reactionLeft = REACTION_MIN + bot.random() * (REACTION_MAX - REACTION_MIN);
          bot.aimTime = 0;
          bot.burstLeft = 0;
        }
        bot.aimTime += dt;
        bot.reactionLeft -= dt;
        if (bot.reactionLeft <= 0) {
          bot.burstGap -= dt;
          if (bot.burstLeft <= 0 && bot.burstGap <= 0) {
            bot.burstLeft = 3 + Math.floor(bot.random() * 3);
            bot.burstGap = 0.09;
          }
          if (bot.burstLeft > 0) {
            bot.burstGap -= dt;
            if (bot.burstGap <= 0) {
              bot.burstLeft -= 1;
              bot.burstGap = 0.11;
              fireAt(bot, player, seen.dist);
              if (bot.burstLeft === 0) bot.burstGap = 0.9 + bot.random() * 0.7;
            }
          }
        }
      }
      return;
    }

    // Not engaging: hold, patrol, or investigate a noise.
    bot.state = bot.hearPos && time - bot.hearAt < 6 ? 'investigate' : bot.state === 'investigate' ? 'hold' : bot.state;
    if (bot.state === 'engage') bot.state = 'hold';
    if (bot.state === 'investigate' && bot.hearPos) {
      const target = map.nearestNode(bot.hearPos.x, bot.hearPos.z);
      if (bot.path.length === 0) setPath(bot, target.id);
      const arrived = followPath(bot, dt, WALK_SPEED);
      if (arrived) {
        bot.hearPos = null;
        bot.state = 'hold';
        bot.waitLeft = 1 + bot.random() * 2;
      }
    } else if (bot.state === 'hold') {
      bot.waitLeft -= dt;
      if (bot.waitLeft <= 0) {
        const choices = HOLD_NODES[bot.site];
        const next = choices[Math.floor(bot.random() * choices.length)];
        if (next !== bot.holdNode) {
          bot.holdNode = next;
          setPath(bot, next);
          bot.state = 'patrol';
        } else {
          bot.waitLeft = 2 + bot.random() * 3;
        }
      }
      // Slow scan while holding.
      bot.yaw += dt * 0.25;
    } else if (bot.state === 'patrol') {
      const arrived = followPath(bot, dt, WALK_SPEED);
      if (arrived) {
        bot.state = 'hold';
        bot.waitLeft = 2 + bot.random() * 4;
      }
    } else if (bot.state === 'rush') {
      followPath(bot, dt, RUSH_SPEED);
    }
    bot.group.rotation.y = bot.yaw;
  }

  function fireAt(bot, player, dist) {
    const from = new THREE.Vector3(bot.position.x, bot.position.y + 1.5, bot.position.z);
    const target = new THREE.Vector3(
      player.state.position.x,
      player.state.position.y + player.state.eye - 0.25,
      player.state.position.z,
    );
    // Aim error grows with distance and shrinks the longer the bot has aimed.
    const aim = Math.min(1, bot.aimTime / 0.9);
    const error = (0.012 + dist * 0.0016) * (1.4 - aim);
    target.x += (bot.random() * 2 - 1) * error * dist;
    target.y += (bot.random() * 2 - 1) * error * dist * 0.7;
    target.z += (bot.random() * 2 - 1) * error * dist;
    const dir = target.clone().sub(from).normalize();
    raycaster.set(from, dir);
    raycaster.far = 60;
    const hits = raycaster.intersectObjects(playerHitMeshes.concat(shootables), false);
    const damage = Math.max(8, 26 - dist * 0.35);
    onBotShot(bot, hits, damage);
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.health -= amount;
    bot.defuseProgress = 0;
    if (bot.health <= 0) {
      bot.alive = false;
      bot.health = 0;
      bot.fall = 0;
      return true;
    }
    // Being shot at tells the bot where you are.
    return false;
  }

  function hear(position, time, loud) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.position.x - position.x, bot.position.z - position.z);
      if (d < (loud ? 30 : 12)) {
        bot.hearPos = new THREE.Vector3(position.x, 0, position.z);
        bot.hearAt = time;
        if (bot.state === 'hold' || bot.state === 'patrol') bot.state = 'investigate';
      }
    }
  }

  return {
    bots,
    reset,
    stepAll(dt, time, player, spike, phase) {
      for (const bot of bots) step(bot, dt, time, player, spike, phase);
    },
    damage,
    hear,
    aliveCount() {
      return bots.filter((b) => b.alive).length;
    },
    aimPoint(index) {
      const bot = bots[index % bots.length];
      return new THREE.Vector3(bot.position.x, bot.position.y + 1.1, bot.position.z);
    },
  };
}
