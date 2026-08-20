import {
  GameState,
  GamePhase,
  WeaponTypeId,
  AuxiliaryWeaponType,
  Projectile,
  ChestType,
  Vector2,
  Enemy,
  SlashEffect,
  BeamEffect,
  DamageNumber,
  Character,
  Weapon,
  MAP_WIDTH,
  MAP_HEIGHT,
  MAX_AUX_SLOTS,
  INITIAL_WEAPON_POOL,
  WEAPON_CONFIGS,
  AUXILIARY_WEAPON_CONFIGS,
  STAGE_DURATION,
  COINS_PER_KILL,
  STAGE_NEXT_COUNTDOWN,
  TALENT_POINTS_PER_STAGE,
} from './types';
import { createCharacter, getXpThreshold, getMiniBossKillThreshold, healCharacter, increaseMaxHealth, addXpAbsorptionRadius, increaseSpeed } from './character';
import { applyDamage, respawnCharacter } from './combat';
import { generateUpgradeOptions, applyUpgrade, generateWeaponDropOptions } from './upgrades';
import { spawnEnemyWave, createXpDrop, createChest, generateObstacles, resetIds } from './spawner';
import { loadCoins, addCoins } from './coins';
import { getTalentProgress, addTalentPoints, syncTalentState, applyTalentStats, rollCrit } from './talents';
import { updateAuxWeapons, resetAuxIds } from '../systems/auxWeapons';
import { distance, angleBetween, findAutoAimTarget, findNearestEnemy, enemiesInArc, clampToMap, resolveObstacleCollision } from './collision';

let nextProjectileId = 0;

function projectileSpeed(weaponType: WeaponTypeId): number {
  return weaponType === WeaponTypeId.Flamethrower ? 350 : 500;
}

/** 电波枪连锁电弧颜色 */
const ELECTRIC_BEAM_COLOR = '#b388ff';

/** 最近一次电波枪开火的连锁命中数（DEV 调试用） */
export let lastElectricChainHits = 0;
let lastElectricChainLogAt = 0;

/**
 * 电波枪弹射起点：在射程内挑选「身边连锁范围内敌人最多」的目标（打团中心），
 * 同票数时取离玩家最近者；无法命中任何目标时返回 null。
 */
function pickChainStart(pos: Vector2, enemies: Enemy[], weaponRange: number, chainRange: number): Enemy | null {
  let best: Enemy | null = null;
  let bestScore = -1;
  let bestDist = Infinity;
  for (const e of enemies) {
    if (distance(pos, e.position) > weaponRange) continue;
    let neighbors = 0;
    for (const o of enemies) {
      if (o !== e && distance(e.position, o.position) <= chainRange) neighbors++;
    }
    const dStart = distance(pos, e.position);
    if (neighbors > bestScore || (neighbors === bestScore && dStart < bestDist)) {
      bestScore = neighbors;
      bestDist = dStart;
      best = e;
    }
  }
  return best;
}

/**
 * 电波枪：对首目标造成伤害后，在 chainRange 内逐跳贴近未命中敌人，
 * 每跳伤害按 chainGrowthPct 逐次提高（第 j 跳 = 基础 × (1 + j·growth%)）。
 * 首段暴击只在第一次命中时展示 critical 标记。
 */
