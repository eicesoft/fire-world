# Fireworld —— 功能与整体架构

> 本文档整理 Fireworld 当前（基于 `src/` 代码现状）已实现的功能模块与整体架构，作为对 `AGENTS.md`（Agent 操作指南）、`CONTEXT.md`（领域语言）与 `docs/adr/`（决策记录）的补充与汇总。
>
> 领域术语以 `CONTEXT.md` 为准：`Character`（角色）、`Enemy`（敌人）、`Mini-boss`（精英怪）、`Weapon Type`（武器类型）、`Main Weapon`（主武器）、`Auxiliary Weapon`（`CONTEXT.md` 中称 Secondary Weapon，后期获取）、`Automatic Attack`（自动攻击）、`XP`（经验）、`Level-Up`（升级）、`Upgrade Option`（升级选项）、`Weapon Drop`（武器掉落）、`Chest`（宝箱）。

---

## 1. 项目概述

Fireworld 是一款**俯视角生存游戏**：角色在一张固定大地图（3000×3000）中央出生，敌人持续从四周涌来，玩家靠走位躲避并自动清怪。核心循环是「打怪 → 捡经验 → 升级选强化 → 变强 → 打更强的怪」。

关键设计决策（见 `docs/adr/0001-simultaneous-auto-attack.md`）：

- 角色同时装备的所有武器**同时自动攻击**附近敌人，玩家**不手动瞄准/切换武器**。
- 鼠标/右摇杆方向是「优先攻击方向」，但武器仍会攻击各个方向的敌人（近战刀走扇形、其余走最近目标）。
- 角色最多携带 **3 种武器** = 1 把主武器 + 最多 2 把辅助武器（`MAX_AUX_SLOTS = 2`）。

技术栈：TypeScript + Vite + Canvas 2D + Vitest。**纯逻辑与渲染严格分层**（详见第 3 节）。

---

## 2. 已实现功能

### 2.1 武器系统

**主武器（`Main Weapon`）**——开局从 5 选 1，定义见 `types.ts` 的 `WeaponTypeId` 与 `WEAPON_CONFIGS`：

| 武器类型 | 名称 | 特点 |
|---|---|---|
| `MachineGun` | 机关枪 | 高射速、低伤、可穿透 1 |
| `Shotgun` | 散弹枪 | 一次 5 发、近距 |
| `MeleeBlade` | 近战刀 | 近战扇形、高伤、无限弹药/穿透 |
| `Flamethrower` | 火焰喷射器 | 短射程、附带**灼烧** DoT 伤害 |
| `LaserGun` | 激光枪 | 远射程、高穿透（5） |
| `Bow` | 弓箭 | 1 弹匣 3 发、穿透 3 |

> 平衡说明：所有武器的 `range`（含升级增量）已统一减半。主武器基础射程为 150/100/45/75/200/175（机枪/散弹/近战/喷火/激光/弓），近战刀的攻击弧也从 90° 扩至 135°（攻击范围+触发范围各 +50%）；辅助武器为 150/40/125/100/100（导弹/飞轮/激光/剑气/炮台）；`range` 升级幅度由 +20 改为 +10。

> 不同主武器赋予角色不同初始属性（`WEAPON_CHARACTER_PRESETS`）：机关枪 移速×1（200）/血量 100；散弹枪 ×0.8（160）/130；近战刀 ×1.4（280）/90；火焰喷射器 ×0.75（150）/120；弓箭 ×1.25（250）/80。

> `LaserGun` 已配置为武器类型，但**不在初始 5 选 1 池内**（`INITIAL_WEAPON_POOL` 不含它），目前仅作为数据存在。

武器共有 7 个 `WeaponStat`：`damage / fireRate / magazineCapacity / reloadSpeed / penetration / bulletCount / range`。近战刀用 `isMelee + attackArc` 走扇形判定而非弹丸。

**辅助武器（`Auxiliary Weapon`）**——击败 Mini-boss 掉落获取，最多 2 把，定义见 `AuxiliaryWeaponType` 与 `AUXILIARY_WEAPON_CONFIGS`：

| 类型 | 名称 | 行为 |
|---|---|---|
| `Missile` | 导弹 | 追踪最近敌人、命中产生**范围爆炸**（AoE） |
| `WindWheel` | 旋转风轮 | 角色身边环绕刀刃，持续接触伤害；数量满（6）后升级不再出「数量」，改为伤害/范围/旋转速度 |
| `LaserGun` | 激光枪 | 朝最近敌人发射激光束（线段判定）；宽度随数量提升，但有上限 |
| `SwordEnergy` | 剑气 | 释放带持续时间的匕首形剑气，穿透敌人、自动索敌；升级属性为数量/持续时间/放置时间；数量最多 6 把，满后不再出「数量」 |
| `Turret` | 炮台 | 在身边放置自动射击的炮台实体（有持续时间），炮弹命中产生范围爆炸 |
| `LandMine` | 地雷 | 在脚下布雷，敌进入爆炸半径触发 AoE；绘制高透明爆炸范围圆，引爆带橙红粒子特效 |

