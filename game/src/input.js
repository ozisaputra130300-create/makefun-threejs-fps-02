// Keyboard and mouse, and the pointer lock that turns the mouse into look.
// Plain browser APIs only. The game reads keys by code, so layout does not matter.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = { keys, locked: false, firing: false, lookX: 0, lookY: 0, zoomHeld: false };

  function setKey(event, down) {
    if (down) keys.add(event.code);
    else keys.delete(event.code);
    if (event.code === 'Space') event.preventDefault();
  }

  const pressed = new Set();
  function wasPressed(code) {
    return pressed.has(code);
  }
  function consumePressed(code) {
    pressed.delete(code);
  }

  window.addEventListener('keydown', (event) => {
    if (!event.repeat) pressed.add(event.code);
    setKey(event, true);
  });
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) state.firing = true;
    if (state.locked && event.button === 2) state.zoomHeld = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.zoomHeld = false;
  });
  window.addEventListener('contextmenu', (event) => {
    if (state.locked) event.preventDefault();
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
      state.zoomHeld = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    wasPressed,
    consumePressed,
    requestLock() {
      // Pointer lock can be refused (headless browsers reject it outright);
      // a rejection must not surface as an uncaught console error, and the
      // overlay stays so the player can click to try again.
      let pending;
      try {
        pending = canvas.requestPointerLock();
      } catch {
        return;
      }
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
  };
}
