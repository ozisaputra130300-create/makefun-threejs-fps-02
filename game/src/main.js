// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=start|play|end with &seed=N stages a deterministic
// frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMap } from './map.js';
import { createPlayer } from './player.js';
import { createArsenal } from './weapons.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createGame } from './game.js';
import { mulberry32 } from './rng.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 90);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const map = createMap(scene);
const player = createPlayer(map.colliders, map.playerSpawn);
const arsenal = createArsenal(camera);
const hud = createHud();
const audio = createAudio();
const input = createInput(renderer.domElement, onLockChange);

const game = createGame({
  scene, camera, map, player, arsenal, hud, input, audio,
});
// The bots need the player's hitbox, which the game owns; wire them after.
const bots = createBots(scene, map, game.playerHitMeshes, (bot, hits, damage) => game.onBotShot(bot, hits, damage));
game.setBots(bots);

const body = player.state;
// Debug handle for headless play-tests only (?debug=1): lets a test read
// positions, bot states and the match state without touching the game.
if (params.get('debug')) {
  window.__emberline = { game, bots, player, arsenal, map };
}
let frozen = false;
// Staging hook: transient HUD lines (kill feed, hit marker) expire on real
// time, but a SwiftShader render takes seconds, so re-show them after the
// capture renders finish, just before the shot is declared ready.
let postReady = null;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;

hud.setHealth(100);
hud.setAmmo(arsenal.ammo.mag, arsenal.ammo.reserve);
hud.setMoney(800);
hud.setScore(0, 0);
hud.setAlive(1, 4);
hud.setWeapon(arsenal.current.name);
hud.showOverlay('start', 0);

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  const phase = game.state.phase;
  if (phase === 'menu') game.startMatch();
  else if (phase === 'roundEnd') game.nextRound();
  else if (phase === 'matchEnd') game.startMatch();
  input.requestLock();
});

hud.onBuy((id) => {
  game.buy(id);
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
    hud.hideBuy();
  } else {
    const phase = game.state.phase;
    if (phase === 'buy') hud.showOverlay('buy', 0);
    else if (phase === 'play') hud.showOverlay('paused', 0);
    else if (phase === 'menu') hud.showOverlay('start', 0);
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function step(dt) {
  game.step(dt);
  // Semi-automatic fire: one shot per click.
  const firing = input.state.firing;
  if (firing && !prevFiring && game.state.phase === 'play' && !arsenal.current.auto && arsenal.ready()) {
    game.shoot(arsenal.spread(player.groundSpeed()));
  }
  prevFiring = firing;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    if (frozen) return;
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      frozen = true;
      if (postReady) postReady();
      window.__shotReady = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  game.startMatch();
  if (name === 'start') {
    game.teleportPlayer(0, 12.5, 0, 0);
    settle(20);
    game.aimAt(new THREE.Vector3(0, 1.6, -6));
    hud.showOverlay('start', 0);
  } else if (name === 'play') {
    game.state.phase = 'play';
    game.state.timer = 78;
    hud.hideBuy();
    // Stage the round with the rifle in hand: the shot lands three torso hits
    // on the first Warden, so the kill feed, hit marker and ammo are all real.
    arsenal.owned.vk47 = { mag: 30, reserve: 90 };
    arsenal.select('vk47');
    game.state.money = 800;
    // Two Wardens push mid where the camera can see them; freeze their patrol
    // so the staged frame is exactly the one the camera takes.
    const b0 = bots.bots[0];
    const b1 = bots.bots[1];
    b0.position.set(-4, 0, -1);
    b0.yaw = Math.PI;
    b0.group.rotation.y = b0.yaw;
    b0.state = 'hold';
    b0.waitLeft = 999;
    b1.position.set(1, 0, -2.5);
    b1.yaw = Math.PI;
    b1.group.rotation.y = b1.yaw;
    b1.state = 'hold';
    b1.waitLeft = 999;
    game.teleportPlayer(0, 9, 0, 0);
    scene.updateMatrixWorld(true);
    settle(30);
    // The Wardens engage during staging and can kill the player in ~1 s of
    // sim time, which would fire endRound and put a "Round lost" overlay over
    // the frame. Keep the player alive through staging; the frame shows the
    // round as the player starts it, not mid-beatdown.
    player.state.health = 100;
    const killsBefore = game.state.kills;
    for (let round = 0; round < 3; round += 1) {
      game.aimAt(bots.aimPoint(0));
      syncCamera();
      game.shoot(0);
      settle(8);
      player.state.health = 100;
    }
    settle(6);
    player.state.health = 100;
    hud.hideOverlay();
    if (game.state.kills > killsBefore) {
      // Same line shoot() already wrote; re-show it after the slow renders,
      // when the original 6 s feed lifetime has already expired. Only if the
      // feed is empty, so a fast render does not duplicate the line.
      postReady = () => {
        if (document.getElementById('killfeed').children.length === 0) {
          hud.killfeed('You dropped Warden 1 (VK-47 Rifle)');
        }
        hud.hitMarker(true, 4000);
      };
    }
  } else if (name === 'end') {
    game.state.phase = 'play';
    game.state.timer = 60;
    hud.hideBuy();
    for (const bot of bots.bots) {
      bot.alive = false;
      bot.health = 0;
      bot.fall = 1;
      bot.group.rotation.x = -1.45;
    }
    game.teleportPlayer(0, 6, 0.15, 0);
    settle(20);
    game.state.wins.you = 1;
    game.state.money = 4050;
    game.aimAt(bots.aimPoint(0));
    hud.showOverlay('roundWin', '1 — 0 · All Wardens down');
    hud.banner('Round won', 'All Wardens down');
  }
  hud.setHealth(player.state.health);
  hud.setAmmo(arsenal.ammo.mag, arsenal.ammo.reserve);
  hud.setMoney(game.state.money);
  hud.setScore(game.state.wins.you, game.state.wins.foes);
  hud.setTimer(game.state.timer);
  hud.setAlive(1, bots.aliveCount());
  hud.setWeapon(arsenal.current.name);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