function fireElectricChain(state: GameState, char: Character, weapon: Weapon, firstTarget: Enemy): void {
  const baseDamage = weapon.stats.damage;
  const chainCount = Math.max(0, Math.floor(weapon.stats.chainCount ?? 0));
  const chainRange = weapon.stats.chainRange ?? 300;
  const growthPct = weapon.stats.chainGrowthPct ?? 0;
  const { damage: firstDmg, crit } = rollCrit(char, baseDamage);

  const hitIds = new Set<string>([firstTarget.id]);
  let current = firstTarget;
  let prevPos: Vector2 = { x: char.position.x, y: char.position.y };

  for (let j = 0; j <= chainCount; j++) {
    const dmg = Math.round(firstDmg * (1 + (j * growthPct) / 100));
    current.health -= dmg;
    state.damageNumbers.push({
      position: { x: current.position.x, y: current.position.y - current.size },
      value: dmg, timer: 0.6, maxTimer: 0.6, critical: crit && j === 0,
    });
    state.beamEffects.push({
      origin: prevPos,
      end: { x: current.position.x, y: current.position.y },
      color: ELECTRIC_BEAM_COLOR,
      timer: 0.25,
      width: 8,
    });
    if (j >= chainCount) break;
    const next = findNearestEnemy(current.position, state.enemies, chainRange, hitIds);
    if (!next) break;
    hitIds.add(next.id);
    prevPos = { x: current.position.x, y: current.position.y };
    current = next;
  }
  lastElectricChainHits = hitIds.size;
  // DEV 调试：开火后每 ~0.6s 回显一次连锁命中数，方便确认连锁生效
  if (import.meta.env.DEV) {
    const now = performance.now();
    if (now - lastElectricChainLogAt > 600) {
      lastElectricChainLogAt = now;
      console.log(`[电波枪] 连锁命中 ${hitIds.size} 个敌人`);
    }
  }
}

function predictAimPoint(origin: Vector2, target: Enemy, projectileSpeed: number): Vector2 {
  const dist = distance(origin, target.position);
  if (dist <= 0) return { x: target.position.x, y: target.position.y };
  const toOrigin = { x: origin.x - target.position.x, y: origin.y - target.position.y };
  const len = Math.sqrt(toOrigin.x * toOrigin.x + toOrigin.y * toOrigin.y) || 1;
  const timeToImpact = dist / projectileSpeed;
  return {
    x: target.position.x + (toOrigin.x / len) * target.speed * timeToImpact,
    y: target.position.y + (toOrigin.y / len) * target.speed * timeToImpact,
  };
}

function createProjectile(
  origin: Vector2, target: Vector2, damage: number, penetration: number,
  weaponType: WeaponTypeId, explosionRadius: number = 0, projectileSize: number = 3,
): Projectile {
  const angle = angleBetween(origin, target);
  const speed = projectileSpeed(weaponType);
  const lifetime = weaponType === WeaponTypeId.Flamethrower
    ? Math.max(0.2, (projectileSize * 2.13) / speed)
    : 2;
  return {
    id: `proj_${nextProjectileId++}`,
    position: { x: origin.x, y: origin.y },
    velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    damage, penetration, hitEnemies: new Set<string>(), ownerId: 'character',
    lifetime, maxLifetime: lifetime, weaponType, explosionRadius, projectileSize,
  };
}

export function createInitialGameState(): GameState {
  resetIds();
  resetAuxIds();
  nextProjectileId = 0;
  const state: GameState = {
    phase: GamePhase.WeaponSelect,
    character: createCharacter(WeaponTypeId.MachineGun),
    enemies: [], projectiles: [], xpDrops: [], chests: [],
    obstacles: generateObstacles(20), slashEffects: [], beamEffects: [], damageNumbers: [],
    turrets: [], landMines: [],
    mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT,
    mouseDirection: { x: 1, y: 0 }, elapsedTime: 0,
    stageLevel: 1, stageElapsedTime: 0, stageKillCount: 0,
    nextStageCountdown: STAGE_NEXT_COUNTDOWN, lastStageResult: null,
    coins: loadCoins(),
    miniBossKillThreshold: getMiniBossKillThreshold(1), currentMiniBossKills: 0,
    upgradeOptions: [], weaponDropOptions: [],
    availableWeaponTypes: [...INITIAL_WEAPON_POOL],
    selectedWeaponType: null, selectedIndex: 0,
    talentPointsPerWeapon: {}, talentLevelsPerWeapon: {},
    talentTreeView: null, inTalentTree: false,
  };
  syncTalentState(state);
  return state;
}

