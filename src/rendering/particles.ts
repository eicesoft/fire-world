import { CanvasSource, Particle, ParticleContainer, Texture } from 'pixi.js';

/**
 * 基于 PixiJS v8 内置 ParticleContainer 的轻量粒子系统。
 *
 * 设计要点：
 * - 所有粒子共享同一张「柔和光点」纹理（白色径向渐变），颜色由 tint 决定
 *   （ParticleContainer 要求容器内所有粒子共用同一张基础纹理）。
 * - 两个容器：additive（叠加混合，用于光效/爆炸/闪光）与 normal（普通混合，用于碎片）。
 * - 粒子对象池：死亡粒子回收到 free 列表复用，避免每帧 GC。
 * - color 开启动态更新，允许 alpha 随生命周期淡出。
 */

export interface BurstOptions {
  count: number;
  /** 世界坐标 x */
  x?: number;
  /** 世界坐标 y */
  y?: number;
  /** 颜色，0xRRGGBB */
  color: number;
  /** 基准方向（弧度），默认随机全方向 */
  angle?: number;
  /** 围绕 angle 的扩散弧度，默认 2π */
  spread?: number;
  speedMin?: number;
  speedMax?: number;
  /** 粒子半径 */
  sizeMin?: number;
  sizeMax?: number;
  lifeMin?: number;
  lifeMax?: number;
  /** 重力加速度 px/s²（y 方向） */
  gravity?: number;
  /** 指数衰减：速度每帧乘 drag^(dt) */
  drag?: number;
  /** 最大自旋速度 rad/s */
  spin?: number;
  /** true → 加到 add 容器（叠加发光），false → 普通混合 */
  additive?: boolean;
  /** 初始透明度 0~1，默认 1 */
  alpha?: number;
}

interface ParticleMeta {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  startScale: number;
  drag: number;
  gravity: number;
  spin: number;
  spinDir: number;
  startAlpha: number;
}

const MAX_ALIVE = 700;

export function createGlowTexture(): Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new Texture({ source: new CanvasSource({ resource: canvas }) });
}

export class ParticleSystem {
  readonly additiveContainer: ParticleContainer;
  readonly normalContainer: ParticleContainer;

  private readonly texture: Texture;
  private readonly alive: Particle[] = [];
  private readonly free: Particle[] = [];
  private readonly meta = new WeakMap<Particle, ParticleMeta>();
  private readonly containerOf = new WeakMap<Particle, ParticleContainer>();

  constructor() {
    this.texture = createGlowTexture();
    this.additiveContainer = new ParticleContainer({
      texture: this.texture,
      dynamicProperties: { position: true, rotation: true, color: true, vertex: false, uvs: false },
    });
    this.additiveContainer.blendMode = 'add';
    this.normalContainer = new ParticleContainer({
      texture: this.texture,
      dynamicProperties: { position: true, rotation: true, color: true, vertex: false, uvs: false },
    });
    this.normalContainer.blendMode = 'normal';
  }

  /** 一次性爆发一组粒子。 */
  burst(opts: BurstOptions): void {
    const {
      count, color,
      x = 0, y = 0,
      angle = Math.random() * Math.PI * 2,
      spread = Math.PI * 2,
      speedMin = 40, speedMax = 120,
      sizeMin = 2, sizeMax = 4,
      lifeMin = 0.3, lifeMax = 0.7,
      gravity = 0, drag = 0,
      spin = 0,
      additive = true,
      alpha = 1,
    } = opts;

      const target = additive ? this.additiveContainer : this.normalContainer;
      // 纹理半径为 32px，这里把「像素半径」换算成缩放
      const radius = sizeMin + Math.random() * (sizeMax - sizeMin);
      for (let i = 0; i < count; i++) {
      if (this.alive.length >= MAX_ALIVE) return;
      const dir = angle + (Math.random() - 0.5) * spread;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const life = lifeMin + Math.random() * (lifeMax - lifeMin);

      const p = this.acquire();
      p.x = x;
      p.y = y;
      p.tint = color;
      p.alpha = alpha;
      p.rotation = Math.random() * Math.PI * 2;
      p.scaleX = radius / 32;
      p.scaleY = radius / 32;
      target.addParticle(p);
      this.containerOf.set(p, target);

      this.meta.set(p, {
        vx: Math.cos(dir) * speed,
        vy: Math.sin(dir) * speed,
        life,
        maxLife: life,
        startScale: radius / 32,
        drag,
        gravity,
        spin: spin * (0.5 + Math.random() * 0.5),
        spinDir: Math.random() < 0.5 ? -1 : 1,
        startAlpha: alpha,
      });
      this.alive.push(p);
    }
  }

  /** 单发粒子（适用于需要每帧按速率控制的流式效果，如火焰余烬）。 */
  spawn(x: number, y: number, opts: Omit<BurstOptions, 'count'>): void {
    this.burst({ count: 1, x, y, ...opts, angle: opts.angle ?? Math.random() * Math.PI * 2 });
  }

  update(dt: number): void {
    if (dt <= 0) return;
    const alive = this.alive;
    for (let i = alive.length - 1; i >= 0; i--) {
      const p = alive[i];
      const m = this.meta.get(p)!;
      m.life -= dt;

      if (m.life <= 0) {
        // 回收
        this.containerOf.get(p)?.removeParticle(p);
        alive[i] = alive[alive.length - 1];
        alive.pop();
        this.free.push(p);
        continue;
      }

      // 物理：重力 + 阻力
      m.vy += m.gravity * dt;
      if (m.drag > 0) {
        const f = Math.pow(m.drag, dt);
        m.vx *= f;
        m.vy *= f;
      }
      p.x += m.vx * dt;
      p.y += m.vy * dt;

      // 自旋
      if (m.spin > 0) p.rotation += m.spin * m.spinDir * dt;

      // 淡出 + 缩小
      const t = m.life / m.maxLife;
      p.alpha = m.startAlpha * Math.pow(t, 1.5);
      const s = m.startScale * (0.35 + 0.65 * t);
      p.scaleX = s;
      p.scaleY = s;
    }
  }

  /** 清空并回收所有粒子。 */
  clear(): void {
    for (const p of this.alive) {
      this.containerOf.get(p)?.removeParticle(p);
      this.free.push(p);
    }
    this.alive.length = 0;
  }

  private acquire(): Particle {
    const p = this.free.pop();
    if (p) return p;
    return new Particle({
      texture: this.texture,
      x: -10000,
      y: -10000,
      anchorX: 0.5,
      anchorY: 0.5,
      tint: 0xffffff,
      alpha: 0,
    });
  }
}