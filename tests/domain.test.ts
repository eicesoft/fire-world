import { describe, it, expect } from 'vitest';
import {
  WeaponTypeId,
  AuxiliaryWeaponType,
  Rarity,
  Enemy,
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
import { findAutoAimTarget } from '../src/game/collision';
import { createChest } from '../src/game/spawner';
import { createInitialGameState, updateGame, startNextStage } from '../src/game/gameLoop';
import { spawnEnemyWave } from '../src/game/spawner';
import { ChestType, GamePhase, STAGE_DURATION, COINS_PER_KILL } from '../src/game/types';

function makeEnemy(id: string, x: number, y: number, isMiniBoss = false, speed = 60): Enemy {
  return {
    id, configId: 'walker', position: { x, y }, health: 20, maxHealth: 20,
    speed, damage: 10, xpValue: 1, isMiniBoss, size: 20, attackCooldown: 0,
    burnDamage: 0, burnTimer: 0,
  };
}

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

describe('Per-weapon character presets', () => {
  it('machine gun: base speed 200, hp 100', () => {
    const c = createCharacter(WeaponTypeId.MachineGun);
    expect(c.speed).toBe(BASE_SPEED);
    expect(c.health).toBe(100);
  });

  it('shotgun: slow, durable (speed 160, hp 130)', () => {
    const c = createCharacter(WeaponTypeId.Shotgun);
    expect(c.speed).toBeCloseTo(160);
    expect(c.health).toBe(130);
  });

  it('melee blade: fast, fragile (speed 280, hp 90)', () => {
    const c = createCharacter(WeaponTypeId.MeleeBlade);
    expect(c.speed).toBeCloseTo(280);
    expect(c.health).toBe(90);
  });

  it('flamethrower: slowest, durable (speed 150, hp 120)', () => {
    const c = createCharacter(WeaponTypeId.Flamethrower);
    expect(c.speed).toBeCloseTo(150);
    expect(c.health).toBe(120);
  });

  it('bow: fast, fragile (speed 250, hp 80)', () => {
    const c = createCharacter(WeaponTypeId.Bow);
    expect(c.speed).toBeCloseTo(250);
    expect(c.health).toBe(80);
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
    expect(machineGun.stats.range).toBe(150);

    const shotgun = createWeapon(WeaponTypeId.Shotgun);
    expect(shotgun.stats.damage).toBe(7);
    expect(shotgun.stats.bulletCount).toBe(5);

    const melee = createWeapon(WeaponTypeId.MeleeBlade);
    expect(melee.stats.damage).toBe(25);
    expect(melee.stats.range).toBe(45);
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

  it('missile upgrade options only offer the stats it uses (damage/explosionRadius/placementCooldown)', () => {
    const char = createCharacter(WeaponTypeId.MachineGun);
    char.auxWeapons.push(createAuxiliaryWeapon(AuxiliaryWeaponType.Missile));
    const forbidden = new Set(['range', 'count', 'cooldown', 'rotationSpeed', 'duration', 'turretFireRate', 'armTime']);
    const allowed = new Set(['damage', 'explosionRadius', 'placementCooldown']);
    for (let i = 0; i < 300; i++) {
      for (const opt of generateUpgradeOptions(char)) {
        if (opt.target === 'aux_weapon') {
          expect(opt.auxTypeId).toBe(AuxiliaryWeaponType.Missile);
          expect(forbidden.has(opt.stat as string)).toBe(false);
          expect(allowed.has(opt.stat as string)).toBe(true);
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

  it('wind wheel stops offering count upgrades once count is maxed (6)', () => {
    const char = createCharacter(WeaponTypeId.MachineGun);
    const ww = createAuxiliaryWeapon(AuxiliaryWeaponType.WindWheel);
    ww.stats.count = 6;
    char.auxWeapons.push(ww);
    for (let i = 0; i < 300; i++) {
      for (const opt of generateUpgradeOptions(char)) {
        if (opt.target === 'aux_weapon' && opt.auxTypeId === AuxiliaryWeaponType.WindWheel) {
          expect(opt.stat).not.toBe('count');
        }
      }
    }
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

describe('Auto-aim target selection', () => {
  it('picks the nearest enemy within range', () => {
    const enemies = [
      makeEnemy('far', 300, 0),
      makeEnemy('near', 120, 0),
    ];
    const target = findAutoAimTarget({ x: 0, y: 0 }, enemies, 300);
    expect(target?.id).toBe('near');
  });

  it('returns null when no enemy is in range', () => {
    const enemies = [makeEnemy('out', 500, 0)];
    expect(findAutoAimTarget({ x: 0, y: 0 }, enemies, 300)).toBeNull();
  });

  it('prioritizes a mini-boss over closer regular enemies', () => {
    const enemies = [
      makeEnemy('boss', 280, 0, true),
      makeEnemy('walk', 100, 0),
    ];
    const target = findAutoAimTarget({ x: 0, y: 0 }, enemies, 300);
    expect(target?.id).toBe('boss');
  });
});

describe('Auxiliary weapon base stat buffs', () => {
  it('missile base stats: uses placementCooldown (3s) as launch interval, explosive radius 40', () => {
    const missile = createAuxiliaryWeapon(AuxiliaryWeaponType.Missile);
    expect(missile.stats.cooldown).toBe(0);
    expect(missile.stats.placementCooldown).toBe(3);
    expect(missile.stats.explosionRadius).toBe(40);
  });

  it('wind wheel base damage is 25 (+150%) and rotation speed is 4.4 (+120%)', () => {
    const ww = createAuxiliaryWeapon(AuxiliaryWeaponType.WindWheel);
    expect(ww.stats.damage).toBe(25);
    expect(ww.stats.rotationSpeed).toBeCloseTo(4.4);
    expect(ww.stats.range).toBe(40);
  });

  it('turret base stats: damage 16 (+100%), fire rate 2 (+100%), no placement wait, explosive', () => {
    const turret = createAuxiliaryWeapon(AuxiliaryWeaponType.Turret);
    expect(turret.stats.damage).toBe(16);
    expect(turret.stats.turretFireRate).toBe(2);
    expect(turret.stats.placementCooldown).toBe(0);
    expect(turret.stats.range).toBe(100);
    expect(turret.stats.explosionRadius).toBeGreaterThan(0);
  });

  it('aux laser base damage is 21.6 (+80%)', () => {
    const laser = createAuxiliaryWeapon(AuxiliaryWeaponType.LaserGun);
    expect(laser.stats.damage).toBeCloseTo(21.6);
    expect(laser.stats.range).toBe(125);
  });
});

describe('SwordEnergy rework', () => {
  it('has halved range (100) and gains duration/placement stats', () => {
    const sword = createAuxiliaryWeapon(AuxiliaryWeaponType.SwordEnergy);
    expect(sword.stats.range).toBe(100);
    expect(sword.stats.duration).toBe(2.5);
    expect(sword.stats.placementCooldown).toBe(1.5);
    expect(sword.stats.cooldown).toBe(0);
  });

  it('only offers count/duration/placementCooldown upgrades', () => {
    const char = createCharacter(WeaponTypeId.MachineGun);
    char.auxWeapons.push(createAuxiliaryWeapon(AuxiliaryWeaponType.SwordEnergy));
    const allowed = new Set(['count', 'duration', 'placementCooldown']);
    for (let i = 0; i < 300; i++) {
      for (const opt of generateUpgradeOptions(char)) {
        if (opt.target === 'aux_weapon' && opt.auxTypeId === AuxiliaryWeaponType.SwordEnergy) {
          expect(allowed.has(opt.stat as string)).toBe(true);
        }
      }
    }
  });

  it('sword energy stops offering count upgrades once count is maxed (6)', () => {
    const char = createCharacter(WeaponTypeId.MachineGun);
    const sword = createAuxiliaryWeapon(AuxiliaryWeaponType.SwordEnergy);
    sword.stats.count = 6;
    char.auxWeapons.push(sword);
    for (let i = 0; i < 300; i++) {
      for (const opt of generateUpgradeOptions(char)) {
        if (opt.target === 'aux_weapon' && opt.auxTypeId === AuxiliaryWeaponType.SwordEnergy) {
          expect(opt.stat).not.toBe('count');
        }
      }
    }
  });
});

describe('Chest drops', () => {
  it('creates chests of all five types (health/maxhp/speed/range/xp)', () => {
    const seen = new Set<ChestType>();
    for (let i = 0; i < 400 && seen.size < 5; i++) {
      seen.add(createChest({ x: 10, y: 10 }).type);
    }
    expect(seen.size).toBe(5);
  });

  it('picks up chests within the XP absorption radius', () => {
    const state = createInitialGameState();
    state.phase = GamePhase.Playing;
    const char = state.character;
    char.position = { x: 1000, y: 1000 };
    state.chests = [{ id: 'chest_t', position: { x: 1000 + 25, y: 1000 }, type: ChestType.Health }];
    updateGame(state, 1 / 60, { x: 0, y: 0 });
    expect(state.chests.length).toBe(0);
  });

  it('does not pick up chests beyond the XP absorption radius', () => {
    const state = createInitialGameState();
    state.phase = GamePhase.Playing;
    const char = state.character;
    char.position = { x: 1000, y: 1000 };
    state.chests = [{ id: 'chest_f', position: { x: 1000 + 50, y: 1000 }, type: ChestType.Health }];
    updateGame(state, 1 / 60, { x: 0, y: 0 });
    expect(state.chests.length).toBe(1);
  });
});

describe('Stage system', () => {
  it('creates initial state at stage 1 with zeroed stage timer and kills', () => {
    const state = createInitialGameState();
    expect(state.stageLevel).toBe(1);
    expect(state.stageElapsedTime).toBe(0);
    expect(state.stageKillCount).toBe(0);
    expect(state.coins).toBeGreaterThanOrEqual(0);
  });

  it('awards coins = kills × stage × 100 when the stage timer expires', () => {
    const state = createInitialGameState();
    state.phase = GamePhase.Playing;
    state.stageKillCount = 50;
    state.stageElapsedTime = STAGE_DURATION - 0.001;
    updateGame(state, 0.01, { x: 0, y: 0 });
    expect(state.phase).toBe(GamePhase.LevelComplete);
    expect(state.lastStageResult).toEqual({ stage: 1, kills: 50, coinsEarned: 50 * 1 * COINS_PER_KILL });
    expect(state.coins).toBe(50 * 1 * COINS_PER_KILL);
  });

  it('stage timer does not complete early', () => {
    const state = createInitialGameState();
    state.phase = GamePhase.Playing;
    state.stageElapsedTime = STAGE_DURATION - 60;
    updateGame(state, 30, { x: 0, y: 0 });
    expect(state.phase).toBe(GamePhase.Playing);
  });

  it('startNextStage increments stage and resets the timer and kill count', () => {
    const state = createInitialGameState();
    state.phase = GamePhase.Playing;
    state.stageElapsedTime = 400;
    state.stageKillCount = 20;
    state.enemies = [makeEnemy('e1', 0, 0)];
    startNextStage(state);
    expect(state.stageLevel).toBe(2);
    expect(state.stageElapsedTime).toBe(0);
    expect(state.stageKillCount).toBe(0);
    expect(state.enemies.length).toBe(0);
    expect(state.phase).toBe(GamePhase.Playing);
  });

  it('enemy starting health is multiplied by the stage level (+100% per stage)', () => {
    const pos = { x: 1500, y: 1500 };
    const w1 = spawnEnemyWave(pos, 1, 1, 1);
    const w3 = spawnEnemyWave(pos, 1, 1, 3);
    expect(w3[0].maxHealth).toBeCloseTo(w1[0].maxHealth * 3);
  });
});