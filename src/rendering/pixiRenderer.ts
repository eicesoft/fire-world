import {
  Application,
  Container,
  Graphics,
  Particle,
  ParticleContainer,
  Text,
} from 'pixi.js';
import {
  GameState,
  GamePhase,
  WeaponTypeId,
  AuxiliaryWeaponType,
  Enemy,
  Projectile,
  XPDrop,
  Chest,
  ChestType,
  Obstacle,
  SlashEffect,
  BeamEffect,
  DamageNumber,
  TurretEntity,
  LandMineEntity,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  MAP_WIDTH,
  MAP_HEIGHT,
  WEAPON_CONFIGS,
  AUXILIARY_WEAPON_CONFIGS,
  INITIAL_WEAPON_POOL,
  MAX_AUX_SLOTS,
} from '../game/types';
import { ParticleSystem, createGlowTexture } from './particles';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const rgb = (r: number, g: number, b: number): number => ((r << 16) | (g << 8) | b) >>> 0;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

    const MONO = 'monospace';
const FONT_10 = { fontFamily: MONO, fontSize: 10, fill: 0xffffff };
const FONT_11 = { fontFamily: MONO, fontSize: 11, fill: 0xffffff };
const FONT_12 = { fontFamily: MONO, fontSize: 12, fill: 0xffffff };
const FONT_14 = { fontFamily: MONO, fontSize: 14, fill: 0xffffff };

function makeText(text: string, style: object, anchorX = 0, anchorY = 0.5): Text {
  const t = new Text({ text, style });
  t.anchor.set(anchorX, anchorY);
  return t;
}

interface EnemyGfx {
  body: Graphics;
  bar: Graphics;
}

interface ChestGfx {
  gfx: Graphics;
  label: Text;
}

interface TurretGfx {
  gfx: Graphics;
  label: Text;
}

interface WindWheelSlot {
  root: Container;
  gfx: Graphics;
  count: number;
  range: number;
}

interface FlashFx {
  color: number;
  alpha: number;
  duration: number;
  timer: number;
}

interface ShakeFx {
  power: number;
  duration: number;
  timer: number;
}

const PROJECTILE_COLORS: Record<string, number> = {
  [WeaponTypeId.MachineGun]: 0xffeb3b,
  [WeaponTypeId.Shotgun]: 0xff9800,
  [WeaponTypeId.Flamethrower]: 0xff6d00,
  [WeaponTypeId.LaserGun]: 0x00e5ff,
  [WeaponTypeId.Bow]: 0x8bc34a,
  missile: 0xff7043,
  aux_laser_gun: 0x00e5ff,
  sword_energy: 0xab47bc,
  turret: 0xffeb3b,
};

const PROJECTILE_RADIUS: Record<string, number> = {
  [WeaponTypeId.MachineGun]: 3,
  [WeaponTypeId.Shotgun]: 4,
  [WeaponTypeId.Flamethrower]: 5,
  [WeaponTypeId.LaserGun]: 3,
  [WeaponTypeId.Bow]: 4.5,
  missile: 5,
  aux_laser_gun: 3,
  sword_energy: 6,
  turret: 3,
};

const ENEMY_BURST_COLORS: Record<string, number> = {
  walker: 0xd4e157,
  runner: 0xce93d8,
  tank: 0xbcaaa4,
  ranged: 0x64b5f6,
  exploder: 0xff8a65,
};

const RARITY_COLOR_NUM: Record<string, number> = {
  common: 0x4caf50,
  rare: 0x2196f3,
  epic: 0x9c27b0,
  legendary: 0xffc107,
};

/* ------------------------------------------------------------------ */
/* PixiRenderer                                                        */
/* ------------------------------------------------------------------ */

export class PixiRenderer {
  private readonly app: Application;
  private readonly fx = new ParticleSystem();
  private readonly glowTexture = createGlowTexture();

  // 图层
  private readonly gridGfx = new Graphics();
  private readonly cameraGroup = new Container();
  private readonly worldLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly hudC = new Container();
  private readonly menuC = new Container();
  private readonly flashGfx = new Graphics();

  // 世界分类容器（按绘制顺序叠加）
  private readonly obstacleC = new Container();
  private readonly damageC = new Container();
  private readonly chestC = new Container();
  private readonly turretC = new Container();
  private readonly mineC = new Container();
  private readonly enemyC = new Container();
  private readonly slashC = new Container();
  private readonly beamC = new Container();
  private readonly windwheelC = new Container();
  private readonly projC = new ParticleContainer({
    texture: createGlowTexture(),
    dynamicProperties: { position: true, rotation: true, color: true, vertex: false, uvs: false },
  });
  private readonly xpC = new ParticleContainer({
    texture: createGlowTexture(),
    dynamicProperties: { position: true, rotation: true, color: true, vertex: false, uvs: false },
  });

  // 实体对象池
  private readonly enemies = new Map<string, EnemyGfx>();
  private readonly chests = new Map<string, ChestGfx>();
  private readonly turrets = new Map<string, TurretGfx>();
  private readonly landMines = new Map<string, { gfx: Graphics; armed: boolean }>();
  private readonly slashes = new Map<string, Graphics>();
  private readonly beams = new Map<string, Graphics>();
  private readonly damages = new Map<string, Text>();
  private readonly projectiles = new Map<string, Particle>();
  private readonly xpDrops = new Map<string, Particle>();
  private readonly windwheels = new Map<number, WindWheelSlot>();

  private readonly charGroup = new Container();
  private readonly charGfx = new Graphics();

  // HUD 元素
  private hudBuilt = false;
  private readonly hudTexts: { level: Text; hp: Text; kills: Text; invincible: Text } = {
    level: makeText('', FONT_14),
    hp: makeText('', FONT_14),
    kills: makeText('', FONT_14),
    invincible: makeText('无敌', FONT_12, 0.5, 0.5),
  };

  private cameraX = 0;
  private cameraY = 0;
  private lastRenderTime = 0;
  private seeded = false;
  private prevPhase: GamePhase | null = null;
  private prevEnemies = new Map<string, Enemy>();
  private prevProjectiles = new Map<string, Projectile>();
  private prevXp = new Set<string>();
  private prevXpData = new Map<string, XPDrop>();
  private prevLevel = 0;
  private prevHealth = 0;
  private flameAcc = 0;
  private menuKey = '';
  private flashes: FlashFx[] = [];
  private shake: ShakeFx | null = null;

  private constructor(canvas: HTMLCanvasElement) {
    this.app = new Application();
    this.projC.blendMode = 'add';
    this.xpC.blendMode = 'add';
    void canvas;
  }

