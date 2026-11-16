// Sound, synthesized live with WebAudio — no audio files to ship. A gunshot is a
// short noise burst through a low-pass filter, a reload is two clicks, a plant
// beep is a square blip, and the round sting is three notes. Muted until the
// player first interacts, as browsers require.
export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noiseBurst(duration, filterFreq, gain) {
    const c = ensure();
    if (!c || !enabled) return;
    const length = Math.max(1, Math.floor(c.sampleRate * duration));
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = c.createBufferSource();
    source.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.value = gain;
    source.connect(filter).connect(g).connect(master);
    source.start();
  }

  function tone(freq, duration, type = 'square', gain = 0.12, when = 0) {
    const c = ensure();
    if (!c || !enabled) return;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = c.createGain();
    const t = c.currentTime + when;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  return {
    unlock() { ensure(); },
    setEnabled(on) { enabled = on; },
    get enabled() { return enabled; },
    shot(kind) {
      if (kind === 'longbow') noiseBurst(0.22, 900, 0.5);
      else if (kind === 'hornet') noiseBurst(0.08, 2400, 0.28);
      else if (kind === 'p9') noiseBurst(0.1, 1800, 0.32);
      else noiseBurst(0.12, 1500, 0.4);
    },
    enemyShot() { noiseBurst(0.1, 1100, 0.16); },
    dryFire() { tone(1200, 0.04, 'square', 0.08); },
    reload() {
      tone(500, 0.05, 'square', 0.08);
      tone(700, 0.05, 'square', 0.08, 0.18);
    },
    hit(kill) {
      tone(kill ? 1400 : 950, 0.06, 'square', 0.14);
      if (kill) tone(1800, 0.09, 'square', 0.12, 0.07);
    },
    hurt() { noiseBurst(0.12, 500, 0.3); },
    plantBeep() { tone(880, 0.09, 'square', 0.12); },
    defuseTick() { tone(660, 0.06, 'square', 0.1); },
    explosion() {
      noiseBurst(0.9, 300, 0.8);
      tone(60, 0.7, 'sine', 0.5);
    },
    roundWin() {
      tone(523, 0.16, 'triangle', 0.16);
      tone(659, 0.16, 'triangle', 0.16, 0.14);
      tone(784, 0.3, 'triangle', 0.18, 0.28);
    },
    roundLoss() {
      tone(392, 0.2, 'triangle', 0.16);
      tone(311, 0.2, 'triangle', 0.16, 0.18);
      tone(233, 0.4, 'triangle', 0.16, 0.36);
    },
    buy() { tone(1046, 0.07, 'square', 0.1); },
    click() { tone(800, 0.04, 'square', 0.08); },
  };
}
