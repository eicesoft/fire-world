import { Vector2, Obstacle, Enemy, Character, MAP_WIDTH, MAP_HEIGHT } from './types';

export interface AABB {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function pointInRect(px: number, py: number, rect: AABB): boolean {
  return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function clampToMap(x: number, y: number, size: number): Vector2 {
  return {
    x: Math.max(size / 2, Math.min(MAP_WIDTH - size / 2, x)),
    y: Math.max(size / 2, Math.min(MAP_HEIGHT - size / 2, y)),
  };
}

export function getObstacleRect(obstacle: Obstacle): AABB {
  return {
    x: obstacle.position.x - obstacle.width / 2,
    y: obstacle.position.y - obstacle.height / 2,
    width: obstacle.width,
    height: obstacle.height,
  };
}

export function resolveObstacleCollision(
  pos: Vector2,
  size: number,
  obstacles: Obstacle[],
): Vector2 {
  const charRect: AABB = {
    x: pos.x - size / 2,
    y: pos.y - size / 2,
    width: size,
    height: size,
  };

  for (const obstacle of obstacles) {
    const obsRect = getObstacleRect(obstacle);
    if (aabbOverlap(charRect, obsRect)) {
      const overlapLeft = (charRect.x + charRect.width) - obsRect.x;
      const overlapRight = (obsRect.x + obsRect.width) - charRect.x;
      const overlapTop = (charRect.y + charRect.height) - obsRect.y;
      const overlapBottom = (obsRect.y + obsRect.height) - charRect.y;

      const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
      if (minOverlap === overlapLeft) pos.x = obsRect.x - size / 2;
      else if (minOverlap === overlapRight) pos.x = obsRect.x + obsRect.width + size / 2;
      else if (minOverlap === overlapTop) pos.y = obsRect.y - size / 2;
      else pos.y = obsRect.y + obsRect.height + size / 2;
    }
  }
  return pos;
}

export function distance(a: Vector2, b: Vector2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function angleBetween(from: Vector2, to: Vector2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function normalize(v: Vector2): Vector2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function findNearestEnemy(pos: Vector2, enemies: Enemy[], maxRange: number): Enemy | null {
  let nearest: Enemy | null = null;
  let nearestDist = maxRange;
  for (const enemy of enemies) {
    const d = distance(pos, enemy.position);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = enemy;
    }
  }
  return nearest;
}

export function findEnemiesInRange(pos: Vector2, enemies: Enemy[], range: number): Enemy[] {
  return enemies.filter((e) => distance(pos, e.position) <= range);
}

export function enemiesInArc(
  pos: Vector2,
  direction: number,
  enemies: Enemy[],
  range: number,
  arcAngle: number,
): Enemy[] {
  return enemies.filter((e) => {
    const d = distance(pos, e.position);
    if (d > range) return false;
    const angle = angleBetween(pos, e.position);
    const diff = Math.abs(angle - direction);
    const wrapped = Math.min(diff, Math.PI * 2 - diff);
    return wrapped <= arcAngle / 2;
  });
}