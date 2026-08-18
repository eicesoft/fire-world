import {
  Application,
  Container,
  Graphics,
  Particle,
  ParticleContainer,
  Sprite,
  Text,
  Texture,
  CanvasSource,
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
  STAGE_DURATION,
  COINS_PER_KILL,
  PAUSE_EXIT_BTN,
  NEXT_STAGE_BTN,
} from '../game/types';
import { ParticleSystem, createGlowTexture } from './particles';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const rgb = (r: number, g: number, b: number): number => {
  // Canvas 的 rgb() 会自动截断到 0-255；Pixi Color 不截断，溢出会挤进 alpha 位并抛异常
  const cr = Math.max(0, Math.min(255, r));
  const cg = Math.max(0, Math.min(255, g));
  const cb = Math.max(0, Math.min(255, b));
  return (cr << 16) | (cg << 8) | cb;
};
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
  body: Sprite;
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

interface SlashGfx {
  fill: Graphics;
  arc: Graphics;
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
  sword_energy: 0x9fffff,
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

function drawSwordBlade(g: Graphics, color: number): void {
  g.moveTo(16, 0)
    .lineTo(0, -4.5)
    .lineTo(-6, -3)
    .lineTo(-8, 0)
    .lineTo(-6, 3)
    .lineTo(0, 4.5)
    .closePath()
    .fill({ color })
    .stroke({ color: 0xffffff, width: 1.2, alpha: 0.9 });
  g.moveTo(16, 0).lineTo(-7, 0).stroke({ color: 0xffffff, width: 1.6, alpha: 0.95 });
  g.moveTo(-4, -6.5).lineTo(-4, 6.5).stroke({ color: 0x80deea, width: 2.2 });
  g.moveTo(-4, 0).lineTo(-11, 0).stroke({ color: 0x84ffff, width: 2.4 });
  g.circle(-11.5, 0, 1.8).fill({ color: 0xffffff });
}

function drawMine(g: Graphics, armed: boolean, explosionRadius: number): void {
  g.clear();
  g.circle(0, 0, explosionRadius).fill({ color: 0xff7043, alpha: 0.08 }).stroke({ color: 0xff5722, width: 1, alpha: 0.35 });
  g.circle(0, 0, 5).fill({ color: armed ? 0xf44336 : 0x666666 }).stroke({ color: 0xffeb3b, width: 1 });
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function createCharacterTexture(): Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  // 地面阴影（水平，不随角色旋转）
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 28, 24, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // 整个人物斜 45° 构图
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);

  // 后披风
  const cape = ctx.createLinearGradient(0, -30, 0, 20);
  cape.addColorStop(0, '#e53935');
  cape.addColorStop(1, '#b71c1c');
  ctx.fillStyle = cape;
  ctx.beginPath();
  ctx.moveTo(-14, -16);
  ctx.quadraticCurveTo(-24, 6, -16, 24);
  ctx.quadraticCurveTo(0, 30, 16, 24);
  ctx.quadraticCurveTo(24, 6, 14, -16);
  ctx.quadraticCurveTo(0, -20, -14, -16);
  ctx.closePath();
  ctx.fill();

  // 双腿 + 靴子
  ctx.fillStyle = '#2c3e50';
  roundRectPath(ctx, -9, 10, 8, 17, 3);
  ctx.fill();
  roundRectPath(ctx, 1, 10, 8, 17, 3);
  ctx.fill();
  ctx.fillStyle = '#6d4c41';
  roundRectPath(ctx, -10, 25, 10, 8, 3);
  ctx.fill();
  roundRectPath(ctx, 0, 25, 10, 8, 3);
  ctx.fill();

