export interface Vector2 {
  x: number;
  y: number;
}

export enum WeaponTypeId {
  MachineGun = 'machine_gun',
  Shotgun = 'shotgun',
  MeleeBlade = 'melee_blade',
  Flamethrower = 'flamethrower',
  LaserGun = 'laser_gun',
  Bow = 'bow',
}

export interface WeaponStats {
  damage: number;
  fireRate: number;
  magazineCapacity: number;
  reloadSpeed: number;
  penetration: number;
  bulletCount: number;
  range: number;
}

export interface WeaponConfig {
  id: WeaponTypeId;
  name: string;
  baseStats: WeaponStats;
  isMelee: boolean;
  attackArc?: number;
}

export interface Weapon {
  typeId: WeaponTypeId;
  stats: WeaponStats;
  currentAmmo: number;
  reloadTimer: number;
  fireCooldown: number;
  level: number;
}

export enum AuxiliaryWeaponType {
  Missile = 'missile',
  WindWheel = 'wind_wheel',
  LaserGun = 'aux_laser_gun',
  SwordEnergy = 'sword_energy',
  Turret = 'turret',
  LandMine = 'land_mine',
}

export interface AuxiliaryWeaponStats {
  damage: number;
  range: number;
  cooldown: number;
  count: number;
  explosionRadius: number;
  rotationSpeed: number;
  duration: number;
  placementCooldown: number;
  turretFireRate: number;
  armTime: number;
}

export interface AuxiliaryWeaponConfig {
  id: AuxiliaryWeaponType;
  name: string;
  baseStats: AuxiliaryWeaponStats;
  maxCount: number;
}

export interface AuxiliaryWeapon {
  typeId: AuxiliaryWeaponType;
  stats: AuxiliaryWeaponStats;
  cooldownTimer: number;
  level: number;
  activeTimer: number;
  placedCount: number;
  rotationAngle: number;
}

export interface Character {
  position: Vector2;
  health: number;
  maxHealth: number;
  speed: number;
  mainWeapon: Weapon;
  auxWeapons: AuxiliaryWeapon[];
  maxAuxSlots: number;
  xp: number;
  xpToNextLevel: number;
  level: number;
  killCount: number;
  xpAbsorptionRadius: number;
  invincibleTimer: number;
  critChance: number;
  doubleStrikeChance: number;
}

export interface EnemyConfig {
  id: string;
  health: number;
  speed: number;
  damage: number;
  xpValue: number;
  isMiniBoss: boolean;
  size: number;
}

export interface Enemy {
  id: string;
  configId: string;
  position: Vector2;
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  xpValue: number;
  isMiniBoss: boolean;
  size: number;
  attackCooldown: number;
  burnDamage: number;
  burnTimer: number;
}

export interface Projectile {
  id: string;
  position: Vector2;
  velocity: Vector2;
  damage: number;
  penetration: number;
  hitEnemies: Set<string>;
  ownerId: string;
  lifetime: number;
  maxLifetime: number;
  weaponType: WeaponTypeId;
  explosionRadius: number;
  projectileSize: number;
  crit?: boolean;
}

export interface Obstacle {
  position: Vector2;
  width: number;
  height: number;
}

export interface XPDrop {
  id: string;
  position: Vector2;
  value: number;
}

export interface Chest {
  id: string;
  position: Vector2;
  type: ChestType;
}

export enum ChestType {
  Health = 'health',
  MaxHP = 'max_hp',
  MoveSpeed = 'move_speed',
  XPRange = 'xp_range',
  XP = 'xp',
}

export enum Rarity {
  Common = 'common',
  Rare = 'rare',
  Epic = 'epic',
  Legendary = 'legendary',
}

export const RARITY_COLORS: Record<Rarity, string> = {
  [Rarity.Common]: '#4caf50',
  [Rarity.Rare]: '#2196f3',
  [Rarity.Epic]: '#9c27b0',
  [Rarity.Legendary]: '#ffc107',
};

export const RARITY_NAMES: Record<Rarity, string> = {
  [Rarity.Common]: '普通',
  [Rarity.Rare]: '高级',
  [Rarity.Epic]: '特殊',
  [Rarity.Legendary]: '传说',
};

export const RARITY_MULTIPLIERS: Record<Rarity, number> = {
  [Rarity.Common]: 1,
  [Rarity.Rare]: 2,
  [Rarity.Epic]: 4,
  [Rarity.Legendary]: 8,
};

export const RARITY_WEIGHTS: Record<Rarity, number> = {
  [Rarity.Common]: 50,
  [Rarity.Rare]: 30,
  [Rarity.Epic]: 15,
  [Rarity.Legendary]: 5,
};

export type UpgradeTarget = 'main_weapon' | 'aux_weapon' | 'acquire_aux';