辅助武器共 10 个 `AuxiliaryWeaponStat`：`damage / range / cooldown / count / explosionRadius / rotationSpeed / duration / placementCooldown / turretFireRate / armTime`。

辅助武器逻辑集中在 `src/systems/auxWeapons.ts`，每种类型一个 `update*` 函数，并维护 `TurretEntity` 与 `LandMineEntity` 两类独立实体。

### 2.2 升级系统（`Level-Up`）

- 经验累计达到阈值（`getXpThreshold`，指数增长 `1.2^(level-1)`）触发升级，暂停并弹出 **3 个随机升级选项**。
- 选项由 `upgrades.ts` 的 `generateUpgradeOptions` 生成，来源三类：
  - 强化主武器某一 `WeaponStat`；
  - 强化已拥有的辅助武器某一 `AuxiliaryWeaponStat`；
  - 获取一把尚未拥有的辅助武器（`acquire_aux`，仅当槽位未满）。
- **稀有度（Rarity）**：`Common(50%) / Rare(30%) / Epic(15%) / Legendary(5%)`，对应属性倍率 `1× / 2× / 4× / 8×`。选项不足 3 个时用「普通主武器属性」补全（见 `generateUpgradeOptions` 的兜底逻辑）。
- 选择由 `handleLevelUpSelect` → `applyUpgrade` 应用，武器 `level++` 并按倍率叠加属性（最小值 clamp 到 0.3）。

### 2.3 敌人系统（`Enemy` + `Mini-boss`）

- 5 种普通敌人（`spawner.ts` 的 `ENEMY_TYPES`）：`walker / runner / tank / ranged / exploder`，随角色等级逐步解锁刷新（`getAvailableEnemyTypes`）。
- 敌人属性随等级时间缩放（`1 + (level-1)*0.1`）。
- **Mini-boss**：独立强敌（HP 300、体型大、掉落武器），击杀后若槽位未满则进入 `WeaponDrop` 阶段，提供 3 选 1 辅助武器（`generateWeaponDropOptions`）。Mini-boss 出现阈值 `getMiniBossKillThreshold` 按 `1.5` 增长。
- 敌人 AI：朝角色移动、接触造成 `damage`（带 1s 攻击冷却）；火焰喷射器造成的**灼烧**在 `updateEnemies` 中做 DoT 结算（最后一秒伤害翻倍）。

### 2.4 经验 / 宝箱 / 掉落

- 敌人死亡掉落 `XPDrop`（生成于怪物死亡位置，默认磁吸半径 35，玩家靠近才被吸向角色拾取）；拾取累加 `xp`。
- 敌人死亡有 2.5% 概率掉落 `Chest`，五类（`ChestType`）：`Health`（回血 30，浅绿）/ `MaxHP`（最大生命 +20，红色）/ `MoveSpeed`（移速 +20，蓝色）/ `XPRange`（经验吸收半径 +20，黄色）/ `XP`（经验 +30，紫色）。宝箱拾取范围与经验吸附半径一致（默认 35px，`XPRange` 宝箱可扩大）。
- Mini-boss 死亡触发 `WeaponDrop`（见 2.3）。

### 2.5 地图 / 障碍 / 碰撞

- 固定大地图 `MAP_WIDTH/HEIGHT = 3000`，摄像机跟随角色（视图 800×600）。
- 20 个随机 `Obstacle`（矩形），角色移动经 `collision.ts` 的 `resolveObstacleCollision`（AABB 最小重叠推出）做碰撞解算；角色也被 `clampToMap` 限制在地图内。
- 提供几何工具：`distance / angleBetween / normalize / findNearestEnemy / findEnemiesInRange / enemiesInArc / aabbOverlap / pointInRect`。

### 2.6 游戏阶段（状态机 / `GamePhase`）

| 阶段 | 含义 |
|---|---|
| `WeaponSelect` | 开局 5 选 1 主武器 |
| `Playing` | 正常游玩（主循环仅在此阶段推进逻辑） |
| `Paused` | 暂停，侧栏显示角色/武器详细属性（ESC 切换） |
| `LevelUp` | 升级三选一 |
| `WeaponDrop` | Mini-boss 掉落三选一 |
| `GameOver` | 已定义类型，但当前实现中角色死亡会**原地满血复活**（`respawnCharacter`，2 秒无敌），暂无真正游戏结束流程 |