  // 躯干（铠甲上衣）
  const body = ctx.createLinearGradient(0, -22, 0, 14);
  body.addColorStop(0, '#5dade2');
  body.addColorStop(1, '#2874a6');
  ctx.fillStyle = body;
  ctx.strokeStyle = '#1a5276';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-13, -6);
  ctx.quadraticCurveTo(-13, -20, 0, -20);
  ctx.quadraticCurveTo(13, -20, 13, -6);
  ctx.quadraticCurveTo(12, 13, 0, 13);
  ctx.quadraticCurveTo(-12, 13, -13, -6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 胸甲高光
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(-4, -12, 5, 8, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // 腰带 + 扣
  ctx.fillStyle = '#ffd54f';
  ctx.fillRect(-13, 6, 26, 5);
  ctx.fillStyle = '#f57f17';
  ctx.fillRect(-3.5, 5, 7, 8);

  // 手臂：右手持剑前举、左手在身侧
  ctx.strokeStyle = '#2874a6';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(11, -6);
  ctx.quadraticCurveTo(18, 0, 24, 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-11, -6);
  ctx.quadraticCurveTo(-18, 2, -21, 8);
  ctx.stroke();
  ctx.fillStyle = '#f2c9a0';
  ctx.beginPath();
  ctx.arc(25, 7, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-22, 9, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // 剑（右手高举，斜 45° 上指）
  ctx.save();
  ctx.translate(25, 7);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#7e57c2';
  roundRectPath(ctx, -2, -16, 4.5, 10, 2);
  ctx.fill();
  ctx.fillStyle = '#ffd54f';
  roundRectPath(ctx, -5.5, -18, 11, 4.5, 2);
  ctx.fill();
  ctx.fillStyle = '#eef2f7';
  ctx.strokeStyle = '#90a4ae';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -46);
  ctx.lineTo(-4.5, -17);
  ctx.lineTo(4.5, -17);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -44);
  ctx.lineTo(0, -18);
  ctx.stroke();
  ctx.restore();

  // 头 + 脸
  ctx.fillStyle = '#e8a33d';
  ctx.beginPath();
  ctx.arc(-1, -30, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f6c99b';
  ctx.beginPath();
  ctx.arc(-1, -29, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#263238';
  ctx.beginPath();
  ctx.arc(1, -31, 1.5, 0, Math.PI * 2);
  ctx.arc(-3.5, -31, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8a33d';
  ctx.beginPath();
  ctx.arc(-1, -34, 11, Math.PI * 0.85, Math.PI * 1.15);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  return new Texture({ source: new CanvasSource({ resource: canvas }) });
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function createEnemyTexture(configId: string): Texture {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  // 与角色一致的斜 45° 构图；主体白色，方便后续按血量 tint 变色
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(Math.PI / 4);

  const dark = '#141414';
  const body = '#ffffff';

  switch (configId) {
    case 'walker': {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, -4, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 12, 22, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-10, -20);
      ctx.quadraticCurveTo(-14, -34, -6, -36);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(10, -20);
      ctx.quadraticCurveTo(14, -34, 6, -36);
      ctx.stroke();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(-6, -36, 3, 0, Math.PI * 2);
      ctx.arc(6, -36, 3, 0, Math.PI * 2);
      ctx.fill();
      eye(ctx, -11, -8, 7);
      eye(ctx, 11, -8, 7);
      break;
    }
    case 'runner': {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, 6, 27, 15, 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(26, -2, 12, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-24, 8);
      ctx.quadraticCurveTo(-38, 2, -34, -12);
      ctx.stroke();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-4, -16);
      ctx.lineTo(2, -34);
      ctx.lineTo(10, -16);
      ctx.closePath();
      ctx.fill();
      eye(ctx, 18, -8, 6);
      break;
    }
    case 'tank': {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, 2, 32, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.quadraticCurveTo(-8, 0, 0, 24);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 2, 20, 16, 0.3, 0, Math.PI * 2);
      ctx.stroke();
      eye(ctx, -12, -6, 4);
      eye(ctx, 12, -6, 4);
      break;
    }
    case 'ranged': {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(0, -6, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, -6, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(0, -6, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 14, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'exploder': {
      ctx.lineCap = 'round';
      ctx.strokeStyle = dark;
      ctx.lineWidth = 6;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 22, Math.sin(a) * 22);
        ctx.lineTo(Math.cos(a) * 34, Math.sin(a) * 34);
        ctx.stroke();
      }
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -26);
      ctx.quadraticCurveTo(6, -38, 16, -34);
      ctx.stroke();
      eye(ctx, -9, -5, 6);
      eye(ctx, 9, -5, 6);
      break;
    }
    default: {
      // mini_boss：大恶魔（双角 + 粗眉 + 咧嘴）
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, 6, 34, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(-18, -16);
      ctx.lineTo(-10, -38);
      ctx.lineTo(-28, -26);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(18, -16);
      ctx.lineTo(10, -38);
      ctx.lineTo(28, -26);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-12, -6, 5, 0, Math.PI * 2);
      ctx.arc(12, -6, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 14, 8, 0, Math.PI);
      ctx.fill();
      break;
    }
  }

  ctx.restore();
  return new Texture({ source: new CanvasSource({ resource: canvas }) });
}

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
  private readonly bladeC = new Container();
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
  private readonly landMines = new Map<string, { gfx: Graphics; armed: boolean; radius: number }>();
  private readonly slashes = new Map<string, SlashGfx>();
  private readonly beams = new Map<string, Graphics>();
  private readonly damages = new Map<string, Text>();
  private readonly projectiles = new Map<string, Particle>();
  private readonly blades = new Map<string, Graphics>();
  private readonly xpDrops = new Map<string, Particle>();
  private readonly windwheels = new Map<number, WindWheelSlot>();

  private readonly charGroup = new Container();
  private readonly charSprite = new Sprite(createCharacterTexture());

  // HUD 元素
  private hudBuilt = false;
  private readonly hudMisc = new Map<string, Graphics>();
  private readonly hudSlots: Graphics[] = [];
  private readonly hudSlotNames: Text[] = [];
  private readonly hudSlotLvs: Text[] = [];
  private readonly hudRings: Graphics[] = [];
  private readonly hudBars: Graphics[] = [];
  private readonly hudTexts: { level: Text; hp: Text; kills: Text; invincible: Text; timer: Text; stage: Text; coins: Text } = {
    level: makeText('', FONT_14),
    hp: makeText('', FONT_14),
    kills: makeText('', FONT_14, 1, 0.5),
    invincible: makeText('无敌', FONT_12, 0.5, 0.5),
    timer: makeText('10:00', FONT_14, 0.5, 0.5),
    stage: makeText('', FONT_14),
    coins: makeText('', FONT_14),
  };

  private cameraX = 0;
  private cameraY = 0;
  private lastRenderTime = 0;
  private seeded = false;
  private prevPhase: GamePhase | null = null;
  private prevEnemies = new Map<string, Enemy>();
  private prevProjectiles = new Map<string, Projectile>();
  private prevLandMines = new Map<string, { id: string; x: number; y: number }>();
  private prevXp = new Set<string>();
  private prevXpData = new Map<string, XPDrop>();
  private prevLevel = 0;
  private prevHealth = 0;
  private flameAcc = 0;
  private windTrailAcc = 0;
  private prevSlashKeys = new Set<string>();
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
      this.bladeC,
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

    // 角色精灵（面向 +x，由容器旋转对准攻击方向）
    this.charSprite.anchor.set(0.5, 0.5);
    this.charSprite.scale.set(0.5);
    this.charGroup.addChild(this.charSprite);

    // HUD 初始文本摆放
    this.hudTexts.level.position.set(8, 12);
    this.hudTexts.hp.position.set(70, 12);
    this.hudTexts.stage.position.set(180, 12);
    this.hudTexts.coins.position.set(260, 12);
    this.hudTexts.kills.position.set(SCREEN_WIDTH - 8, 12);
    this.hudTexts.timer.position.set(SCREEN_WIDTH / 2, 12);
    this.hudTexts.invincible.position.set(SCREEN_WIDTH / 2, 40);
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
        const style = CHEST_COLORS[chest.type] ?? CHEST_COLORS[ChestType.Health];
        gfx.rect(-6, -6, 12, 12).fill({ color: style.fill }).stroke({ color: style.stroke, width: 2 });
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
        drawMine(gfx, m.armed, m.explosionRadius);
        entry = { gfx, armed: m.armed, radius: m.explosionRadius };
        this.landMines.set(m.id, entry);
        this.mineC.addChild(gfx);
      } else if (entry.armed !== m.armed || entry.radius !== m.explosionRadius) {
        entry.armed = m.armed;
        entry.radius = m.explosionRadius;
        drawMine(entry.gfx, m.armed, m.explosionRadius);
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
        eg = { body: new Sprite(createEnemyTexture(e.configId)), bar: new Graphics() };
        eg.body.anchor.set(0.5, 0.5);
        this.enemies.set(e.id, eg);
        this.enemyC.addChild(eg.body, eg.bar);
      }
      eg.body.position.set(e.position.x, e.position.y);
      eg.body.scale.set(e.size / 30);
      const ratio = clamp01(e.health / e.maxHealth);
      const r = Math.floor(200 * (1 - ratio) + 100);
      const gl = Math.floor(100 * ratio);
      eg.body.tint = rgb(r, gl, 40);
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
      const key = slashKeyOf(ef);
      seen.add(key);
      let slot = this.slashes.get(key);
      if (!slot) {
        slot = { fill: new Graphics(), arc: new Graphics() };
        const startAngle = ef.direction - ef.arc / 2;
        const endAngle = ef.direction + ef.arc / 2;
        const r = ef.range;

        // 填充层：外浅内亮两层扇形刀光
        slot.fill
          .moveTo(Math.cos(startAngle) * r, Math.sin(startAngle) * r)
          .arc(0, 0, r, startAngle, endAngle)
          .lineTo(0, 0)
          .closePath()
          .fill({ color: 0x7fd8ff, alpha: 0.16 });
        slot.fill
          .moveTo(Math.cos(startAngle) * r * 0.55, Math.sin(startAngle) * r * 0.55)
          .arc(0, 0, r * 0.55, startAngle, endAngle)
          .lineTo(0, 0)
          .closePath()
          .fill({ color: 0xffffff, alpha: 0.12 });

        // 弧线层：外围光晕 + 白色亮核 + 内层纤细刀锋
        slot.arc.arc(0, 0, r, startAngle, endAngle).stroke({ color: 0x81d4fa, width: 7, alpha: 0.35 });
        slot.arc.arc(0, 0, r, startAngle, endAngle).stroke({ color: 0xffffff, width: 3.5, alpha: 0.95 });
        slot.arc.arc(0, 0, r * 0.94, startAngle, endAngle).stroke({ color: 0xe3f7ff, width: 1.5, alpha: 0.9 });

        this.slashes.set(key, slot);
        this.slashC.addChild(slot.fill, slot.arc);
      }
      slot.fill.position.set(ef.position.x, ef.position.y);
      slot.arc.position.set(ef.position.x, ef.position.y);
      const fade = clamp01(ef.timer / 0.15);
      slot.fill.alpha = fade;
      slot.arc.alpha = fade;
    }
    for (const [key, slot] of this.slashes) {
      if (!seen.has(key)) {
        this.slashC.removeChild(slot.fill, slot.arc);
        slot.fill.destroy();
        slot.arc.destroy();
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
        slot.root.addChild(slot.gfx); // 关键：把刀刃图形挂进 root，否则永不显示
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
    let bladeCount = 0;
    for (const proj of projectiles) {
      seen.add(proj.id);
      if (proj.weaponType === ('sword_energy' as any)) {
        // 剑气：匕首造型实体
        const angle = Math.atan2(proj.velocity.y, proj.velocity.x);
        let b = this.blades.get(proj.id);
        if (!b) {
          b = new Graphics();
          drawSwordBlade(b, 0x9fffff);
          this.bladeC.addChild(b);
          this.blades.set(proj.id, b);
        }
        b.position.set(proj.position.x, proj.position.y);
        b.rotation = angle;
        const pulse = 1 + Math.sin(elapsed * 18 + proj.id.length * 3) * 0.08;
        b.scale.set(pulse);
        bladeCount++;
        continue;
      }
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
    // 清理消失的剑气实体（当 blades 数量异常膨胀时也一并清理）
    if (bladeCount === 0 && this.blades.size > 0) {
      for (const [id, b] of this.blades) {
        this.bladeC.removeChild(b);
      }
      this.blades.clear();
    } else {
      for (const [id, b] of this.blades) {
        if (!seen.has(id)) {
          this.bladeC.removeChild(b);
          this.blades.delete(id);
        }
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
    const curProjectiles = new Set(state.projectiles.map((p) => p.id));
    const curLandMines = new Set(state.landMines.map((m) => m.id));

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

    // 敌人受击 → 火花（近战强化：更多青白色 + 白闪）
    const isMelee = WEAPON_CONFIGS[state.character.mainWeapon.typeId].isMelee;
    for (const [id, pe] of this.prevEnemies) {
      const cur = curEnemies.get(id);
      if (cur && cur.health < pe.health - 0.5) {
        this.fx.burst({
          x: cur.position.x, y: cur.position.y,
          count: isMelee ? 9 : 4,
          color: isMelee ? 0xa9f1ff : 0xffffff,
          speedMin: isMelee ? 90 : 80, speedMax: isMelee ? 240 : 200,
          sizeMin: 1.5, sizeMax: isMelee ? 3.5 : 3,
          lifeMin: 0.12, lifeMax: 0.3,
          drag: 0.9, additive: true, alpha: 0.95,
        });
        if (isMelee) {
          this.fx.burst({
            x: cur.position.x, y: cur.position.y, count: 5, color: 0xffffff,
            speedMin: 120, speedMax: 280, sizeMin: 1.2, sizeMax: 2.5,
            lifeMin: 0.08, lifeMax: 0.18, drag: 0.92, additive: true,
          });
        }
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

    // 爆炸弹丸消失（命中/触界）→ 爆炸火光
    for (const [, pe] of this.prevProjectiles) {
      if (pe.explosionRadius > 0 && !curProjectiles.has(pe.id)) {
        this.fx.burst({
          x: pe.position.x, y: pe.position.y,
          count: 18, color: 0xffa726,
          speedMin: 60, speedMax: 260, sizeMin: 2, sizeMax: 5,
          lifeMin: 0.2, lifeMax: 0.5, drag: 0.9, additive: true,
        });
        this.addShake(3, 0.2);
      }
    }

    // 地雷引爆（从场景中消失）→ 橙红爆炸粒子
    for (const [, pm] of this.prevLandMines) {
      if (!curLandMines.has(pm.id)) {
        this.fx.burst({
          x: pm.x, y: pm.y,
          count: 24, color: 0xff7043,
          speedMin: 50, speedMax: 260, sizeMin: 2, sizeMax: 5,
          lifeMin: 0.25, lifeMax: 0.6, drag: 0.9, additive: true,
        });
        this.addShake(5, 0.3);
      }
    }

    // 剑气：匕首流光拖尾
    for (const proj of state.projectiles) {
      if (proj.weaponType !== ('sword_energy' as any)) continue;
      const back = Math.atan2(proj.velocity.y, proj.velocity.x) + Math.PI + (Math.random() - 0.5) * 0.8;
      const dist = 6 + Math.random() * 10;
      this.fx.spawn(
        proj.position.x + Math.cos(back) * dist,
        proj.position.y + Math.sin(back) * dist,
        {
          color: Math.random() < 0.5 ? 0x9fffff : 0x4dd0ff,
          additive: true, angle: back, spread: 0.6,
          speedMin: 10, speedMax: 60,
          sizeMin: 1.5, sizeMax: 3,
          lifeMin: 0.15, lifeMax: 0.35,
          drag: 0.93, alpha: 0.8,
        },
      );
    }

    // 导弹：尾焰拖尾（橙红火苗 + 白热核心）
    for (const proj of state.projectiles) {
      if (proj.weaponType !== ('missile' as any)) continue;
      const back = Math.atan2(proj.velocity.y, proj.velocity.x) + Math.PI + (Math.random() - 0.5) * 0.5;
      const dist = 4 + Math.random() * 8;
      this.fx.spawn(
        proj.position.x + Math.cos(back) * dist,
        proj.position.y + Math.sin(back) * dist,
        {
          color: Math.random() < 0.6 ? 0xff7043 : 0xffe0b2,
          additive: true, angle: back, spread: 0.8,
          speedMin: 20, speedMax: 90,
          sizeMin: 2, sizeMax: 4,
          lifeMin: 0.15, lifeMax: 0.4,
          drag: 0.92, alpha: 0.9,
        },
      );
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

    // 旋转飞轮：刀刃沿轨道持续甩出紫色光尘
    const windWheel = state.character.auxWeapons.find((a) => a.typeId === AuxiliaryWeaponType.WindWheel);
    if (windWheel) {
      this.windTrailAcc += dt;
      const wwCount = Math.max(1, Math.min(Math.floor(windWheel.stats.count), 6));
      const wwRadius = 80;
      const interval = 0.045;
      while (this.windTrailAcc > interval) {
        this.windTrailAcc -= interval;
        for (let b = 0; b < wwCount; b += wwCount > 3 ? 2 : 1) {
          const a = windWheel.rotationAngle + (b / wwCount) * Math.PI * 2;
          const rad = wwRadius * (0.92 + Math.random() * 0.2);
          const px = state.character.position.x + Math.cos(a) * rad;
          const py = state.character.position.y + Math.sin(a) * rad;
          this.fx.spawn(px, py, {
            color: Math.random() < 0.5 ? 0xce93d8 : 0x9c27b0,
            additive: true,
            speedMin: 5, speedMax: 30,
            sizeMin: 1.5, sizeMax: 3,
            lifeMin: 0.3, lifeMax: 0.6,
            drag: 0.94, alpha: 0.55,
          });
        }
      }
    }

    // 近战挥砍：弧光出现瞬间，沿弧线甩出刀光粒子 + 刀锋尖端爆闪
    if (isMelee) {
      const curSlashKeys = new Set(state.slashEffects.map(slashKeyOf));
      for (const ef of state.slashEffects) {
        if (this.prevSlashKeys.has(slashKeyOf(ef))) continue;
        const bladeColors = [0xffffff, 0xc8e6ff, 0x81d4fa, 0xb3e5fc];
        for (let i = 0; i < 14; i++) {
          const t = Math.random();
          const a = ef.direction - ef.arc / 2 + t * ef.arc;
          const dist = ef.range * (0.4 + Math.random() * 0.6);
          // 速度：径向向外 + 少量切向甩动
          const velAngle = Math.random() < 0.75
            ? a + (Math.random() - 0.5) * 0.9
            : a + Math.PI / 2 + (Math.random() - 0.5) * 1.2;
          this.fx.spawn(
            ef.position.x + Math.cos(a) * dist,
            ef.position.y + Math.sin(a) * dist,
            {
              color: bladeColors[(Math.random() * bladeColors.length) | 0],
              additive: true, angle: velAngle, spread: 0.5,
              speedMin: 40, speedMax: 210,
              sizeMin: 1.5, sizeMax: 4,
              lifeMin: 0.12, lifeMax: 0.32,
              drag: 0.88, alpha: 0.95,
            },
          );
        }
        // 刀锋方向核心爆闪
        this.fx.burst({
          x: ef.position.x + Math.cos(ef.direction) * ef.range * 0.75,
          y: ef.position.y + Math.sin(ef.direction) * ef.range * 0.75,
          count: 8, color: 0xffffff, angle: ef.direction, spread: 1.2,
          speedMin: 140, speedMax: 320, sizeMin: 2, sizeMax: 4,
          lifeMin: 0.1, lifeMax: 0.22, drag: 0.9, additive: true,
        });
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
        this.prevLandMines = new Map(state.landMines.map((m) => [m.id, { id: m.id, x: m.position.x, y: m.position.y }]));
        this.prevXp = new Set(state.xpDrops.map((d) => d.id));
        this.prevXpData = new Map(state.xpDrops.map((d) => [d.id, d]));
        this.prevLevel = state.character.level;
        this.prevHealth = state.character.health;
        this.prevSlashKeys = new Set(state.slashEffects.map(slashKeyOf));
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
    this.prevLandMines = new Map(state.landMines.map((m) => [m.id, { id: m.id, x: m.position.x, y: m.position.y }]));
    this.prevXp = new Set(state.xpDrops.map((d) => d.id));
    this.prevXpData = new Map(state.xpDrops.map((d) => [d.id, d]));
    this.prevLevel = state.character.level;
    this.prevHealth = state.character.health;
    this.prevSlashKeys = new Set(state.slashEffects.map(slashKeyOf));
  }

  /* ---------------------------------------------------------------- */
  /* HUD & 菜单                                                        */
  /* ---------------------------------------------------------------- */

  private buildHud(): void {
    const topBar = new Graphics();
    topBar.rect(0, 0, SCREEN_WIDTH, 24).fill({ color: 0x000000, alpha: 0.5 });
    this.hudC.addChild(topBar);

    this.hudC.addChild(this.hudTexts.level, this.hudTexts.hp, this.hudTexts.kills, this.hudTexts.invincible, this.hudTexts.timer, this.hudTexts.stage, this.hudTexts.coins);

    // 武器槽（主武器 + 2 个副武器槽）
    for (let i = 0; i < 1 + MAX_AUX_SLOTS; i++) {
      const slot = new Graphics();
      this.hudC.addChild(slot);
      this.hudSlots.push(slot);

      const nameTxt = makeText('', { fontFamily: MONO, fontSize: 9, fill: 0x4fc3f7 }, 0, 0.5);
      this.hudC.addChild(nameTxt);
      this.hudSlotNames.push(nameTxt);

      const lvTxt = makeText('', { fontFamily: MONO, fontSize: 8, fill: 0xffeb3b }, 1, 0.5);
      this.hudC.addChild(lvTxt);
      this.hudSlotLvs.push(lvTxt);

      const reloadRing = new Graphics();
      this.hudC.addChild(reloadRing);
      this.hudRings.push(reloadRing);

      const ammoBar = new Graphics();
      this.hudC.addChild(ammoBar);
      this.hudBars.push(ammoBar);
    }
    this.hudBuilt = true;
  }

  private updateHud(state: GameState): void {
    const char = state.character;
    this.hudTexts.level.text = `等级 ${char.level}`;
    this.hudTexts.hp.text = `生命: ${Math.floor(char.health)}/${char.maxHealth}`;
    this.hudTexts.kills.text = `击杀 ${char.killCount} | 本关 ${state.stageKillCount}`;
    this.hudTexts.stage.text = `关卡 ${state.stageLevel}`;
    this.hudTexts.coins.text = `金币 ${state.coins}`;
    const remain = Math.max(0, Math.ceil(STAGE_DURATION - state.stageElapsedTime));
    const mm = Math.floor(remain / 60).toString().padStart(2, '0');
    const ss = (remain % 60).toString().padStart(2, '0');
    this.hudTexts.timer.text = `${mm}:${ss}`;
    this.hudTexts.invincible.visible = char.invincibleTimer > 0;

    const slotW = 50;
    const slotH = 22;
    const slotGap = 4;
    const slotsCount = 1 + MAX_AUX_SLOTS;
    const slotY = SCREEN_HEIGHT - slotH - 10;
    const slotX0 = SCREEN_WIDTH - 8 - (slotsCount * slotW + (slotsCount - 1) * slotGap);

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
    const slot = this.hudSlots[index];
    const nameTxt = this.hudSlotNames[index];
    const lvTxt = this.hudSlotLvs[index];
    const ring = this.hudRings[index];
    const barGfx = this.hudBars[index];

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

    barGfx.clear();
    if (!isAux) {
      barGfx.rect(x + 2, y + h - 5, w - 4, 3).fill({ color: 0x333333 });
      const ammo = Math.max(0, ammoRatio);
      barGfx.rect(x + 2, y + h - 5, (w - 4) * ammo, 3).fill({
        color: ammo > 0.3 ? 0x4caf50 : ammo > 0.1 ? 0xff9800 : 0xf44336,
      });
    }
  }

  /** 在 HUD 上按 key 获取或创建一个小 Graphics（XP 条等）。 */
  private getOrCreateGfx(key: string): Graphics {
    let g = this.hudMisc.get(key);
    if (!g) {
      g = new Graphics();
      this.hudMisc.set(key, g);
      this.hudC.addChild(g);
    }
    return g;
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
      case GamePhase.LevelComplete:
        key = `lc:${state.lastStageResult ? `${state.lastStageResult.stage}:${state.lastStageResult.kills}:${state.lastStageResult.coinsEarned}` : ''}:${Math.ceil(state.nextStageCountdown)}`;
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
      case GamePhase.LevelComplete:
        this.drawLevelComplete(this.menuC, state);
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

    const coinText = makeText(`金币: ${state.coins}`, { fontFamily: MONO, fontSize: 16, fontWeight: 'bold', fill: 0xffc107 }, 0.5, 0.5);
    coinText.position.set(SCREEN_WIDTH / 2, 118);
    c.addChild(coinText);

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

  private drawLevelComplete(c: Container, state: GameState): void {
    const g = new Graphics();
    g.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill({ color: 0x000000, alpha: 0.7 });
    c.addChild(g);

    const result = state.lastStageResult ?? { stage: state.stageLevel, kills: state.stageKillCount, coinsEarned: 0 };
    const earned = Math.floor(result.kills * result.stage * COINS_PER_KILL);

    const title = makeText(`第 ${result.stage} 关完成！`, { fontFamily: MONO, fontSize: 26, fontWeight: 'bold', fill: 0xffc107 }, 0.5, 0.5);
    title.position.set(SCREEN_WIDTH / 2, 120);
    c.addChild(title);

    const panelW = 360;
    const panelX = (SCREEN_WIDTH - panelW) / 2;
    const panel = new Graphics();
    panel.rect(panelX, 170, panelW, 170).fill({ color: 0x111122, alpha: 0.9 });
    panel.rect(panelX, 170, panelW, 170).stroke({ color: 0xffc107, alpha: 0.5, width: 1.5 });
    c.addChild(panel);

    const rows: [string, string, number][] = [
      ['本关击杀', `${result.kills}`, 0x4fc3f7],
      ['关卡等级', `${result.stage}`, 0xffeb3b],
      ['公式', `${result.kills} × ${result.stage} × ${COINS_PER_KILL}`, 0xaaaaaa],
      ['获得金币', `+${earned}`, 0x76ff03],
      ['总金币', `${state.coins}`, 0xffc107],
    ];
    rows.forEach(([label, value, color], idx) => {
      const y = 192 + idx * 26;
      const lt = makeText(label, FONT_12, 0, 0.5);
      lt.position.set(panelX + 16, y);
      lt.style.fill = 0x8899aa;
      c.addChild(lt);
      const vt = makeText(value, FONT_12, 1, 0.5);
      vt.position.set(panelX + panelW - 16, y);
      vt.style.fill = color;
      c.addChild(vt);
    });

    const btn = NEXT_STAGE_BTN;
    const btnGfx = new Graphics();
    btnGfx.rect(btn.x, btn.y, btn.w, btn.h).fill({ color: 0xffc107 });
    btnGfx.rect(btn.x, btn.y, btn.w, btn.h).stroke({ color: 0xffffff, width: 2 });
    c.addChild(btnGfx);
    const nextLabel = makeText(`下一关 (第 ${result.stage + 1} 关)`, { fontFamily: MONO, fontSize: 14, fontWeight: 'bold', fill: 0x111111 }, 0.5, 0.5);
    nextLabel.position.set(btn.x + btn.w / 2, btn.y + btn.h / 2);
    c.addChild(nextLabel);

    const countdownTxt = makeText(`${Math.ceil(state.nextStageCountdown)} 秒后自动开始...`, { fontFamily: MONO, fontSize: 12, fill: 0x8899aa }, 0.5, 0.5);
    countdownTxt.position.set(SCREEN_WIDTH / 2, btn.y + btn.h + 28);
    c.addChild(countdownTxt);

    const hint = makeText('回车 立即开始', { fontFamily: MONO, fontSize: 12, fill: 0x888888 }, 0.5, 0.5);
    hint.position.set(SCREEN_WIDTH / 2, btn.y + btn.h + 48);
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

    drawStat('关卡', `第 ${state.stageLevel} 关`, 0xffc107);
    drawStat('等级', `${char.level}`, 0x4fc3f7);
    drawStat('生命', `${Math.floor(char.health)} / ${char.maxHealth}`, 0x4caf50);
    drawStat('击杀', `${char.killCount}`, 0xff9800);
    drawStat('经验', `${Math.floor(char.xp)} / ${char.xpToNextLevel}`, 0x76ff03);
    drawStat('金币', `${state.coins}`, 0xffc107);
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
      drawStat('换弹', isMelee ? '-' : `${w.stats.reloadSpeed.toFixed(1)}s`, isMelee ? 0xaaaaaa : 0xff9800);
      y += 8;
    };

    const drawAuxTile = (aux: typeof char.auxWeapons[0], x: number, w: number) => {
      const config = AUXILIARY_WEAPON_CONFIGS[aux.typeId];
      const s = aux.stats;
      const tileH = 118;
      const block = new Graphics();
      block.rect(x, y, w, tileH).fill({ color: 0xffffff, alpha: 0.05 });
      block.rect(x, y, w, tileH).stroke({ color: 0xffffff, alpha: 0.1, width: 1 });
      block.rect(x, y, w, 18).fill({ color: 0xce93d8 });
      c.addChild(block);

      const name = makeText(config.name, { fontFamily: MONO, fontSize: 10, fontWeight: 'bold', fill: 0xffffff }, 0, 0.5);
      name.position.set(x + 6, y + 9);
      c.addChild(name);
      const lv = makeText(`Lv.${aux.level}`, { fontFamily: MONO, fontSize: 10, fontWeight: 'bold', fill: 0xffffff }, 1, 0.5);
      lv.position.set(x + w - 6, y + 9);
      c.addChild(lv);

      const lines: [string, string][] = [
        ['伤害', `${Math.floor(s.damage * 10) / 10}`],
        ['范围', `${Math.floor(s.range)}`],
        ['数量', `${Math.floor(s.count)}`],
      ];
      if (s.explosionRadius > 0) lines.push(['爆炸', `${Math.floor(s.explosionRadius)}`]);
      else if (s.rotationSpeed > 0) lines.push(['转速', `${s.rotationSpeed.toFixed(1)}`]);
      else if (s.duration > 0) lines.push(['持续', `${s.duration.toFixed(1)}s`]);
      else if (s.cooldown > 0) lines.push(['充能', `${s.cooldown.toFixed(1)}s`]);
      else if (s.turretFireRate > 0) lines.push(['攻速', `${s.turretFireRate}`]);

      lines.forEach(([label, value], idx) => {
        const ty = y + 32 + idx * 20;
        const lt = makeText(label, { fontFamily: MONO, fontSize: 10, fill: 0x8899aa }, 0, 0.5);
        lt.position.set(x + 8, ty);
        c.addChild(lt);
        const vt = makeText(value, { fontFamily: MONO, fontSize: 10, fill: 0xeeeeee }, 1, 0.5);
        vt.position.set(x + w - 8, ty);
        c.addChild(vt);
      });
    };

    drawMainWeaponBlock();

    const auxHeader = makeText('辅助武器', { fontFamily: MONO, fontSize: 11, fontWeight: 'bold', fill: 0xce93d8 }, 0, 0.5);
    y += 6;
    auxHeader.position.set(12, y);
    c.addChild(auxHeader);
    y += 20;

    if (char.auxWeapons.length === 0) {
      const empty = makeText('暂无辅助武器', { fontFamily: MONO, fontSize: 11, fill: 0x666666 }, 0.5, 0.5);
      empty.position.set(panelW / 2, y + 30);
      c.addChild(empty);
    } else {
      const tileGap = 8;
      const tileW = (panelW - 12 - tileGap) / 2;
      char.auxWeapons.forEach((aux, i) => {
        const x = 6 + i * (tileW + tileGap);
        drawAuxTile(aux, x, tileW);
      });
    }
    y += 118;

    const btn = PAUSE_EXIT_BTN;
    const btnGfx = new Graphics();
    btnGfx.rect(btn.x, btn.y, btn.w, btn.h).fill({ color: 0xf44336 });
    btnGfx.rect(btn.x, btn.y, btn.w, btn.h).stroke({ color: 0xffffff, width: 2 });
    c.addChild(btnGfx);
    const btnTxt = makeText('退出游戏', { fontFamily: MONO, fontSize: 14, fontWeight: 'bold', fill: 0xffffff }, 0.5, 0.5);
    btnTxt.position.set(btn.x + btn.w / 2, btn.y + btn.h / 2);
    c.addChild(btnTxt);

    const esc = makeText('ESC 继续', { fontFamily: MONO, fontSize: 11, fill: 0xffffff }, 0.5, 0.5);
    esc.alpha = 0.3;
    esc.position.set(panelW / 2, SCREEN_HEIGHT - 8);
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
    case ChestType.MaxHP:
      return '上限';
    case ChestType.MoveSpeed:
      return '移速';
    case ChestType.XPRange:
      return '范围';
    case ChestType.XP:
      return '经验';
    default:
      return '';
  }
}

const CHEST_COLORS: Record<ChestType, { fill: number; stroke: number }> = {
  [ChestType.Health]: { fill: 0x66bb6a, stroke: 0xa5d6a7 },
  [ChestType.MaxHP]: { fill: 0xef5350, stroke: 0xffcdd2 },
  [ChestType.MoveSpeed]: { fill: 0x42a5f5, stroke: 0x90caf9 },
  [ChestType.XPRange]: { fill: 0xfdd835, stroke: 0xfff59d },
  [ChestType.XP]: { fill: 0xab47bc, stroke: 0xce93d8 },
};

function slashKeyOf(ef: SlashEffect): string {
  return `${ef.position.x.toFixed(1)},${ef.position.y.toFixed(1)},${ef.direction.toFixed(2)},${ef.arc.toFixed(2)},${ef.range.toFixed(1)}`;
}