export type MainWeaponStat = keyof WeaponStats;
export type AuxiliaryWeaponStat = keyof AuxiliaryWeaponStats;

export interface UpgradeOption {
  target: UpgradeTarget;
  weaponTypeId?: WeaponTypeId;
  auxTypeId?: AuxiliaryWeaponType;
  stat?: MainWeaponStat | AuxiliaryWeaponStat;
  statDelta?: number;
  description: string;
  rarity: Rarity;
}

export enum GamePhase {
  WeaponSelect = 'weapon_select',
  Playing = 'playing',
  Paused = 'paused',
  LevelUp = 'level_up',
  WeaponDrop = 'weapon_drop',
  LevelComplete = 'level_complete',
  GameOver = 'game_over',
}

/* ------------------------------------------------------------------ */
/* 天赋树                                                              */
/* ------------------------------------------------------------------ */

export enum TalentNodeId {
  MoveSpeed = 'move_speed',
  AttackDamage = 'attack_damage',
  AttackSpeed = 'attack_speed',
  AttackRange = 'attack_range',
  CritRate = 'crit_rate',
  DoubleStrike = 'double_strike',
}

export interface TalentNodeDef {
  id: TalentNodeId;
  name: string;
  /** 当前等级效果描述（显示当前值） */
  desc: string;
  tier: number; // 1 | 2 | 3
  maxLevel: number; // 5
  /** 每级累计效果数值（第 1 级 = values[0]），百分比用整数表示 */
  values: number[];
  /** 数值单位（如 '%'），空字符串表示无单位 */
  unit: string;
}

export interface TalentTreeDef {
  weaponType: WeaponTypeId;
  nodes: TalentNodeDef[];
}

/** 单个天赋节点在界面上的快照（由 game 逻辑计算，渲染器只消费） */
export interface TalentNodeView {
  id: TalentNodeId;
  name: string;
  desc: string;
  tier: number;
  maxLevel: number;
  level: number;
  /** 当前效果文本，如 '+24%' */
  curValue: string;
  /** 下一级效果文本，如 '+32%'（满级为空） */
  nextValue: string;
  /** 是否已解锁（两阶天赋受前置等级约束） */
  unlocked: boolean;
  /** 能否立即升级（解锁 && 未满级 && 天赋点充足） */
  canUpgrade: boolean;
  /** 已满级 */
  maxed: boolean;
  /** 解锁所需前置说明 */
  lockHint: string;
  /** 升级花费天赋点 */
  cost: number;
}

export interface TalentTreeView {
  weaponType: WeaponTypeId;
  nodes: TalentNodeView[];
  points: number;
  /** 每阶已投入等级数 */
  tierLevels: number[];
}


export interface DamageNumber {
  position: Vector2;
  value: number;
  timer: number;
  maxTimer: number;
  critical?: boolean;
}

export interface SlashEffect {
  position: Vector2;
  direction: number;
  arc: number;
  range: number;
  timer: number;
}

export interface BeamEffect {
  origin: Vector2;
  end: Vector2;
  color: string;
  timer: number;
  width: number;
}

export interface TurretEntity {
  id: string;
  position: Vector2;
  typeId: AuxiliaryWeaponType;
  damage: number;
  fireRate: number;
  range: number;
  explosionRadius: number;
  fireCooldown: number;
  lifetime: number;
}

export interface LandMineEntity {
  id: string;
  position: Vector2;
  damage: number;
  explosionRadius: number;
  armed: boolean;
  armTimer: number;
}

export interface WindWheelBlade {
  angle: number;
  active: boolean;
}

export interface StageResult {
  stage: number;
  kills: number;
  coinsEarned: number;
}

export interface GameState {
  phase: GamePhase;
  character: Character;
  enemies: Enemy[];
  projectiles: Projectile[];
  xpDrops: XPDrop[];
  chests: Chest[];
  obstacles: Obstacle[];
  slashEffects: SlashEffect[];
  beamEffects: BeamEffect[];
  damageNumbers: DamageNumber[];
  turrets: TurretEntity[];
  landMines: LandMineEntity[];
  mapWidth: number;
  mapHeight: number;
  mouseDirection: Vector2;
  elapsedTime: number;
  stageLevel: number;
  stageElapsedTime: number;
  stageKillCount: number;
  nextStageCountdown: number;
  lastStageResult: StageResult | null;
  coins: number;
  miniBossKillThreshold: number;
  currentMiniBossKills: number;
  upgradeOptions: UpgradeOption[];
  weaponDropOptions: AuxiliaryWeaponType[];
  availableWeaponTypes: WeaponTypeId[];
  selectedWeaponType: WeaponTypeId | null;
  selectedIndex: number;
  /** 各主武器角色的天赋点（从持久化同步，供界面展示） */
  talentPointsPerWeapon: Record<string, number>;
  /** 各主武器角色的天赋等级（从持久化同步，供界面展示） */
  talentLevelsPerWeapon: Record<string, Readonly<Record<string, number>>>;
  /** 天赋树界面视图（weapon_select 中打开天赋面板时非空） */
  talentTreeView: TalentTreeView | null;
  /** 主菜单当前是否打开天赋树面板 */
  inTalentTree: boolean;
}

