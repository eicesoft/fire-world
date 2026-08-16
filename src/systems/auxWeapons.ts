import {
  GameState,
  Character,
  AuxiliaryWeapon,
  AuxiliaryWeaponType,
  Projectile,
  TurretEntity,
  LandMineEntity,
  DamageNumber,
  Vector2,
  AUXILIARY_WEAPON_CONFIGS,
} from '../game/types';
import { distance, angleBetween, findNearestEnemy } from '../game/collision';

let nextEntityId = 0;

export function resetAuxIds(): void {
  nextEntityId = 0;
}

export function updateAuxWeapons(state: GameState, dt: number): void {
  const char = state.character;

  for (const aux of char.auxWeapons) {
    aux.cooldownTimer = Math.max(0, aux.cooldownTimer - dt);
    aux.rotationAngle = (aux.rotationAngle + (aux.stats.rotationSpeed || 1) * dt) % (Math.PI * 2);

    switch (aux.typeId) {
      case AuxiliaryWeaponType.Missile:
        updateMissile(state, aux, dt);
        break;
      case AuxiliaryWeaponType.WindWheel:
        updateWindWheel(state, aux, dt);
        break;
      case AuxiliaryWeaponType.LaserGun:
        updateAuxLaserGun(state, aux, dt);
        break;
      case AuxiliaryWeaponType.SwordEnergy:
        updateSwordEnergy(state, aux, dt);
        break;
      case AuxiliaryWeaponType.Turret:
        updateTurret(state, aux, dt);
        break;
      case AuxiliaryWeaponType.LandMine:
        updateLandMine(state, aux, dt);
        break;
    }
  }

  updateTurrets(state, dt);
  updateLandMines(state, dt);
}

function updateMissile(state: GameState, aux: AuxiliaryWeapon, dt: number): void {
  if (aux.cooldownTimer > 0) return;
  const nearest = findNearestEnemy(state.character.position, state.enemies, aux.stats.range);
  if (!nearest) return;

  for (let i = 0; i < Math.max(1, Math.floor(aux.stats.count)); i++) {
    const spread = (Math.random() - 0.5) * 0.3;
    const angle = angleBetween(state.character.position, nearest.position) + spread;
    const proj: Projectile = {
      id: `aux_missile_${nextEntityId++}`,
      position: { x: state.character.position.x, y: state.character.position.y },
      velocity: { x: Math.cos(angle) * 300, y: Math.sin(angle) * 300 },
      damage: aux.stats.damage,
      penetration: 1,
      hitEnemies: new Set<string>(),
      ownerId: 'character',
      lifetime: 1.5,
      maxLifetime: 1.5,
      weaponType: 'missile' as any,
      explosionRadius: aux.stats.explosionRadius,
      projectileSize: 3,
    };
    state.projectiles.push(proj);
  }
  aux.cooldownTimer = aux.stats.cooldown;
}

function updateWindWheel(state: GameState, aux: AuxiliaryWeapon, dt: number): void {
  const count = Math.max(1, Math.min(Math.floor(aux.stats.count), 6));
  const radius = 80;
  const bladeSize = Math.max(6, aux.stats.range * 0.15);
  for (let i = 0; i < count; i++) {
    const angle = aux.rotationAngle + (i / count) * Math.PI * 2;
    const bx = state.character.position.x + Math.cos(angle) * radius;
    const by = state.character.position.y + Math.sin(angle) * radius;

    for (const enemy of state.enemies) {
      if (distance({ x: bx, y: by }, enemy.position) < enemy.size + bladeSize) {
        enemy.health -= aux.stats.damage * dt;
        state.damageNumbers.push({
          position: { x: enemy.position.x, y: enemy.position.y - enemy.size },
          value: Math.ceil(aux.stats.damage * dt),
          timer: 0.5,
          maxTimer: 0.5,
        });
      }
    }
  }
}

function updateAuxLaserGun(state: GameState, aux: AuxiliaryWeapon, dt: number): void {
  if (aux.cooldownTimer > 0) return;
  const nearest = findNearestEnemy(state.character.position, state.enemies, aux.stats.range);
  if (!nearest) return;

  const beamWidth = Math.max(4, 4 + Math.floor(aux.stats.count) * 3);
  const damageMult = Math.max(1, Math.floor(aux.stats.count));
  const angle = angleBetween(state.character.position, nearest.position);
  const endX = state.character.position.x + Math.cos(angle) * aux.stats.range;
  const endY = state.character.position.y + Math.sin(angle) * aux.stats.range;

  for (const enemy of state.enemies) {
    const d = distanceToSegment(enemy.position, state.character.position, { x: endX, y: endY });
    if (d < enemy.size + beamWidth) {
      enemy.health -= aux.stats.damage * damageMult;
      state.damageNumbers.push({
        position: { x: enemy.position.x, y: enemy.position.y - enemy.size },
        value: aux.stats.damage * damageMult, timer: 0.6, maxTimer: 0.6,
      });
    }
  }

  state.beamEffects.push({
    origin: { x: state.character.position.x, y: state.character.position.y },
    end: { x: endX, y: endY },
    color: '#00e5ff',
    timer: 0.15,
    width: beamWidth * 2,
  });
  aux.cooldownTimer = aux.stats.cooldown;
}

