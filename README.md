# Fireworld

俯视角生存小游戏：角色在 3000×3000 的固定大地图上移动，敌人持续涌入，武器自动攻击，打怪捡经验、升级选强化、越战越强。

> 技术预览：TypeScript + Vite + PixiJS 8（渲染）+ Vitest（测试）。纯逻辑与渲染严格分层。

## 玩法

- 开局从 5 种主武器中选 1：机关枪 / 散弹枪 / 近战刀 / 火焰喷射器 / 弓箭
- 所有已装备武器**自动攻击**附近敌人，玩家只需走位（鼠标/右摇杆设定优先攻击方向）
- 击杀敌人掉落经验点（XPDrop），走近自动吸收；经验满触发升级，3 选 1 强化
- 击败 Mini-boss 掉落武器：3 选 1 获取一把尚未拥有的辅助武器（最多 2 把）
- 辅助武器：导弹 / 旋转风轮 / 激光枪 / 剑气 / 炮台 / 地雷
- 敌人有 5% 概率掉落宝箱：回血 / 经验磁吸半径 +20 / 最大生命 +20
- 角色死亡原地满血复活（2 秒无敌），无游戏结束流程

## 升级与稀有度

- 升级选项来源：主武器属性强化、已装备辅助武器属性强化、未满槽时获取新辅助武器
- 稀有度：普通 50% / 高级 30% / 特殊 15% / 传说 5%，属性倍率 1× / 2× / 4× / 8×
- 选项不足 3 个时用普通主武器属性补全；选项明确标注归属武器与数值

## 快速开始

```bash
npm install        # 或 pnpm install
npm run dev        # 开发服务器，端口 3000
npm run typecheck  # TS 类型检查
npm run test       # 运行全部 Vitest 测试
npm run build      # 类型检查 + 生产构建，输出 dist/
```

## 操作

| 输入 | 功能 |
|---|---|
| WASD / 方向键 | 移动 |
| 鼠标移动 | 设定攻击方向（自动索敌为默认） |
| 鼠标左键 | 菜单中直接点选 |
| ← → / 方向键左右 / 手柄左摇杆 | 菜单导航 |
| 回车 / A 键 | 确认选择 |
| ESC | 暂停 / 继续 |
| 手柄 | 左摇杆移动、右摇杆瞄准、A 确认 |

## 项目结构

```
src/
  game/                纯逻辑层（无 DOM/Canvas 依赖，可单测）
    types.ts           接口、枚举、配置常量（武器/敌人/稀有度/地图）
    character.ts       Character/Weapon/AuxiliaryWeapon 工厂、经验阈值
    combat.ts          伤害计算、复活
    upgrades.ts        升级选项生成（稀有度加权）、属性增量、应用
    gameLoop.ts        主更新循环，编排所有子系统、阶段切换
    spawner.ts         敌人波次/Mini-boss 生成、经验/宝箱掉落
    collision.ts       几何、AABB 碰撞、障碍解算、敌人查询
  systems/
    input.ts           键盘 / 鼠标 / 手柄输入
    auxWeapons.ts      6 种辅助武器行为 + 炮台/地雷实体
  rendering/
    pixiRenderer.ts    PixiJS 8 渲染器：场景分层、对象池、HUD/菜单、粒子特效
    particles.ts       粒子系统（叠加/普通双容器、对象池）
  main.ts              入口：初始化渲染器、输入接线、rAF 主循环、菜单导航
tests/
  domain.test.ts       针对 src/game 纯逻辑的单元测试
docs/
  features-and-architecture.md   功能与架构说明
  handoff-2026-08-17.md          开发交接文档
  adr/                            架构决策记录
CONTEXT.md            领域术语（领域语言规范）
AGENTS.md             Agent 开发指南
```

## 分层原则

依赖方向单向向下：

```
main.ts（入口/编排）
  ├── rendering/pixiRenderer.ts  只读 GameState 画图，不改逻辑
  ├── systems/input.ts           采集输入 → InputState
  └── game/gameLoop.ts           核心逻辑编排
         ├── game/character.ts, combat.ts, upgrades.ts, spawner.ts, collision.ts
         └── systems/auxWeapons.ts
```

`src/game/**` 为纯函数/纯数据，不引用浏览器 API，可直接被 Vitest 单测。

## 技术要点

- 单 `GameState` 作为真相源，渲染器按帧 diff（实体 id/血量/数量比较）触发特效事件
- 敌人 AI：朝角色移动、接触伤害（1s 冷却）；火焰喷射器附加灼烧 DoT
- 特效：击杀爆裂、受击火花、开火闪光、火焰余烬、旋转飞轮光尘、XP 拾取光点、升级金色爆发、受击红闪+闪屏+相机抖动
- DEV 调试钩子：`window.__fw = { state, renderer }`（仅开发构建，生产被 tree-shake）

## 相关文档

- [CONTEXT.md](CONTEXT.md) — 领域术语规范
- [docs/features-and-architecture.md](docs/features-and-architecture.md) — 功能与架构详解
- [docs/adr/0001-simultaneous-auto-attack.md](docs/adr/0001-simultaneous-auto-attack.md) — 自动攻击设计决策
- [AGENTS.md](AGENTS.md) — Agent 开发指南（含测试/架构约定）

## License

ISC