export function selectWeapon(state: GameState, weaponType: WeaponTypeId): void {
  state.character = createCharacter(weaponType);
  applyTalentStats(state.character); // 天赋加成在角色创建后立即生效
  state.selectedWeaponType = weaponType;
  state.selectedIndex = 0;
  state.stageLevel = 1;
  state.stageElapsedTime = 0;
  state.stageKillCount = 0;
  state.lastStageResult = null;
  state.nextStageCountdown = STAGE_NEXT_COUNTDOWN;
  state.inTalentTree = false;
  state.talentTreeView = null;
  syncTalentState(state);
  state.phase = GamePhase.Playing;
}

/** 退出到主菜单：结算当前关卡已得金币（击杀×关卡×100），结果带回主菜单展示 */
export function exitToMainMenu(state: GameState): GameState {
  const next = createInitialGameState();
  const coinsEarned = Math.floor(state.stageKillCount * state.stageLevel * COINS_PER_KILL);
  if (coinsEarned > 0) {
    next.coins = addCoins(coinsEarned);
    next.lastStageResult = { stage: state.stageLevel, kills: state.stageKillCount, coinsEarned };
  }
  return next;
}

/** 结算本关：金币 = 本关击杀数 × 关卡等级 × 100，并奖励本角色 1 点天赋点 */
function completeStage(state: GameState): void {
  const coinsEarned = Math.floor(state.stageKillCount * state.stageLevel * COINS_PER_KILL);
  state.lastStageResult = { stage: state.stageLevel, kills: state.stageKillCount, coinsEarned };
  state.coins = addCoins(coinsEarned);
  if (state.selectedWeaponType) {
    state.talentPointsPerWeapon[state.selectedWeaponType] = addTalentPoints(state.selectedWeaponType, TALENT_POINTS_PER_STAGE);
  }
  if (state.talentTreeView) state.talentTreeView.points = getTalentProgress(state.selectedWeaponType ?? WeaponTypeId.MeleeBlade).points;
  state.stageElapsedTime = STAGE_DURATION;
  state.nextStageCountdown = STAGE_NEXT_COUNTDOWN;
  state.phase = GamePhase.LevelComplete;
}

/** 开启下一关：自动重置计时与计数、清场，怪物血量随关卡等级上涨 */
export function startNextStage(state: GameState): void {
  state.stageLevel++;
  state.stageElapsedTime = 0;
  state.stageKillCount = 0;
  state.nextStageCountdown = STAGE_NEXT_COUNTDOWN;
  state.enemies = [];
  state.projectiles = [];
  state.xpDrops = [];
  state.chests = [];
  state.turrets = [];
  state.landMines = [];
  state.slashEffects = [];
  state.beamEffects = [];
  state.damageNumbers = [];
  state.character.invincibleTimer = 0;
  state.miniBossKillThreshold = getMiniBossKillThreshold(state.stageLevel);
  state.currentMiniBossKills = 0;
  state.phase = GamePhase.Playing;
}

/** 关卡完成界面的自动倒计时，结束后自动进入下一关 */
export function updateLevelComplete(state: GameState, dt: number): void {
  if (state.phase !== GamePhase.LevelComplete) return;
  state.nextStageCountdown = Math.max(0, state.nextStageCountdown - dt);
  if (state.nextStageCountdown <= 0) startNextStage(state);
}

export function updateGame(state: GameState, dt: number, moveDir: Vector2): void {
  if (state.phase !== GamePhase.Playing) return;
  state.elapsedTime += dt;
  state.stageElapsedTime += dt;

  if (state.stageElapsedTime >= STAGE_DURATION) {
    completeStage(state);
    return;
  }

  updateCharacterMovement(state, dt, moveDir);
  updateMainWeapon(state, dt);
  updateProjectiles(state, dt);
  updateEnemies(state, dt);
  updateXpDrops(state, dt);
  updateChests(state);
  updateTimers(state, dt);
  updateSlashEffects(state, dt);
  updateBeamEffects(state, dt);
  updateDamageNumbers(state, dt);
  updateAuxWeapons(state, dt);
  spawnEnemies(state);
  checkLevelUp(state);
  cleanupDead(state);
}