function updateSwordEnergy(state: GameState, aux: AuxiliaryWeapon, dt: number): void {
  if (aux.cooldownTimer > 0) return;
  const nearest = findNearestEnemy(state.character.position, state.enemies, aux.stats.range);
  if (!nearest) return;

  const count = Math.max(1, Math.floor(aux.stats.count));
  for (let i = 0; i < count; i++) {
    const spread = (i - (count - 1) / 2) * 0.1;
    const angle = angleBetween(state.character.position, nearest.position) + spread;
    const proj: Projectile = {
      id: `aux_sword_${nextEntityId++}`,
      position: { x: state.character.position.x, y: state.character.position.y },
      velocity: { x: Math.cos(angle) * 500, y: Math.sin(angle) * 500 },
      damage: aux.stats.damage,
      penetration: 999,
      hitEnemies: new Set<string>(),
      ownerId: 'character',
      lifetime: 0.8,
      maxLifetime: 0.8,
      weaponType: 'sword_energy' as any,
      explosionRadius: 0,
      projectileSize: 6,
    };
    state.projectiles.push(proj);
  }
  aux.cooldownTimer = aux.stats.cooldown;
}

function distanceToSegment(p: Vector2, a: Vector2, b: Vector2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return distance(p, a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * abx, y: a.y + t * aby });
}

function updateTurret(state: GameState, aux: AuxiliaryWeapon, dt: number): void {
  if (aux.activeTimer > 0) {
    aux.activeTimer -= dt;
    return;
  }
  if (aux.placedCount >= Math.floor(aux.stats.count)) return;
  if (aux.cooldownTimer > 0) return;

  const nearest = findNearestEnemy(state.character.position, state.enemies, 600);
  if (!nearest) return;

  const angle = angleBetween(state.character.position, nearest.position);
  const dist = 80;
  const tx = state.character.position.x + Math.cos(angle) * dist;
  const ty = state.character.position.y + Math.sin(angle) * dist;

  const turret: TurretEntity = {
    id: `turret_${nextEntityId++}`,
    position: { x: tx, y: ty },
    typeId: aux.typeId,
    damage: aux.stats.damage,
    fireRate: aux.stats.turretFireRate,
    range: aux.stats.range,
    fireCooldown: 0,
    lifetime: aux.stats.duration,
  };
  state.turrets.push(turret);
  aux.placedCount++;
  aux.cooldownTimer = aux.stats.placementCooldown > 0 ? aux.stats.placementCooldown : 999;
}

function updateLandMine(state: GameState, aux: AuxiliaryWeapon, dt: number): void {
  if (aux.cooldownTimer > 0) return;

  const nearest = findNearestEnemy(state.character.position, state.enemies, 100);
  if (!nearest) return;

  const mine: LandMineEntity = {
    id: `mine_${nextEntityId++}`,
    position: { x: state.character.position.x, y: state.character.position.y },
    damage: aux.stats.damage,
    explosionRadius: aux.stats.explosionRadius,
    armed: false,
    armTimer: aux.stats.armTime,
  };
  state.landMines.push(mine);
  aux.cooldownTimer = 3;
}

function updateTurrets(state: GameState, dt: number): void {
  for (let i = state.turrets.length - 1; i >= 0; i--) {
    const turret = state.turrets[i];
    turret.lifetime -= dt;
    turret.fireCooldown -= dt;

    if (turret.lifetime <= 0) {
      state.turrets.splice(i, 1);
      continue;
    }

    if (turret.fireCooldown > 0) continue;

    const nearest = findNearestEnemy(turret.position, state.enemies, turret.range);
    if (!nearest) continue;

    const angle = angleBetween(turret.position, nearest.position);
    const proj: Projectile = {
      id: `turret_proj_${nextEntityId++}`,
      position: { x: turret.position.x, y: turret.position.y },
      velocity: { x: Math.cos(angle) * 400, y: Math.sin(angle) * 400 },
      damage: turret.damage,
      penetration: 1,
      hitEnemies: new Set<string>(),
      ownerId: 'character',
      lifetime: 1,
      maxLifetime: 1,
      weaponType: 'turret' as any,
      explosionRadius: 0,
      projectileSize: 3,
    };
    state.projectiles.push(proj);
    turret.fireCooldown = 1 / turret.fireRate;
  }
}

function updateLandMines(state: GameState, dt: number): void {
  for (let i = state.landMines.length - 1; i >= 0; i--) {
    const mine = state.landMines[i];
    if (!mine.armed) {
      mine.armTimer -= dt;
      if (mine.armTimer <= 0) mine.armed = true;
      continue;
    }

    for (const enemy of state.enemies) {
      if (distance(mine.position, enemy.position) < mine.explosionRadius) {
        for (const e of state.enemies) {
          if (distance(mine.position, e.position) < mine.explosionRadius) {
            e.health -= mine.damage;
            state.damageNumbers.push({
              position: { x: e.position.x, y: e.position.y - e.size },
              value: mine.damage,
              timer: 0.6,
              maxTimer: 0.6,
            });
          }
        }
        state.landMines.splice(i, 1);
        break;
      }
    }
  }
}