import {
  GameState,
  GamePhase,
  WeaponTypeId,
  AuxiliaryWeaponType,
  Projectile,
  ChestType,
  Vector2,
  SlashEffect,
  BeamEffect,
  DamageNumber,
  MAP_WIDTH,
  MAP_HEIGHT,
  MAX_AUX_SLOTS,
  INITIAL_WEAPON_POOL,
  WEAPON_CONFIGS,
  AUXILIARY_WEAPON_CONFIGS,
} from './types';
import { createCharacter, getXpThreshold, getMiniBossKillThreshold, healCharacter, increaseMaxHealth, addXpAbsorptionRadius } from './character';
import { applyDamage, respawnCharacter } from './combat';
import { generateUpgradeOptions, applyUpgrade, generateWeaponDropOptions } from './upgrades';
import { spawnEnemyWave, spawnMiniBoss, createXpDrop, createChest, generateObstacles, resetIds } from './spawner';
import { updateAuxWeapons, resetAuxIds } from '../systems/auxWeapons';
import { distance, angleBetween, findEnemiesInRange, enemiesInArc, clampToMap, resolveObstacleCollision } from './collision';

let nextProjectileId = 0;

function createProjectile(
  origin: Vector2, target: Vector2, damage: number, penetration: number,
  weaponType: WeaponTypeId, explosionRadius: number = 0, projectileSize: number = 3,
): Projectile {
  const angle = angleBetween(origin, target);
  const speed = weaponType === WeaponTypeId.Flamethrower ? 350 : 500;
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
  return {
    phase: GamePhase.WeaponSelect,
    character: createCharacter(WeaponTypeId.MachineGun),
    enemies: [], projectiles: [], xpDrops: [], chests: [],
    obstacles: generateObstacles(20), slashEffects: [], beamEffects: [], damageNumbers: [],
    turrets: [], landMines: [],
    mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT,
    mouseDirection: { x: 1, y: 0 }, elapsedTime: 0,
    miniBossKillThreshold: getMiniBossKillThreshold(1), currentMiniBossKills: 0,
    upgradeOptions: [], weaponDropOptions: [],
    availableWeaponTypes: [...INITIAL_WEAPON_POOL],
    selectedWeaponType: null, selectedIndex: 0,
  };
}

export function selectWeapon(state: GameState, weaponType: WeaponTypeId): void {
  state.character = createCharacter(weaponType);
  state.selectedWeaponType = weaponType;
  state.selectedIndex = 0;
  state.phase = GamePhase.Playing;
}

export function updateGame(state: GameState, dt: number, moveDir: Vector2): void {
  if (state.phase !== GamePhase.Playing) return;
  state.elapsedTime += dt;

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
  const mouseDir = state.mouseDirection;

  weapon.fireCooldown = Math.max(0, weapon.fireCooldown - dt);
  weapon.reloadTimer = Math.max(0, weapon.reloadTimer - dt);

  if (weapon.reloadTimer > 0) return;
  if (weapon.currentAmmo <= 0 && weapon.stats.magazineCapacity !== Infinity) {
    weapon.reloadTimer = weapon.stats.reloadSpeed;
    weapon.currentAmmo = weapon.stats.magazineCapacity;
    return;
  }
  if (weapon.fireCooldown > 0) return;

  const config = WEAPON_CONFIGS[weapon.typeId];
  if (config.isMelee) {
    const dirAngle = Math.atan2(mouseDir.y, mouseDir.x);
    const targets = enemiesInArc(char.position, dirAngle, state.enemies, weapon.stats.range, config.attackArc ?? Math.PI / 2);
    if (targets.length > 0) {
      for (const target of targets) {
        target.health -= weapon.stats.damage;
        state.damageNumbers.push({ position: { x: target.position.x, y: target.position.y - target.size }, value: weapon.stats.damage, timer: 0.8, maxTimer: 0.8 });
        const dx = target.position.x - char.position.x;
        const dy = target.position.y - char.position.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) { target.position.x += (dx / len) * 200; target.position.y += (dy / len) * 200; }
      }
      state.slashEffects.push({ position: { x: char.position.x, y: char.position.y }, direction: dirAngle, arc: config.attackArc ?? Math.PI / 2, range: weapon.stats.range, timer: 0.15 });
      weapon.fireCooldown = 1 / weapon.stats.fireRate;
    }
  } else {
    const nearest = findEnemiesInRange(char.position, state.enemies, weapon.stats.range);
    if (nearest.length > 0) {
      for (let i = 0; i < weapon.stats.bulletCount; i++) {
        const spread = (Math.random() - 0.5) * 0.2;
        const aimAngle = Math.atan2(mouseDir.y, mouseDir.x);
        const finalAngle = aimAngle + spread;
        const aimPos: Vector2 = { x: char.position.x + Math.cos(finalAngle) * 100, y: char.position.y + Math.sin(finalAngle) * 100 };
        const projSize = weapon.typeId === WeaponTypeId.Flamethrower ? weapon.stats.range : 3;
state.projectiles.push(createProjectile(char.position, aimPos, weapon.stats.damage, weapon.stats.penetration, weapon.typeId, 0, projSize));
      }
      weapon.currentAmmo--;
      weapon.fireCooldown = 1 / weapon.stats.fireRate;
    }
  }
}

function updateProjectiles(state: GameState, dt: number): void {
  const projectiles = state.projectiles;
  const enemies = state.enemies;
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    proj.position.x += proj.velocity.x * dt;
    proj.position.y += proj.velocity.y * dt;
    proj.lifetime -= dt;

    if (proj.lifetime <= 0 || proj.position.x < 0 || proj.position.x > MAP_WIDTH || proj.position.y < 0 || proj.position.y > MAP_HEIGHT) {
      projectiles.splice(i, 1);
      continue;
    }

    for (const enemy of enemies) {
      if (proj.hitEnemies.has(enemy.id)) continue;
      if (distance(proj.position, enemy.position) < enemy.size) {
        enemy.health -= proj.damage;
        state.damageNumbers.push({ position: { x: enemy.position.x, y: enemy.position.y - enemy.size }, value: proj.damage, timer: 0.8, maxTimer: 0.8 });
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
    if (distance(char.position, chest.position) < 20) {
      switch (chest.type) {
        case ChestType.Health: healCharacter(char, 30); break;
        case ChestType.XPRange: addXpAbsorptionRadius(char, 20); break;
        case ChestType.MaxHP: increaseMaxHealth(char, 20); break;
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
    const newEnemies = spawnEnemyWave(state.character.position, state.character.level, toSpawn);
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
      const xpDrop = createXpDrop(enemy.position, Math.floor(enemy.xpValue));
      state.xpDrops.push(xpDrop);
      if (Math.random() < 0.05) state.chests.push(createChest(enemy.position));

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