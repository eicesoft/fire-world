import { describe, it, expect } from 'vitest';
import {
  WeaponTypeId,
  AuxiliaryWeaponType,
  Rarity,
  WEAPON_CONFIGS,
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
} from '../src/game/types';
import { createCharacter, createWeapon, createAuxiliaryWeapon, getXpThreshold, getMiniBossKillThreshold } from '../src/game/character';
import { calculateDamage, applyDamage } from '../src/game/combat';
import { generateUpgradeOptions, applyUpgrade, generateWeaponDropOptions } from '../src/game/upgrades';

describe('Character creation', () => {
  it('creates a character with default stats', () => {
    const char = createCharacter(WeaponTypeId.MachineGun);
    expect(char.health).toBe(BASE_MAX_HEALTH);
    expect(char.maxHealth).toBe(BASE_MAX_HEALTH);
    expect(char.speed).toBe(BASE_SPEED);
    expect(char.level).toBe(1);
    expect(char.xp).toBe(0);
    expect(char.xpToNextLevel).toBe(XP_THRESHOLD_BASE);
    expect(char.mainWeapon.typeId).toBe(WeaponTypeId.MachineGun);
    expect(char.auxWeapons.length).toBe(0);
    expect(char.maxAuxSlots).toBe(MAX_AUX_SLOTS);
    expect(char.xpAbsorptionRadius).toBe(BASE_XP_ABSORPTION_RADIUS);
    expect(char.position.x).toBe(MAP_WIDTH / 2);
    expect(char.position.y).toBe(MAP_HEIGHT / 2);
  });

  it('creates a character with Shotgun', () => {
    const char = createCharacter(WeaponTypeId.Shotgun);
    expect(char.mainWeapon.typeId).toBe(WeaponTypeId.Shotgun);
  });

  it('creates a character with MeleeBlade', () => {
    const char = createCharacter(WeaponTypeId.MeleeBlade);
    expect(char.mainWeapon.typeId).toBe(WeaponTypeId.MeleeBlade);
  });
});

describe('Weapon creation', () => {
  it('creates a weapon with full ammo', () => {
    const weapon = createWeapon(WeaponTypeId.MachineGun);
    expect(weapon.currentAmmo).toBe(WEAPON_CONFIGS[WeaponTypeId.MachineGun].baseStats.magazineCapacity);
    expect(weapon.reloadTimer).toBe(0);
    expect(weapon.fireCooldown).toBe(0);
  });

  it('melee weapon has infinite ammo', () => {
    const weapon = createWeapon(WeaponTypeId.MeleeBlade);
    expect(weapon.currentAmmo).toBe(Infinity);
  });

  it('creates weapons with correct base stats', () => {
    const machineGun = createWeapon(WeaponTypeId.MachineGun);
    expect(machineGun.stats.damage).toBe(10);
    expect(machineGun.stats.fireRate).toBe(8);
    expect(machineGun.stats.magazineCapacity).toBe(30);
    expect(machineGun.stats.reloadSpeed).toBe(2.5);
    expect(machineGun.stats.penetration).toBe(1);

    const shotgun = createWeapon(WeaponTypeId.Shotgun);
    expect(shotgun.stats.damage).toBe(7);
    expect(shotgun.stats.bulletCount).toBe(5);

    const melee = createWeapon(WeaponTypeId.MeleeBlade);
    expect(melee.stats.damage).toBe(25);
    expect(melee.stats.range).toBe(60);
  });
});

describe('XP threshold', () => {
  it('calculates base XP threshold for level 1', () => {
    expect(getXpThreshold(1)).toBe(XP_THRESHOLD_BASE);
  });

  it('scales XP threshold with level', () => {
    expect(getXpThreshold(2)).toBe(Math.floor(XP_THRESHOLD_BASE * XP_THRESHOLD_GROWTH));
    expect(getXpThreshold(3)).toBe(Math.floor(XP_THRESHOLD_BASE * XP_THRESHOLD_GROWTH ** 2));
    expect(getXpThreshold(5)).toBe(Math.floor(XP_THRESHOLD_BASE * XP_THRESHOLD_GROWTH ** 4));
  });
});

describe('Mini-boss kill threshold', () => {
  it('calculates base threshold', () => {
    expect(getMiniBossKillThreshold(1)).toBe(MINI_BOSS_KILL_THRESHOLD_BASE);
  });

  it('scales with spawn count', () => {
    expect(getMiniBossKillThreshold(2)).toBe(Math.floor(MINI_BOSS_KILL_THRESHOLD_BASE * MINI_BOSS_KILL_THRESHOLD_GROWTH));
    expect(getMiniBossKillThreshold(3)).toBe(Math.floor(MINI_BOSS_KILL_THRESHOLD_BASE * MINI_BOSS_KILL_THRESHOLD_GROWTH ** 2));
  });
});