export const MAP_WIDTH = 3000;
export const MAP_HEIGHT = 3000;
export const SCREEN_WIDTH = 800;
export const SCREEN_HEIGHT = 600;
export const BASE_XP_ABSORPTION_RADIUS = 35;
export const BASE_SPEED = 200;
export const BASE_MAX_HEALTH = 100;
export const RESPAWN_INVINCIBLE_TIME = 2;
export const INITIAL_WEAPON_CHOICES = 5;
export const MAX_AUX_SLOTS = 2;

/** 每关时长（秒） */
export const STAGE_DURATION = 600;
/** 结算公式：击杀数 × 关卡等级 × 该系数 */
export const COINS_PER_KILL = 100;
/** 关卡结算后自动进入下一关的倒计时（秒） */
export const STAGE_NEXT_COUNTDOWN = 5;

/** 暂停面板「退出游戏」按钮（面板为左侧 300px 栏） */
export const PAUSE_EXIT_BTN = { x: 10, y: 552, w: 280, h: 34 };
/** 关卡完成界面「下一关」按钮 */
export const NEXT_STAGE_BTN = { x: (SCREEN_WIDTH - 220) / 2, y: 380, w: 220, h: 50 };
/** 主菜单「天赋树」入口按钮 */
export const TALENT_BTN = { x: (SCREEN_WIDTH - 200) / 2, y: 396, w: 200, h: 44 };
/** 天赋树面板「返回」按钮 */
export const TALENT_BACK_BTN = { x: (SCREEN_WIDTH - 160) / 2, y: 552, w: 160, h: 36 };

/* 天赋树常量 */
export const TALENT_MAX_LEVEL = 5;
/** 暴击伤害倍率 */
export const CRIT_MULTIPLIER = 2;
/** 2 阶解锁条件：1 阶合计投入等级 >= 该值 */
export const TALENT_TIER2_REQ = 5;
/** 3 阶解锁条件：2 阶合计投入等级 >= 该值 */
export const TALENT_TIER3_REQ = 4;
/** 每次升级消耗的天赋点 */
export const TALENT_UPGRADE_COST = 1;
/** 通关每关获得的天赋点 */
export const TALENT_POINTS_PER_STAGE = 1;

export interface WeaponCharacterPreset {
  speedMultiplier: number;
  health: number;
}

export const WEAPON_CHARACTER_PRESETS: Record<WeaponTypeId, WeaponCharacterPreset> = {
  [WeaponTypeId.MachineGun]: { speedMultiplier: 1, health: 100 },
  [WeaponTypeId.Shotgun]: { speedMultiplier: 0.8, health: 130 },
  [WeaponTypeId.MeleeBlade]: { speedMultiplier: 1.4, health: 90 },
  [WeaponTypeId.Flamethrower]: { speedMultiplier: 0.75, health: 120 },
  [WeaponTypeId.LaserGun]: { speedMultiplier: 1, health: 100 },
  [WeaponTypeId.Bow]: { speedMultiplier: 1.25, health: 80 },
};

export const WEAPON_CONFIGS: Record<WeaponTypeId, WeaponConfig> = {
  [WeaponTypeId.MachineGun]: {
    id: WeaponTypeId.MachineGun, name: '机关枪',
    baseStats: { damage: 10, fireRate: 8, magazineCapacity: 30, reloadSpeed: 2.5, penetration: 1, bulletCount: 1, range: 150 },
    isMelee: false,
  },
  [WeaponTypeId.Shotgun]: {
    id: WeaponTypeId.Shotgun, name: '散弹枪',
    baseStats: { damage: 7, fireRate: 1.2, magazineCapacity: 6, reloadSpeed: 1.5, penetration: 1, bulletCount: 5, range: 100 },
    isMelee: false,
  },
  [WeaponTypeId.MeleeBlade]: {
    id: WeaponTypeId.MeleeBlade, name: '近战刀',
    baseStats: { damage: 25, fireRate: 5, magazineCapacity: Infinity, reloadSpeed: 0, penetration: Infinity, bulletCount: 1, range: 45 },
    isMelee: true, attackArc: Math.PI * 0.75,
  },
  [WeaponTypeId.Flamethrower]: {
    id: WeaponTypeId.Flamethrower, name: '火焰喷射器',
    baseStats: { damage: 5, fireRate: 8, magazineCapacity: 200, reloadSpeed: 2.8, penetration: 1, bulletCount: 1, range: 140 },
    isMelee: false,
  },
  [WeaponTypeId.LaserGun]: {
    id: WeaponTypeId.LaserGun, name: '激光枪',
    baseStats: { damage: 15, fireRate: 3, magazineCapacity: 20, reloadSpeed: 1.8, penetration: 5, bulletCount: 1, range: 200 },
    isMelee: false,
  },
  [WeaponTypeId.Bow]: {
    id: WeaponTypeId.Bow, name: '弓箭',
    baseStats: { damage: 20, fireRate: 1.5, magazineCapacity: 1, reloadSpeed: 0.4, penetration: 3, bulletCount: 3, range: 175 },
    isMelee: false,
  },
};

