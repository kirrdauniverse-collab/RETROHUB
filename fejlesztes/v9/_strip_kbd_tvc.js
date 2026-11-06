/**
 * TVC keyboard matrix — from the MAME driver's INPUT_PORTS (tvc.cpp).
 *
 * The ROM selects one of 16 lines with port $03 (bits 0-3) and reads the
 * 8-key row back from port $58. Bits are ACTIVE LOW (0 = pressed).
 * Lines 9-15 have no keys (read 0xFF).
 */


/** Hungarian accent keys (their own matrix positions). */
const ACCENTS = [
  { label: 'Í', line: 0, bit: 5 },
  { label: 'ü', line: 1, bit: 3 },
  { label: 'ó', line: 1, bit: 5 },
  { label: 'ö', line: 1, bit: 6 },
  { label: 'ő', line: 3, bit: 3 },
  { label: 'ú', line: 3, bit: 5 },
  { label: 'á', line: 5, bit: 3 },
  { label: 'ű', line: 5, bit: 5 },
  { label: 'é', line: 5, bit: 6 },
];

/** Main QWERTZ block for the on-screen keyboard. */
const TVC_ROWS = [
  [
    { label: 'ESC', line: 7, bit: 3 },
    { label: '1', sub: '!', line: 0, bit: 6 },
    { label: '2', sub: '"', line: 0, bit: 2 },
    { label: '3', sub: '#', line: 0, bit: 1 },
    { label: '4', sub: '$', line: 0, bit: 7 },
    { label: '5', sub: '%', line: 0, bit: 0 },
    { label: '6', sub: '&', line: 0, bit: 4 },
    { label: '7', sub: '=', line: 1, bit: 7 },
    { label: '8', sub: '(', line: 1, bit: 1 },
    { label: '9', sub: ')', line: 1, bit: 2 },
    { label: '0', sub: '@', line: 0, bit: 3 },
    { label: '-', sub: '_', line: 7, bit: 6 },
    { label: '⌫', line: 5, bit: 0, wide: true },
  ],
  [
    { label: 'TAB', line: 2, bit: 5, wide: true },
    { label: 'Q', line: 2, bit: 6 },
    { label: 'W', line: 2, bit: 2 },
    { label: 'E', line: 2, bit: 1 },
    { label: 'R', line: 2, bit: 7 },
    { label: 'T', line: 2, bit: 0 },
    { label: 'Z', line: 2, bit: 4 },
    { label: 'U', line: 3, bit: 7 },
    { label: 'I', line: 3, bit: 1 },
    { label: 'O', line: 3, bit: 2 },
    { label: 'P', line: 3, bit: 6 },
    { label: '[', sub: '{', line: 3, bit: 4 },
    { label: ']', sub: '}', line: 3, bit: 0 },
    { label: '⏎', line: 5, bit: 4, wide: true },
  ],
  [
    { label: 'CAPS', line: 6, bit: 5, wide: true },
    { label: 'A', line: 4, bit: 6 },
    { label: 'S', line: 4, bit: 2 },
    { label: 'D', line: 4, bit: 1 },
    { label: 'F', line: 4, bit: 7 },
    { label: 'G', line: 4, bit: 0 },
    { label: 'H', line: 4, bit: 4 },
    { label: 'J', line: 5, bit: 7 },
    { label: 'K', line: 5, bit: 1 },
    { label: 'L', line: 5, bit: 2 },
    { label: ';', sub: ':', line: 2, bit: 3 },
    { label: '"', sub: "'", line: 4, bit: 3 },
    { label: '^', line: 1, bit: 0 },
  ],
  [
    { label: 'SHIFT', line: 6, bit: 3, wide: true },
    { label: 'Y', line: 6, bit: 6 },
    { label: 'X', line: 6, bit: 2 },
    { label: 'C', line: 6, bit: 1 },
    { label: 'V', line: 6, bit: 7 },
    { label: 'B', line: 6, bit: 0 },
    { label: 'N', line: 6, bit: 4 },
    { label: 'M', line: 7, bit: 7 },
    { label: ',', sub: '?', line: 7, bit: 1 },
    { label: '.', sub: ':', line: 7, bit: 2 },
    { label: '\\', sub: '|', line: 4, bit: 3 },
    { label: '←', line: 8, bit: 6 },
    { label: '↓', line: 8, bit: 2 },
    { label: '→', line: 8, bit: 5 },
  ],
  [
    { label: 'CTRL', line: 7, bit: 4, wide: true },
    { label: 'ALT', line: 7, bit: 0, wide: true },
    { label: 'SPACE', line: 7, bit: 5, wide: true },
    { label: 'INS', line: 8, bit: 0 },
    { label: '↑', line: 8, bit: 1 },
    { label: '<', line: 4, bit: 5 },
    { label: '*', line: 1, bit: 4 },
    { label: '=', line: 7, bit: 6 },
  ],
];

