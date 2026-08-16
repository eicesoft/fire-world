import { Weapon, Character } from './types';

export function calculateDamage(weapon: Weapon): number {
  return weapon.stats.damage;
}

export function applyDamage(char: Character, damage: number): { health: number; isDead: boolean } {
  if (char.invincibleTimer > 0) {
    return { health: char.health, isDead: false };
  }
  const newHealth = Math.max(0, char.health - damage);
  char.health = newHealth;
  return { health: newHealth, isDead: newHealth <= 0 };
}

export function respawnCharacter(char: Character): void {
  char.health = char.maxHealth;
  char.invincibleTimer = 2;
  char.position = { x: 3000 / 2, y: 3000 / 2 };
}