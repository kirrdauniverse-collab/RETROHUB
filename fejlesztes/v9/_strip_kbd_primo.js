/**
 * Primo keyboard — 4 groups x 16 bits, ACTIVE HIGH.
 *
 * Mapping from the MAME primo INPUT_PORTS_START (refs/primo):
 *   IN0: y,UP,s,SHIFT,e,UPPER,w,CTR,d,3,x,2,q,1,a,DOWN
 *   IN1: c,-,f,-,r,-,t,7,h,SPACE,b,6,g,5,v,4
 *   IN2: n,8,z,+,u,0,j,HOME,l,-,k,.,m,9,i,,
 *   IN3: ?,*,p,£,o,CLS,-,RETURN,-,LEFT,-,RIGHT,-,-,-,BRK
 */


const PRIMO_SHIFT = { label: 'SHIFT', group: 0, bit: 3, wide: true, word: true };

/** On-screen layout, close to the physical Primo arrangement. */
const PRIMO_LAYOUT = [
  [
    { label: '1', sub: '!', group: 0, bit: 13 },
    { label: '2', sub: '"', group: 0, bit: 11 },
    { label: '3', sub: '#', group: 0, bit: 9 },
    { label: '4', sub: '$', group: 1, bit: 15 },
    { label: '5', sub: '%', group: 1, bit: 13 },
    { label: '6', sub: '&', group: 1, bit: 11 },
    { label: '7', sub: '/', group: 1, bit: 7 },
    { label: '8', sub: '(', group: 2, bit: 1 },
    { label: '9', sub: ')', group: 2, bit: 13 },
    { label: '0', sub: '=', group: 2, bit: 5 },
    { label: '+', sub: '?', group: 2, bit: 3 },
    { label: '?', group: 3, bit: 0 },
  ],
  [
    { label: 'Q', group: 0, bit: 12 },
    { label: 'W', group: 0, bit: 6 },
    { label: 'E', group: 0, bit: 4 },
    { label: 'R', group: 1, bit: 4 },
    { label: 'T', group: 1, bit: 6 },
    { label: 'Y', group: 0, bit: 0 },
    { label: 'U', group: 2, bit: 4 },
    { label: 'I', group: 2, bit: 14 },
    { label: 'O', group: 3, bit: 4 },
    { label: 'P', group: 3, bit: 2 },
    { label: '*', sub: "'", group: 3, bit: 1 },
    { label: '£', group: 3, bit: 3 },
  ],
  [
    { label: 'A', group: 0, bit: 14 },
    { label: 'S', group: 0, bit: 2 },
    { label: 'D', group: 0, bit: 8 },
    { label: 'F', group: 1, bit: 2 },
    { label: 'G', group: 1, bit: 12 },
    { label: 'H', group: 1, bit: 8 },
    { label: 'J', group: 2, bit: 6 },
    { label: 'K', group: 2, bit: 10 },
    { label: 'L', group: 2, bit: 8 },
    { label: '-', sub: '|', group: 2, bit: 9 },
    { label: 'HOME', sub: '><', group: 2, bit: 7, wide: true, word: true },
  ],
  [
    { label: 'UPPER', group: 0, bit: 5, wide: true, word: true },
    { label: 'Z', group: 2, bit: 2 },
    { label: 'X', group: 0, bit: 10 },
    { label: 'C', group: 1, bit: 0 },
    { label: 'V', group: 1, bit: 14 },
    { label: 'B', group: 1, bit: 10 },
    { label: 'N', group: 2, bit: 0 },
    { label: 'M', group: 2, bit: 12 },
    { label: ',', sub: ';', group: 2, bit: 15 },
    { label: '.', sub: ':', group: 2, bit: 11 },
    { label: 'CLS', group: 3, bit: 5, wide: true, word: true },
  ],
  [
    PRIMO_SHIFT,
    { label: 'CTR', group: 0, bit: 7, wide: true, word: true },
    { label: 'SPACE', group: 1, bit: 9, wide: true, word: true },
    { label: 'RETURN', group: 3, bit: 7, wide: true, word: true },
    { label: 'BRK', group: 3, bit: 15, word: true },
    { label: '←', group: 3, bit: 9, word: true },
    { label: '↑', group: 0, bit: 1, word: true },
    { label: '↓', group: 0, bit: 15, word: true },
    { label: '→', group: 3, bit: 11, word: true },
  ],
];

/** Browser KeyboardEvent.code -> matrix position (MAME keycodes). */
const PRIMO_PHYSICAL_MAP = {
  // digits
  Digit1: { group: 0, bit: 13 },
  Digit2: { group: 0, bit: 11 },
  Digit3: { group: 0, bit: 9 },
  Digit4: { group: 1, bit: 15 },
  Digit5: { group: 1, bit: 13 },
  Digit6: { group: 1, bit: 11 },
  Digit7: { group: 1, bit: 7 },
  Digit8: { group: 2, bit: 1 },
  Digit9: { group: 2, bit: 13 },
  Digit0: { group: 2, bit: 5 },
  // letters
  KeyQ: { group: 0, bit: 12 },
  KeyW: { group: 0, bit: 6 },
  KeyE: { group: 0, bit: 4 },
  KeyR: { group: 1, bit: 4 },
  KeyT: { group: 1, bit: 6 },
  KeyY: { group: 0, bit: 0 },
  KeyU: { group: 2, bit: 4 },
  KeyI: { group: 2, bit: 14 },
  KeyO: { group: 3, bit: 4 },
  KeyP: { group: 3, bit: 2 },
  KeyA: { group: 0, bit: 14 },
  KeyS: { group: 0, bit: 2 },
  KeyD: { group: 0, bit: 8 },
  KeyF: { group: 1, bit: 2 },
  KeyG: { group: 1, bit: 12 },
  KeyH: { group: 1, bit: 8 },
  KeyJ: { group: 2, bit: 6 },
  KeyK: { group: 2, bit: 10 },
  KeyL: { group: 2, bit: 8 },
  KeyZ: { group: 2, bit: 2 },
  KeyX: { group: 0, bit: 10 },
  KeyC: { group: 1, bit: 0 },
  KeyV: { group: 1, bit: 14 },
  KeyB: { group: 1, bit: 10 },
  KeyN: { group: 2, bit: 0 },
  KeyM: { group: 2, bit: 12 },
  // punctuation (MAME keycode positions)
  Equal: { group: 3, bit: 0 },     // '?' key
  Minus: { group: 2, bit: 3 },     // '+' key
  Slash: { group: 2, bit: 9 },     // '-' key
  Backslash: { group: 3, bit: 1 }, // '*' key
  Comma: { group: 2, bit: 15 },
  Period: { group: 2, bit: 11 },
  // controls
  Space: { group: 1, bit: 9 },
  Enter: { group: 3, bit: 7 },
  Backspace: { group: 3, bit: 5 },
  Escape: { group: 3, bit: 15 },
  Home: { group: 2, bit: 7 },
  End: { group: 3, bit: 3 },       // '£' key
  ArrowUp: { group: 0, bit: 1 },
  ArrowDown: { group: 0, bit: 15 },
  ArrowLeft: { group: 3, bit: 9 },
  ArrowRight: { group: 3, bit: 11 },
  ShiftLeft: { group: 0, bit: 3 },
  ShiftRight: { group: 0, bit: 3 },
  ControlLeft: { group: 0, bit: 7 },
  ControlRight: { group: 0, bit: 7 },
  AltLeft: { group: 0, bit: 5 },   // UPPER
};
