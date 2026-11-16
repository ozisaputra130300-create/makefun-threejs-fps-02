// Weapons: four guns and a frag grenade. Each gun owns its numbers, its view
// model and its magazine; the match owns the ray and the damage. Spread grows
// with movement, so stopping to aim pays — the core of the gunplay.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', slot: 2, price: 0, auto: false,
    magSize: 12, reserve: 48, fireGap: 0.16, reloadTime: 1.4,
    damage: 26, headDamage: 78, spreadStill: 0.004, spreadMove: 0.02, zoom: 1,
  },
  vk47: {
    id: 'vk47', name: 'VK-47 Rifle', slot: 1, price: 2700, auto: true,
    magSize: 30, reserve: 90, fireGap: 0.1, reloadTime: 2.2,
    damage: 34, headDamage: 100, spreadStill: 0.0025, spreadMove: 0.03, zoom: 1,
  },
  hornet: {
    id: 'hornet', name: 'Hornet SMG', slot: 1, price: 1500, auto: true,
    magSize: 25, reserve: 100, fireGap: 0.07, reloadTime: 1.9,
    damage: 22, headDamage: 66, spreadStill: 0.006, spreadMove: 0.034, zoom: 1,
  },
  longbow: {
    id: 'longbow', name: 'Longbow DMR', slot: 1, price: 4750, auto: false,
    magSize: 5, reserve: 20, fireGap: 0.9, reloadTime: 2.8,
    damage: 80, headDamage: 160, spreadStill: 0.0008, spreadMove: 0.012, zoom: 2.4,
  },
  frag: {
    id: 'frag', name: 'Frag Grenade', slot: 3, price: 300, auto: false,
    magSize: 1, reserve: 1, fireGap: 0.6, reloadTime: 0,
    damage: 90, headDamage: 90, spreadStill: 0, spreadMove: 0, zoom: 1,
  },
};

function buildViewModel(camera, def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.iron), roughness: 0.7, metalness: 0.25 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.5, metalness: 0.2 });
  const group = new THREE.Group();
  if (def.id === 'p9') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.24), body);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), grip);
    handle.position.set(0, -0.09, 0.08);
    group.add(slide, handle);
    group.position.set(0.2, -0.18, -0.34);
  } else if (def.id === 'vk47') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.46), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.44), grip);
    barrel.position.set(0, 0.02, -0.42);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.24), grip);
    stock.position.set(0, -0.02, 0.32);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), accent);
    mag.position.set(0, -0.12, -0.05);
    group.add(receiver, barrel, stock, mag);
    group.position.set(0.24, -0.2, -0.42);
  } else if (def.id === 'hornet') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.34), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), grip);
    barrel.position.set(0, 0.02, -0.3);
    const gripF = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), grip);
    gripF.position.set(0, -0.1, -0.12);
    group.add(receiver, barrel, gripF);
    group.position.set(0.22, -0.19, -0.36);
  } else if (def.id === 'longbow') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.5), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.5), grip);
    barrel.position.set(0, 0.02, -0.48);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 12), grip);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.08, -0.05);
    const bipod = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.02), accent);
    bipod.position.set(0, -0.1, -0.3);
    group.add(receiver, barrel, scope, bipod);
    group.position.set(0.22, -0.21, -0.4);
  } else {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), accent);
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), body);
    pin.position.set(0.05, 0.05, 0);
    group.add(ball, pin);
    group.position.set(0.2, -0.18, -0.34);
  }
  camera.add(group);
  return group;
}

export function createArsenal(camera) {
  const models = {};
  for (const def of Object.values(WEAPONS)) models[def.id] = buildViewModel(camera, def);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.17, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 6);
  flashLight.position.set(0.24, -0.15, -0.6);
  camera.add(flashLight);

  const owned = {
    p9: { mag: WEAPONS.p9.magSize, reserve: WEAPONS.p9.reserve },
  };
  let currentId = 'p9';
  const state = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, zoomed: false };

  function def() { return WEAPONS[currentId]; }
  function ammo() { return owned[currentId]; }

  function showCurrent() {
    for (const [id, model] of Object.entries(models)) model.visible = id === currentId;
  }
  showCurrent();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[currentId];
    model.position.z = (currentId === 'p9' ? -0.34 : currentId === 'frag' ? -0.34 : -0.42) + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.5 * Math.min(1, (def().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const a = ammo();
        const need = def().magSize - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
  }

  return {
    state,
    owned,
    get current() { return def(); },
    get ammo() { return ammo(); },
    get currentId() { return currentId; },
    has(id) { return id in owned; },
    buy(id, money) {
      if (id in owned || WEAPONS[id].price > money) return money;
      owned[id] = { mag: WEAPONS[id].magSize, reserve: WEAPONS[id].reserve };
      return money - WEAPONS[id].price;
    },
    buyGrenade(money) {
      const count = owned.frag ? owned.frag.mag + owned.frag.reserve : 0;
      if (count >= 2 || WEAPONS.frag.price > money) return money;
      if (!owned.frag) owned.frag = { mag: 1, reserve: 0 };
      else if (owned.frag.mag === 0) owned.frag.mag = 1;
      else owned.frag.reserve = 1;
      return money - WEAPONS.frag.price;
    },
    select(id) {
      if (!(id in owned) || id === currentId) return false;
      currentId = id;
      state.reloadLeft = 0;
      state.zoomed = false;
      showCurrent();
      return true;
    },
    selectSlot(slot) {
      const ids = Object.keys(owned).filter((id) => WEAPONS[id].slot === slot);
      if (ids.length === 0) return false;
      if (ids.includes(currentId)) return false;
      return this.select(ids[0]);
    },
    cycle() {
      const ids = Object.keys(owned);
      if (ids.length < 2) return;
      const next = ids[(ids.indexOf(currentId) + 1) % ids.length];
      this.select(next);
    },
    ready() {
      return ammo().mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (ammo().mag <= 0) return false;
      ammo().mag -= 1;
      return true;
    },
    reload() {
      const a = ammo();
      if (state.reloadLeft > 0 || a.mag === def().magSize || a.reserve === 0 || def().reloadTime === 0) return;
      state.reloadLeft = def().reloadTime;
    },
    spread(speed, moving) {
      const d = def();
      const still = d.spreadStill * (state.zoomed ? 0.25 : 1);
      return still + Math.min(1, speed / 5.4) * d.spreadMove + (moving ? 0 : 0);
    },
    refill() {
      for (const [id, a] of Object.entries(owned)) {
        a.mag = WEAPONS[id].magSize;
        a.reserve = WEAPONS[id].reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    setZoom(on) { state.zoomed = on && def().zoom > 1; },
  };
}
