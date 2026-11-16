// Emberline's match: one striker against four Wardens, first to 5 rounds. The
// single state store lives here — phase, round, money, spike, grenades — and the
// fixed-step loop in main.js calls step() sixty times a second. Rendering never
// writes to it; only this module and the bots move it.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { PALETTE } from './palette.js';

const ROUND_SECONDS = 100;
const BUY_SECONDS = 12;
const PLANT_SECONDS = 3.5;
const FUSE_SECONDS = 35;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const KILL_REWARD = 300;
const WIN_REWARD = 3250;
const LOSS_REWARD = 1900;
const START_MONEY = 800;

export function createGame(deps) {
  const { scene, camera, map, player, arsenal, hud, input, audio } = deps;
  // The bots are wired after creation: they need the hitbox this module owns.
  let bots = deps.bots || null;
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  const direction = new THREE.Vector3();
  const muzzle = new THREE.Vector3();

  // Invisible hitbox the bots shoot at: a body box and a head sphere.
  const hitBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.35, 0.7),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitBody.userData.part = 'torso';
  const hitHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 6),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitHead.userData.part = 'head';
  scene.add(hitBody, hitHead);
  const playerHitMeshes = [hitBody, hitHead];

  // Pooled tracers and impact sparks: no new objects in the hot loop.
  const tracers = [];
  for (let i = 0; i < 12; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0,
    }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;
  const sparks = [];
  for (let i = 0; i < 8; i += 1) {
    const spark = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.09),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.money), transparent: true, opacity: 0 }),
    );
    spark.visible = false;
    scene.add(spark);
    sparks.push({ mesh: spark, life: 0 });
  }
  let sparkIndex = 0;
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 22, 1.6);
  scene.add(boomLight);
  const boomShell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0, depthWrite: false }),
  );
  boomShell.visible = false;
  scene.add(boomShell);
  let boomLife = 0;

  const state = {
    phase: 'menu',
    round: 1,
    wins: { you: 0, foes: 0 },
    money: START_MONEY,
    timer: BUY_SECONDS,
    spike: { state: 'carried', site: null, fuse: 0, plantProgress: 0 },
    grenades: [],
    time: 0,
    plantSite: null,
    kills: 0,
    deaths: 0,
  };

  function syncPlayerHitbox() {
    const p = player.state;
    hitBody.position.set(p.position.x, p.position.y + 0.85, p.position.z);
    hitHead.position.set(p.position.x, p.position.y + p.eye + 0.05, p.position.z);
  }

  function spawnTracer(from, to) {
    const t = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % tracers.length;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.material.opacity = 0.85;
    t.life = 0.09;
  }

  function spawnSpark(point) {
    const s = sparks[sparkIndex];
    sparkIndex = (sparkIndex + 1) % sparks.length;
    s.mesh.position.copy(point);
    s.mesh.visible = true;
    s.mesh.material.opacity = 0.95;
    s.mesh.scale.setScalar(1);
    s.life = 0.22;
  }

  function muzzlePoint() {
    camera.getWorldPosition(muzzle);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    return muzzle.addScaledVector(forward, 0.5).addScaledVector(right, 0.22).add(new THREE.Vector3(0, -0.14, 0));
  }

  function shoot(spread) {
    const def = arsenal.current;
    if (def.id === 'frag') {
      throwGrenade();
      return;
    }
    if (!arsenal.takeRound()) {
      audio.dryFire();
      return;
    }
    camera.getWorldDirection(direction);
    direction.x += (Math.random() * 2 - 1) * spread;
    direction.y += (Math.random() * 2 - 1) * spread;
    direction.z += (Math.random() * 2 - 1) * spread;
    direction.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, direction);
    const botMeshes = [];
    for (const bot of bots.bots) {
      if (bot.alive) botMeshes.push(bot.torso, bot.head);
    }
    const hits = raycaster.intersectObjects(map.shootables.concat(botMeshes), false);
    const from = muzzlePoint();
    if (hits.length > 0) {
      const hit = hits[0];
      spawnTracer(from, hit.point);
      const bot = hit.object.userData.bot;
      if (bot) {
        const killed = bots.damage(bot, hit.object.userData.part === 'head' ? def.headDamage : def.damage);
        hud.hitMarker(killed);
        audio.hit(killed);
        if (killed) {
          state.kills += 1;
          state.money += KILL_REWARD;
          hud.killfeed(`You dropped Warden ${bot.index + 1} (${hit.object.userData.part === 'head' ? 'headshot' : def.name})`);
          hud.setMoney(state.money);
          if (bots.aliveCount() === 0) {
            endRound(true, state.spike.state === 'planted' ? 'Spike armed, yard clear' : 'All Wardens down');
          }
        }
      } else {
        spawnSpark(hit.point);
      }
    } else {
      spawnTracer(from, camera.position.clone().addScaledVector(direction, 60));
    }
    arsenal.pullTrigger();
    player.recoil(0.009 + Math.random() * 0.005, (Math.random() * 2 - 1) * 0.004);
    audio.shot(def.id);
    bots.hear(player.state.position, state.time, !player.state.sneaking);
    hud.setAmmo(arsenal.ammo.mag, arsenal.ammo.reserve);
  }

  function throwGrenade() {
    if (!arsenal.takeRound()) {
      audio.dryFire();
      return;
    }
    camera.getWorldDirection(direction);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.4, metalness: 0.5 }),
    );
    mesh.position.copy(camera.position).addScaledVector(direction, 0.4);
    scene.add(mesh);
    state.grenades.push({
      mesh,
      velocity: direction.clone().multiplyScalar(15).add(new THREE.Vector3(0, 3.2, 0)),
      fuse: 2.1,
    });
    arsenal.pullTrigger();
    audio.shot('frag');
  }

  function explodeGrenade(g) {
    scene.remove(g.mesh);
    const center = g.mesh.position.clone();
    boomLight.position.copy(center);
    boomLight.intensity = 60;
    boomShell.position.copy(center);
    boomShell.visible = true;
    boomShell.scale.setScalar(0.2);
    boomLife = 0.45;
    audio.explosion();
    for (const bot of bots.bots) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.position.x - center.x, bot.position.z - center.z) + Math.abs(bot.position.y - center.y) * 0.5;
      if (d < 6.5) {
        const damage = Math.round(90 - (d / 6.5) * 72);
        const killed = bots.damage(bot, damage);
        if (killed) {
          state.kills += 1;
          state.money += KILL_REWARD;
          hud.killfeed(`You dropped Warden ${bot.index + 1} (frag)`);
          hud.setMoney(state.money);
        }
      }
    }
    const pd = Math.hypot(player.state.position.x - center.x, player.state.position.z - center.z);
    if (pd < 4) hurtPlayer(Math.round((1 - pd / 4) * 40));
    if (bots.aliveCount() === 0 && state.phase === 'play') {
      endRound(true, 'All Wardens down');
    }
  }

  function hurtPlayer(amount, headshot = false) {
    if (state.phase !== 'play' && state.phase !== 'buy') return;
    player.state.health -= headshot ? amount * 1.5 : amount;
    hud.setHealth(player.state.health);
    hud.damageFlash();
    audio.hurt();
    if (player.state.health <= 0) {
      player.state.health = 0;
      state.deaths += 1;
      endRound(false, 'Striker down');
    }
  }

  function onBotShot(bot, hits, damage) {
    audio.enemyShot();
    const from = new THREE.Vector3(bot.position.x, bot.position.y + 1.45, bot.position.z);
    if (hits.length > 0 && (hits[0].object === hitBody || hits[0].object === hitHead)) {
      spawnTracer(from, hits[0].point);
      hurtPlayer(damage, hits[0].object === hitHead);
    } else if (hits.length > 0) {
      spawnTracer(from, hits[0].point);
      spawnSpark(hits[0].point);
    } else {
      spawnTracer(from, from.clone().add(new THREE.Vector3(0, 0, -1)));
    }
  }

  function siteAt(position) {
    for (const site of Object.values(map.sites)) {
      if (site.zone.containsPoint(new THREE.Vector3(position.x, 0.5, position.z))) return site;
    }
    return null;
  }

  function startRound() {
    bots.reset();
    player.reset();
    arsenal.refill();
    for (const g of state.grenades) scene.remove(g.mesh);
    state.grenades = [];
    state.spike = { state: 'carried', site: null, fuse: 0, plantProgress: 0 };
    state.timer = BUY_SECONDS;
    state.phase = 'buy';
    hud.setHealth(player.state.health);
    hud.setAmmo(arsenal.ammo.mag, arsenal.ammo.reserve);
    hud.setMoney(state.money);
    hud.setScore(state.wins.you, state.wins.foes);
    hud.setAlive(1, bots.aliveCount());
    hud.setWeapon(arsenal.current.name);
    hud.setSpike(null, 0);
    hud.setSite('Ember Yard');
    hud.banner(`Round ${state.round}`, state.round === 1 ? 'Buy up — B opens the market' : 'Buy up — B opens the market');
    hud.showBuy(buyItems(), state.money);
  }

  function buyItems() {
    const list = [];
    const defs = [
      { id: 'vk47', key: '1', name: 'VK-47 Rifle' },
      { id: 'hornet', key: '2', name: 'Hornet SMG' },
      { id: 'longbow', key: '3', name: 'Longbow DMR' },
      { id: 'frag', key: '4', name: 'Frag Grenade' },
    ];
    for (const d of defs) {
      const owned = arsenal.has(d.id);
      const fragCount = d.id === 'frag' && arsenal.owned.frag ? arsenal.owned.frag.mag + arsenal.owned.frag.reserve : 0;
      list.push({
        ...d,
        price: WEAPONS[d.id].price,
        owned: d.id === 'frag' ? fragCount >= 2 : owned,
        disabled: d.id === 'frag' ? fragCount >= 2 || state.money < WEAPONS.frag.price
          : owned || state.money < WEAPONS[d.id].price,
      });
    }
    return list;
  }

  function buy(id) {
    if (state.phase !== 'buy') return;
    if (id === 'frag') {
      const before = state.money;
      state.money = arsenal.buyGrenade(state.money);
      if (state.money !== before) audio.buy();
    } else {
      const before = state.money;
      state.money = arsenal.buy(id, state.money);
      if (state.money !== before) {
        audio.buy();
        arsenal.select(id);
        hud.setWeapon(arsenal.current.name);
      }
    }
    hud.setMoney(state.money);
    hud.setAmmo(arsenal.ammo.mag, arsenal.ammo.reserve);
    hud.showBuy(buyItems(), state.money);
  }

  function endRound(won, reason) {
    if (state.phase !== 'play' && state.phase !== 'buy') return;
    state.phase = 'roundEnd';
    if (won) {
      state.wins.you += 1;
      state.money += WIN_REWARD;
    } else {
      state.wins.foes += 1;
      state.money += LOSS_REWARD;
    }
    hud.setScore(state.wins.you, state.wins.foes);
    hud.setMoney(state.money);
    hud.hideBuy();
    hud.setSpike(null, 0);
    if (won) audio.roundWin();
    else audio.roundLoss();
    hud.banner(won ? 'Round won' : 'Round lost', reason);
    if (state.wins.you >= WIN_ROUNDS || state.wins.foes >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      endMatch(state.wins.you > state.wins.foes);
    } else {
      hud.showOverlay(won ? 'roundWin' : 'roundLoss', `${state.wins.you} — ${state.wins.foes} · ${reason}`);
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }

  function endMatch(youWon) {
    state.phase = 'matchEnd';
    hud.showOverlay(youWon ? 'matchWin' : 'matchLoss', `${state.wins.you} — ${state.wins.foes} · ${state.kills} eliminations`);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function startMatch() {
    state.round = 1;
    state.wins = { you: 0, foes: 0 };
    state.money = START_MONEY;
    state.kills = 0;
    state.deaths = 0;
    startRound();
  }

  function nextRound() {
    state.round += 1;
    startRound();
  }

  function step(dt) {
    state.time += dt;
    syncPlayerHitbox();
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.85;
      }
    }
    for (const s of sparks) {
      if (s.life > 0) {
        s.life -= dt;
        s.mesh.scale.setScalar(1 + (0.22 - s.life) * 6);
        s.mesh.material.opacity = Math.max(0, s.life / 0.22) * 0.95;
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
    if (boomLife > 0) {
      boomLife -= dt;
      boomLight.intensity = Math.max(0, boomLife / 0.45) * 60;
      boomShell.scale.setScalar(0.2 + (0.45 - boomLife) * 22);
      boomShell.material.opacity = Math.max(0, boomLife / 0.45) * 0.5;
      if (boomLife <= 0) boomShell.visible = false;
    }
    for (let i = state.grenades.length - 1; i >= 0; i -= 1) {
      const g = state.grenades[i];
      g.velocity.y -= 14 * dt;
      g.mesh.position.addScaledVector(g.velocity, dt);
      if (g.mesh.position.y < 0.07) {
        g.mesh.position.y = 0.07;
        g.velocity.y = Math.abs(g.velocity.y) * 0.35;
        g.velocity.x *= 0.6;
        g.velocity.z *= 0.6;
      }
      g.fuse -= dt;
      if (g.fuse <= 0) {
        state.grenades.splice(i, 1);
        explodeGrenade(g);
      }
    }

    if (state.phase === 'menu' || state.phase === 'roundEnd' || state.phase === 'matchEnd') return;

    // Timers.
    state.timer -= dt;
    if (state.phase === 'buy' && state.timer <= 0) {
      state.phase = 'play';
      state.timer = ROUND_SECONDS;
      hud.hideBuy();
      hud.banner('Go', state.spike.state === 'carried' ? 'Plant the spike at A or B' : '');
    } else if (state.phase === 'play' && state.timer <= 0) {
      if (state.spike.state === 'planted') {
        // Fuse already decides the round; timer expiry with a live spike is a win.
        endRound(true, 'Spike detonated the yard');
        return;
      }
      endRound(false, 'Time expired — spike never planted');
      return;
    }

    // Spike fuse.
    if (state.spike.state === 'planted') {
      state.spike.fuse -= dt;
      hud.setSpike('planted', 1 - state.spike.fuse / FUSE_SECONDS);
      if (state.spike.fuse <= 0) {
        state.spike.state = 'detonated';
        endRound(true, 'Spike detonated');
        return;
      }
    }

    // Defuse completion is flagged by the bots.
    for (const bot of bots.bots) {
      if (bot.defuseDone) {
        state.spike.state = 'defused';
        endRound(false, 'Warden defused the spike');
        return;
      }
    }

    // Planting: hold E inside a site, standing still.
    const site = siteAt(player.state.position);
    hud.setSite(site ? `${site.id} — ${site.name}` : state.phase === 'buy' ? 'Ember Yard' : 'Mid yard');
    if (state.phase === 'play' && state.spike.state === 'carried' && site) {
      if (input.state.keys.has('KeyE') && player.groundSpeed() < 1.2) {
        state.spike.plantProgress += dt;
        hud.setSpike('planting', state.spike.plantProgress / PLANT_SECONDS);
        if (Math.floor(state.spike.plantProgress * 2) !== Math.floor((state.spike.plantProgress - dt) * 2)) audio.plantBeep();
        if (state.spike.plantProgress >= PLANT_SECONDS) {
          state.spike.state = 'planted';
          state.spike.site = site.id;
          state.spike.fuse = FUSE_SECONDS;
          state.spike.plantProgress = 0;
          hud.killfeed(`Spike planted at ${site.id} — ${site.name}`);
          audio.plantBeep();
        }
      } else {
        state.spike.plantProgress = Math.max(0, state.spike.plantProgress - dt * 2);
        if (state.spike.state === 'carried') hud.setSpike(null, 0);
      }
    }

    // A defusing bot shows on the spike bar.
    const defusing = bots.bots.find((b) => b.alive && b.state === 'defuse');
    if (defusing && state.spike.state === 'planted') {
      hud.setSpike('defusing', (defusing.defuseProgress || 0) / 5);
    }

    // Movement and combat.
    player.step(dt, input.state.keys);
    bots.stepAll(dt, state.time, player, state.spike, state.phase);
    const look = input.takeLook();
    player.look(look.x, look.y);
    arsenal.setZoom(input.state.zoomHeld && input.state.locked);
    camera.fov += ((arsenal.state.zoomed ? 74 / arsenal.current.zoom : 74) - camera.fov) * Math.min(1, dt * 12);
    camera.updateProjectionMatrix();
    if (state.phase === 'play' && input.state.firing && arsenal.current.auto && arsenal.ready()) {
      shoot(arsenal.spread(player.groundSpeed()));
    }
    if (input.wasPressed('KeyR')) {
      arsenal.reload();
      input.consumePressed('KeyR');
    }
    if (input.wasPressed('KeyB') && state.phase === 'buy') {
      hud.showBuy(buyItems(), state.money);
      if (document.pointerLockElement) document.exitPointerLock();
      input.consumePressed('KeyB');
    }
    if (input.wasPressed('Digit1')) { arsenal.selectSlot(1); input.consumePressed('Digit1'); }
    if (input.wasPressed('Digit2')) { arsenal.selectSlot(2); input.consumePressed('Digit2'); }
    if (input.wasPressed('Digit3')) { arsenal.selectSlot(3); input.consumePressed('Digit3'); }
    if (input.wasPressed('KeyQ')) { arsenal.cycle(); input.consumePressed('KeyQ'); }
    if (input.wasPressed('KeyG') && arsenal.currentId === 'frag') {
      if (arsenal.ready()) shoot(0);
      input.consumePressed('KeyG');
    }

    hud.setHealth(player.state.health);
    hud.setAmmo(arsenal.ammo.mag, arsenal.ammo.reserve);
    hud.setTimer(state.timer);
    hud.setAlive(1, bots.aliveCount());
    hud.setWeapon(arsenal.current.name);
    const spreadPx = 10 + arsenal.spread(player.groundSpeed()) * 900;
    hud.setCrosshairSpread(spreadPx);
  }

  return {
    state,
    playerHitMeshes,
    setBots(b) { bots = b; },
    startMatch,
    startRound,
    nextRound,
    buy,
    shoot,
    hurtPlayer,
    onBotShot,
    step,
    siteAt,
    // Staging helpers for deterministic screenshots.
    teleportPlayer(x, z, yaw, pitch) {
      player.state.position.set(x, 0, z);
      player.state.velocity.set(0, 0, 0);
      player.state.yaw = yaw;
      player.state.pitch = pitch;
    },
    aimAt(point) {
      const p = player.state;
      const dx = point.x - p.position.x;
      const dy = point.y - (p.position.y + p.eye);
      const dz = point.z - p.position.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      p.yaw = Math.atan2(-dx, -dz);
      p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
    },
  };
}