export const AUXILIARY_WEAPON_CONFIGS: Record<AuxiliaryWeaponType, AuxiliaryWeaponConfig> = {
  [AuxiliaryWeaponType.Missile]: {
    id: AuxiliaryWeaponType.Missile, name: '导弹',
    baseStats: { damage: 30, range: 350, cooldown: 0, count: 1, explosionRadius: 55, rotationSpeed: 0, duration: 0, placementCooldown: 2, turretFireRate: 0, armTime: 0 },
    maxCount: 1,
  },
  [AuxiliaryWeaponType.WindWheel]: {
    id: AuxiliaryWeaponType.WindWheel, name: '旋转风轮',
    baseStats: { damage: 40, range: 40, cooldown: 0, count: 3, explosionRadius: 0, rotationSpeed: 4.4, duration: 0, placementCooldown: 0, turretFireRate: 0, armTime: 0 },
    maxCount: 6,
  },
  [AuxiliaryWeaponType.LaserGun]: {
    id: AuxiliaryWeaponType.LaserGun, name: '激光枪',
    baseStats: { damage: 21.6, range: 125, cooldown: 0.5, count: 1, explosionRadius: 0, rotationSpeed: 0, duration: 0, placementCooldown: 0, turretFireRate: 0, armTime: 0 },
    maxCount: 1,
  },
  [AuxiliaryWeaponType.SwordEnergy]: {
    id: AuxiliaryWeaponType.SwordEnergy, name: '剑气',
    baseStats: { damage: 20, range: 300, cooldown: 0, count: 1, explosionRadius: 0, rotationSpeed: 0, duration: 2.5, placementCooldown: 1, turretFireRate: 0, armTime: 0 },
    maxCount: 3,
  },
  [AuxiliaryWeaponType.Turret]: {
    id: AuxiliaryWeaponType.Turret, name: '炮台',
    baseStats: { damage: 24, range: 220, cooldown: 0, count: 2, explosionRadius: 45, rotationSpeed: 0, duration: 20, placementCooldown: 0.6, turretFireRate: 3, armTime: 0 },
    maxCount: 3,
  },
  [AuxiliaryWeaponType.LandMine]: {
    id: AuxiliaryWeaponType.LandMine, name: '地雷',
    baseStats: { damage: 40, range: 0, cooldown: 0, count: 1, explosionRadius: 50, rotationSpeed: 0, duration: 0, placementCooldown: 0, turretFireRate: 0, armTime: 2 },
    maxCount: 1,
  },
};

export const INITIAL_WEAPON_POOL: WeaponTypeId[] = [
  WeaponTypeId.MachineGun, WeaponTypeId.Shotgun, WeaponTypeId.MeleeBlade,
  WeaponTypeId.Flamethrower, WeaponTypeId.Bow,
];

export const ALL_WEAPON_TYPES: WeaponTypeId[] = [
  WeaponTypeId.MachineGun, WeaponTypeId.Shotgun, WeaponTypeId.MeleeBlade,
  WeaponTypeId.Flamethrower, WeaponTypeId.LaserGun, WeaponTypeId.Bow,
];

export const ALL_AUXILIARY_TYPES: AuxiliaryWeaponType[] = [
  AuxiliaryWeaponType.Missile, AuxiliaryWeaponType.WindWheel, AuxiliaryWeaponType.LaserGun,
  AuxiliaryWeaponType.SwordEnergy, AuxiliaryWeaponType.Turret, AuxiliaryWeaponType.LandMine,
];

export const XP_THRESHOLD_BASE = 30;
export const XP_THRESHOLD_GROWTH = 1.2;
export const ENEMY_XP_BASE = 15;
export const ENEMY_XP_GROWTH = 1.1;
export const MINI_BOSS_XP_MULTIPLIER = 5;
export const MINI_BOSS_KILL_THRESHOLD_BASE = 50;
export const MINI_BOSS_KILL_THRESHOLD_GROWTH = 1.5;