// The look plan, in one place. Emberline is a night foundry: charcoal steel, rusted
// iron, one hot ember orange and one cold cyan for the two bomb sites. Every colour
// in the game is one of these seven; lighting makes the shades in between.
export const PALETTE = {
  canvas: '#101216', // night sky / fog
  floor: '#2e3238', // poured concrete
  steel: '#3d434d', // walls and beams
  iron: '#4d545f', // crates and cover
  rust: '#7a5236', // rusted containers
  ink: '#ece7dd', // pale UI text and tracer white
  muted: '#8b939e', // dim UI text
  ember: '#ff7a1a', // site A, furnace glow, attacker accent
  cyan: '#58c4dc', // site B, coolant glow, defender accent
  danger: '#ff453a', // damage, fuse, low health
  money: '#ffd34d', // economy, buy menu
};

export function hex(name) {
  return PALETTE[name];
}
