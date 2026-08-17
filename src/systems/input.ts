import { Vector2 } from '../game/types';

export interface InputState {
  keys: Set<string>;
  mousePosition: Vector2;
  mouseDirection: Vector2;
  click: boolean;
  clickConsumed: boolean;
  leftStick: Vector2;
  rightStick: Vector2;
  aPressed: boolean;
  aConsumed: boolean;
  navLeft: boolean;
  navLeftConsumed: boolean;
  navRight: boolean;
  navRightConsumed: boolean;
  lastManualAimTime: number;
}

export function createInputState(): InputState {
  return {
    keys: new Set(),
    mousePosition: { x: 0, y: 0 },
    mouseDirection: { x: 1, y: 0 },
    click: false,
    clickConsumed: false,
    leftStick: { x: 0, y: 0 },
    rightStick: { x: 0, y: 0 },
    aPressed: false,
    aConsumed: false,
    navLeft: false,
    navLeftConsumed: false,
    navRight: false,
    navRightConsumed: false,
    lastManualAimTime: -999,
  };
}

const DEAD_ZONE = 0.15;

export function pollGamepad(input: InputState): void {
  const gamepads = navigator.getGamepads?.();
  if (!gamepads) return;
  const gp = gamepads[0];
  if (!gp) return;

  let lx = gp.axes[0] ?? 0;
  let ly = gp.axes[1] ?? 0;
  if (Math.abs(lx) < DEAD_ZONE) lx = 0;
  if (Math.abs(ly) < DEAD_ZONE) ly = 0;
  const lLen = Math.sqrt(lx * lx + ly * ly);
  input.leftStick = lLen > 1 ? { x: lx / lLen, y: ly / lLen } : { x: lx, y: ly };

  let rx = gp.axes[2] ?? 0;
  let ry = gp.axes[3] ?? 0;
  if (Math.abs(rx) < DEAD_ZONE) rx = 0;
  if (Math.abs(ry) < DEAD_ZONE) ry = 0;
  const rLen = Math.sqrt(rx * rx + ry * ry);
  input.rightStick = rLen > 1 ? { x: rx / rLen, y: ry / rLen } : { x: rx, y: ry };
  if (rx !== 0 || ry !== 0) input.lastManualAimTime = performance.now() / 1000;

  if (gp.buttons[0]?.pressed) {
    if (!input.aConsumed) input.aPressed = true;
  } else {
    input.aPressed = false;
    input.aConsumed = false;
  }

  if (gp.buttons[14]?.pressed || gp.buttons[15]?.pressed) {
    const dLeft = gp.buttons[14]?.pressed ?? false;
    const dRight = gp.buttons[15]?.pressed ?? false;
    if (dLeft && !input.navLeftConsumed) input.navLeft = true;
    if (dRight && !input.navRightConsumed) input.navRight = true;
  } else {
    input.navLeft = false;
    input.navRight = false;
    input.navLeftConsumed = false;
    input.navRightConsumed = false;
  }
}

let getCameraOffset: () => { x: number; y: number } = () => ({ x: 0, y: 0 });

export function setupInputHandlers(
  canvas: HTMLCanvasElement,
  input: InputState,
  getOffset: () => { x: number; y: number },
): void {
  getCameraOffset = getOffset;

  window.addEventListener('keydown', (e) => {
    input.keys.add(e.key.toLowerCase());
    if (e.key === 'ArrowLeft' && !input.navLeftConsumed) {
      input.navLeft = true;
    }
    if (e.key === 'ArrowRight' && !input.navRightConsumed) {
      input.navRight = true;
    }
    if (e.key === 'Enter' && !input.aConsumed) {
      input.aPressed = true;
    }
  });

  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.key.toLowerCase());
    // 复位菜单导航边沿（否则键盘只能左右各走一步）
    if (e.key === 'ArrowLeft') {
      input.navLeft = false;
      input.navLeftConsumed = false;
    }
    if (e.key === 'ArrowRight') {
      input.navRight = false;
      input.navRightConsumed = false;
    }
    if (e.key === 'Enter') {
      input.aPressed = false;
      input.aConsumed = false;
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const offset = getCameraOffset();
    input.mousePosition = {
      x: e.clientX - rect.left + offset.x,
      y: e.clientY - rect.top + offset.y,
    };
    input.lastManualAimTime = performance.now() / 1000;
  });

  canvas.addEventListener('click', () => {
    input.click = true;
    input.clickConsumed = false;
  });
}

export function getMovementDirection(input: InputState): Vector2 {
  if (input.leftStick.x !== 0 || input.leftStick.y !== 0) {
    return input.leftStick;
  }

  let dx = 0;
  let dy = 0;
  if (input.keys.has('w') || input.keys.has('arrowup')) dy -= 1;
  if (input.keys.has('s') || input.keys.has('arrowdown')) dy += 1;
  if (input.keys.has('a') || input.keys.has('arrowleft')) dx -= 1;
  if (input.keys.has('d') || input.keys.has('arrowright')) dx += 1;

  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

export function updateMouseDirection(input: InputState, characterPos: Vector2): void {
  if (input.rightStick.x !== 0 || input.rightStick.y !== 0) {
    input.mouseDirection = input.rightStick;
    return;
  }

  const dx = input.mousePosition.x - characterPos.x;
  const dy = input.mousePosition.y - characterPos.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0) {
    input.mouseDirection = { x: dx / len, y: dy / len };
  }
}