/** Full on-screen layout: main rows + a compact accent row. */
const TVC_LAYOUT = [...TVC_ROWS, ACCENTS];

/**
 * Physical keyboard mapping: KeyboardEvent.code -> matrix position.
 * The MAME driver maps host keys to TVC keys by character, so the
 * Hungarian Y/Z swap is handled by mapping KeyY->Z and KeyZ->Y
 * positions accordingly (TVC is QWERTZ).
 */
const TVC_PHYSICAL_MAP = {
  Escape: { line: 7, bit: 3 },
  Backspace: { line: 5, bit: 0 },
  Enter: { line: 5, bit: 4 },
  Tab: { line: 2, bit: 5 },
  CapsLock: { line: 6, bit: 5 },
  ShiftLeft: { line: 6, bit: 3 },
  ShiftRight: { line: 6, bit: 3 },
  ControlLeft: { line: 7, bit: 4 },
  ControlRight: { line: 7, bit: 4 },
  AltLeft: { line: 7, bit: 0 },
  AltRight: { line: 7, bit: 0 },
  Space: { line: 7, bit: 5 },
  Insert: { line: 8, bit: 0 },
  ArrowUp: { line: 8, bit: 1 },
  ArrowDown: { line: 8, bit: 2 },
  ArrowLeft: { line: 8, bit: 6 },
  ArrowRight: { line: 8, bit: 5 },

  Digit1: { line: 0, bit: 6 }, Digit2: { line: 0, bit: 2 }, Digit3: { line: 0, bit: 1 },
  Digit4: { line: 0, bit: 7 }, Digit5: { line: 0, bit: 0 }, Digit6: { line: 0, bit: 4 },
  Digit7: { line: 1, bit: 7 }, Digit8: { line: 1, bit: 1 }, Digit9: { line: 1, bit: 2 },
  Digit0: { line: 0, bit: 3 },
  Minus: { line: 7, bit: 6 },
  Equal: { line: 7, bit: 6 },

  // QWERTZ: the TVC 'Z' sits where a QWERTY 'Z' is on the MAME code
  // mapping (KEYCODE_Z -> TVC 'Z'); same for Y.
  KeyQ: { line: 2, bit: 6 }, KeyW: { line: 2, bit: 2 }, KeyE: { line: 2, bit: 1 },
  KeyR: { line: 2, bit: 7 }, KeyT: { line: 2, bit: 0 }, KeyY: { line: 6, bit: 6 },
  KeyU: { line: 3, bit: 7 }, KeyI: { line: 3, bit: 1 }, KeyO: { line: 3, bit: 2 },
  KeyP: { line: 3, bit: 6 },
  BracketLeft: { line: 3, bit: 4 }, BracketRight: { line: 3, bit: 0 },
  Semicolon: { line: 2, bit: 3 }, Quote: { line: 4, bit: 3 },
  Backslash: { line: 4, bit: 3 },
  Comma: { line: 7, bit: 1 }, Period: { line: 7, bit: 2 }, Slash: { line: 7, bit: 6 },

  KeyA: { line: 4, bit: 6 }, KeyS: { line: 4, bit: 2 }, KeyD: { line: 4, bit: 1 },
  KeyF: { line: 4, bit: 7 }, KeyG: { line: 4, bit: 0 }, KeyH: { line: 4, bit: 4 },
  KeyJ: { line: 5, bit: 7 }, KeyK: { line: 5, bit: 1 }, KeyL: { line: 5, bit: 2 },

  KeyZ: { line: 2, bit: 4 }, KeyX: { line: 6, bit: 2 }, KeyC: { line: 6, bit: 1 },
  KeyV: { line: 6, bit: 7 }, KeyB: { line: 6, bit: 0 }, KeyN: { line: 6, bit: 4 },
  KeyM: { line: 7, bit: 7 },
};
