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

const MAX_AUX_LASER_WIDTH = 16;

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
      velocity: { x: Math.cos(angle) * 400, y: Math.sin(angle) * 400 },
      damage: aux.stats.damage,
      penetration: 1,
      hitEnemies: new Set<string>(),
      ownerId: 'character',
      lifetime: 1.8,
      maxLifetime: 1.8,
      weaponType: 'missile' as any,
      explosionRadius: aux.stats.explosionRadius,
      projectileSize: 3,
    };
    state.projectiles.push(proj);
  }
  aux.cooldownTimer = Math.max(0.15, aux.stats.placementCooldown);
}

const WIND_TICK = 0.22;

function updateWindWheel(state: GameState, aux: AuxiliaryWeapon, dt: number): void {
  const count = Math.max(1, Math.min(Math.floor(aux.stats.count), 6));
  const radius = 80;
  const bladeSize = Math.max(6, aux.stats.range * 0.15);
  // 按敌人分桶累计接触伤害，每 0.22s 结算一次，保证伤害数字为可见整数（不逐帧刷小数）
  const hits = ((aux as unknown as { windHits?: Record<string, { dmg: number; t: number }> }).windHits ??= {});
  const frameDmg = new Map<string, number>();

  for (let i = 0; i < count; i++) {
    const angle = aux.rotationAngle + (i / count) * Math.PI * 2;
    const bx = state.character.position.x + Math.cos(angle) * radius;
    const by = state.character.position.y + Math.sin(angle) * radius;

    for (const enemy of state.enemies) {
      if (distance({ x: bx, y: by }, enemy.position) < enemy.size + bladeSize) {
        frameDmg.set(enemy.id, (frameDmg.get(enemy.id) ?? 0) + aux.stats.damage * dt);
      }
    }
  }

  for (const [id, dmg] of frameDmg) {
    const h = hits[id];
    if (!h) hits[id] = { dmg, t: WIND_TICK };
    else h.dmg += dmg;
  }

  for (const id of Object.keys(hits)) {
    const h = hits[id];
    h.t -= dt;
    if (h.t <= 0) {
      const enemy = state.enemies.find((en) => en.id === id);
      if (enemy && h.dmg > 0) {
        enemy.health -= h.dmg;
        state.damageNumbers.push({
          position: { x: enemy.position.x, y: enemy.position.y - enemy.size },
          value: Math.max(1, Math.round(h.dmg)),
          timer: 0.5,
          maxTimer: 0.5,
        });
      }
      delete hits[id];
    } else if (!frameDmg.has(id)) {
      // 敌人脱离接触：清零累计，避免残量堆叠
      h.dmg = 0;
    }
  }
}

function updateAuxLaserGun(state: GameState, aux: AuxiliaryWeapon, dt: number): void {
  if (aux.cooldownTimer > 0) return;
  const nearest = findNearestEnemy(state.character.position, state.enemies, aux.stats.range);
  if (!nearest) return;

  const beamWidth = Math.min(MAX_AUX_LASER_WIDTH, Math.max(4, 4 + Math.floor(aux.stats.count) * 3));
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

  const count = Math.max(1, Math.min(Math.floor(aux.stats.count), AUXILIARY_WEAPON_CONFIGS[AuxiliaryWeaponType.SwordEnergy].maxCount));
  const duration = Math.max(0.5, aux.stats.duration);
  for (let i = 0; i < count; i++) {
    const spread = (i - (count - 1) / 2) * 0.25;
    const angle = angleBetween(state.character.position, nearest.position) + spread;
    const proj: Projectile = {
      id: `aux_sword_${nextEntityId++}`,
      position: { x: state.character.position.x, y: state.character.position.y },
      velocity: { x: Math.cos(angle) * 420, y: Math.sin(angle) * 420 },
      damage: aux.stats.damage,
      penetration: Infinity,
      hitEnemies: new Set<string>(),
      ownerId: 'character',
      lifetime: duration,
      maxLifetime: duration,
      weaponType: 'sword_energy' as any,
      explosionRadius: 0,
      projectileSize: 8,
    };
    state.projectiles.push(proj);
  }
  aux.cooldownTimer = Math.max(0.15, aux.stats.placementCooldown);
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
    explosionRadius: aux.stats.explosionRadius,
    fireCooldown: 0,
    lifetime: aux.stats.duration,
  };
  state.turrets.push(turret);
  aux.placedCount++;
  aux.cooldownTimer = Math.max(0, aux.stats.placementCooldown);
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
      explosionRadius: turret.explosionRadius,
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