function updateCharacterMovement(state: GameState, dt: number, moveDir: Vector2): void {
  const char = state.character;
  const newPos = {
    x: char.position.x + moveDir.x * char.speed * dt,
    y: char.position.y + moveDir.y * char.speed * dt,
  };
  const clamped = clampToMap(newPos.x, newPos.y, 16);
  const resolved = resolveObstacleCollision(clamped, 16, state.obstacles);
  char.position = resolved;
}

function updateMainWeapon(state: GameState, dt: number): void {
  const char = state.character;
  const weapon = char.mainWeapon;
  const config = WEAPON_CONFIGS[weapon.typeId];

  const target = findAutoAimTarget(char.position, state.enemies, weapon.stats.range);
  // 人物朝向始终对准当前攻击目标（含冷却/换弹期间），无目标时保留鼠标朝向
  if (target) {
    const dirAngle = config.isMelee
      ? angleBetween(char.position, target.position)
      : angleBetween(char.position, predictAimPoint(char.position, target, projectileSpeed(weapon.typeId)));
    state.mouseDirection = { x: Math.cos(dirAngle), y: Math.sin(dirAngle) };
  }

  weapon.fireCooldown = Math.max(0, weapon.fireCooldown - dt);
  weapon.reloadTimer = Math.max(0, weapon.reloadTimer - dt);

  if (weapon.reloadTimer > 0) return;
  if (weapon.currentAmmo <= 0 && weapon.stats.magazineCapacity !== Infinity) {
    weapon.reloadTimer = weapon.stats.reloadSpeed;
    weapon.currentAmmo = weapon.stats.magazineCapacity;
    return;
  }
  if (weapon.fireCooldown > 0) return;

  if (config.isMelee) {
    if (!target) return;
    const dirAngle = angleBetween(char.position, target.position);
    // 一次挥砍：命中/伤害/刀光。返回是否命中，供十字连斩复用
    const swing = (dir: number): boolean => {
      const targets = enemiesInArc(char.position, dir, state.enemies, weapon.stats.range, config.attackArc ?? Math.PI / 2);
      if (targets.length === 0) return false;
      for (const hit of targets) {
        const { damage, crit } = rollCrit(char, weapon.stats.damage);
        hit.health -= damage;
        state.damageNumbers.push({
          position: { x: hit.position.x, y: hit.position.y - hit.size },
          value: Math.round(damage), timer: 0.8, maxTimer: 0.8, critical: crit,
        });
        const dx = hit.position.x - char.position.x;
        const dy = hit.position.y - char.position.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) { hit.position.x += (dx / len) * 200; hit.position.y += (dy / len) * 200; }
      }
      state.slashEffects.push({ position: { x: char.position.x, y: char.position.y }, direction: dir, arc: config.attackArc ?? Math.PI / 2, range: weapon.stats.range, timer: 0.15 });
      return true;
    };

    if (swing(dirAngle)) {
      // 十字连斩：主刀切出后，副刀垂直切入（全额伤害），同一冷却内完成交叉双挥
      if (char.doubleStrikeChance > 0 && Math.random() < char.doubleStrikeChance) {
        swing(dirAngle + Math.PI / 2);
      }
      weapon.fireCooldown = 1 / weapon.stats.fireRate;
    }
  } else {
    if (!target) return;
    if (weapon.typeId === WeaponTypeId.ElectricWave) {
      // 电波枪：从人群中心起跳，单目标命中 + 连锁瞬间结算（不产生弹丸）
      const start = pickChainStart(char.position, state.enemies, weapon.stats.range, weapon.stats.chainRange ?? 300);
      if (start) {
        const chainDir = angleBetween(char.position, start.position);
        state.mouseDirection = { x: Math.cos(chainDir), y: Math.sin(chainDir) };
        fireElectricChain(state, char, weapon, start);
      }
    } else {
      const aimPoint = predictAimPoint(char.position, target, projectileSpeed(weapon.typeId));
      const aimAngle = angleBetween(char.position, aimPoint);
      for (let i = 0; i < weapon.stats.bulletCount; i++) {
        const spread = (Math.random() - 0.5) * 0.2;
        const finalAngle = aimAngle + spread;
        const aimDist = weapon.typeId === WeaponTypeId.Flamethrower ? weapon.stats.range : 100;
        const aimPos: Vector2 = { x: char.position.x + Math.cos(finalAngle) * aimDist, y: char.position.y + Math.sin(finalAngle) * aimDist };
        const projSize = weapon.typeId === WeaponTypeId.Flamethrower ? weapon.stats.range : 3;
        const { damage, crit } = rollCrit(char, weapon.stats.damage);
        const proj = createProjectile(char.position, aimPos, damage, weapon.stats.penetration, weapon.typeId, 0, projSize);
        proj.crit = crit;
        state.projectiles.push(proj);
      }
      weapon.currentAmmo--;
    }
    // 电波枪：攻击间隔 = 释放时间 × 基础攻速/当前攻速（攻速与释放时间天赋共同生效），下限 0.05s
    const baseFireRate = WEAPON_CONFIGS[weapon.typeId].baseStats.fireRate;
    weapon.fireCooldown = weapon.stats.releaseTime !== undefined
      ? Math.max(0.05, (weapon.stats.releaseTime * baseFireRate) / weapon.stats.fireRate)
      : 1 / weapon.stats.fireRate;
  }
}

