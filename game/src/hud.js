// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score, kill
// feed, spike progress, buy menu and the overlay panels. It never touches the
// simulation; the match pushes numbers in and reads callbacks out.
const COPY = {
  start: {
    title: 'Emberline',
    copy: 'One striker against four Wardens in the Kestrel Works. Plant the spike at the Furnace or the Silos — or drop every defender. First to 5 rounds takes the yard.',
    action: 'Click to play',
  },
  paused: {
    title: 'Emberline',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  buy: {
    title: 'Emberline',
    copy: 'Buy phase — spend your money, then click to enter the yard. B reopens the market.',
    action: 'Enter the yard',
  },
  roundWin: {
    title: 'Round won',
    copy: '',
    action: 'Next round',
  },
  roundLoss: {
    title: 'Round lost',
    copy: '',
    action: 'Next round',
  },
  matchWin: {
    title: 'Yard taken',
    copy: '',
    action: 'Play again',
  },
  matchLoss: {
    title: 'Yard held',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayCopy = $('overlay-copy');
  const playButton = $('play');
  const buyMenu = $('buy-menu');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreValue = $('score-value');
  const aliveValue = $('alive-value');
  const killfeed = $('killfeed');
  const spikeBar = $('spike');
  const spikeLabel = $('spike-label');
  const spikeFill = $('spike-fill');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const vignette = $('damage-vignette');
  const siteTag = $('site-tag');
  const weaponName = $('weapon-name');

  let hitTimer = 0;
  let bannerTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastHealth = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastAlive = '';
  let lastWeapon = '';

  function setAmmo(mag, reserve) {
    if (mag === lastMag && reserve === lastReserve) return;
    lastMag = mag;
    lastReserve = reserve;
    ammoMag.textContent = String(mag);
    ammoReserve.textContent = `/ ${reserve}`;
    $('ammo').classList.toggle('empty', mag === 0);
  }

  return {
    setHealth(value) {
      const v = Math.max(0, Math.round(value));
      if (v === lastHealth) return;
      lastHealth = v;
      healthFill.style.width = `${v}%`;
      healthValue.textContent = String(v);
      healthFill.classList.toggle('low', v <= 30);
    },
    setAmmo,
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
    },
    setTimer(seconds) {
      const text = seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : `${Math.ceil(seconds)}`;
      if (text === lastTimer) return;
      lastTimer = text;
      timerValue.textContent = text;
      timerValue.classList.toggle('urgent', seconds <= 10);
    },
    setScore(you, foes) {
      const text = `${you} — ${foes}`;
      if (text === lastScore) return;
      lastScore = text;
      scoreValue.textContent = text;
    },
    setAlive(youAlive, foesAlive) {
      const text = `${youAlive} v ${foesAlive}`;
      if (text === lastAlive) return;
      lastAlive = text;
      aliveValue.textContent = text;
    },
    setWeapon(name) {
      if (name === lastWeapon) return;
      lastWeapon = name;
      weaponName.textContent = name;
    },
    setSite(text) {
      siteTag.textContent = text;
    },
    setCrosshairSpread(px) {
      crosshair.style.setProperty('--spread', `${Math.round(px)}px`);
    },
    hitMarker(kill, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', kill);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    killfeed(text) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.lastChild.remove();
      setTimeout(() => line.remove(), 6000);
    },
    banner(title, sub, holdMs = 2200) {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), holdMs);
    },
    setSpike(mode, progress) {
      if (!mode) {
        spikeBar.hidden = true;
        return;
      }
      spikeBar.hidden = false;
      spikeLabel.textContent = mode === 'planting' ? 'PLANTING SPIKE'
        : mode === 'planted' ? 'SPIKE PLANTED — FUSE RUNNING'
          : mode === 'defusing' ? 'WARDEN DEFUSING THE SPIKE' : mode;
      spikeFill.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
      spikeFill.classList.toggle('danger', mode === 'defusing');
    },
    showBuy(items, money) {
      buyMoney.textContent = `$${money}`;
      buyList.innerHTML = '';
      for (const item of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        row.disabled = item.disabled;
        row.dataset.id = item.id;
        row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-price">${item.owned ? 'OWNED' : '$' + item.price}</span>`;
        buyList.appendChild(row);
      }
      buyMenu.hidden = false;
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    showOverlay(mode, score) {
      const text = COPY[mode];
      overlayTitle.textContent = text.title;
      overlayCopy.textContent = mode === 'roundWin' || mode === 'roundLoss' || mode === 'matchWin' || mode === 'matchLoss'
        ? `${score} — click to continue.`
        : text.copy;
      playButton.textContent = text.action;
      overlay.hidden = false;
      playButton.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      playButton.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyList.addEventListener('click', (event) => {
        const row = event.target.closest('.buy-row');
        if (row && !row.disabled) handler(row.dataset.id);
      });
    },
  };
}
