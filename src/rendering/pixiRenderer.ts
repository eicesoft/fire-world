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
  TALENT_BTN,
  TALENT_BACK_BTN,
  TalentNodeView,
  RARITY_NAMES,
} from '../game/types';
import { ParticleSystem, createGlowTexture } from './particles';
import { TALENT_TIER_ROWS, TALENT_TIER_COLORS, talentNodeRect } from '../ui/talentLayout';

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

/** 选择框：脉动描边 + 四角括号 + 顶部指示箭头（菜单卡片选中态） */
function drawSelectionFrame(
  c: Container,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  t: number,
): void {
  const pulse = 0.65 + Math.sin(t * 6 + x * 0.01 + y * 0.013) * 0.3;
  // 双层脉动描边（外圈柔光 + 内圈亮边）
  const g = new Graphics();
  g.rect(x - 7, y - 7, w + 14, h + 14).stroke({ color, width: 1, alpha: pulse * 0.35 });
  g.rect(x - 3, y - 3, w + 6, h + 6).stroke({ color, width: 2, alpha: pulse });
  c.addChild(g);
  // 四角括号
  const L = 13;
  const corners: [number, number, number, number][] = [
    [x - 1, y - 1, 1, 1],
    [x + w + 1, y - 1, -1, 1],
    [x - 1, y + h + 1, 1, -1],
    [x + w + 1, y + h + 1, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    const cg = new Graphics();
    cg.moveTo(cx + L * sx, cy).lineTo(cx, cy).lineTo(cx, cy + L * sy).stroke({ color: 0xffffff, width: 2.5, alpha: 0.95 });
    c.addChild(cg);
  }
  // 顶部指示箭头
  const aw = 7;
  const arrow = new Graphics();
  arrow.moveTo(x + w / 2, y - 10).lineTo(x + w / 2 - aw, y - 4).lineTo(x + w / 2 + aw, y - 4).closePath().fill({ color });
  c.addChild(arrow);
}

/** 赛博朋克升级卡片：霓虹面板 + 稀有度徽章 + 扫描线 + 角落装饰，选中时加辉光 */
function drawCyberCard(
  c: Container,
  x: number,
  y: number,
  w: number,
  h: number,
  rarityColor: number,
  rarityName: string,
  title: string,
  stat: string,
  selected: boolean,
  t: number,
): void {
  // 面板底
  const panel = new Graphics();
  panel.roundRect(x, y, w, h, 8).fill({ color: selected ? 0x101c2e : 0x0c101d, alpha: 0.96 });
  panel.roundRect(x, y, w, h, 8).stroke({ color: rarityColor, width: selected ? 2 : 1, alpha: selected ? 0.9 : 0.4 });
  c.addChild(panel);
  // 顶部霓虹条
  const bar = new Graphics();
  bar.roundRect(x + 3, y + 3, w - 6, 4, 2).fill({ color: rarityColor, alpha: 0.9 });
  c.addChild(bar);
  // 扫描线
  const scan = new Graphics();
  scan.rect(x + 10, y + h / 2 + 16, w - 20, 1).fill({ color: rarityColor, alpha: 0.16 });
  c.addChild(scan);
  // 稀有度徽章（小药丸）
  const badgeBg = new Graphics();
  badgeBg.roundRect(x + 8, y + 12, 40, 12, 6).fill({ color: rarityColor, alpha: 0.22 });
  badgeBg.roundRect(x + 8, y + 12, 40, 12, 6).stroke({ color: rarityColor, width: 1, alpha: 0.8 });
  c.addChild(badgeBg);
  const badge = makeText(rarityName, { fontFamily: MONO, fontSize: 9, fontWeight: 'bold', fill: rarityColor }, 0.5, 0.5);
  badge.position.set(x + 28, y + 18);
  c.addChild(badge);
  // 名称
  const nameTxt = makeText(title, { fontFamily: MONO, fontSize: 14, fontWeight: 'bold', fill: selected ? 0xffffff : rarityColor }, 0, 0.5);
  nameTxt.position.set(x + 10, y + 38);
  c.addChild(nameTxt);
  // 数值
  const statTxt = makeText(stat, { fontFamily: MONO, fontSize: 12, fontWeight: 'bold', fill: 0x9fe8ff }, 0.5, 0.5);
  statTxt.position.set(x + w / 2, y + h - 24);
  c.addChild(statTxt);
  // 右下角装饰三角
  const tri = new Graphics();
  tri.moveTo(x + w - 1, y + h - 1).lineTo(x + w - 20, y + h - 1).lineTo(x + w - 1, y + h - 20).closePath().fill({ color: rarityColor, alpha: 0.35 });
  c.addChild(tri);
  if (selected) {
    drawSelectionFrame(c, x, y, w, h, rarityColor, t);
    const glow = new Graphics();
    glow.roundRect(x - 6, y - 6, w + 12, h + 12, 12).stroke({ color: rarityColor, width: 2, alpha: 0.22 + Math.sin(t * 5) * 0.1 });
    c.addChild(glow);
  }
}

const MONO = '"Cubic11", monospace';
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
  rangeRing: Graphics;
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
  [WeaponTypeId.ElectricWave]: 0xb388ff,
  [WeaponTypeId.Flamethrower]: 0xff6d00,
  [WeaponTypeId.LaserGun]: 0x00e5ff,
  missile: 0xff7043,
  aux_laser_gun: 0x00e5ff,
  sword_energy: 0x9fffff,
  turret: 0xffeb3b,
};