const SWORD_HOMING_RANGE = 300;
const SWORD_HOMING_TURN = 10;

function homeProjectile(proj: Projectile, enemies: Enemy[], dt: number): void {
  const isSword = proj.weaponType === ('sword_energy' as any);
  const isMissile = proj.weaponType === ('missile' as any);
  if (!isSword && !isMissile) return;
  const range = isMissile ? 260 : SWORD_HOMING_RANGE;
  const turn = isMissile ? 3.5 : SWORD_HOMING_TURN;
  const seek = findNearestEnemy(proj.position, enemies, range);
  if (!seek) return;
  const speed = Math.hypot(proj.velocity.x, proj.velocity.y) || 420;
  const curDir = speed > 0 ? { x: proj.velocity.x / speed, y: proj.velocity.y / speed } : { x: 1, y: 0 };
  const dx = seek.position.x - proj.position.x;
  const dy = seek.position.y - proj.position.y;
  const len = Math.hypot(dx, dy) || 1;
  const desired = { x: dx / len, y: dy / len };
  // 越近转向越猛（避免在目标身边干转圈不命中）
  const proximity = 1 - Math.min(1, len / 90);
  const effTurn = isSword ? turn + proximity * 32 : turn;
  const t = Math.min(1, effTurn * dt);
  const nx = curDir.x + (desired.x - curDir.x) * t;
  const ny = curDir.y + (desired.y - curDir.y) * t;
  const nlen = Math.hypot(nx, ny) || 1;
  proj.velocity.x = (nx / nlen) * speed;
  proj.velocity.y = (ny / nlen) * speed;
}

