import {
  Character,
  UpgradeOption,
  WeaponTypeId,
  AuxiliaryWeaponType,
  AuxiliaryWeapon,
  WeaponStats,
  AuxiliaryWeaponStats,
  Rarity,
  RARITY_MULTIPLIERS,
  RARITY_NAMES,
  RARITY_WEIGHTS,
  ALL_AUXILIARY_TYPES,
  WEAPON_CONFIGS,
  AUXILIARY_WEAPON_CONFIGS,
} from './types';
import { createAuxiliaryWeapon } from './character';

const MAIN_WEAPON_DELTAS: Partial<Record<keyof WeaponStats, number>> = {
  damage: 5, fireRate: 1, magazineCapacity: 5, reloadSpeed: -0.2, penetration: 1, bulletCount: 1, range: 10,
};

const AUX_WEAPON_DELTAS: Partial<Record<keyof AuxiliaryWeaponStats, number>> = {
  damage: 5, range: 10, cooldown: -0.3, count: 1, explosionRadius: 10, rotationSpeed: 0.3, duration: 2, placementCooldown: -0.5, turretFireRate: 0.3, armTime: -0.2,
};

const MAIN_STAT_DESCRIPTIONS: Record<string, (delta: number) => string> = {
  damage: (d) => `${d > 0 ? '+' : ''}${d} 伤害`,
  fireRate: (d) => `${d > 0 ? '+' : ''}${d} 攻速`,
  magazineCapacity: (d) => `${d > 0 ? '+' : ''}${d} 弹匣`,
  reloadSpeed: (d) => `${d > 0 ? '+' : ''}${d} 换弹速度`,
  penetration: (d) => `${d > 0 ? '+' : ''}${d} 穿透`,
  bulletCount: (d) => `${d > 0 ? '+' : ''}${d} 子弹数量`,
  range: (d) => `${d > 0 ? '+' : ''}${d} 范围`,
};

const AUX_STAT_DESCRIPTIONS: Record<string, (delta: number) => string> = {
  damage: (d) => `${d > 0 ? '+' : ''}${d} 伤害`,
  range: (d) => `${d > 0 ? '+' : ''}${d} 范围`,
  cooldown: (d) => `${d > 0 ? '+' : ''}${d} 充能时间`,
  count: (d) => `${d > 0 ? '+' : ''}${d} 数量`,
  explosionRadius: (d) => `${d > 0 ? '+' : ''}${d} 爆炸范围`,
  rotationSpeed: (d) => `${d > 0 ? '+' : ''}${d} 旋转速度`,
  duration: (d) => `${d > 0 ? '+' : ''}${d} 持续时间`,
  placementCooldown: (d) => `${d > 0 ? '+' : ''}${d} 放置时间`,
  turretFireRate: (d) => `${d > 0 ? '+' : ''}${d} 炮台攻速`,
  armTime: (d) => `${d > 0 ? '+' : ''}${d} 部署时间`,
};

function rollRarity(): Rarity {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
    roll -= weight;
    if (roll <= 0) return rarity as Rarity;
  }
  return Rarity.Common;
}

function getMainUpgradeableStats(typeId: WeaponTypeId): (keyof WeaponStats)[] {
  const config = WEAPON_CONFIGS[typeId];
  const stats = ['damage', 'fireRate', 'range'] as (keyof WeaponStats)[];
  if (config.isMelee) return stats;
  stats.push('penetration', 'magazineCapacity', 'reloadSpeed', 'bulletCount');
  return stats;
}

const AUX_UPGRADEABLE_OVERRIDES: Partial<Record<AuxiliaryWeaponType, (keyof AuxiliaryWeaponStats)[]>> = {
  [AuxiliaryWeaponType.Missile]: ['damage', 'explosionRadius', 'placementCooldown'],
  [AuxiliaryWeaponType.SwordEnergy]: ['count', 'duration', 'placementCooldown'],
};

function getAuxUpgradeableStats(aux: AuxiliaryWeapon): (keyof AuxiliaryWeaponStats)[] {
  const config = AUXILIARY_WEAPON_CONFIGS[aux.typeId];
  const override = AUX_UPGRADEABLE_OVERRIDES[aux.typeId];
  const stats = override ?? (() => {
    const all = Object.keys(config.baseStats) as (keyof AuxiliaryWeaponStats)[];
    return all.filter((k) => {
      const v = config.baseStats[k];
      // 只保留该武器实际用到的属性（baseStats 为 0 表示该武器不消费此属性，
      // 例如导弹的 rotationSpeed=0，不应 roll 出「旋转速度」（飞轮专属））
      return v > 0 && (
        k === 'damage' || k === 'range' || k === 'cooldown' || k === 'count' || k === 'explosionRadius' ||
        k === 'rotationSpeed' || k === 'duration' || k === 'placementCooldown' || k === 'turretFireRate' || k === 'armTime'
      );
    });
  })();
  // 旋转飞轮 / 剑气数量满后不再出「数量」升级，改为其余属性
  if (
    (aux.typeId === AuxiliaryWeaponType.WindWheel || aux.typeId === AuxiliaryWeaponType.SwordEnergy) &&
    Math.floor(aux.stats.count) >= config.maxCount
  ) {
    return stats.filter((k) => k !== 'count');
  }
  return stats;
}

