import { GameState, GamePhase, WeaponTypeId, SCREEN_WIDTH, SCREEN_HEIGHT, INITIAL_WEAPON_POOL, PAUSE_EXIT_BTN, NEXT_STAGE_BTN, TALENT_BTN, TALENT_BACK_BTN } from './game/types';
import { createInitialGameState, updateGame, selectWeapon, handleLevelUpSelect, handleWeaponDropSelect, startNextStage, updateLevelComplete, exitToMainMenu } from './game/gameLoop';
import { buildTalentTreeView, syncTalentState, spendTalentPoint } from './game/talents';
import { findTalentNodeAt } from './ui/talentLayout';
import { PixiRenderer } from './rendering/pixiRenderer';
import { InputState, createInputState, setupInputHandlers, getMovementDirection, updateMouseDirection, pollGamepad } from './systems/input';
import cubicFontUrl from './assets/fonts/Cubic_11.woff2?url';
import vtFontUrl from './assets/fonts/VT323.woff2?url';

// 像素风中文字体（Cubic 11，缝合像素字体工程）
const gameFont = new FontFace('Cubic11', `url(${cubicFontUrl})`, { style: 'normal', weight: '400' });
const fontReady = gameFont.load().then((f) => {
  document.fonts.add(f);
  return document.fonts.ready.then(() => true);
}).catch(() => {
  console.warn('像素字体加载失败，回退系统字体');
  return false;
});
// 数字专用技术字体（VT323 复古终端风）
const numberFont = new FontFace('VT323', `url(${vtFontUrl})`, { style: 'normal', weight: '400' });
const numberFontReady = numberFont.load().then((f) => {
  document.fonts.add(f);
  return document.fonts.ready.then(() => true);
}).catch(() => {
  console.warn('数字字体加载失败，回退系统字体');
  return false;
});

const canvas = document.getElementById('game') as HTMLCanvasElement;

// 等字体就绪再创建渲染器，避免首帧回退字体后再切换
await fontReady.catch(() => false);
await numberFontReady.catch(() => false);

const renderer = await PixiRenderer.create(canvas);

// DEV 调试钩子：视觉验证/调参用，生产构建会被 tree-shake 掉
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__fw = {
    state: () => gameState,
    input: () => input,
    renderer,
    stage: () => (renderer as unknown as { app: { stage: unknown } }).app.stage,
  };
}
const input = createInputState();
setupInputHandlers(canvas, input, () => renderer.getCameraOffset());

let gameState: GameState = createInitialGameState();
let lastTime = 0;

function openTalentTree(state: GameState): void {
  const weapon = INITIAL_WEAPON_POOL[state.selectedIndex];
  if (weapon === undefined) return;
  state.inTalentTree = true;
  state.selectedIndex = 0;
  state.talentTreeView = buildTalentTreeView(weapon);
}

function closeTalentTree(state: GameState): void {
  state.inTalentTree = false;
  state.talentTreeView = null;
  state.selectedIndex = 0;
}

function upgradeSelectedTalent(state: GameState, index: number): void {
  const view = state.talentTreeView;
  if (!view || index < 0 || index >= view.nodes.length) return;
  const node = view.nodes[index];
  if (spendTalentPoint(view.weaponType, node.id)) {
    syncTalentState(state);
    state.talentTreeView = buildTalentTreeView(view.weaponType);
  }
}

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 't' && gameState.phase === GamePhase.WeaponSelect) {
    if (gameState.inTalentTree) closeTalentTree(gameState);
    else openTalentTree(gameState);
  } else if (e.key === 'Escape' && gameState.phase === GamePhase.WeaponSelect && gameState.inTalentTree) {
    closeTalentTree(gameState);
  } else if (e.key === 'Escape' && gameState.phase === GamePhase.Playing) {
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

    if (gameState.inTalentTree) {
      const back = TALENT_BACK_BTN;
      if (mouseX >= back.x && mouseX <= back.x + back.w && mouseY >= back.y && mouseY <= back.y + back.h) {
        closeTalentTree(gameState);
        return;
      }
      const view = gameState.talentTreeView;
      if (view) {
        const idx = findTalentNodeAt(view.nodes, mouseX, mouseY);
        if (idx >= 0) {
          gameState.selectedIndex = idx;
          upgradeSelectedTalent(gameState, idx);
        }
      }
      return;
    }

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

    const talentBtn = TALENT_BTN;
    if (mouseX >= talentBtn.x && mouseX <= talentBtn.x + talentBtn.w && mouseY >= talentBtn.y && mouseY <= talentBtn.y + talentBtn.h) {
      openTalentTree(gameState);
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

  if (gameState.phase === GamePhase.Paused) {
    if (
      mouseX >= PAUSE_EXIT_BTN.x && mouseX <= PAUSE_EXIT_BTN.x + PAUSE_EXIT_BTN.w &&
      mouseY >= PAUSE_EXIT_BTN.y && mouseY <= PAUSE_EXIT_BTN.y + PAUSE_EXIT_BTN.h
    ) {
      gameState = exitToMainMenu(gameState);
    }
    return;
  }

  if (gameState.phase === GamePhase.LevelComplete) {
    if (
      mouseX >= NEXT_STAGE_BTN.x && mouseX <= NEXT_STAGE_BTN.x + NEXT_STAGE_BTN.w &&
      mouseY >= NEXT_STAGE_BTN.y && mouseY <= NEXT_STAGE_BTN.y + NEXT_STAGE_BTN.h
    ) {
      startNextStage(gameState);
    }
    return;
  }
});

function handleMenuNav(state: GameState, input: InputState): void {
  let maxIndex = 0;
  if (state.phase === GamePhase.WeaponSelect) {
    maxIndex = state.inTalentTree && state.talentTreeView
      ? state.talentTreeView.nodes.length - 1
      : INITIAL_WEAPON_POOL.length - 1;
  } else if (state.phase === GamePhase.LevelUp) {
    maxIndex = state.upgradeOptions.length - 1;
  } else if (state.phase === GamePhase.WeaponDrop) {
    maxIndex = state.weaponDropOptions.length - 1;
  } else if (state.phase !== GamePhase.LevelComplete) {
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
      if (state.inTalentTree && state.talentTreeView) {
        upgradeSelectedTalent(state, state.selectedIndex);
      } else {
        selectWeapon(state, INITIAL_WEAPON_POOL[state.selectedIndex]);
      }
    } else if (state.phase === GamePhase.LevelUp) {
      handleLevelUpSelect(state, state.selectedIndex);
    } else if (state.phase === GamePhase.WeaponDrop) {
      handleWeaponDropSelect(state, state.selectedIndex);
    } else if (state.phase === GamePhase.LevelComplete) {
      startNextStage(state);
    }
    input.aConsumed = true;
  }
}

function gameLoop(timestamp: number): void {
  const dt = lastTime === 0 ? 1 / 60 : Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  pollGamepad(input);

  if (gameState.phase === GamePhase.Playing) {
    const moveDir = getMovementDirection(input);
    updateMouseDirection(input, gameState.character.position);

    gameState.mouseDirection = input.mouseDirection;
    updateGame(gameState, dt, moveDir);
  } else {
    handleMenuNav(gameState, input);
    updateLevelComplete(gameState, dt);
  }

  renderer.render(gameState);
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);