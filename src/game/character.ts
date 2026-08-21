import {
  Character,
  Weapon,
  AuxiliaryWeapon,
  WeaponTypeId,
  AuxiliaryWeaponType,
  WEAPON_CONFIGS,
  AUXILIARY_WEAPON_CONFIGS,
  XP_THRESHOLD_BASE,
  XP_THRESHOLD_GROWTH,
  BASE_MAX_HEALTH,
  BASE_SPEED,
  BASE_XP_ABSORPTION_RADIUS,
  MAX_AUX_SLOTS,
  MAP_WIDTH,
  MAP_HEIGHT,
  MINI_BOSS_KILL_THRESHOLD_BASE,
  MINI_BOSS_KILL_THRESHOLD_GROWTH,
  WEAPON_CHARACTER_PRESETS,
  WeaponStats,
  AuxiliaryWeaponStats,
} from './types';

export function createCharacter(weaponType: WeaponTypeId): Character {
  const weapon = createWeapon(weaponType);
  const preset = WEAPON_CHARACTER_PRESETS[weaponType] ?? { speedMultiplier: 1, health: BASE_MAX_HEALTH };
  return {
    position: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
    health: preset.health,
    maxHealth: preset.health,
    speed: BASE_SPEED * preset.speedMultiplier,
    mainWeapon: weapon,
    auxWeapons: [],
    maxAuxSlots: MAX_AUX_SLOTS,
    xp: 0,
    xpToNextLevel: getXpThreshold(1),
    level: 1,
    killCount: 0,
    xpAbsorptionRadius: BASE_XP_ABSORPTION_RADIUS,
    invincibleTimer: 0,
    critChance: 0,
    doubleStrikeChance: 0,
    burnDamageBonus: 0,
    burnDurationBonus: 0,
    burnStackCap: 0,
  };
}

export function createWeapon(typeId: WeaponTypeId): Weapon {
  const config = WEAPON_CONFIGS[typeId];
  const stats: WeaponStats = { ...config.baseStats };
  return {
    typeId,
    stats,
    currentAmmo: stats.magazineCapacity,
    reloadTimer: 0,
    fireCooldown: 0,
    level: 1,
  };
}

export function createAuxiliaryWeapon(typeId: AuxiliaryWeaponType): AuxiliaryWeapon {
  const config = AUXILIARY_WEAPON_CONFIGS[typeId];
  const stats: AuxiliaryWeaponStats = { ...config.baseStats };
  return {
    typeId,
    stats,
    cooldownTimer: 0,
    level: 1,
    activeTimer: 0,
    placedCount: 0,
    rotationAngle: 0,
  };
}

export function getXpThreshold(level: number): number {
  if (level <= 1) return XP_THRESHOLD_BASE;
  return Math.floor(XP_THRESHOLD_BASE * XP_THRESHOLD_GROWTH ** (level - 1));
}

export function getMiniBossKillThreshold(spawnCount: number): number {
  if (spawnCount <= 1) return MINI_BOSS_KILL_THRESHOLD_BASE;
  return Math.floor(MINI_BOSS_KILL_THRESHOLD_BASE * MINI_BOSS_KILL_THRESHOLD_GROWTH ** (spawnCount - 1));
}

export function getXpFromEnemy(level: number): number {
  return Math.floor(10 * 1.05 ** (level - 1));
}

export function healCharacter(char: Character, amount: number): void {
  char.health = Math.min(char.maxHealth, char.health + amount);
}

export function increaseMaxHealth(char: Character, amount: number): void {
  char.maxHealth += amount;
  char.health += amount;
}

export function addXpAbsorptionRadius(char: Character, amount: number): void {
  char.xpAbsorptionRadius += amount;
}

export function increaseSpeed(char: Character, amount: number): void {
  char.speed += amount;
}