function updateProjectiles(state: GameState, dt: number): void {
  const projectiles = state.projectiles;
  const enemies = state.enemies;
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    if (proj.weaponType === ('sword_energy' as any) || proj.weaponType === ('missile' as any)) {
      homeProjectile(proj, enemies, dt);
    }
    proj.position.x += proj.velocity.x * dt;
    proj.position.y += proj.velocity.y * dt;
    proj.lifetime -= dt;

    if (proj.lifetime <= 0 || proj.position.x < 0 || proj.position.x > MAP_WIDTH || proj.position.y < 0 || proj.position.y > MAP_HEIGHT) {
      projectiles.splice(i, 1);
      continue;
    }

    for (const enemy of enemies) {
      if (proj.hitEnemies.has(enemy.id)) continue;
      const hitRadius = proj.weaponType === ('sword_energy' as any)
        ? enemy.size + proj.projectileSize * 1.0 + 4
        : enemy.size;
      if (distance(proj.position, enemy.position) < hitRadius) {
        enemy.health -= proj.damage;
        state.damageNumbers.push({ position: { x: enemy.position.x, y: enemy.position.y - enemy.size }, value: Math.round(proj.damage), timer: 0.8, maxTimer: 0.8, critical: proj.crit });
        proj.hitEnemies.add(enemy.id);

        if (proj.weaponType === WeaponTypeId.Flamethrower) {
          enemy.burnDamage = Math.max(enemy.burnDamage, proj.damage * 0.2);
          const burnDuration = Math.max(1, 1 + state.character.mainWeapon.stats.range / 100);
          enemy.burnTimer = Math.max(enemy.burnTimer, burnDuration);
        }

        if (proj.explosionRadius > 0) {
          for (const e of enemies) {
            if (e.id !== enemy.id && distance(proj.position, e.position) < proj.explosionRadius) {
              e.health -= proj.damage * 0.5;
              state.damageNumbers.push({ position: { x: e.position.x, y: e.position.y - e.size }, value: Math.floor(proj.damage * 0.5), timer: 0.6, maxTimer: 0.6 });
            }
          }
          projectiles.splice(i, 1);
          break;
        }

        proj.penetration--;
        if (proj.penetration <= 0) { projectiles.splice(i, 1); break; }
      }
    }
  }
}

function updateEnemies(state: GameState, dt: number): void {
  const char = state.character;
  for (const enemy of state.enemies) {
    const dir = { x: char.position.x - enemy.position.x, y: char.position.y - enemy.position.y };
    const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
    if (len > 0) { enemy.position.x += (dir.x / len) * enemy.speed * dt; enemy.position.y += (dir.y / len) * enemy.speed * dt; }
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);

    if (enemy.burnTimer > 0) {
      enemy.burnTimer -= dt;
      const tickDmg = enemy.burnDamage;
      enemy.health -= tickDmg * dt;
      state.damageNumbers.push({
        position: { x: enemy.position.x, y: enemy.position.y - enemy.size - 12 },
        value: Math.ceil(tickDmg * dt),
        timer: 0.4,
        maxTimer: 0.4,
      });
      if (enemy.burnTimer <= 1) enemy.burnDamage *= 2;
    }

    if (len < enemy.size + 16 && enemy.attackCooldown <= 0) { applyDamage(char, enemy.damage); enemy.attackCooldown = 1; }
  }
}

function updateXpDrops(state: GameState, dt: number): void {
  const char = state.character;
  const xpDrops = state.xpDrops;
  for (let i = xpDrops.length - 1; i >= 0; i--) {
    const drop = xpDrops[i];
    const d = distance(char.position, drop.position);
    if (d < char.xpAbsorptionRadius) {
      const dir = { x: char.position.x - drop.position.x, y: char.position.y - drop.position.y };
      const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
      if (len > 0) { drop.position.x += (dir.x / len) * 500 * dt; drop.position.y += (dir.y / len) * 500 * dt; }
    }
    if (distance(char.position, drop.position) < 20) { char.xp += drop.value; xpDrops.splice(i, 1); }
  }
}

function updateChests(state: GameState): void {
  const char = state.character;
  for (let i = state.chests.length - 1; i >= 0; i--) {
    const chest = state.chests[i];
    if (distance(char.position, chest.position) < char.xpAbsorptionRadius) {
      switch (chest.type) {
        case ChestType.Health: healCharacter(char, 30); break;
        case ChestType.MaxHP: increaseMaxHealth(char, 20); break;
        case ChestType.MoveSpeed: increaseSpeed(char, 20); break;
        case ChestType.XPRange: addXpAbsorptionRadius(char, 20); break;
        case ChestType.XP: char.xp += 30; break;
      }
      state.chests.splice(i, 1);
    }
  }
}

