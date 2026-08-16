import {
  Enemy,
  EnemyConfig,
  XPDrop,
  Chest,
  ChestType,
  Vector2,
  MAP_WIDTH,
  MAP_HEIGHT,
  MINI_BOSS_XP_MULTIPLIER,
  WEAPON_CONFIGS,
  WeaponTypeId,
  Obstacle,
} from './types';
import { getXpFromEnemy } from './character';

let nextEnemyId = 0;
let nextXpId = 0;
let nextChestId = 0;

export function resetIds(): void {
  nextEnemyId = 0;
  nextXpId = 0;
  nextChestId = 0;
}

const ENEMY_TYPES: EnemyConfig[] = [
  { id: 'walker', health: 20, speed: 60, damage: 10, xpValue: 1, isMiniBoss: false, size: 20 },
  { id: 'runner', health: 15, speed: 120, damage: 8, xpValue: 1.5, isMiniBoss: false, size: 16 },
  { id: 'tank', health: 80, speed: 35, damage: 15, xpValue: 3, isMiniBoss: false, size: 28 },
  { id: 'ranged', health: 25, speed: 50, damage: 12, xpValue: 2, isMiniBoss: false, size: 20 },
  { id: 'exploder', health: 10, speed: 90, damage: 30, xpValue: 2, isMiniBoss: false, size: 18 },
];

const MINI_BOSS_CONFIG: EnemyConfig = {
  id: 'mini_boss',
  health: 300,
  speed: 45,
  damage: 25,
  xpValue: 10,
  isMiniBoss: true,
  size: 40,
};

function getAvailableEnemyTypes(level: number): EnemyConfig[] {
  const types: EnemyConfig[] = [ENEMY_TYPES[0]];
  if (level >= 2) types.push(ENEMY_TYPES[1]);
  if (level >= 3) types.push(ENEMY_TYPES[2]);
  if (level >= 4) types.push(ENEMY_TYPES[3]);
  if (level >= 5) types.push(ENEMY_TYPES[4]);
  return types;
}

function randomSpawnPosition(characterPos: Vector2, minDist: number, maxDist: number): Vector2 {
  const angle = Math.random() * Math.PI * 2;
  const dist = minDist + Math.random() * (maxDist - minDist);
  let x = characterPos.x + Math.cos(angle) * dist;
  let y = characterPos.y + Math.sin(angle) * dist;
  x = Math.max(20, Math.min(MAP_WIDTH - 20, x));
  y = Math.max(20, Math.min(MAP_HEIGHT - 20, y));
  return { x, y };
}

export function spawnEnemyWave(
  characterPos: Vector2,
  level: number,
  count: number,
): Enemy[] {
  const types = getAvailableEnemyTypes(level);
  const enemies: Enemy[] = [];
  for (let i = 0; i < count; i++) {
    const config = types[Math.floor(Math.random() * types.length)];
    const pos = randomSpawnPosition(characterPos, 400, 600);
    const xpMult = getXpFromEnemy(level);
    const timeMult = 1 + (level - 1) * 0.1;
    enemies.push({
      id: `enemy_${nextEnemyId++}`,
      configId: config.id,
      position: pos,
      health: config.health * timeMult,
      maxHealth: config.health * timeMult,
      speed: config.speed,
      damage: config.damage,
      xpValue: config.xpValue * xpMult,
      isMiniBoss: false,
      size: config.size,
      attackCooldown: 0,
      burnDamage: 0,
      burnTimer: 0,
    });
  }
  return enemies;
}

export function spawnMiniBoss(characterPos: Vector2, level: number): Enemy {
  const pos = randomSpawnPosition(characterPos, 400, 500);
  const xpMult = getXpFromEnemy(level);
  return {
    id: `mini_boss_${nextEnemyId++}`,
    configId: 'mini_boss',
    position: pos,
    health: MINI_BOSS_CONFIG.health * (1 + (level - 1) * 0.15),
    maxHealth: MINI_BOSS_CONFIG.health * (1 + (level - 1) * 0.15),
    speed: MINI_BOSS_CONFIG.speed,
    damage: MINI_BOSS_CONFIG.damage,
    xpValue: MINI_BOSS_CONFIG.xpValue * xpMult * MINI_BOSS_XP_MULTIPLIER,
    isMiniBoss: true,
    size: MINI_BOSS_CONFIG.size,
    attackCooldown: 0,
    burnDamage: 0,
    burnTimer: 0,
  };
}

export function createXpDrop(position: Vector2, value: number): XPDrop {
  return {
    id: `xp_${nextXpId++}`,
    position: { x: position.x, y: position.y },
    value,
  };
}

export function createChest(position: Vector2): Chest {
  const types = [ChestType.Health, ChestType.XPRange, ChestType.MaxHP];
  const type = types[Math.floor(Math.random() * types.length)];
  return {
    id: `chest_${nextChestId++}`,
    position: { x: position.x + (Math.random() - 0.5) * 20, y: position.y + (Math.random() - 0.5) * 20 },
    type,
  };
}

export function generateObstacles(count: number): Obstacle[] {
  const obstacles: Obstacle[] = [];
  for (let i = 0; i < count; i++) {
    obstacles.push({
      position: {
        x: 100 + Math.random() * (MAP_WIDTH - 200),
        y: 100 + Math.random() * (MAP_HEIGHT - 200),
      },
      width: 30 + Math.random() * 40,
      height: 30 + Math.random() * 40,
    });
  }
  return obstacles;
}