> 注意：角色死亡不结束游戏，而是 `respawnCharacter` 回满血并瞬移地图中心，因此 `GameOver` 阶段目前不可达。

### 2.7 输入控制（`src/systems/input.ts`）

- **键盘**：WASD / 方向键移动；方向键 ←/→ 在菜单导航；Enter 确认；ESC 暂停/继续。
- **鼠标**：移动设定角色朝向；主武器对射程内敌人自动索敌（Mini-boss 优先）并对目标做前置预测（打提前量）开火，无需手动瞄准；点击可在各菜单直接点选。
- **手柄**：左摇杆移动、右摇杆瞄准；A 键确认；方向键左右导航；含 0.15 死区。
- `InputState` 统一封装按键/鼠标/摇杆，并提供「消费式」标记（`*Consumed`）防止一次按键重复触发。

> 主武器自动索敌位于纯逻辑层 `gameLoop.ts` 的 `updateMainWeapon`：`findAutoAimTarget`（最近射程内敌人，Mini-boss 优先）锁定目标，`predictAimPoint` 按弹速与敌人朝角色移动的速度预测命中点后开火。

### 2.8 视觉特效（`rendering/renderer.ts`）

- `SlashEffect`：近战扇形白弧 + 填充。
- `BeamEffect`：激光枪/辅助激光的发光光束。
- `DamageNumber`：红色浮动伤害数字，向上淡出。
- 角色精灵：程序化绘制（Canvas→Texture）的斜 45° 视角小英雄（金发/披风/铠甲/高举长剑），朝向始终对准当前攻击目标并随目标实时旋转。
- `WindWheel`：角色周围虚线圆 + 旋转的菱形刀刃。
- 弹丸按武器类型着色并带拖尾 + 辉光（火焰喷射器额外做闪烁/透明度衰减）。
- 敌人精灵：每种敌人一张程序化 Canvas 精灵（史莱姆/猎犬/甲壳坦克/眼怪/爆裂球/恶魔小Boss），斜 45° 构图，白色主体按剩余血量 tint（绿→红）变色。
- HUD：顶部单行条（等级在左、生命在中左、**计时器**居中、**击杀数**在右上）；武器槽（含弹药条/换弹旋转环）置于**右下角**；底部经验条；暂停面板展示完整属性面板。

---

## 3. 整体架构

### 3.1 目录结构

```
src/
  game/                纯逻辑层（无 DOM / Canvas 依赖，可单测）
    types.ts           —— 所有接口、枚举、配置常量（武器/辅助武器/敌人/稀有度/地图尺寸）
    character.ts       —— Character/Weapon/AuxiliaryWeapon 工厂、经验阈值、复活/治疗
    combat.ts          —— 伤害计算、受伤判定、复活
    upgrades.ts        —— 升级选项生成（稀有度加权）、属性增量、应用
    gameLoop.ts        —— 主更新循环，编排所有子系统；阶段切换与选择处理
    spawner.ts         —— 敌人波次/Mini-boss 生成、XP/宝箱掉落、障碍生成
    collision.ts       —— 几何/AABB/障碍解算/敌人查询
  systems/
    input.ts           —— 键盘/鼠标/手柄输入采集与状态封装
    auxWeapons.ts      —— 6 种辅助武器行为 + 炮台/地雷实体更新
  rendering/
    renderer.ts        —— Canvas 2D 渲染（背景/实体/HUD/各阶段界面）
  main.ts              入口：建状态、接线输入、requestAnimationFrame 主循环、菜单点选
tests/
  domain.test.ts       —— 针对 src/game 纯逻辑的单元测试（Vitest）
docs/
  adr/0001-simultaneous-auto-attack.md —— 自动攻击设计决策
```

### 3.2 分层原则

代码严格分层，**依赖方向单向向下**：

```
main.ts (入口/编排)
   │  调用
   ├── rendering/renderer.ts  (只读取 GameState 画图，不修改逻辑)
   ├── systems/input.ts       (采集输入 → InputState)
   └── game/gameLoop.ts       (核心逻辑编排)
          ├── game/character.ts, combat.ts, upgrades.ts, spawner.ts, collision.ts
          └── systems/auxWeapons.ts
```

