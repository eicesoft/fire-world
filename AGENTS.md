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
    pixiRenderer.ts — PixiJS 8 渲染器：场景图分层（world 相机层 + UI 层）、实体对象池、HUD/菜单，与 src/game 完全解耦
    particles.ts    — ParticleContainer 粒子系统：叠加/普通双容器、对象池、burst/spawn API
  main.ts         — entry point, game loop (rAF), menu navigation；await PixiRenderer.create() 接入
  
渲染规则：src/game 保持纯净逻辑，渲染器通过帧间 diff（实体 id/血量/数量比较）在 render() 内触发特效事件（死亡爆裂/受击火花/开火闪光/升级爆发/拾取光点），不支持跨层回调。tests/
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
- `SlashEffect` — melee arc flash: 多层扇形刀光（外浅内亮填充）+ 白色亮核/细锋双层弧线，随 timer 淡出
- 近战额外粒子：挥砍瞬间沿弧线甩出 14 粒白/青刀光 + 刀锋方向锥形爆闪；近战命中溅射 9 粒青白火花 + 5 粒白闪（比远程更浓）
- `BeamEffect` — laser gun beam line, rendered with glow
- `DamageNumber` — floating red damage text, fades upward
- `WindWheel` — rotating blades rendered as diamond shapes on a dashed circle
- Projectiles: colored by weapon type with trail + glow
- 粒子（ParticleSystem，位于 rendering/particles.ts）：击杀爆裂、受击火花、开火闪光、火焰余烬、旋转飞轮轨道光尘、XP 拾取光点、升级金色爆发、角色受击红闪 + 全屏闪色（flashGfx）与相机抖动（cameraGroup 抖动）
- 特效全部由渲染器在 render() 帧间 diff 触发，src/game 逻辑不感知
- DEV 调试钩子：main.ts 在 `import.meta.env.DEV` 下暴露 `window.__fw = { state, renderer }`，可用浏览器控制台注入实体验证视觉效果（生产构建被 tree-shake）
## Projectile
- `Projectile` has `weaponType` (WeaponTypeId cast to any for aux types) and `explosionRadius` (missile AoE)
- Aux projectiles use string weaponType values: `'missile'`, `'aux_laser_gun'`, `'sword_energy'`, `'turret'`