function generateMainWeaponUpgradeOptions(typeId: WeaponTypeId): UpgradeOption[] {
  const stats = getMainUpgradeableStats(typeId);
  const shuffled = stats.sort(() => Math.random() - 0.5);
  const count = Math.min(2, shuffled.length);
  return shuffled.slice(0, count).map((stat) => {
    const rarity = rollRarity();
    const multiplier = RARITY_MULTIPLIERS[rarity];
    const baseDelta = MAIN_WEAPON_DELTAS[stat] ?? 0;
    const delta = baseDelta * multiplier;
    return {
      target: 'main_weapon',
      weaponTypeId: typeId,
      stat,
      statDelta: delta,
      description: `[${RARITY_NAMES[rarity]}] ${WEAPON_CONFIGS[typeId].name} ${MAIN_STAT_DESCRIPTIONS[stat]?.(delta) ?? ''}`,
      rarity,
    };
  });
}

function generateAuxWeaponUpgradeOptions(aux: AuxiliaryWeapon): UpgradeOption[] {
  const stats = getAuxUpgradeableStats(aux);
  const typeId = aux.typeId;
  const shuffled = stats.sort(() => Math.random() - 0.5);
  const count = Math.min(1, shuffled.length);
  return shuffled.slice(0, count).map((stat) => {
    const rarity = rollRarity();
    const multiplier = RARITY_MULTIPLIERS[rarity];
    const baseDelta = AUX_WEAPON_DELTAS[stat] ?? 0;
    const delta = baseDelta * multiplier;
    return {
      target: 'aux_weapon',
      auxTypeId: typeId,
      stat,
      statDelta: delta,
      description: `[${RARITY_NAMES[rarity]}] ${AUXILIARY_WEAPON_CONFIGS[typeId].name} ${AUX_STAT_DESCRIPTIONS[stat]?.(delta) ?? ''}`,
      rarity,
    };
  });
}

function generateAcquireAuxOption(ownedTypes: AuxiliaryWeaponType[]): UpgradeOption[] {
  const available = ALL_AUXILIARY_TYPES.filter((t) => !ownedTypes.includes(t));
  if (available.length === 0) return [];
  const shuffled = available.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 1).map((typeId) => {
    const rarity = rollRarity();
    return {
      target: 'acquire_aux',
      auxTypeId: typeId,
      description: `[${RARITY_NAMES[rarity]}] 获得 ${AUXILIARY_WEAPON_CONFIGS[typeId].name}`,
      rarity,
    };
  });
}

export function generateUpgradeOptions(character: Character): UpgradeOption[] {
  const options: UpgradeOption[] = [];

  generateMainWeaponUpgradeOptions(character.mainWeapon.typeId).forEach((o) => options.push(o));

  for (const aux of character.auxWeapons) {
    generateAuxWeaponUpgradeOptions(aux).forEach((o) => options.push(o));
  }

  if (character.auxWeapons.length < character.maxAuxSlots) {
    const ownedTypes = character.auxWeapons.map((a) => a.typeId);
    generateAcquireAuxOption(ownedTypes).forEach((o) => options.push(o));
  }

  const shuffled = options.sort(() => Math.random() - 0.5);
  const picked: UpgradeOption[] = [];
  const usedDesc = new Set<string>();
  for (const opt of shuffled) {
    if (picked.length >= 3) break;
    if (!usedDesc.has(opt.description)) {
      picked.push(opt);
      usedDesc.add(opt.description);
    }
  }

  const allStats = getMainUpgradeableStats(character.mainWeapon.typeId);
  while (picked.length < 3) {
    const stat = allStats[Math.floor(Math.random() * allStats.length)];
    const rarity = Rarity.Common;
    const baseDelta = MAIN_WEAPON_DELTAS[stat] ?? 0;
    const desc = `[普通] ${WEAPON_CONFIGS[character.mainWeapon.typeId].name} ${MAIN_STAT_DESCRIPTIONS[stat]?.(baseDelta) ?? ''}`;
    if (!usedDesc.has(desc)) {
      picked.push({
        target: 'main_weapon',
        weaponTypeId: character.mainWeapon.typeId,
        stat,
        statDelta: baseDelta,
        description: desc,
        rarity,
      });
      usedDesc.add(desc);
    }
  }

  return picked;
}

export function applyUpgrade(character: Character, option: UpgradeOption): void {
  if (option.target === 'main_weapon') {
    if (option.stat && option.statDelta !== undefined) {
      const weapon = character.mainWeapon;
      weapon.level++;
      const current = (weapon.stats as any)[option.stat] as number;
      (weapon.stats as any)[option.stat] = Math.max(0.3, current + option.statDelta);
      if (option.stat === 'magazineCapacity') {
        weapon.currentAmmo = weapon.stats.magazineCapacity;
      }
    }
    return;
  }

  if (option.target === 'acquire_aux' && option.auxTypeId) {
    const existing = character.auxWeapons.find((a) => a.typeId === option.auxTypeId);
    if (!existing && character.auxWeapons.length < character.maxAuxSlots) {
      character.auxWeapons.push(createAuxiliaryWeapon(option.auxTypeId));
    }
    return;
  }

  if (option.target === 'aux_weapon' && option.auxTypeId && option.stat && option.statDelta !== undefined) {
    const aux = character.auxWeapons.find((a) => a.typeId === option.auxTypeId);
    if (aux) {
      aux.level++;
      const current = (aux.stats as any)[option.stat] as number;
      (aux.stats as any)[option.stat] = Math.max(0.3, current + option.statDelta);
    }
  }
}

export function generateWeaponDropOptions(ownedTypes: AuxiliaryWeaponType[]): AuxiliaryWeaponType[] {
  const available = ALL_AUXILIARY_TYPES.filter((t) => !ownedTypes.includes(t));
  if (available.length === 0) return [];
  const shuffled = available.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(3, shuffled.length));
}