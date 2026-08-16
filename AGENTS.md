# Fireworld — Agent Guide

## Commands
- `npm run dev` — Vite dev server on port 3000
- `npm run build` — typecheck + production build
- `npm run test` — run all Vitest tests
- `npm run test:watch` — Vitest watch mode
- `npm run typecheck` — `tsc --noEmit`

Run `typecheck && test` before any commit.

## Architecture

```
src/
  game/        — pure logic, no DOM/Canvas
    types.ts   — all interfaces, enums, config constants
    character.ts — factories for Character, Weapon, AuxiliaryWeapon
    combat.ts  — damage calculation, respawn
    upgrades.ts — upgrade option generation, rarity system, stat deltas
    gameLoop.ts — main update loop, orchestrates all systems
    spawner.ts — enemy wave spawning, XP/chest drops
    collision.ts — AABB, distance, obstacle resolution, enemy queries
  systems/
    input.ts      — keyboard, mouse, gamepad (left/right stick, buttons)
    auxWeapons.ts — missile, wind wheel, laser, sword, turret, mine behaviors
  rendering/
    renderer.ts   — Canvas 2D rendering (sprites, projectiles, HUD, effects)
  main.ts         — entry point, game loop, menu navigation
tests/
  domain.test.ts  — unit tests for character, weapons, upgrades, combat
```

## Domain Model (CONTEXT.md)
Character, Enemy, Mini-boss, Main Weapon, Auxiliary Weapon, XP, Level-Up, Upgrade Option, Chest, Weapon Drop. Use `_Avoid_` terms from CONTEXT.md.

## Key Types
- `Character` has `mainWeapon: Weapon` + `auxWeapons: AuxiliaryWeapon[]` (max 2)
- `Weapon` — MachineGun/Shotgun/MeleeBlade/Flamethrower/LaserGun/Bow
- `AuxiliaryWeapon` — Missile/WindWheel/LaserGun/SwordEnergy/Turret/LandMine
- `GameState` holds all entities, effects, phase, selectedIndex
- `UpgradeOption` has `target` (main_weapon|aux_weapon|acquire_aux) + `rarity` (Common/Rare/Epic/Legendary)

## Upgrade Rarity
- Weights: Common 50%, Rare 30%, Epic 15%, Legendary 5%
- Stat multipliers: 1x/2x/4x/8x
- Always generates exactly 3 options (fills with Common main weapon stats if needed)

## Gamepad
- Left stick: movement; Right stick: aim direction
- D-pad left/right: menu navigation; A button: confirm
- Keyboard arrows + Enter also work in menus

## Testing
- Vitest, single test file `tests/domain.test.ts`
- Test pure logic at `src/game/` — no Canvas rendering tested
- `UpgradeOption` objects must include `rarity` field

## Visual Effects
- `SlashEffect` — melee arc flash, rendered as white arc + fill
- `BeamEffect` — laser gun beam line, rendered with glow
- `DamageNumber` — floating red damage text, fades upward
- `WindWheel` — rotating blades rendered as diamond shapes on a dashed circle
- Projectiles: colored by weapon type with trail + glow

## Projectile
- `Projectile` has `weaponType` (WeaponTypeId cast to any for aux types) and `explosionRadius` (missile AoE)
- Aux projectiles use string weaponType values: `'missile'`, `'aux_laser_gun'`, `'sword_energy'`, `'turret'`