  static async create(canvas: HTMLCanvasElement): Promise<PixiRenderer> {
    const r = new PixiRenderer(canvas);
    await r.app.init({
      canvas,
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
      background: 0x1a1a2e,
      antialias: true,
      autoStart: false,
      preference: 'webgl',
    });
    r.buildScene();
    return r;
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  getCameraOffset(): { x: number; y: number } {
    return { x: this.cameraX, y: this.cameraY };
  }

  destroy(): void {
    this.app.destroy(true, { children: true, texture: true });
  }

  /* ---------------------------------------------------------------- */
  /* 场景搭建                                                          */
  /* ---------------------------------------------------------------- */

  private buildScene(): void {
    this.fxLayer.addChild(this.fx.additiveContainer, this.fx.normalContainer);
    this.cameraGroup.addChild(this.worldLayer, this.fxLayer);

    this.worldLayer.addChild(
      this.obstacleC,
      this.damageC,
      this.xpC,
      this.chestC,
      this.turretC,
      this.mineC,
      this.enemyC,
      this.slashC,
      this.beamC,
      this.charGroup,
      this.windwheelC,
      this.projC,
    );

    this.app.stage.addChild(this.gridGfx, this.cameraGroup, this.hudC, this.menuC, this.flashGfx);
    this.menuC.visible = false;
    this.flashGfx.visible = false;

    // 屏幕空间滚动网格
    const gridSize = 50;
    this.gridGfx.strokeStyle = { color: 0x2a2a4e, width: 1 };
    for (let x = 0; x <= SCREEN_WIDTH + gridSize; x += gridSize) {
      this.gridGfx.moveTo(x, 0).lineTo(x, SCREEN_HEIGHT + gridSize);
    }
    for (let y = 0; y <= SCREEN_HEIGHT + gridSize; y += gridSize) {
      this.gridGfx.moveTo(0, y).lineTo(SCREEN_WIDTH + gridSize, y);
    }
    this.gridGfx.stroke();

    // 地图边界（世界坐标）
    const border = new Graphics();
    border.rect(0, 0, MAP_WIDTH, MAP_HEIGHT).stroke({ color: 0xff4444, width: 3 });
    this.worldLayer.addChildAt(border, 0);

    // 角色（朝向 +x，由容器旋转）
    this.charGfx.rect(-8, 6, 5, 6).fill({ color: 0x5d4037 });
    this.charGfx.rect(3, 6, 5, 6).fill({ color: 0x5d4037 });
    this.charGfx
      .moveTo(-12, 4)
      .lineTo(8, 4)
      .lineTo(8, -4)
      .lineTo(-12, -4)
      .closePath()
      .fill({ color: 0x4fc3f7 })
      .stroke({ color: 0x2980b9, width: 1.5 });
    this.charGfx.rect(-4, -4, 2, 8).fill({ color: 0x2980b9 });
    this.charGfx.rect(2, -4, 2, 8).fill({ color: 0x2980b9 });
    this.charGfx.circle(10, 0, 7).fill({ color: 0xf5d0a9 }).stroke({ color: 0x8d6e63, width: 1.5 });
    this.charGfx.circle(12, -2, 2.5).fill({ color: 0xffffff }).stroke({ color: 0x333333, width: 1 });
    this.charGfx.circle(12, 2, 2.5).fill({ color: 0xffffff }).stroke({ color: 0x333333, width: 1 });
    this.charGfx.circle(12, -2, 1.2).fill({ color: 0x333333 });
    this.charGfx.circle(12, 2, 1.2).fill({ color: 0x333333 });
    this.charGfx
      .moveTo(16, -4)
      .lineTo(26, 0)
      .lineTo(16, 4)
      .closePath()
      .fill({ color: 0x4fc3f7 })
      .stroke({ color: 0x2980b9, width: 2 });
    this.charGfx.rect(-6, -10, 4, 6).fill({ color: 0x8d6e63 });
    this.charGfx.rect(2, -10, 4, 6).fill({ color: 0x8d6e63 });
    this.charGroup.addChild(this.charGfx);

    // HUD 初始文本摆放
    this.hudTexts.level.position.set(10, 25);
    this.hudTexts.hp.position.set(100, 25);
    this.hudTexts.kills.position.set(400, 25);
    this.hudTexts.invincible.position.set(SCREEN_WIDTH / 2, 80);
    this.hudTexts.invincible.visible = false;
  }

  /* ---------------------------------------------------------------- */
  /* 渲染入口                                                          */
  /* ---------------------------------------------------------------- */

  render(state: GameState): void {
    const now = performance.now();
    const dt = Math.min(Math.max((now - this.lastRenderTime) / 1000, 0), 0.05);
    this.lastRenderTime = now;

    const phase = state.phase;
    const inWorld = phase !== GamePhase.WeaponSelect;

    // 相机
    if (inWorld) {
      this.cameraX = state.character.position.x - SCREEN_WIDTH / 2;
      this.cameraY = state.character.position.y - SCREEN_HEIGHT / 2;
    }

    this.cameraGroup.visible = inWorld;
    this.gridGfx.visible = inWorld;
    this.hudC.visible = phase !== GamePhase.WeaponSelect;

    // 相机抖动 + 相机偏移（如果 world 可见）
    if (this.cameraGroup.visible) {
      let offX = 0;
      let offY = 0;
      if (this.shake && this.shake.timer > 0) {
        const k = this.shake.timer / this.shake.duration;
        const mag = this.shake.power * k;
        offX = (Math.random() - 0.5) * 2 * mag;
        offY = (Math.random() - 0.5) * 2 * mag;
        this.shake.timer -= dt;
        if (this.shake.timer <= 0) this.shake = null;
      }
      this.cameraGroup.position.set(-this.cameraX + offX, -this.cameraY + offY);
      this.gridGfx.position.set(-(this.cameraX % 50), -(this.cameraY % 50));
      this.updateCharacter(state);
      this.reconcileWorld(state);
      if (phase === GamePhase.Playing) {
        this.detectEffects(state, dt);
      }
      this.buildMenu(state);
    } else {
      this.buildMenu(state);
    }

    // HUD（任何非选枪阶段都显示）
    if (this.hudC.visible && !this.hudBuilt) {
      this.buildHud();
    }
    if (this.hudC.visible) {
      this.updateHud(state);
    }

    // 粒子推进
    this.fx.update(dt);

    // 屏幕闪白/闪红
    this.updateFlashes(dt);

    // 状态快照（用于下一帧 diff 特效）
    this.snapshot(state);

    this.app.render();
  }

  /* ---------------------------------------------------------------- */
  /* 世界同步                                                          */
  /* ---------------------------------------------------------------- */

  private reconcileWorld(state: GameState): void {
    this.syncObstacles(state.obstacles);
    this.syncDamageNumbers(state.damageNumbers);
    this.syncXpDrops(state.xpDrops, state.elapsedTime);
    this.syncChests(state.chests);
    this.syncTurrets(state.turrets);
    this.syncLandMines(state.landMines);
    this.syncEnemies(state.enemies);
    this.syncSlashes(state.slashEffects);
    this.syncBeams(state.beamEffects);
    this.syncWindWheels(state);
    this.syncProjectiles(state.projectiles, state.elapsedTime);
  }

  private syncObstacles(obstacles: Obstacle[]): void {
    const count = obstacles.length;
    if (this.obstacleC.children.length !== count) {
      this.obstacleC.removeChildren().forEach((c) => c.destroy());
      for (const obs of obstacles) {
        const g = new Graphics();
        g.rect(-obs.width / 2, -obs.height / 2, obs.width, obs.height).fill({ color: 0x4a4a6a });
        g.position.set(obs.position.x, obs.position.y);
        this.obstacleC.addChild(g);
      }
    }
  }

  private syncDamageNumbers(numbers: DamageNumber[]): void {
    const seen = new Set<string>();
    for (const dn of numbers) {
      const key = `${dn.position.x.toFixed(0)},${dn.position.y.toFixed(0)},${dn.value}`;
      seen.add(key);
      let txt = this.damages.get(key);
      if (!txt) {
        txt = new Text({
          text: `${dn.value}`,
          style: { fontFamily: MONO, fontSize: 14, fontWeight: 'bold', fill: 0xff3232 },
        });
        txt.anchor.set(0.5, 0.5);
        this.damages.set(key, txt);
        this.damageC.addChild(txt);
      }
      txt.position.set(dn.position.x, dn.position.y);
      txt.alpha = clamp01(dn.timer / dn.maxTimer);
    }
    for (const [key, txt] of this.damages) {
      if (!seen.has(key)) {
        this.damageC.removeChild(txt);
        txt.destroy();
        this.damages.delete(key);
      }
    }
  }

  private syncXpDrops(drops: XPDrop[], elapsed: number): void {
    const seen = new Set<string>();
    for (const drop of drops) {
      seen.add(drop.id);
      let p = this.xpDrops.get(drop.id);
      if (!p) {
        p = new Particle({
          texture: this.glowTexture,
          x: drop.position.x,
          y: drop.position.y,
          anchorX: 0.5,
          anchorY: 0.5,
          tint: 0x76ff03,
          alpha: 1,
        });
        this.xpDrops.set(drop.id, p);
        this.xpC.addParticle(p);
      }
      p.x = drop.position.x;
      p.y = drop.position.y;
      // 呼吸感脉冲
      const pulse = 3.6 + Math.sin(elapsed * 4 + drop.id.length * 1.7) * 0.7;
      p.scaleX = pulse / 32;
      p.scaleY = pulse / 32;
    }
    for (const [id, p] of this.xpDrops) {
      if (!seen.has(id)) {
        this.xpC.removeParticle(p);
        this.xpDrops.delete(id);
      }
    }
  }

  private syncChests(chests: Chest[]): void {
    const seen = new Set<string>();
    for (const chest of chests) {
      seen.add(chest.id);
      let c = this.chests.get(chest.id);
      if (!c) {
        const gfx = new Graphics();
        gfx.rect(-6, -6, 12, 12).fill({ color: 0xff9800 }).stroke({ color: 0xffc107, width: 2 });
        const label = makeText(chestLabel(chest.type), FONT_10, 0.5, 0.5);
        label.position.set(0, 3);
        gfx.addChild(label);
        c = { gfx, label };
        this.chests.set(chest.id, c);
        this.chestC.addChild(gfx);
      }
      c.gfx.position.set(chest.position.x, chest.position.y);
    }
    for (const [id, c] of this.chests) {
      if (!seen.has(id)) {
        this.chestC.removeChild(c.gfx);
        c.gfx.destroy({ children: true });
        this.chests.delete(id);
      }
    }
  }

  private syncTurrets(turrets: TurretEntity[]): void {
    const seen = new Set<string>();
    for (const t of turrets) {
      seen.add(t.id);
      let tg = this.turrets.get(t.id);
      if (!tg) {
        const gfx = new Graphics();
        gfx.rect(-6, -6, 12, 12).fill({ color: 0xff9800 }).stroke({ color: 0xffc107, width: 2 });
        const label = makeText('炮', { fontFamily: MONO, fontSize: 8, fill: 0xffffff }, 0.5, 0.5);
        label.position.set(0, 3);
        gfx.addChild(label);
        tg = { gfx, label };
        this.turrets.set(t.id, tg);
        this.turretC.addChild(gfx);
      }
      tg.gfx.position.set(t.position.x, t.position.y);
    }
    for (const [id, tg] of this.turrets) {
      if (!seen.has(id)) {
        this.turretC.removeChild(tg.gfx);
        tg.gfx.destroy({ children: true });
        this.turrets.delete(id);
      }
    }
  }

  private syncLandMines(mines: LandMineEntity[]): void {
    const seen = new Set<string>();
    for (const m of mines) {
      seen.add(m.id);
      let entry = this.landMines.get(m.id);
      if (!entry) {
        const gfx = new Graphics();
        gfx.circle(0, 0, 5).fill({ color: m.armed ? 0xf44336 : 0x666666 }).stroke({ color: 0xffeb3b, width: 1 });
        entry = { gfx, armed: m.armed };
        this.landMines.set(m.id, entry);
        this.mineC.addChild(gfx);
      } else if (entry.armed !== m.armed) {
        entry.armed = m.armed;
        entry.gfx.clear();
        entry.gfx.circle(0, 0, 5).fill({ color: m.armed ? 0xf44336 : 0x666666 }).stroke({ color: 0xffeb3b, width: 1 });
      }
      entry.gfx.position.set(m.position.x, m.position.y);
    }
    for (const [id, entry] of this.landMines) {
      if (!seen.has(id)) {
        this.mineC.removeChild(entry.gfx);
        entry.gfx.destroy();
        this.landMines.delete(id);
      }
    }
  }

  private syncEnemies(enemies: Enemy[]): void {
    const seen = new Set<string>();
    for (const e of enemies) {
      seen.add(e.id);
      let eg = this.enemies.get(e.id);
      if (!eg) {
        eg = { body: new Graphics(), bar: new Graphics() };
        this.enemies.set(e.id, eg);
        this.enemyC.addChild(eg.body, eg.bar);
      }
      eg.body.position.set(e.position.x, e.position.y);
      this.redrawEnemy(eg.body, e);
      eg.bar.position.set(e.position.x, e.position.y - e.size - 10);
      this.redrawEnemyBar(eg.bar, e);
    }
    for (const [id, eg] of this.enemies) {
      if (!seen.has(id)) {
        this.enemyC.removeChild(eg.body, eg.bar);
        eg.body.destroy();
        eg.bar.destroy();
        this.enemies.delete(id);
      }
    }
  }

  private redrawEnemy(g: Graphics, e: Enemy): void {
    g.clear();
    const s = e.size;
    if (e.isMiniBoss) {
      g.circle(0, 0, s).fill({ color: 0xc0392b }).stroke({ color: 0xe74c3c, width: 3 });
      g.moveTo(-s * 0.8, -s * 0.9).lineTo(0, -s * 1.4).lineTo(s * 0.8, -s * 0.9).closePath()
        .fill({ color: 0x8e44ad });
      for (const sx of [-1, 1]) {
        g.circle(sx * s * 0.3, -s * 0.1, 4).fill({ color: 0xf1c40f });
        g.circle(sx * s * 0.3, -s * 0.1, 2).fill({ color: 0x000000 });
      }
      return;
    }

    const healthRatio = clamp01(e.health / e.maxHealth);
    const r = Math.floor(200 * (1 - healthRatio) + 100);
    const gl = Math.floor(100 * healthRatio);

    switch (e.configId) {
      case 'walker': {
        const body = rgb(r, gl, 50);
        const light = rgb(r + 30, gl + 30, 50);
        g.circle(0, 0, s).fill({ color: body }).stroke({ color: light, width: 2 });
        g.rect(-s * 0.2, s * 0.3, s * 0.4, s * 0.6).fill({ color: light });
        this.redrawEnemyEyes(g, s, 0xcc0000);
        g.circle(-s * 0.4, -s * 0.3, 2).fill({ color: rgb(r + 20, gl + 20, 40) });
        g.circle(s * 0.4, -s * 0.3, 2).fill({ color: rgb(r + 20, gl + 20, 40) });
        break;
      }
      case 'runner': {
        const body = rgb(r + 50, gl, 80);
        const light = rgb(r + 80, gl + 30, 80);
        g.ellipse(0, 0, s * 1.2, s * 0.7).fill({ color: body }).stroke({ color: light, width: 2 });
        g.rect(-s * 0.5, s * 0.3, s * 0.3, s * 0.5).fill({ color: light });
        g.rect(s * 0.2, s * 0.3, s * 0.3, s * 0.5).fill({ color: light });
        this.redrawEnemyEyes(g, s, 0x8800aa);
        break;
      }
      case 'tank': {
        const body = rgb(r - 30, gl, 30);
        const light = rgb(r, gl + 30, 30);
        g.rect(-s * 0.9, -s * 0.7, s * 1.8, s * 1.4).fill({ color: body }).stroke({ color: light, width: 3 });
        g.rect(-s * 0.7, -s * 0.3, s * 0.3, s * 0.3).fill({ color: rgb(r - 10, gl + 10, 20) });
        g.rect(s * 0.4, -s * 0.3, s * 0.3, s * 0.3).fill({ color: rgb(r - 10, gl + 10, 20) });
        g.rect(-s * 0.7, s * 0.2, s * 1.4, s * 0.2).fill({ color: rgb(r - 10, gl + 10, 20) });
        this.redrawEnemyEyes(g, s, 0xaa4400);
        break;
      }
      case 'ranged': {
        const body = rgb(r - 20, gl + 30, 80);
        const light = rgb(r + 10, gl + 60, 80);
        g.circle(0, 0, s).fill({ color: body }).stroke({ color: light, width: 2 });
        g.rect(s * 0.5, -3, s * 0.8, 6).fill({ color: light });
        g.rect(s * 0.3, -5, s * 0.2, 10).fill({ color: rgb(r + 30, gl + 80, 80) });
        this.redrawEnemyEyes(g, s, 0x0055aa);
        break;
      }
      case 'exploder': {
        const body = rgb(r + 60, gl - 20, 20);
        const light = rgb(r + 90, gl + 10, 20);
        this.redrawStar(g, s, body, light);
        g.circle(0, 0, s * 0.4).fill({ color: rgb(r + 90, gl - 10, 10) });
        for (const sx of [-1, 1]) {
          g.circle(sx * s * 0.2, -s * 0.1, 3).fill({ color: 0xffffff });
          g.circle(sx * s * 0.2, -s * 0.1, 1.5).fill({ color: 0x000000 });
        }
        break;
      }
      default: {
        g.circle(0, 0, s).fill({ color: rgb(r, gl, 50) });
        this.redrawEnemyEyes(g, s, 0xff0000);
        break;
      }
    }
  }

  private redrawStar(g: Graphics, s: number, body: number, light: number): void {
    let pts: number[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? s * 1.3 : s * 0.9;
      pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.poly(pts, true).fill({ color: body });
    pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? s * 1.3 : s * 0.9;
      pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.poly(pts, true).stroke({ color: light, width: 2 });
  }

  private redrawEnemyEyes(g: Graphics, size: number, color: number): void {
    const eyeOff = size * 0.3;
    const eyeR = size * 0.12;
    for (const sx of [-1, 1]) {
      g.circle(sx * eyeOff, -eyeOff * 0.4, eyeR).fill({ color: 0xffffff });
      g.circle(sx * eyeOff, -eyeOff * 0.4, eyeR * 0.6).fill({ color });
    }
  }

  private redrawEnemyBar(g: Graphics, e: Enemy): void {
    g.clear();
    const w = Math.max(16, e.size * 2);
    const ratio = clamp01(e.health / e.maxHealth);
    g.rect(-w / 2, 0, w, 3).fill({ color: 0x222222, alpha: 0.85 });
    g.rect(-w / 2, 0, w * ratio, 3).fill({
      color: ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xff9800 : 0xf44336,
    });
  }

  private syncSlashes(effects: SlashEffect[]): void {
    const seen = new Set<string>();
    for (const ef of effects) {
      const key = `${ef.position.x.toFixed(1)},${ef.position.y.toFixed(1)},${ef.direction.toFixed(2)},${ef.arc.toFixed(2)},${ef.range.toFixed(1)}`;
      seen.add(key);
      let g = this.slashes.get(key);
      if (!g) {
        g = new Graphics();
        const startAngle = ef.direction - ef.arc / 2;
        const endAngle = ef.direction + ef.arc / 2;
        g.moveTo(Math.cos(startAngle) * ef.range, Math.sin(startAngle) * ef.range)
          .arc(0, 0, ef.range, startAngle, endAngle)
          .lineTo(0, 0)
          .closePath()
          .fill({ color: 0xc8e6ff, alpha: 0.3 });
        g.arc(0, 0, ef.range, startAngle, endAngle).stroke({ color: 0xffffff, width: 4 });
        this.slashes.set(key, g);
        this.slashC.addChild(g);
      }
      g.position.set(ef.position.x, ef.position.y);
      g.alpha = clamp01(ef.timer / 0.15);
    }
    for (const [key, g] of this.slashes) {
      if (!seen.has(key)) {
        this.slashC.removeChild(g);
        g.destroy();
        this.slashes.delete(key);
      }
    }
  }

  private syncBeams(effects: BeamEffect[]): void {
    const seen = new Set<string>();
    for (const ef of effects) {
      const key = `${ef.origin.x.toFixed(1)},${ef.origin.y.toFixed(1)},${ef.end.x.toFixed(1)},${ef.end.y.toFixed(1)}`;
      seen.add(key);
      let g = this.beams.get(key);
      if (!g) {
        g = new Graphics();
        g.moveTo(ef.origin.x, ef.origin.y).lineTo(ef.end.x, ef.end.y).stroke({ color: 0x00e5ff, width: ef.width });
        g.moveTo(ef.origin.x, ef.origin.y).lineTo(ef.end.x, ef.end.y).stroke({
          color: 0xc8ffff,
          width: Math.max(2, ef.width * 0.4),
        });
        this.beams.set(key, g);
        this.beamC.addChild(g);
      }
      g.alpha = clamp01(ef.timer / 0.15);
    }
    for (const [key, g] of this.beams) {
      if (!seen.has(key)) {
        this.beamC.removeChild(g);
        g.destroy();
        this.beams.delete(key);
      }
    }
  }

  private syncWindWheels(state: GameState): void {
    const { auxWeapons } = state.character;
    const seen = new Set<number>();
    for (let i = 0; i < auxWeapons.length; i++) {
      const aux = auxWeapons[i];
      if (aux.typeId !== AuxiliaryWeaponType.WindWheel) continue;
      seen.add(i);
      let slot = this.windwheels.get(i);
      const count = Math.max(1, Math.min(Math.floor(aux.stats.count), 6));
      const radius = 80;
      const needsRedraw = !slot || slot.count !== count || slot.range !== aux.stats.range;
      if (!slot) {
        slot = { root: new Container(), gfx: new Graphics(), count, range: aux.stats.range };
        this.windwheels.set(i, slot);
        this.windwheelC.addChild(slot.root);
      }
      slot.root.position.set(state.character.position.x, state.character.position.y);
      slot.root.rotation = aux.rotationAngle;
      if (needsRedraw) {
        slot.count = count;
        slot.range = aux.stats.range;
        slot.gfx.clear();
        const bladeSize = Math.max(6, aux.stats.range * 0.15);
        // 虚线环
        const segs = 24;
        const dash = (Math.PI * 2) / segs / 2;
        for (let i = 0; i < segs; i++) {
          const a0 = (i / segs) * Math.PI * 2;
          slot.gfx.arc(0, 0, radius, a0, a0 + dash).stroke({ color: 0x9c27b0, width: 1, alpha: 0.3 });
        }
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          const ux = Math.cos(a);
          const uy = Math.sin(a);
          const px = -uy; // 垂直方向
          const py = ux;
          const bx = ux * radius;
          const by = uy * radius;
          const g = slot.gfx;
          g.moveTo(bx + ux * bladeSize * 1.3, by + uy * bladeSize * 1.3)
            .lineTo(bx + px * bladeSize * 0.75, by + py * bladeSize * 0.75)
            .lineTo(bx - ux * bladeSize * 1.3, by - uy * bladeSize * 1.3)
            .lineTo(bx - px * bladeSize * 0.75, by - py * bladeSize * 0.75)
            .closePath()
            .fill({ color: 0x9c27b0, alpha: 0.6 });
          g.circle(bx, by, bladeSize * 0.4).fill({ color: 0xce93d8, alpha: 0.6 });
        }
      }
    }
    for (const [i, slot] of this.windwheels) {
      if (!seen.has(i)) {
        this.windwheelC.removeChild(slot.root);
        slot.root.destroy({ children: true });
        this.windwheels.delete(i);
      }
    }
  }

  private syncProjectiles(projectiles: Projectile[], elapsed: number): void {
    const seen = new Set<string>();
    for (const proj of projectiles) {
      seen.add(proj.id);
      let p = this.projectiles.get(proj.id);
      if (!p) {
        p = new Particle({
          texture: this.glowTexture,
          anchorX: 0.5,
          anchorY: 0.5,
          alpha: 1,
        });
        this.projectiles.set(proj.id, p);
        this.projC.addParticle(p);
        const color = PROJECTILE_COLORS[proj.weaponType as string] ?? 0xce93d8;
        const radius = PROJECTILE_RADIUS[proj.weaponType as string] ?? 4;
        p.tint = color;
        (p as unknown as { __radius: number }).__radius = radius;
        p.scaleY = radius / 32;
      }
      p.x = proj.position.x;
      p.y = proj.position.y;
      const angle = Math.atan2(proj.velocity.y, proj.velocity.x);
      p.rotation = angle;

      const speed = Math.hypot(proj.velocity.x, proj.velocity.y);
      const radius = (p as unknown as { __radius: number }).__radius;
      const trail = Math.min(12, speed * 0.02);

      if (proj.weaponType === WeaponTypeId.Flamethrower) {
        // 火焰：随机大小闪烁，随生命周期淡出
        const lifeRatio = proj.maxLifetime > 0 ? proj.lifetime / proj.maxLifetime : 0;
        const flicker = 1 + Math.random() * 0.9;
        const a = Math.max(0, Math.min(1, Math.sin((1 - lifeRatio) * Math.PI)));
        p.alpha = a;
        p.scaleX = (radius * flicker) / 32;
        p.scaleY = (radius * flicker) / 32;
      } else {
        p.alpha = 1;
        // 彗星拖尾：沿速度方向拉长
        p.scaleX = (radius + trail * 0.28) / 32;
        p.scaleY = radius / 32;
        const pulse = 1 + Math.sin(elapsed * 20 + proj.id.length * 3) * 0.12;
        p.scaleX *= pulse;
        p.scaleY *= pulse;
      }
    }
    for (const [id, p] of this.projectiles) {
      if (!seen.has(id)) {
        this.projC.removeParticle(p);
        this.projectiles.delete(id);
      }
    }
  }

  private updateCharacter(state: GameState): void {
    const char = state.character;
    this.charGroup.position.set(char.position.x, char.position.y);
    const dir = state.mouseDirection;
    this.charGroup.rotation = Math.atan2(dir.y, dir.x);
    const blink = char.invincibleTimer > 0 && Math.floor(char.invincibleTimer * 10) % 2 === 0;
    this.charGroup.alpha = blink ? 0.5 : 1;
  }

  /* ---------------------------------------------------------------- */
  /* 特效触发（帧间 diff，保持游戏逻辑纯净）                            */
  /* ---------------------------------------------------------------- */

  private detectEffects(state: GameState, dt: number): void {
    if (!this.seeded) return;

    const curEnemies = new Map(state.enemies.map((e) => [e.id, e]));

    // 敌人死亡 → 爆裂
    for (const [id, pe] of this.prevEnemies) {
      if (!curEnemies.has(id)) {
        const color = ENEMY_BURST_COLORS[pe.configId] ?? 0xe0e0e0;
        const big = pe.isMiniBoss;
        this.fx.burst({
          x: pe.position.x, y: pe.position.y,
          count: big ? 42 : Math.max(8, Math.floor(pe.size * 1.2)),
          color,
          speedMin: big ? 60 : 40, speedMax: big ? 300 : 160,
          sizeMin: 2, sizeMax: big ? 6 : 4,
          lifeMin: 0.3, lifeMax: big ? 1.0 : 0.6,
          gravity: 80, drag: 0.9, spin: 6, additive: true,
        });
        if (big) {
          this.fx.burst({
            x: pe.position.x, y: pe.position.y, count: 26, color: 0xffc107,
            speedMin: 30, speedMax: 220, sizeMin: 3, sizeMax: 7,
            lifeMin: 0.4, lifeMax: 1.1, gravity: 40, drag: 0.92, additive: true,
          });
          this.addShake(7, 0.45);
        } else if (pe.configId === 'exploder') {
          this.addShake(3, 0.25);
        }
      }
    }

    // 敌人受击 → 火花
    for (const [id, pe] of this.prevEnemies) {
      const cur = curEnemies.get(id);
      if (cur && cur.health < pe.health - 0.5) {
        this.fx.burst({
          x: cur.position.x, y: cur.position.y, count: 4,
          color: 0xffffff, speedMin: 80, speedMax: 200,
          sizeMin: 1.5, sizeMax: 3, lifeMin: 0.12, lifeMax: 0.3,
          drag: 0.9, additive: true, alpha: 0.9,
        });
      }
    }

    // 燃烧中的敌人 → 火星
    for (const e of state.enemies) {
      if (e.burnTimer > 0 && Math.random() < dt * 10) {
        this.fx.spawn(
          e.position.x + (Math.random() - 0.5) * e.size,
          e.position.y + (Math.random() - 0.5) * e.size,
          {
            color: Math.random() < 0.5 ? 0xff3d00 : 0xff6d00, alpha: 0.8,
            speedMin: 5, speedMax: 40, sizeMin: 1.5, sizeMax: 3,
            lifeMin: 0.2, lifeMax: 0.45, drag: 0.94, gravity: -20, additive: true,
          },
        );
      }
    }

    // 新弹药 → 开火闪光（限流）
    let muzzleCount = 0;
    for (const proj of state.projectiles) {
      if (!this.prevProjectiles.has(proj.id) && muzzleCount < 10) {
        const wt = proj.weaponType as string;
        const color = PROJECTILE_COLORS[wt] ?? 0xffffff;
        const isShotgun = wt === WeaponTypeId.Shotgun;
        const isFlame = wt === WeaponTypeId.Flamethrower;
        const count = isShotgun ? 10 : isFlame ? 6 : 4;
        const angle = Math.atan2(proj.velocity.y, proj.velocity.x);
        this.fx.burst({
          x: proj.position.x, y: proj.position.y, count,
          color, angle, spread: 1.4,
          speedMin: 60, speedMax: isShotgun ? 240 : 160,
          sizeMin: 2, sizeMax: 4,
          lifeMin: 0.12, lifeMax: 0.3,
          drag: 0.92, additive: true,
        });
        muzzleCount++;
      }
    }

    // 火焰喷射器持续余烬
    this.flameAcc += dt;
    while (this.flameAcc > 0.03) {
      this.flameAcc -= 0.03;
      for (const proj of state.projectiles) {
        if (proj.weaponType === WeaponTypeId.Flamethrower && Math.random() < 0.5) {
          this.fx.spawn(proj.position.x, proj.position.y, {
            color: Math.random() < 0.6 ? 0xff6d00 : 0xff3d00, alpha: 0.7,
            speedMin: 10, speedMax: 70, sizeMin: 1.5, sizeMax: 3.5,
            lifeMin: 0.15, lifeMax: 0.4, drag: 0.95, additive: true,
          });
        }
      }
    }

    // XP 拾取 → 光点
    const curXp = new Set(state.xpDrops.map((d) => d.id));
    for (const id of this.prevXp) {
      if (curXp.has(id)) continue;
      const drop = this.prevXpData.get(id);
      if (drop) {
        this.fx.burst({
          x: drop.position.x, y: drop.position.y, count: 6, color: 0x76ff03,
          speedMin: 40, speedMax: 140, sizeMin: 1.5, sizeMax: 3,
          lifeMin: 0.2, lifeMax: 0.45, drag: 0.9, additive: true,
        });
      }
    }

    // 升级 → 金色爆发 + 闪屏
    if (state.character.level > this.prevLevel) {
      this.fx.burst({
        x: state.character.position.x, y: state.character.position.y,
        count: 30, color: 0xffc107, speedMin: 60, speedMax: 260,
        sizeMin: 2, sizeMax: 6, lifeMin: 0.4, lifeMax: 1.0,
        gravity: 60, drag: 0.9, spin: 5, additive: true,
      });
      this.addFlash(0xffeb3b, 0.22, 0.35);
    }

    // 角色受击 → 红色粒子
    if (state.character.health < this.prevHealth - 0.5) {
      this.fx.burst({
        x: state.character.position.x, y: state.character.position.y,
        count: 10, color: 0xf44336, speedMin: 60, speedMax: 220,
        sizeMin: 2, sizeMax: 4, lifeMin: 0.25, lifeMax: 0.5,
        drag: 0.9, additive: true,
      });
      this.addFlash(0xff1744, 0.12, 0.25);
    }
  }

  /* ---------------------------------------------------------------- */
  /* 快照                                                              */
  /* ---------------------------------------------------------------- */

  private snapshot(state: GameState): void {
    const playing = state.phase === GamePhase.Playing;
    if (state.phase !== this.prevPhase) {
      if (state.phase === GamePhase.Playing) {
        // 进入游玩：直接铺底，避免进场瞬间误触发特效
        this.prevEnemies = new Map(state.enemies.map((e) => [e.id, e]));
        this.prevProjectiles = new Map(state.projectiles.map((p) => [p.id, p]));
        this.prevXp = new Set(state.xpDrops.map((d) => d.id));
        this.prevXpData = new Map(state.xpDrops.map((d) => [d.id, d]));
        this.prevLevel = state.character.level;
        this.prevHealth = state.character.health;
        this.flameAcc = 0;
        this.seeded = true;
      } else {
        this.seeded = false;
      }
      this.prevPhase = state.phase;
      return;
    }
    if (!playing || !this.seeded) return;

    this.prevEnemies = new Map(state.enemies.map((e) => [e.id, e]));
    this.prevProjectiles = new Map(state.projectiles.map((p) => [p.id, p]));
    this.prevXp = new Set(state.xpDrops.map((d) => d.id));
    this.prevXpData = new Map(state.xpDrops.map((d) => [d.id, d]));
    this.prevLevel = state.character.level;
    this.prevHealth = state.character.health;
  }

  /* ---------------------------------------------------------------- */
  /* HUD & 菜单                                                        */
  /* ---------------------------------------------------------------- */

  private buildHud(): void {
    const topBar = new Graphics();
    topBar.rect(0, 0, SCREEN_WIDTH, 65).fill({ color: 0x000000, alpha: 0.5 });
    this.hudC.addChild(topBar);

    this.hudC.addChild(this.hudTexts.level, this.hudTexts.hp, this.hudTexts.kills, this.hudTexts.invincible);

    // 武器槽（主武器 + 2 个副武器槽）
    for (let i = 0; i < 1 + MAX_AUX_SLOTS; i++) {
      const slot = new Graphics();
      slot.name = `slot_${i}`;
      this.hudC.addChild(slot);

      const nameTxt = makeText('', { fontFamily: MONO, fontSize: 9, fill: 0x4fc3f7 }, 0, 0.5);
      nameTxt.name = `slotName_${i}`;
      this.hudC.addChild(nameTxt);

      const lvTxt = makeText('', { fontFamily: MONO, fontSize: 8, fill: 0xffeb3b }, 1, 0.5);
      lvTxt.name = `slotLv_${i}`;
      this.hudC.addChild(lvTxt);

      const reloadRing = new Graphics();
      reloadRing.name = `slotRing_${i}`;
      this.hudC.addChild(reloadRing);
    }
    this.hudBuilt = true;
  }

  private updateHud(state: GameState): void {
    const char = state.character;
    this.hudTexts.level.text = `等级 ${char.level}`;
    this.hudTexts.hp.text = `生命: ${Math.floor(char.health)}/${char.maxHealth}`;
    this.hudTexts.kills.text = `击杀: ${char.killCount}`;
    this.hudTexts.invincible.visible = char.invincibleTimer > 0;

    const slotY = 42;
    const slotW = 50;
    const slotH = 22;
    const slotGap = 4;
    const slotX0 = 10;

    const main = char.mainWeapon;
    const mainConfig = WEAPON_CONFIGS[main.typeId];
    const mainAmmo = main.stats.magazineCapacity === Infinity ? 1 : main.currentAmmo / main.stats.magazineCapacity;
    this.redrawWeaponSlot(0, slotX0, slotY, slotW, slotH, mainConfig.name.slice(0, 2), main.level, mainAmmo, main.reloadTimer > 0, main.reloadTimer / main.stats.reloadSpeed, false, false);

    for (let i = 0; i < MAX_AUX_SLOTS; i++) {
      const x = slotX0 + (i + 1) * (slotW + slotGap);
      if (i < char.auxWeapons.length) {
        const aux = char.auxWeapons[i];
        const cfg = AUXILIARY_WEAPON_CONFIGS[aux.typeId];
        this.redrawWeaponSlot(i + 1, x, slotY, slotW, slotH, cfg.name.slice(0, 2), aux.level, 1, false, 0, true, false);
      } else {
        this.redrawWeaponSlot(i + 1, x, slotY, slotW, slotH, '', 0, 0, false, 0, true, true);
      }
    }

    // XP 条
    const barY = SCREEN_HEIGHT - 3;
    const bg = this.getOrCreateGfx('xpBg');
    bg.clear();
    bg.rect(0, barY, SCREEN_WIDTH, 3).fill({ color: 0x000000, alpha: 0.6 });
    const ratio = clamp01(char.xp / char.xpToNextLevel);
    const fill = this.getOrCreateGfx('xpFill');
    fill.clear();
    fill.rect(0, barY, SCREEN_WIDTH * ratio, 3).fill({ color: 0x76ff03 });
  }

  private redrawWeaponSlot(
    index: number,
    x: number, y: number, w: number, h: number,
    label: string, lv: number, ammoRatio: number,
    isReloading: boolean, reloadProgress: number, isAux: boolean,
    isEmpty: boolean,
  ): void {
    const slot = this.hudC.getChildByName(`slot_${index}`) as Graphics;
    const nameTxt = this.hudC.getChildByName(`slotName_${index}`) as Text;
    const lvTxt = this.hudC.getChildByName(`slotLv_${index}`) as Text;
    const ring = this.hudC.getChildByName(`slotRing_${index}`) as Graphics;

    if (isEmpty) {
      slot.clear();
      slot.rect(x, y, w, h).fill({ color: 0xffffff, alpha: 0.08 });
      slot.rect(x, y, w, h).stroke({ color: 0xffffff, alpha: 0.2, width: 1 });
      nameTxt.text = '';
      lvTxt.text = '';
      ring.clear();
      ring.visible = false;
      return;
    }

    slot.clear();
    slot.rect(x, y, w, h).fill({ color: 0x222222 });
    slot.rect(x, y, w, h).stroke({
      color: isReloading ? 0xff9800 : isAux ? 0xce93d8 : 0x4fc3f7,
      width: 1.5,
    });

    nameTxt.visible = true;
    nameTxt.position.set(x + 3, y + 10);
    nameTxt.style.fill = isAux ? 0xce93d8 : 0x4fc3f7;
    nameTxt.text = label;

    lvTxt.visible = true;
    lvTxt.position.set(x + w - 3, y + 10);
    lvTxt.text = `Lv${lv}`;

    if (isReloading) {
      ring.visible = true;
      ring.clear();
      const cx = x + w / 2;
      const cy = y + h / 2;
      ring.arc(cx, cy, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 1.5 * clamp01(1 - reloadProgress)).stroke({
        color: 0xff9800,
        width: 2,
      });
    } else {
      ring.visible = false;
    }

    const barGfx = this.getChildGraphics(`slotBar_${index}`);
    barGfx.clear();
    if (!isAux) {
      barGfx.rect(x + 2, y + h - 5, w - 4, 3).fill({ color: 0x333333 });
      const ammo = Math.max(0, ammoRatio);
      barGfx.rect(x + 2, y + h - 5, (w - 4) * ammo, 3).fill({
        color: ammo > 0.3 ? 0x4caf50 : ammo > 0.1 ? 0xff9800 : 0xf44336,
      });
    }
  }

  /** 在 HUD 上按 name 查找或创建一个小 Graphics（弹药条）。 */
  private getChildGraphics(name: string): Graphics {
    let g = this.hudC.getChildByName(name) as Graphics | null;
    if (!g) {
      g = new Graphics();
      g.name = name;
      this.hudC.addChild(g);
    }
    return g;
  }

  /** 在 HUD 上按 name 查找或创建 Graphics（XP 条）。 */
  private getOrCreateGfx(name: string): Graphics {
    return this.getChildGraphics(name);
  }

  /* ---------------------------------------------------------------- */
  /* 菜单（阶段画布）                                                  */
  /* ---------------------------------------------------------------- */

  private buildMenu(state: GameState): void {
    const phase = state.phase;
    let key = '';
    switch (phase) {
      case GamePhase.WeaponSelect:
        key = `ws:${state.selectedIndex}`;
        break;
      case GamePhase.LevelUp:
        key = `lu:${state.selectedIndex}:${state.upgradeOptions.map((o) => o.description).join('|')}`;
        break;
      case GamePhase.WeaponDrop:
        key = `wd:${state.selectedIndex}:${state.weaponDropOptions.join('|')}`;
        break;
      case GamePhase.Paused:
        key = 'pause';
        break;
      default:
        break;
    }

    if (key === this.menuKey) return;
    this.menuKey = key;

    this.menuC.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.menuC.visible = key !== '';
    if (!key) return;

    switch (phase) {
      case GamePhase.WeaponSelect:
        this.drawWeaponSelect(this.menuC, state);
        break;
      case GamePhase.LevelUp:
        this.drawLevelUp(this.menuC, state);
        break;
      case GamePhase.WeaponDrop:
        this.drawWeaponDrop(this.menuC, state);
        break;
      case GamePhase.Paused:
        this.drawPause(this.menuC, state);
        break;
    }
  }

  private drawWeaponSelect(c: Container, state: GameState): void {
    const g = new Graphics();
    g.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill({ color: 0x111111 });
    c.addChild(g);

    const title = makeText('选择你的武器', { fontFamily: MONO, fontSize: 24, fill: 0xffffff }, 0.5, 0.5);
    title.position.set(SCREEN_WIDTH / 2, 80);
    c.addChild(title);

    const weapons = INITIAL_WEAPON_POOL;
    const boxWidth = 150;
    const boxHeight = 150;
    const gap = 10;
    const totalWidth = weapons.length * boxWidth + (weapons.length - 1) * gap;
    const startX = (SCREEN_WIDTH - totalWidth) / 2;
    const startY = 150;

    for (let i = 0; i < weapons.length; i++) {
      const config = WEAPON_CONFIGS[weapons[i]];
      const x = startX + i * (boxWidth + gap);
      const selected = i === state.selectedIndex;

      const gfx = new Graphics();
      if (selected) {
        gfx.rect(x - 2, startY - 2, boxWidth + 4, boxHeight + 4).stroke({ color: 0xffffff, width: 3 });
      }
      gfx.rect(x, startY, boxWidth, boxHeight).stroke({ color: 0x4fc3f7, width: 2 });
      c.addChild(gfx);

      const name = makeText(config.name, { fontFamily: MONO, fontSize: 16, fill: selected ? 0xffffff : 0x4fc3f7 }, 0.5, 0.5);
      name.position.set(x + boxWidth / 2, startY + 30);
      c.addChild(name);

      const stats = [
        `伤害: ${config.baseStats.damage}`,
        `攻速: ${config.baseStats.fireRate}`,
        `弹匣: ${config.baseStats.magazineCapacity === Infinity ? '∞' : config.baseStats.magazineCapacity}`,
        `换弹: ${config.baseStats.reloadSpeed}秒`,
        `范围: ${config.baseStats.range}`,
      ];
      stats.forEach((sLine, idx) => {
        const t = makeText(sLine, { ...FONT_11, fill: 0xaaaaaa }, 0, 0.5);
        t.position.set(x + 10, startY + 55 + idx * 16);
        c.addChild(t);
      });
    }

    const hint = makeText('← → 选择  回车/A 确认', { fontFamily: MONO, fontSize: 12, fill: 0x888888 }, 0.5, 0.5);
    hint.position.set(SCREEN_WIDTH / 2, startY + boxHeight + 40);
    c.addChild(hint);
  }

  private drawLevelUp(c: Container, state: GameState): void {
    const g = new Graphics();
    g.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill({ color: 0x000000, alpha: 0.7 });
    c.addChild(g);

    const title = makeText('升级！', { fontFamily: MONO, fontSize: 20, fill: 0x76ff03 }, 0.5, 0.5);
    title.position.set(SCREEN_WIDTH / 2, 80);
    c.addChild(title);

    const boxWidth = 200;
    const boxHeight = 100;
    const totalWidth = state.upgradeOptions.length * boxWidth + (state.upgradeOptions.length - 1) * 20;
    const startX = (SCREEN_WIDTH - totalWidth) / 2;
    const startY = 150;

    for (let i = 0; i < state.upgradeOptions.length; i++) {
      const opt = state.upgradeOptions[i];
      const color = RARITY_COLOR_NUM[opt.rarity] ?? 0x76ff03;
      const x = startX + i * (boxWidth + 20);
      const selected = i === state.selectedIndex;

      const gfx = new Graphics();
      if (selected) {
        gfx.rect(x - 2, startY - 2, boxWidth + 4, boxHeight + 4).stroke({ color: 0xffffff, width: 3 });
      }
      gfx.rect(x, startY, boxWidth, boxHeight).stroke({ color, width: 2 });
      c.addChild(gfx);

      const desc = makeText(opt.description, { fontFamily: MONO, fontSize: 12, fill: color }, 0.5, 0.5);
      desc.position.set(x + boxWidth / 2, startY + 50);
      c.addChild(desc);
    }

    const hint = makeText('← → 选择  回车/A 确认', { fontFamily: MONO, fontSize: 12, fill: 0x888888 }, 0.5, 0.5);
    hint.position.set(SCREEN_WIDTH / 2, startY + boxHeight + 40);
    c.addChild(hint);
  }

  private drawWeaponDrop(c: Container, state: GameState): void {
    const g = new Graphics();
    g.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill({ color: 0x000000, alpha: 0.7 });
    c.addChild(g);

    const title = makeText('武器掉落！', { fontFamily: MONO, fontSize: 20, fill: 0xff9800 }, 0.5, 0.5);
    title.position.set(SCREEN_WIDTH / 2, 80);
    c.addChild(title);

    const boxWidth = 200;
    const boxHeight = 80;
    const totalWidth = state.weaponDropOptions.length * boxWidth + (state.weaponDropOptions.length - 1) * 20;
    const startX = (SCREEN_WIDTH - totalWidth) / 2;
    const startY = 150;

    for (let i = 0; i < state.weaponDropOptions.length; i++) {
      const typeId = state.weaponDropOptions[i];
      const config = AUXILIARY_WEAPON_CONFIGS[typeId];
      const x = startX + i * (boxWidth + 20);
      const selected = i === state.selectedIndex;

      const gfx = new Graphics();
      if (selected) {
        gfx.rect(x - 2, startY - 2, boxWidth + 4, boxHeight + 4).stroke({ color: 0xffffff, width: 3 });
      }
      gfx.rect(x, startY, boxWidth, boxHeight).stroke({ color: 0xce93d8, width: 2 });
      c.addChild(gfx);

      const name = makeText(config.name, { fontFamily: MONO, fontSize: 14, fill: 0xce93d8 }, 0.5, 0.5);
      name.position.set(x + boxWidth / 2, startY + 45);
      c.addChild(name);
    }

    const hint = makeText('← → 选择  回车/A 确认', { fontFamily: MONO, fontSize: 12, fill: 0x888888 }, 0.5, 0.5);
    hint.position.set(SCREEN_WIDTH / 2, startY + boxHeight + 40);
    c.addChild(hint);
  }

  private drawPause(c: Container, state: GameState): void {
    const g = new Graphics();
    g.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill({ color: 0x000000, alpha: 0.4 });
    c.addChild(g);

    const panelW = 300;
    const panel = new Graphics();
    panel.rect(0, 0, panelW, SCREEN_HEIGHT).fill({ color: 0x0a0a1e, alpha: 0.92 });
    panel.rect(0, 0, panelW, SCREEN_HEIGHT).stroke({ color: 0x4fc3f7, alpha: 0.3, width: 1 });
    c.addChild(panel);

    const char = state.character;

    const title = makeText('角色属性', { fontFamily: MONO, fontSize: 18, fontWeight: 'bold', fill: 0x4fc3f7 }, 0.5, 0.5);
    title.position.set(panelW / 2, 30);
    c.addChild(title);

    const line = new Graphics();
    line.moveTo(10, 40).lineTo(panelW - 10, 40).stroke({ color: 0x4fc3f7, alpha: 0.2, width: 1 });
    c.addChild(line);

    let y = 62;
    const rowH = 20;
    const drawStat = (label: string, value: string, color: number) => {
      const lt = makeText(label, FONT_12, 0, 0.5);
      lt.position.set(12, y);
      lt.style.fill = 0x8899aa;
      c.addChild(lt);
      const vt = makeText(value, FONT_12, 1, 0.5);
      vt.position.set(panelW - 12, y);
      vt.style.fill = color;
      c.addChild(vt);
      y += rowH;
    };

    drawStat('等级', `${char.level}`, 0x4fc3f7);
    drawStat('生命', `${Math.floor(char.health)} / ${char.maxHealth}`, 0x4caf50);
    drawStat('经验', `${Math.floor(char.xp)} / ${char.xpToNextLevel}`, 0x76ff03);
    drawStat('击杀', `${char.killCount}`, 0xff9800);
    drawStat('经验范围', `${char.xpAbsorptionRadius}`, 0xce93d8);
    drawStat('移动速度', `${char.speed}`, 0x81d4fa);
    y += 10;

    const drawMainWeaponBlock = () => {
      const w = char.mainWeapon;
      const config = WEAPON_CONFIGS[w.typeId];
      const isMelee = config.isMelee;
      const h = isMelee ? 116 : 152;
      const block = new Graphics();
      block.rect(6, y, panelW - 12, h).fill({ color: 0xffffff, alpha: 0.05 });
      block.rect(6, y, panelW - 12, h).stroke({ color: 0xffffff, alpha: 0.1, width: 1 });
      block.rect(6, y, panelW - 12, 22).fill({ color: isMelee ? 0xff7043 : 0x4fc3f7 });
      c.addChild(block);

      const name = makeText(config.name, { fontFamily: MONO, fontSize: 12, fontWeight: 'bold', fill: 0xffffff }, 0, 0.5);
      name.position.set(16, y + 15);
      c.addChild(name);
      const lv = makeText(`Lv.${w.level}`, { fontFamily: MONO, fontSize: 12, fontWeight: 'bold', fill: 0xffffff }, 1, 0.5);
      lv.position.set(panelW - 16, y + 15);
      c.addChild(lv);
      y += 28;

      const ammoStr = w.stats.magazineCapacity === Infinity ? '∞' : `${Math.floor(w.currentAmmo)}/${w.stats.magazineCapacity}`;
      drawStat('弹药', ammoStr, isMelee ? 0xaaaaaa : 0xffeb3b);
      drawStat('伤害', `${w.stats.damage}`, 0xef5350);
      drawStat('攻速', `${w.stats.fireRate}`, 0xab47bc);
      drawStat('范围', `${w.stats.range}`, 0x26c6da);
      if (!isMelee) {
        drawStat('换弹', `${w.stats.reloadSpeed.toFixed(1)}s`, 0xff9800);
        drawStat('穿透', `${w.stats.penetration}`, 0x7e57c2);
        drawStat('弹数', `${w.stats.bulletCount}`, 0x66bb6a);
        drawStat('弹匣', `${w.stats.magazineCapacity}`, 0x42a5f5);
      } else {
        const angleDeg = ((config.attackArc ?? Math.PI / 2) * 180 / Math.PI).toFixed(0);
        drawStat('扇形角', `${angleDeg}°`, 0xff7043);
      }
      y += 8;
    };

    const drawAuxWeaponBlock = (aux: typeof char.auxWeapons[0]) => {
      const config = AUXILIARY_WEAPON_CONFIGS[aux.typeId];
      const s = aux.stats;
      const block = new Graphics();
      block.rect(6, y, panelW - 12, 130).fill({ color: 0xffffff, alpha: 0.05 });
      block.rect(6, y, panelW - 12, 130).stroke({ color: 0xffffff, alpha: 0.1, width: 1 });
      block.rect(6, y, panelW - 12, 22).fill({ color: 0xce93d8 });
      c.addChild(block);

      const name = makeText(config.name, { fontFamily: MONO, fontSize: 12, fontWeight: 'bold', fill: 0xffffff }, 0, 0.5);
      name.position.set(16, y + 15);
      c.addChild(name);
      const lv = makeText(`Lv.${aux.level}`, { fontFamily: MONO, fontSize: 12, fontWeight: 'bold', fill: 0xffffff }, 1, 0.5);
      lv.position.set(panelW - 16, y + 15);
      c.addChild(lv);
      y += 28;

      drawStat('伤害', `${s.damage}`, 0xef5350);
      drawStat('范围', `${s.range}`, 0x26c6da);
      drawStat('充能', `${s.cooldown.toFixed(1)}s`, 0xff9800);
      drawStat('数量', `${s.count}`, 0x66bb6a);
      if (s.explosionRadius > 0) drawStat('爆炸范围', `${s.explosionRadius}`, 0xff7043);
      if (s.rotationSpeed > 0) drawStat('转速', `${s.rotationSpeed.toFixed(1)}`, 0xab47bc);
      if (s.duration > 0) drawStat('持续', `${s.duration.toFixed(1)}s`, 0x42a5f5);
      if (s.turretFireRate > 0) drawStat('炮台攻速', `${s.turretFireRate}`, 0x4fc3f7);
      y += 8;
    };

    drawMainWeaponBlock();
    for (const aux of char.auxWeapons) drawAuxWeaponBlock(aux);

    const esc = makeText('ESC 继续', { fontFamily: MONO, fontSize: 11, fill: 0xffffff }, 0.5, 0.5);
    esc.alpha = 0.3;
    esc.position.set(panelW / 2, SCREEN_HEIGHT - 15);
    c.addChild(esc);
  }

  /* ---------------------------------------------------------------- */
  /* 闪光 / 抖动                                                       */
  /* ---------------------------------------------------------------- */

  private addFlash(color: number, alpha: number, duration: number): void {
    if (this.flashes.length > 4) this.flashes.shift();
    this.flashes.push({ color, alpha, duration, timer: duration });
  }

  private updateFlashes(dt: number): void {
    if (this.flashes.length === 0) {
      this.flashGfx.visible = false;
      return;
    }
    this.flashGfx.clear();
    let any = false;
    for (const f of this.flashes) {
      f.timer -= dt;
      if (f.timer <= 0) continue;
      any = true;
      const a = f.alpha * (f.timer / f.duration);
      this.flashGfx
        .rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
        .fill({ color: f.color, alpha: a });
    }
    this.flashes = this.flashes.filter((f) => f.timer > 0);
    this.flashGfx.visible = any;
  }

  private addShake(power: number, duration: number): void {
    this.shake = { power, duration, timer: duration };
  }
}

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

function chestLabel(type: ChestType): string {
  switch (type) {
    case ChestType.Health:
      return '回血';
    case ChestType.XPRange:
      return '经验';
    case ChestType.MaxHP:
      return '血量';
    default:
      return '';
  }
}