const PROJECTILE_RADIUS: Record<string, number> = {
  [WeaponTypeId.MachineGun]: 3,
  [WeaponTypeId.ElectricWave]: 3,
  [WeaponTypeId.Flamethrower]: 9,
  [WeaponTypeId.LaserGun]: 3,
  missile: 6,
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
  // 剑气流光宽刃（半透明外沿）
  g.moveTo(28, 0)
    .lineTo(-4, -6.5)
    .lineTo(-11, -4.5)
    .lineTo(-14, 0)
    .lineTo(-11, 4.5)
    .lineTo(-4, 6.5)
    .closePath()
    .fill({ color, alpha: 0.28 });
  // 白亮核心刃体
  g.moveTo(26, 0)
    .lineTo(-2, -3.4)
    .lineTo(-10, -2.4)
    .lineTo(-13, 0)
    .lineTo(-10, 2.4)
    .lineTo(-2, 3.4)
    .closePath()
    .fill({ color: 0xd9ffff })
    .stroke({ color: 0xffffff, width: 1, alpha: 0.9 });
  // 中心高光线
  g.moveTo(23, 0).lineTo(-11, 0).stroke({ color: 0xffffff, width: 1.8, alpha: 0.95 });
  // 剑尖高亮
  g.circle(24, 0, 1.6).fill({ color: 0xffffff });
  // 尾端剑气流
  g.moveTo(-12, 0).lineTo(-18, -4).stroke({ color, width: 2.4, alpha: 0.7 });
  g.moveTo(-12, 0).lineTo(-18, 4).stroke({ color, width: 2.4, alpha: 0.7 });
  g.moveTo(-18, 0).lineTo(-26, 0).stroke({ color, width: 1.8, alpha: 0.45 });
  g.circle(-27, 0, 1.4).fill({ color: 0xffffff, alpha: 0.8 });
}

function drawMine(g: Graphics, armed: boolean, explosionRadius: number): void {
  g.clear();
  g.circle(0, 0, explosionRadius).fill({ color: 0xff7043, alpha: 0.08 }).stroke({ color: 0xff5722, width: 1, alpha: 0.35 });
  g.circle(0, 0, 5).fill({ color: armed ? 0xf44336 : 0x666666 }).stroke({ color: 0xffeb3b, width: 1 });
}

