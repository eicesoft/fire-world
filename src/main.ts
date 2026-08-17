import { GameState, GamePhase, WeaponTypeId, Vector2, SCREEN_WIDTH, SCREEN_HEIGHT, INITIAL_WEAPON_POOL } from './game/types';
import { createInitialGameState, updateGame, selectWeapon, handleLevelUpSelect, handleWeaponDropSelect } from './game/gameLoop';
import { PixiRenderer } from './rendering/pixiRenderer';
import { InputState, createInputState, setupInputHandlers, getMovementDirection, updateMouseDirection, pollGamepad } from './systems/input';
import { distance } from './game/collision';

const canvas = document.getElementById('game') as HTMLCanvasElement;

const renderer = await PixiRenderer.create(canvas);

// DEV 调试钩子：视觉验证/调参用，生产构建会被 tree-shake 掉
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__fw = {
    state: () => gameState,
    renderer,
    stage: () => (renderer as unknown as { app: { stage: unknown } }).app.stage,
  };
}
const input = createInputState();
setupInputHandlers(canvas, input, () => renderer.getCameraOffset());

let gameState: GameState = createInitialGameState();
let lastTime = 0;

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && gameState.phase === GamePhase.Playing) {
    gameState.phase = GamePhase.Paused;
  } else if (e.key === 'Escape' && gameState.phase === GamePhase.Paused) {
    gameState.phase = GamePhase.Playing;
  }
});

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  if (gameState.phase === GamePhase.WeaponSelect) {
    const weapons = INITIAL_WEAPON_POOL;
    const boxWidth = 150;
    const boxHeight = 150;
    const gap = 10;
    const totalWidth = weapons.length * boxWidth + (weapons.length - 1) * gap;
    const startX = (SCREEN_WIDTH - totalWidth) / 2;
    const startY = 150;

    for (let i = 0; i < weapons.length; i++) {
      const x = startX + i * (boxWidth + gap);
      if (mouseX >= x && mouseX <= x + boxWidth && mouseY >= startY && mouseY <= startY + boxHeight) {
        selectWeapon(gameState, weapons[i]);
        break;
      }
    }
    return;
  }

  if (gameState.phase === GamePhase.LevelUp) {
    const boxWidth = 200;
    const boxHeight = 100;
    const totalWidth = gameState.upgradeOptions.length * boxWidth + (gameState.upgradeOptions.length - 1) * 20;
    const startX = (SCREEN_WIDTH - totalWidth) / 2;
    const startY = 150;

    for (let i = 0; i < gameState.upgradeOptions.length; i++) {
      const x = startX + i * (boxWidth + 20);
      if (mouseX >= x && mouseX <= x + boxWidth && mouseY >= startY && mouseY <= startY + boxHeight) {
        handleLevelUpSelect(gameState, i);
        break;
      }
    }
    return;
  }

  if (gameState.phase === GamePhase.WeaponDrop) {
    const boxWidth = 200;
    const boxHeight = 80;
    const totalWidth = gameState.weaponDropOptions.length * boxWidth + (gameState.weaponDropOptions.length - 1) * 20;
    const startX = (SCREEN_WIDTH - totalWidth) / 2;
    const startY = 150;

    for (let i = 0; i < gameState.weaponDropOptions.length; i++) {
      const x = startX + i * (boxWidth + 20);
      if (mouseX >= x && mouseX <= x + boxWidth && mouseY >= startY && mouseY <= startY + boxHeight) {
        handleWeaponDropSelect(gameState, i);
        break;
      }
    }
    return;
  }
});

function handleMenuNav(state: GameState, input: InputState): void {
  let maxIndex = 0;
  if (state.phase === GamePhase.WeaponSelect) {
    maxIndex = INITIAL_WEAPON_POOL.length - 1;
  } else if (state.phase === GamePhase.LevelUp) {
    maxIndex = state.upgradeOptions.length - 1;
  } else if (state.phase === GamePhase.WeaponDrop) {
    maxIndex = state.weaponDropOptions.length - 1;
  } else {
    return;
  }

  if (input.navLeft && !input.navLeftConsumed) {
    state.selectedIndex = Math.max(0, state.selectedIndex - 1);
    input.navLeftConsumed = true;
  }
  if (input.navRight && !input.navRightConsumed) {
    state.selectedIndex = Math.min(maxIndex, state.selectedIndex + 1);
    input.navRightConsumed = true;
  }

  if (input.aPressed && !input.aConsumed) {
    if (state.phase === GamePhase.WeaponSelect) {
      selectWeapon(state, INITIAL_WEAPON_POOL[state.selectedIndex]);
    } else if (state.phase === GamePhase.LevelUp) {
      handleLevelUpSelect(state, state.selectedIndex);
    } else if (state.phase === GamePhase.WeaponDrop) {
      handleWeaponDropSelect(state, state.selectedIndex);
    }
    input.aConsumed = true;
  }
}

function gameLoop(timestamp: number): void {
  const dt = lastTime === 0 ? 1 / 60 : Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  pollGamepad(input);

  if (gameState.phase === GamePhase.Playing) {
    const now = performance.now() / 1000;
    const moveDir = getMovementDirection(input);
    updateMouseDirection(input, gameState.character.position);

    if (now - input.lastManualAimTime > 0.3) {
      let target: Vector2 | null = null;
      let bossDist = Infinity;
      for (const enemy of gameState.enemies) {
        const d = distance(gameState.character.position, enemy.position);
        if (enemy.isMiniBoss && d < bossDist) {
          bossDist = d;
          target = enemy.position;
        }
      }
      if (!target) {
        let nearestDist = Infinity;
        for (const enemy of gameState.enemies) {
          const d = distance(gameState.character.position, enemy.position);
          if (d < nearestDist) { nearestDist = d; target = enemy.position; }
        }
      }
      if (target) {
        const dx = target.x - gameState.character.position.x;
        const dy = target.y - gameState.character.position.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) input.mouseDirection = { x: dx / len, y: dy / len };
      }
    }

    gameState.mouseDirection = input.mouseDirection;
    updateGame(gameState, dt, moveDir);
  } else {
    handleMenuNav(gameState, input);
  }

  renderer.render(gameState);
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);