function updateTimers(state: GameState, dt: number): void {
  state.character.invincibleTimer = Math.max(0, state.character.invincibleTimer - dt);
}

function updateSlashEffects(state: GameState, dt: number): void {
  for (let i = state.slashEffects.length - 1; i >= 0; i--) {
    state.slashEffects[i].timer -= dt;
    if (state.slashEffects[i].timer <= 0) state.slashEffects.splice(i, 1);
  }
}

function updateBeamEffects(state: GameState, dt: number): void {
  for (let i = state.beamEffects.length - 1; i >= 0; i--) {
    state.beamEffects[i].timer -= dt;
    if (state.beamEffects[i].timer <= 0) state.beamEffects.splice(i, 1);
  }
}

function updateDamageNumbers(state: GameState, dt: number): void {
  for (let i = state.damageNumbers.length - 1; i >= 0; i--) {
    const dn = state.damageNumbers[i];
    dn.timer -= dt;
    dn.position.y -= 60 * dt;
    if (dn.timer <= 0) state.damageNumbers.splice(i, 1);
  }
}

function spawnEnemies(state: GameState): void {
  const expectedEnemies = Math.min(50, 5 + state.elapsedTime * 0.5);
  if (state.enemies.length < expectedEnemies) {
    const toSpawn = Math.min(5, Math.ceil(expectedEnemies - state.enemies.length));
    const newEnemies = spawnEnemyWave(state.character.position, state.character.level, toSpawn, state.stageLevel, state.stageElapsedTime);
    state.enemies.push(...newEnemies);
  }
}

function checkLevelUp(state: GameState): void {
  const char = state.character;
  while (char.xp >= char.xpToNextLevel) {
    char.xp -= char.xpToNextLevel;
    char.level++;
    char.xpToNextLevel = getXpThreshold(char.level);
    state.upgradeOptions = generateUpgradeOptions(char);
    state.phase = GamePhase.LevelUp;
    return;
  }
}

function cleanupDead(state: GameState): void {
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i];
    if (enemy.health <= 0) {
      state.character.killCount++;
      state.stageKillCount++;
      const xpDrop = createXpDrop(enemy.position, Math.floor(enemy.xpValue));
      state.xpDrops.push(xpDrop);
      if (Math.random() < 0.025) state.chests.push(createChest(enemy.position));

      if (enemy.isMiniBoss) {
        const ownedTypes = state.character.auxWeapons.map((a) => a.typeId);
        if (ownedTypes.length < MAX_AUX_SLOTS) {
          const options = generateWeaponDropOptions(ownedTypes);
          if (options.length > 0) { state.weaponDropOptions = options; state.phase = GamePhase.WeaponDrop; }
        }
      }
      state.enemies.splice(i, 1);
    }
  }
  if (state.character.health <= 0) respawnCharacter(state.character);
}

export function handleLevelUpSelect(state: GameState, index: number): void {
  if (state.phase !== GamePhase.LevelUp) return;
  if (index < 0 || index >= state.upgradeOptions.length) return;
  applyUpgrade(state.character, state.upgradeOptions[index]);
  state.upgradeOptions = [];
  state.selectedIndex = 0;
  state.phase = GamePhase.Playing;
}

export function handleWeaponDropSelect(state: GameState, index: number): void {
  if (state.phase !== GamePhase.WeaponDrop) return;
  if (index < 0 || index >= state.weaponDropOptions.length) return;
  const typeId = state.weaponDropOptions[index];
  const owned = state.character.auxWeapons.map((a) => a.typeId);
  if (!owned.includes(typeId) && state.character.auxWeapons.length < state.character.maxAuxSlots) {
    applyUpgrade(state.character, { target: 'acquire_aux', auxTypeId: typeId, description: `获得 ${AUXILIARY_WEAPON_CONFIGS[typeId].name}`, rarity: 'common' as any, stat: undefined, statDelta: undefined });
  }
  state.weaponDropOptions = [];
  state.selectedIndex = 0;
  state.phase = GamePhase.Playing;
}