function drawXpGem(g: Graphics, color: number): void {
  g.clear();
  // 菱形能量晶核 + 霓虹外框
  g.moveTo(0, -7).lineTo(5, 0).lineTo(0, 7).lineTo(-5, 0).closePath()
    .fill({ color, alpha: 0.85 })
    .stroke({ color, width: 1.2, alpha: 0.9 });
  g.moveTo(0, -3.5).lineTo(2.5, 0).lineTo(0, 3.5).lineTo(-2.5, 0).closePath()
    .fill({ color: 0xffffff, alpha: 0.9 });
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
  private readonly xpGemC = new Container();

  // 实体对象池
  private readonly enemies = new Map<string, EnemyGfx>();
  private readonly chests = new Map<string, ChestGfx>();
  private readonly turrets = new Map<string, TurretGfx>();
  private readonly landMines = new Map<string, { gfx: Graphics; armed: boolean; radius: number }>();
  private readonly slashes = new Map<string, SlashGfx>();
  private readonly beams = new Map<string, Graphics>();
  private prevBeamKeys = new Set<string>();
  private readonly damages = new Map<string, Text>();
  private readonly projectiles = new Map<string, Particle>();
  private readonly blades = new Map<string, Graphics>();
  private readonly swordGlows = new Map<string, Sprite>();
  private readonly xpDrops = new Map<string, Particle>();
  private readonly xpGems = new Map<string, Graphics>();
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
      this.xpGemC,
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
          text: `${Math.floor(dn.value)}`,
          style: {
            fontFamily: '"VT323", monospace',
            fontSize: dn.critical ? 30 : 22,
            fontWeight: 'normal',
            fill: dn.critical ? 0xffd54f : 0xff5252,
            stroke: dn.critical
              ? { color: 0x7a4f00, width: 4 }
              : { color: 0x3b0d0d, width: 3 },
            dropShadow: dn.critical
              ? { color: 0xffc107, blur: 8, distance: 0, alpha: 0.9 }
              : undefined,
          },
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
          tint: 0x29f3ff,
          alpha: 0.9,
        });
        this.xpDrops.set(drop.id, p);
        this.xpC.addParticle(p);
      }
      p.x = drop.position.x;
      p.y = drop.position.y;
      // 呼吸感脉冲
      const pulse = 4 + Math.sin(elapsed * 4 + drop.id.length * 1.7) * 0.8;
      p.scaleX = pulse / 32;
      p.scaleY = pulse / 32;

      // 旋转菱形晶核（赛博朋克能量晶体）
      let gem = this.xpGems.get(drop.id);
      if (!gem) {
        gem = new Graphics();
        drawXpGem(gem, 0x29f3ff);
        this.xpGems.set(drop.id, gem);
        this.xpGemC.addChild(gem);
      }
      gem.position.set(drop.position.x, drop.position.y);
      gem.rotation = elapsed * 3 + drop.id.length;
      gem.scale.set(1 + Math.sin(elapsed * 5 + drop.id.length * 1.3) * 0.12);
    }
    for (const [id, p] of this.xpDrops) {
      if (!seen.has(id)) {
        this.xpC.removeParticle(p);
        this.xpDrops.delete(id);
      }
    }
    for (const [id, g] of this.xpGems) {
      if (!seen.has(id)) {
        this.xpGemC.removeChild(g);
        g.destroy();
        this.xpGems.delete(id);
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
        const rangeRing = new Graphics();
        // 半透明攻击范围圈 + 旋转扫描线
        rangeRing.circle(0, 0, t.range).fill({ color: 0xff9800, alpha: 0.06 });
        rangeRing.circle(0, 0, t.range).stroke({ color: 0xff9800, width: 1, alpha: 0.3 });
        rangeRing.circle(0, 0, t.range - 6).stroke({ color: 0xffc107, width: 1, alpha: 0.12 });
        const gfx = new Graphics();
        gfx.rect(-6, -6, 12, 12).fill({ color: 0xff9800 }).stroke({ color: 0xffc107, width: 2 });
        const label = makeText('炮', { fontFamily: MONO, fontSize: 8, fill: 0xffffff }, 0.5, 0.5);
        label.position.set(0, 3);
        gfx.addChild(label);
        rangeRing.addChild(gfx);
        tg = { gfx: rangeRing, rangeRing, label };
        this.turrets.set(t.id, tg);
        this.turretC.addChild(rangeRing);
      }
      tg.gfx.position.set(t.position.x, t.position.y);
      // 范围环扫描线：随时间旋转一圈
      const rot = ((performance.now() / 1000) % 4 / 4) * Math.PI * 2;
      const rx = Math.cos(rot) * t.range;
      const ry = Math.sin(rot) * t.range;
      tg.rangeRing.moveTo(0, 0).lineTo(rx, ry).stroke({ color: 0xffc107, width: 1, alpha: 0.35 });
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
    const w = Math.max(22, e.size * 2.2);
    const h = 5;
    const ratio = clamp01(e.health / e.maxHealth);
    const color = ratio > 0.5 ? 0x33ff9c : ratio > 0.25 ? 0xffb300 : 0xff3d5a;
    // 底槽 + 霓虹描边
    g.rect(-w / 2 - 1, -1, w + 2, h + 2).fill({ color: 0x0a0f1e });
    g.rect(-w / 2 - 1, -1, w + 2, h + 2).stroke({ color: 0x2b4a6b, width: 1, alpha: 0.8 });
    // 8 节段 HUD 血条
    const segs = 8;
    const gap = 1;
    const segW = (w - (segs - 1) * gap) / segs;
    const filled = Math.ceil(ratio * segs);
    for (let i = 0; i < segs; i++) {
      g.rect(-w / 2 + i * (segW + gap), 0, segW, h).fill({
        color: i < filled ? color : 0x15202f,
        alpha: i < filled ? 1 : 0.9,
      });
    }
    // 血量边缘白色高光（科技感端点）
    if (ratio > 0) {
      const endX = -w / 2 + w * ratio - 1;
      g.rect(Math.max(-w / 2 - 1, endX), -1, 2, h + 2).fill({ color: 0xffffff, alpha: 0.9 });
    }
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
      const colorNum = /^#([0-9a-f]{6})$/i.test(ef.color)
        ? parseInt(ef.color.slice(1), 16)
        : 0x00e5ff;
      let g = this.beams.get(key);
      const isNew = !g;
      if (!g) {
        g = new Graphics();
        // 折线闪电：沿直线方向做若干次随机垂直抖动（创建时固定，存续期间稳定）
        const dx = ef.end.x - ef.origin.x;
        const dy = ef.end.y - ef.origin.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const segs = 5;
        const pts: number[] = [];
        for (let s = 0; s <= segs; s++) {
          const t = s / segs;
          const perp = s === 0 || s === segs ? 0 : (Math.random() - 0.5) * 10;
          pts.push(ef.origin.x + dx * t + nx * perp, ef.origin.y + dy * t + ny * perp);
        }
        // 外圈辉光（宽、半透明）
        g.moveTo(pts[0], pts[1]);
        for (let s = 1; s <= segs; s++) g.lineTo(pts[s * 2], pts[s * 2 + 1]);
        g.stroke({ color: colorNum, width: ef.width * 2.2, alpha: 0.35 });
        // 主体
        g.moveTo(pts[0], pts[1]);
        for (let s = 1; s <= segs; s++) g.lineTo(pts[s * 2], pts[s * 2 + 1]);
        g.stroke({ color: colorNum, width: ef.width });
        // 亮核
        g.moveTo(pts[0], pts[1]);
        for (let s = 1; s <= segs; s++) g.lineTo(pts[s * 2], pts[s * 2 + 1]);
        g.stroke({
          color: 0xffffff, width: Math.max(2, ef.width * 0.35),
        });
        this.beams.set(key, g);
        this.beamC.addChild(g);
      }
      g.alpha = clamp01(ef.timer / 0.25);
      // 新电弧 → 两端迸放电火花，让连锁肉眼可见
      if (isNew && !this.prevBeamKeys.has(key)) {
        const spark = { x: ef.end.x, y: ef.end.y };
        this.fx.burst({
          count: 8, x: spark.x, y: spark.y, color: colorNum, angle: Math.random() * Math.PI * 2,
          spread: Math.PI * 2, speedMin: 50, speedMax: 200, sizeMin: 1.5, sizeMax: 4,
          lifeMin: 0.15, lifeMax: 0.45, drag: 0.9, additive: true,
        });
      }
    }
    for (const [key, g] of this.beams) {
      if (!seen.has(key)) {
        this.beamC.removeChild(g);
        g.destroy();
        this.beams.delete(key);
      }
    }
    this.prevBeamKeys = seen;
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
        // 剑气：光晕 + 匕首实体（光晕在下方，叠加发光）
        const angle = Math.atan2(proj.velocity.y, proj.velocity.x);
        let glow = this.swordGlows.get(proj.id);
        if (!glow) {
          glow = new Sprite(this.glowTexture);
          glow.anchor.set(0.5, 0.5);
          glow.tint = 0x66e0ff;
          glow.alpha = 0.55;
          glow.blendMode = 'add';
          this.bladeC.addChild(glow);
          this.swordGlows.set(proj.id, glow);
        }
        glow.position.set(proj.position.x, proj.position.y);
        const glowPulse = 0.85 + Math.sin(elapsed * 18 + proj.id.length * 3) * 0.12;
        glow.scale.set(glowPulse);

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
        // 火焰：沿飞行方向拉长的火舌，随机大小闪烁，随生命周期淡出
        const lifeRatio = proj.maxLifetime > 0 ? proj.lifetime / proj.maxLifetime : 0;
        const flicker = 1 + Math.random() * 0.9;
        const a = Math.max(0, Math.min(1, Math.sin((1 - lifeRatio) * Math.PI)));
        p.alpha = a;
        p.scaleX = (radius * 2.8 * flicker) / 32;
        p.scaleY = (radius * 1.1 * flicker) / 32;
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
      for (const [id, g] of this.swordGlows) {
        this.bladeC.removeChild(g);
      }
      this.swordGlows.clear();
    } else {
      for (const [id, b] of this.blades) {
        if (!seen.has(id)) {
          this.bladeC.removeChild(b);
          this.blades.delete(id);
        }
      }
      for (const [id, g] of this.swordGlows) {
        if (!seen.has(id)) {
          this.bladeC.removeChild(g);
          this.swordGlows.delete(id);
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

    // 剑气发射：起手剑光
    for (const p of state.projectiles) {
      if (p.weaponType !== ('sword_energy' as any)) continue;
      if (this.prevProjectiles.has(p.id)) continue;
      const dirAngle = Math.atan2(p.velocity.y, p.velocity.x);
      this.fx.burst({
        x: p.position.x, y: p.position.y, count: 14,
        color: 0x80e8ff, angle: dirAngle, spread: 0.9,
        speedMin: 40, speedMax: 170, sizeMin: 2, sizeMax: 4,
        lifeMin: 0.12, lifeMax: 0.3, drag: 0.88, additive: true,
      });
      this.fx.spawn(
        p.position.x + Math.cos(dirAngle) * 6,
        p.position.y + Math.sin(dirAngle) * 6,
        { color: 0xffffff, speedMin: 180, speedMax: 260, sizeMin: 2.5, sizeMax: 4,
          lifeMin: 0.12, lifeMax: 0.2, drag: 0.85, additive: true, alpha: 0.95 },
      );
    }

    // 剑气消散：弹道寿命结束时光点散开
    for (const [id, p] of this.prevProjectiles) {
      if (p.weaponType !== ('sword_energy' as any)) continue;
      if (curProjectiles.has(id)) continue;
      this.fx.burst({
        x: p.position.x, y: p.position.y, count: 7, color: 0x9fffff,
        speedMin: 5, speedMax: 45, sizeMin: 1.2, sizeMax: 2.6,
        lifeMin: 0.1, lifeMax: 0.3, drag: 0.94, additive: true,
      });
    }

    // 导弹命中/引爆 → 橙红爆炸 + 冲击波 + 震屏
    for (const [id, p] of this.prevProjectiles) {
      if (p.weaponType !== ('missile' as any)) continue;
      if (curProjectiles.has(id)) continue;
      this.fx.burst({
        x: p.position.x, y: p.position.y, count: 26, color: 0xff7043,
        speedMin: 70, speedMax: 330, sizeMin: 3, sizeMax: 6.5,
        lifeMin: 0.2, lifeMax: 0.5, drag: 0.9, gravity: 30, spin: 5, additive: true,
      });
      this.fx.burst({
        x: p.position.x, y: p.position.y, count: 12, color: 0xffe0b2,
        speedMin: 120, speedMax: 360, sizeMin: 2, sizeMax: 4.5,
        lifeMin: 0.12, lifeMax: 0.3, drag: 0.88, additive: true,
      });
      // 冲击波环（外圈快速扩散的稀疏粒子）
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        this.fx.spawn(p.position.x, p.position.y, {
          color: 0xffb74d, angle: a, spread: 0.12, additive: true,
          speedMin: 220, speedMax: 300, sizeMin: 1.5, sizeMax: 2.6,
          lifeMin: 0.18, lifeMax: 0.3, drag: 0.92, alpha: 0.9,
        });
      }
      this.addFlash(0xff6d00, 0.16, 0.28);
      this.addShake(4, 0.25);
    }

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
        // 剑气命中：额外青色剑气轨迹溅射
        const swordNear = state.projectiles.some((p) => {
          if (p.weaponType !== ('sword_energy' as any)) return false;
          const dx = p.position.x - cur.position.x;
          const dy = p.position.y - cur.position.y;
          return Math.sqrt(dx * dx + dy * dy) < cur.size + 16;
        });
        if (swordNear) {
          this.fx.spawn(
            cur.position.x, cur.position.y,
            { color: 0x9fffff, angle: Math.random() * Math.PI * 2, spread: 0.7,
              speedMin: 90, speedMax: 240, sizeMin: 2, sizeMax: 4,
              lifeMin: 0.1, lifeMax: 0.22, drag: 0.9, additive: true, alpha: 0.95 },
          );
          this.fx.burst({
            x: cur.position.x, y: cur.position.y, count: 6, color: 0x66e0ff,
            speedMin: 60, speedMax: 220, sizeMin: 1.5, sizeMax: 3,
            lifeMin: 0.12, lifeMax: 0.3, drag: 0.92, additive: true,
          });
        }
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
        const isFlame = wt === WeaponTypeId.Flamethrower;
        const count = isFlame ? 6 : 4;
        const angle = Math.atan2(proj.velocity.y, proj.velocity.x);
        this.fx.burst({
          x: proj.position.x, y: proj.position.y, count,
          color, angle, spread: 1.4,
          speedMin: 60, speedMax: 160,
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

    // 剑气：流光拖尾（尾随光尘 + 刀刃两侧气流 + 剑尖星点）
    for (const proj of state.projectiles) {
      if (proj.weaponType !== ('sword_energy' as any)) continue;
      const fwd = Math.atan2(proj.velocity.y, proj.velocity.x);
      const perp = fwd + Math.PI / 2;
      // 1) 尾随光尘（沿速度反方向螺旋散开）
      for (let k = 0; k < 2; k++) {
        const back = fwd + Math.PI + (Math.random() - 0.5) * 1.1;
        const dist = 10 + Math.random() * 14;
        this.fx.spawn(
          proj.position.x + Math.cos(back) * dist,
          proj.position.y + Math.sin(back) * dist,
          {
            color: Math.random() < 0.5 ? 0x9fffff : 0x4dd0ff,
            additive: true, angle: back, spread: 0.7,
            speedMin: 8, speedMax: 55,
            sizeMin: 1.5, sizeMax: 3.2,
            lifeMin: 0.15, lifeMax: 0.35,
            drag: 0.93, alpha: 0.85,
          },
        );
      }
      // 2) 刀刃两侧气流（垂直方向轻扫）
      const side = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.5);
      const sideAngle = perp + side * 0.5;
      this.fx.spawn(
        proj.position.x + Math.cos(sideAngle) * 6,
        proj.position.y + Math.sin(sideAngle) * 6,
        {
          color: 0xffffff,
          additive: true, angle: sideAngle, spread: 0.4,
          speedMin: 15, speedMax: 60,
          sizeMin: 1.2, sizeMax: 2.4,
          lifeMin: 0.08, lifeMax: 0.2,
          drag: 0.92, alpha: 0.7,
        },
      );
      // 3) 剑尖星点（极低概率闪亮）
      if (Math.random() < 0.15) {
        this.fx.spawn(
          proj.position.x + Math.cos(fwd) * 20,
          proj.position.y + Math.sin(fwd) * 20,
          {
            color: 0xe6ffff, additive: true, angle: fwd, spread: 0.25,
            speedMin: 20, speedMax: 80, sizeMin: 2, sizeMax: 3.5,
            lifeMin: 0.06, lifeMax: 0.16, drag: 0.9, alpha: 1,
          },
        );
      }
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

    // XP 拾取 → 赛博朋克能量吸收：青色电弧 + 上升光柱 + 光点
    const curXp = new Set(state.xpDrops.map((d) => d.id));
    for (const id of this.prevXp) {
      if (curXp.has(id)) continue;
      const drop = this.prevXpData.get(id);
      if (drop) {
        this.fx.burst({
          x: drop.position.x, y: drop.position.y, count: 10, color: 0x29f3ff,
          speedMin: 60, speedMax: 220, sizeMin: 1.5, sizeMax: 3.5,
          lifeMin: 0.2, lifeMax: 0.5, drag: 0.9, additive: true,
        });
        this.fx.burst({
          x: drop.position.x, y: drop.position.y, count: 5, color: 0xffffff,
          speedMin: 90, speedMax: 260, sizeMin: 1.2, sizeMax: 2.2,
          lifeMin: 0.1, lifeMax: 0.25, drag: 0.88, additive: true,
        });
        // 上升数据流光柱
        for (let k = 0; k < 8; k++) {
          this.fx.spawn(
            drop.position.x + (Math.random() - 0.5) * 10,
            drop.position.y,
            {
              color: Math.random() < 0.5 ? 0x29f3ff : 0x9ffcff,
              angle: -Math.PI / 2, spread: 0.35, additive: true,
              speedMin: 80, speedMax: 220, sizeMin: 1.5, sizeMax: 3,
              lifeMin: 0.25, lifeMax: 0.6, drag: 0.95, alpha: 0.9,
            },
          );
        }
        this.addFlash(0x21d4fd, 0.08, 0.2);
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
        key = `ws:${state.selectedIndex}:${state.lastStageResult ? `${state.lastStageResult.stage}:${state.lastStageResult.kills}:${state.lastStageResult.coinsEarned}` : ''}:${state.inTalentTree ? '1' : '0'}:${state.talentTreeView ? `${state.talentTreeView.points}|${state.talentTreeView.nodes.map((n) => `${n.id}:${n.level}:${n.canUpgrade ? 1 : 0}:${n.unlocked ? 1 : 0}`).join(',')}` : ''}`;
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
        if (state.inTalentTree) {
          this.drawTalentTree(this.menuC, state);
        } else {
          this.drawWeaponSelect(this.menuC, state);
        }
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

    // 中途退出时的金币结算结果
    if (state.lastStageResult) {
      const r = state.lastStageResult;
      const banner = makeText(
        `退出结算  第 ${r.stage} 关  击杀 ${r.kills}  →  +${r.coinsEarned} 金币`,
        { fontFamily: MONO, fontSize: 14, fontWeight: 'bold', fill: 0xffc107 },
        0.5, 0.5,
      );
      banner.position.set(SCREEN_WIDTH / 2, 142);
      c.addChild(banner);
    }

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
      gfx.rect(x, startY, boxWidth, boxHeight).fill({ color: selected ? 0x16233a : 0x0d1526 });
      gfx.rect(x, startY, boxWidth, boxHeight).stroke({ color: selected ? 0x4fc3f7 : 0x33506e, width: 1.5 });
      c.addChild(gfx);
      if (selected) {
        drawSelectionFrame(c, x, startY, boxWidth, boxHeight, 0x4fc3f7, performance.now() / 1000);
      }

      const name = makeText(config.name, { fontFamily: MONO, fontSize: 16, fill: selected ? 0xffffff : 0x4fc3f7 }, 0.5, 0.5);
      name.position.set(x + boxWidth / 2, startY + 30);
      c.addChild(name);

      const stats: string[] = [];
      if (config.baseStats.magazineCapacity !== Infinity) {
        stats.push(`弹匣: ${config.baseStats.magazineCapacity}`);
      }
      if (config.baseStats.reloadSpeed > 0) {
        stats.push(`换弹: ${config.baseStats.reloadSpeed}秒`);
      }
      stats.push(`伤害: ${config.baseStats.damage}`);
      stats.push(`攻速: ${config.baseStats.fireRate}`);
      stats.push(`范围: ${config.baseStats.range}`);
      if (config.baseStats.chainCount !== undefined) {
        stats.push(`连锁: ${config.baseStats.chainCount}次`);
        stats.push(`连锁范围: ${config.baseStats.chainRange}`);
      }
      stats.forEach((sLine, idx) => {
        const t = makeText(sLine, { ...FONT_11, fill: 0xaaaaaa }, 0, 0.5);
        t.position.set(x + 10, startY + 55 + idx * 16);
        c.addChild(t);
      });
    }

    const hint = makeText('← → 选择武器  回车/A 确认  T/点击 [天赋树] 升级天赋', { fontFamily: MONO, fontSize: 12, fill: 0x888888 }, 0.5, 0.5);
    hint.position.set(SCREEN_WIDTH / 2, startY + boxHeight + 40);
    c.addChild(hint);

    const btn = TALENT_BTN;
    const btnGfx = new Graphics();
    btnGfx.rect(btn.x, btn.y, btn.w, btn.h).fill({ color: 0x16202e });
    btnGfx.rect(btn.x, btn.y, btn.w, btn.h).stroke({ color: 0xffc107, width: 1.5 });
    c.addChild(btnGfx);
    const selWeapon = weapons[state.selectedIndex];
    const selPoints = selWeapon !== undefined ? (state.talentPointsPerWeapon[selWeapon] ?? 0) : 0;
    const btnTxt = makeText(`天赋树  可用 ${selPoints} 点`, { fontFamily: MONO, fontSize: 13, fontWeight: 'bold', fill: 0xffc107 }, 0.5, 0.5);
    btnTxt.position.set(btn.x + btn.w / 2, btn.y + btn.h / 2);
    c.addChild(btnTxt);
  }

  private drawTalentTree(c: Container, state: GameState): void {
    const g = new Graphics();
    g.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill({ color: 0x0b0b14 });
    c.addChild(g);

    const view = state.talentTreeView;
    const weaponType = view?.weaponType ?? INITIAL_WEAPON_POOL[state.selectedIndex];
    const weaponName = weaponType !== undefined ? WEAPON_CONFIGS[weaponType].name : '';

    const title = makeText(`${weaponName} · 天赋树`, { fontFamily: MONO, fontSize: 22, fontWeight: 'bold', fill: 0xffc107 }, 0.5, 0.5);
    title.position.set(SCREEN_WIDTH / 2, 40);
    c.addChild(title);

    if (!view) {
      const none = makeText('该角色暂无天赋树（后续版本开放）', { fontFamily: MONO, fontSize: 14, fill: 0x888888 }, 0.5, 0.5);
      none.position.set(SCREEN_WIDTH / 2, 300);
      c.addChild(none);
      const backHint = makeText('点击下方按钮或按 ESC 返回', { fontFamily: MONO, fontSize: 12, fill: 0x666666 }, 0.5, 0.5);
      backHint.position.set(SCREEN_WIDTH / 2, 330);
      c.addChild(backHint);
      this.drawTalentBack(c);
      return;
    }

    const pointsTxt = makeText(`天赋点：${view.points}`, { fontFamily: MONO, fontSize: 14, fontWeight: 'bold', fill: 0x76ff03 }, 0.5, 0.5);
    pointsTxt.position.set(SCREEN_WIDTH / 2, 74);
    c.addChild(pointsTxt);

    // 分阶标题 + 解锁条件
    TALENT_TIER_ROWS.forEach((row, rIdx) => {
      const color = TALENT_TIER_COLORS[row.tier];
      const label = makeText(`${row.tier} 阶${row.tier === 3 ? ' · 终极' : ''}`, { fontFamily: MONO, fontSize: 12, fontWeight: 'bold', fill: color }, 0, 0.5);
      label.position.set(20, row.labelY - 16);
      c.addChild(label);
      if (row.tier > 1) {
        const need = row.tier === 2 ? 5 : 4;
        const cur = view.tierLevels[rIdx - 1] ?? 0;
        const ok = cur >= need;
        const unlock = makeText(
          `解锁：${row.tier - 1} 阶累计 ${cur}/${need} 级`,
          { fontFamily: MONO, fontSize: 11, fill: ok ? color : 0x666666 },
          1, 0.5,
        );
        unlock.position.set(SCREEN_WIDTH - 20, row.labelY - 16);
        c.addChild(unlock);
      }
    });

    for (let i = 0; i < view.nodes.length; i++) {
      const node = view.nodes[i];
      const rect = talentNodeRect(view.nodes, i);
      if (!rect) continue;
      const tierColor = TALENT_TIER_COLORS[node.tier];
      const selected = i === state.selectedIndex;
      const active = node.unlocked;

      const gfx = new Graphics();
      gfx.rect(rect.x, rect.y, rect.w, rect.h).fill({ color: selected ? 0x1c2438 : 0x14141f });
      gfx.rect(rect.x, rect.y, rect.w, rect.h).stroke({ color: active ? tierColor : 0x3a3a4a, width: 1.5 });
      c.addChild(gfx);
      if (selected) {
        drawSelectionFrame(c, rect.x, rect.y, rect.w, rect.h, tierColor, performance.now() / 1000);
      }

      // 等级进度条（5 段）
      const segW = 12;
      const segGap = 4;
      const segsW = node.maxLevel * segW + (node.maxLevel - 1) * segGap;
      const segX0 = rect.x + (rect.w - segsW) / 2;
      const segY = rect.y + rect.h - 16;
      for (let p = 0; p < node.maxLevel; p++) {
        const filled = p < node.level;
        const seg = new Graphics();
        seg.roundRect(segX0 + p * (segW + segGap), segY, segW, 6, 2).fill({
          color: filled ? tierColor : 0x2c2c3c,
          alpha: active ? 1 : 0.4,
        });
        c.addChild(seg);
      }

      if (!active) {
        const mask = new Graphics();
        mask.rect(rect.x, rect.y, rect.w, rect.h - 10).fill({ color: 0x000000, alpha: 0.45 });
        c.addChild(mask);
      }

      const name = makeText(node.name, { fontFamily: MONO, fontSize: 14, fontWeight: 'bold', fill: active ? tierColor : 0x666666 }, 0, 0.5);
      name.position.set(rect.x + 10, rect.y + 20);
      c.addChild(name);

      const desc = makeText(node.desc, { fontFamily: MONO, fontSize: 10, fill: 0x8899aa }, 0, 0.5);
      desc.position.set(rect.x + 10, rect.y + 42);
      c.addChild(desc);

      if (node.maxed) {
        const maxTxt = makeText('已达满级', { fontFamily: MONO, fontSize: 11, fontWeight: 'bold', fill: 0xffffff }, 0.5, 0.5);
        maxTxt.position.set(rect.x + rect.w / 2, rect.y + 64);
        c.addChild(maxTxt);
      } else if (!active) {
        const lockTxt = makeText(node.lockHint, { fontFamily: MONO, fontSize: 10, fill: 0x666666 }, 0.5, 0.5);
        lockTxt.position.set(rect.x + rect.w / 2, rect.y + 64);
        c.addChild(lockTxt);
      } else {
        const valueTxt = makeText(
          `${node.curValue}${node.nextValue ? '  →  ' + node.nextValue : ''}`,
          { fontFamily: MONO, fontSize: 11, fontWeight: 'bold', fill: 0xffffff },
          0.5, 0.5,
        );
        valueTxt.position.set(rect.x + rect.w / 2, rect.y + 64);
        c.addChild(valueTxt);
        if (view.points < node.cost) {
          const costTxt = makeText('天赋点不足', { fontFamily: MONO, fontSize: 9, fill: 0xff5252 }, 1, 0.5);
          costTxt.position.set(rect.x + rect.w - 6, rect.y + 86);
          c.addChild(costTxt);
        }
      }
    }

    const hint = makeText('← → 选择天赋  回车/A 或点击 升级   ESC 返回', { fontFamily: MONO, fontSize: 12, fill: 0x888888 }, 0.5, 0.5);
    hint.position.set(SCREEN_WIDTH / 2, SCREEN_HEIGHT - 26);
    c.addChild(hint);

    this.drawTalentBack(c);
  }

  private drawTalentBack(c: Container): void {
    const btn = TALENT_BACK_BTN;
    const bg = new Graphics();
    bg.rect(btn.x, btn.y, btn.w, btn.h).fill({ color: 0x1a1a2e });
    bg.rect(btn.x, btn.y, btn.w, btn.h).stroke({ color: 0xffffff, alpha: 0.4, width: 1 });
    c.addChild(bg);
    const txt = makeText('返回武器选择', { fontFamily: MONO, fontSize: 13, fontWeight: 'bold', fill: 0xffffff }, 0.5, 0.5);
    txt.position.set(btn.x + btn.w / 2, btn.y + btn.h / 2);
    c.addChild(txt);
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

      // 卡片标题：武器/副武器名
      let title = '';
      if (opt.target === 'acquire_aux' && opt.auxTypeId) title = AUXILIARY_WEAPON_CONFIGS[opt.auxTypeId].name;
      else if (opt.weaponTypeId) title = WEAPON_CONFIGS[opt.weaponTypeId].name;
      else if (opt.auxTypeId) title = AUXILIARY_WEAPON_CONFIGS[opt.auxTypeId].name;

      // 数值行：从 description 剥掉 [稀有度] 前缀和名称
      let stat = opt.description;
      const rarityName = RARITY_NAMES[opt.rarity] ?? '';
      if (stat.startsWith(`[${rarityName}] `)) stat = stat.slice(rarityName.length + 3);
      if (title && stat.startsWith(`${title} `)) stat = stat.slice(title.length + 1);
      else if (title && stat.startsWith(title)) stat = stat.slice(title.length);

      drawCyberCard(c, x, startY, boxWidth, boxHeight, color, rarityName, title, stat, selected, performance.now() / 1000);
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

      drawCyberCard(c, x, startY, boxWidth, boxHeight, 0xce93d8, '新武器', config.name, '获得辅助武器', selected, performance.now() / 1000);
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
    drawStat('天赋点', `${state.talentPointsPerWeapon[state.selectedWeaponType ?? ''] ?? 0}`, 0x76ff03);
    if (char.critChance > 0) drawStat('暴击', `${Math.round(char.critChance * 100)}%`, 0xffc107);
    if (char.doubleStrikeChance > 0) drawStat('双刀', `${Math.round(char.doubleStrikeChance * 100)}%`, 0xffc107);
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

      const isElectric = w.typeId === WeaponTypeId.ElectricWave;
      if (!isElectric) {
        const ammoStr = w.stats.magazineCapacity === Infinity ? '∞' : `${Math.floor(w.currentAmmo)}/${w.stats.magazineCapacity}`;
        drawStat('弹药', ammoStr, isMelee ? 0xaaaaaa : 0xffeb3b);
      }
      drawStat('伤害', `${w.stats.damage}`, 0xef5350);
      drawStat('攻速', `${w.stats.fireRate}`, 0xab47bc);
      drawStat('范围', `${w.stats.range}`, 0x26c6da);
      if (!isElectric) {
        drawStat('换弹', isMelee ? '-' : `${w.stats.reloadSpeed.toFixed(1)}s`, isMelee ? 0xaaaaaa : 0xff9800);
      } else {
        drawStat('连锁', `${w.stats.chainCount}次`, 0xb388ff);
        drawStat('连锁范围', `${w.stats.chainRange}`, 0xb388ff);
      }
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