- `src/game/**` 是**纯函数/纯数据**，不引用 `window`/`document`/`canvas`，因此可被 Vitest 直接单测（这也是 `AGENTS.md` 规定的测试边界）。
- `src/systems/input.ts` 与 `src/rendering/renderer.ts` 是唯一接触浏览器 API 的层；`main.ts` 负责把两者与纯逻辑粘合。

### 3.3 核心数据结构（`GameState`）

所有运行时实体都挂在单一 `GameState` 上，是渲染与逻辑共享的「真相源」：

```
GameState {
  phase, character,
  enemies[], projectiles[], xpDrops[], chests[], obstacles[],
  slashEffects[], beamEffects[], damageNumbers[],
  turrets[], landMines[],
  mapWidth/Height, mouseDirection, elapsedTime,
  miniBossKillThreshold/currentMiniBossKills,
  upgradeOptions[], weaponDropOptions[],
  availableWeaponTypes[], selectedWeaponType, selectedIndex
}
```

### 3.4 主循环与数据流

`requestAnimationFrame` 驱动的 `gameLoop(timestamp)`（`main.ts`）每帧：

1. 计算 `dt`（封顶 0.05s）。
2. `pollGamepad` 采集手柄。
3. 若 `Playing`：
   - `getMovementDirection` 取移动向量；`updateMouseDirection` 取角色朝向（鼠标/右摇杆）。
   - 调用 `updateGame(state, dt, moveDir)`，内部按固定顺序推进：
     移动 → 主武器 → 弹丸 → 敌人 → XP → 宝箱 → 计时器 → 特效衰减 → 辅助武器 → 刷怪 → 升级检查 → 清理死亡。
   - `updateGame` 仅在 `Playing` 阶段执行，其余阶段由 `handleMenuNav` 处理菜单导航/确认。
4. `renderer.render(state)` 画出当前帧（根据 `phase` 叠加不同界面）。

关键解耦点：`gameLoop.ts` 的 `updateGame` 只接受 `(state, dt, moveDir)`，把「输入如何来」与「逻辑怎么跑」分开；`mouseDirection` 作为方向偏好传入武器系统。

### 3.5 测试

- 框架 Vitest，单一测试文件 `tests/domain.test.ts`。
- 仅覆盖 `src/game/` 纯逻辑（角色、武器、升级、战斗），不测渲染。
- 约定：`UpgradeOption` 必须带 `rarity` 字段（影响生成与渲染取色）。

---

## 4. 扩展点速查（在哪里改什么）

| 想做的改动 | 去处 |
|---|---|
| 新增/调整主武器 | `types.ts` 的 `WeaponTypeId` + `WEAPON_CONFIGS`；加入 `INITIAL_WEAPON_POOL` 才会出现在开局选择 |
| 新增/调整辅助武器 | `types.ts` 的 `AuxiliaryWeaponType` + `AUXILIARY_WEAPON_CONFIGS`；在 `auxWeapons.ts` 加 `update*` 分支；在 `renderer.ts` 的 `default` 分支补颜色 |
| 调整稀有度权重/倍率 | `types.ts` 的 `RARITY_WEIGHTS` / `RARITY_MULTIPLIERS` |
| 调整升级属性增量文案 | `upgrades.ts` 的 `MAIN_WEAPON_DELTAS` / `AUX_WEAPON_DELTAS` 与 `*_STAT_DESCRIPTIONS` |
| 调整敌人强度/解锁曲线 | `spawner.ts` 的 `ENEMY_TYPES` / `getAvailableEnemyTypes` |
| 调整地图/摄像机 | `types.ts` 的 `MAP_WIDTH/HEIGHT`、`SCREEN_WIDTH/HEIGHT`；`renderer.ts` 的 `updateCamera` |
| 新增输入设备/按键 | `systems/input.ts` 的事件绑定与 `InputState` |
| 新增视觉特效 | 在 `types.ts` 加 Effect 接口 → `gameLoop.ts` 推进 → `renderer.ts` 绘制 |

---

## 5. 与 `CONTEXT.md` 的差异备注

- **武器槽上限**：`CONTEXT.md` 将「Weapon Expansion（扩充槽位至最多 3）」列为概念，但当前实现中 `maxAuxSlots` 固定为 2（1 主 + 2 辅），没有动态提升槽位的升级项；「最多 3 武器」通过固定的 2 个辅助槽实现。
- **`GameOver` 阶段**：类型已定义，但角色死亡走 `respawnCharacter` 复活流程，无真正的游戏结束界面。
- **术语映射**：代码内用 `AuxiliaryWeapon`（AGENTS.md 亦用“辅助武器”），与 `CONTEXT.md` 的 “Secondary Weapon” 同义，均指“后期获取的额外武器”。