describe('Combat system', () => {
  it('calculates damage from weapon stats', () => {
    const weapon = createWeapon(WeaponTypeId.MachineGun);
    const damage = calculateDamage(weapon);
    expect(damage).toBe(10);
  });

  it('applies damage to character', () => {
    const char = createCharacter(WeaponTypeId.MachineGun);
    const result = applyDamage(char, 30);
    expect(result.health).toBe(BASE_MAX_HEALTH - 30);
    expect(result.isDead).toBe(false);
  });

  it('character dies when health reaches 0', () => {
    const char = createCharacter(WeaponTypeId.MachineGun);
    const result = applyDamage(char, BASE_MAX_HEALTH);
    expect(result.health).toBe(0);
    expect(result.isDead).toBe(true);
  });

  it('character health does not go below 0', () => {
    const char = createCharacter(WeaponTypeId.MachineGun);
    const result = applyDamage(char, 200);
    expect(result.health).toBe(0);
    expect(result.isDead).toBe(true);
  });
});

describe('Upgrade system', () => {
  it('generates upgrade options for a level-up', () => {
    const char = createCharacter(WeaponTypeId.MachineGun);
    const options = generateUpgradeOptions(char);
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options[0].target).toBeDefined();
    expect(options[0].description).toBeTruthy();
  });

  it('applies a main weapon stat upgrade', () => {
    const char = createCharacter(WeaponTypeId.MachineGun);
    const originalDamage = char.mainWeapon.stats.damage;
    applyUpgrade(char, {
      target: 'main_weapon',
      weaponTypeId: WeaponTypeId.MachineGun,
      stat: 'damage',
      statDelta: 5,
      description: '+5 damage',
      rarity: Rarity.Common,
    });
    expect(char.mainWeapon.stats.damage).toBe(originalDamage + 5);
  });

  it('acquires an auxiliary weapon', () => {
    const char = createCharacter(WeaponTypeId.MachineGun);
    expect(char.auxWeapons.length).toBe(0);
    applyUpgrade(char, {
      target: 'acquire_aux',
      auxTypeId: AuxiliaryWeaponType.Missile,
      description: '获得 导弹',
      rarity: Rarity.Common,
    });
    expect(char.auxWeapons.length).toBe(1);
    expect(char.auxWeapons[0].typeId).toBe(AuxiliaryWeaponType.Missile);
  });

  it('generates weapon drop options', () => {
    const options = generateWeaponDropOptions([]);
    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThanOrEqual(3);
  });

  it('aux upgrade options only offer stats the weapon actually uses', () => {
    const char = createCharacter(WeaponTypeId.MachineGun);
    char.auxWeapons.push(createAuxiliaryWeapon(AuxiliaryWeaponType.Missile));
    const forbidden = new Set(['rotationSpeed', 'duration', 'placementCooldown', 'turretFireRate', 'armTime']);
    for (let i = 0; i < 300; i++) {
      for (const opt of generateUpgradeOptions(char)) {
        if (opt.target === 'aux_weapon') {
          expect(opt.auxTypeId).toBe(AuxiliaryWeaponType.Missile);
          expect(forbidden.has(opt.stat as string)).toBe(false);
        }
      }
    }
  });

  it('wind wheel offers rotation speed upgrades', () => {
    const char = createCharacter(WeaponTypeId.MachineGun);
    char.auxWeapons.push(createAuxiliaryWeapon(AuxiliaryWeaponType.WindWheel));
    let found = false;
    for (let i = 0; i < 300 && !found; i++) {
      for (const opt of generateUpgradeOptions(char)) {
        if (opt.target === 'aux_weapon' && opt.stat === 'rotationSpeed') {
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
  });
});

describe('Main weapon stat upgrade deltas', () => {
  it('increases damage by 5 per upgrade', () => {
    const char = createCharacter(WeaponTypeId.MachineGun);
    const original = char.mainWeapon.stats.damage;
    applyUpgrade(char, { target: 'main_weapon', weaponTypeId: WeaponTypeId.MachineGun, stat: 'damage', statDelta: 5, description: '+5 damage', rarity: Rarity.Common });
    expect(char.mainWeapon.stats.damage).toBe(original + 5);
  });

  it('increases magazine capacity by 5 per upgrade', () => {
    const char = createCharacter(WeaponTypeId.MachineGun);
    const original = char.mainWeapon.stats.magazineCapacity;
    applyUpgrade(char, { target: 'main_weapon', weaponTypeId: WeaponTypeId.MachineGun, stat: 'magazineCapacity', statDelta: 5, description: '+5 mag', rarity: Rarity.Common });
    expect(char.mainWeapon.stats.magazineCapacity).toBe(original + 5);
  });

  it('decreases reload speed by 0.2 per upgrade (capped at 0.3)', () => {
    const char = createCharacter(WeaponTypeId.MachineGun);
    applyUpgrade(char, { target: 'main_weapon', weaponTypeId: WeaponTypeId.MachineGun, stat: 'reloadSpeed', statDelta: -0.2, description: '-0.2 reload', rarity: Rarity.Common });
    expect(char.mainWeapon.stats.reloadSpeed).toBeCloseTo(2.3);
  });

  it('increases fire rate by 1 per upgrade', () => {
    const char = createCharacter(WeaponTypeId.MachineGun);
    const original = char.mainWeapon.stats.fireRate;
    applyUpgrade(char, { target: 'main_weapon', weaponTypeId: WeaponTypeId.MachineGun, stat: 'fireRate', statDelta: 1, description: '+1 fire rate', rarity: Rarity.Common });
    expect(char.mainWeapon.stats.fireRate).toBe(original + 1);
  });
});