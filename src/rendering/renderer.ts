import {
  GameState,
  GamePhase,
  WeaponTypeId,
  AuxiliaryWeaponType,
  Rarity,
  RARITY_COLORS,
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

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private cameraX: number = 0;
  private cameraY: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;
  }

  updateCamera(charX: number, charY: number): void {
    this.cameraX = charX - SCREEN_WIDTH / 2;
    this.cameraY = charY - SCREEN_HEIGHT / 2;
  }

  getCameraOffset(): { x: number; y: number } {
    return { x: this.cameraX, y: this.cameraY };
  }

  render(state: GameState): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    if (state.phase === GamePhase.WeaponSelect) {
      this.renderWeaponSelect(state);
      return;
    }

    this.updateCamera(state.character.position.x, state.character.position.y);

    this.renderBackground();
    this.renderObstacles(state.obstacles);
    this.renderDamageNumbers(state.damageNumbers);
    this.renderXpDrops(state.xpDrops);
    this.renderChests(state.chests);
    this.renderTurrets(state.turrets);
    this.renderLandMines(state.landMines);
    this.renderEnemies(state.enemies);
    this.renderSlashEffects(state.slashEffects);
    this.renderBeamEffects(state.beamEffects);
    this.renderCharacter(state);
    this.renderAuxEffects(state);
    this.renderProjectiles(state.projectiles);
    this.renderHUD(state);

    if (state.phase === GamePhase.LevelUp) {
      this.renderLevelUp(state);
    }

    if (state.phase === GamePhase.WeaponDrop) {
      this.renderWeaponDrop(state);
    }

    if (state.phase === GamePhase.Paused) {
      this.renderPause(state);
    }
  }

  private renderBackground(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.strokeStyle = '#2a2a4e';
    ctx.lineWidth = 1;
    const gridSize = 50;
    const startX = -(this.cameraX % gridSize);
    const startY = -(this.cameraY % gridSize);
    for (let x = startX; x < SCREEN_WIDTH; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, SCREEN_HEIGHT);
      ctx.stroke();
    }
    for (let y = startY; y < SCREEN_HEIGHT; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(SCREEN_WIDTH, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 3;
    ctx.strokeRect(-this.cameraX, -this.cameraY, MAP_WIDTH, MAP_HEIGHT);
  }

  private renderObstacles(obstacles: Obstacle[]): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#4a4a6a';
    for (const obs of obstacles) {
      const sx = obs.position.x - this.cameraX - obs.width / 2;
      const sy = obs.position.y - this.cameraY - obs.height / 2;
      if (sx + obs.width < 0 || sx > SCREEN_WIDTH || sy + obs.height < 0 || sy > SCREEN_HEIGHT) continue;
      ctx.fillRect(sx, sy, obs.width, obs.height);
    }
  }

  private renderSlashEffects(effects: SlashEffect[]): void {
    const ctx = this.ctx;
    for (const effect of effects) {
      const sx = effect.position.x - this.cameraX;
      const sy = effect.position.y - this.cameraY;
      const alpha = effect.timer / 0.15;

      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      const startAngle = effect.direction - effect.arc / 2;
      const endAngle = effect.direction + effect.arc / 2;
      ctx.arc(sx, sy, effect.range, startAngle, endAngle);
      ctx.stroke();

      ctx.fillStyle = `rgba(200, 230, 255, ${alpha * 0.3})`;
      ctx.beginPath();
      ctx.arc(sx, sy, effect.range, startAngle, endAngle);
      ctx.lineTo(sx, sy);
      ctx.closePath();
      ctx.fill();
    }
  }

  private renderBeamEffects(effects: BeamEffect[]): void {
    const ctx = this.ctx;
    for (const effect of effects) {
      const sx = effect.origin.x - this.cameraX;
      const sy = effect.origin.y - this.cameraY;
      const ex = effect.end.x - this.cameraX;
      const ey = effect.end.y - this.cameraY;
      const alpha = effect.timer / 0.15;

      ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
      ctx.lineWidth = effect.width;
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = `rgba(200, 255, 255, ${alpha * 0.5})`;
      ctx.lineWidth = Math.max(2, effect.width * 0.4);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
  }

  private renderAuxEffects(state: GameState): void {
    const ctx = this.ctx;
    const char = state.character;
    const sx = char.position.x - this.cameraX;
    const sy = char.position.y - this.cameraY;

    for (const aux of char.auxWeapons) {
      if (aux.typeId !== AuxiliaryWeaponType.WindWheel) continue;

      const count = Math.max(1, Math.min(Math.floor(aux.stats.count), 6));
      const radius = 80;
      const bladeSize = Math.max(6, aux.stats.range * 0.15);
      const alpha = 0.6;

      ctx.strokeStyle = `rgba(156, 39, 176, ${alpha * 0.3})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      for (let i = 0; i < count; i++) {
        const angle = aux.rotationAngle + (i / count) * Math.PI * 2;
        const bx = sx + Math.cos(angle) * radius;
        const by = sy + Math.sin(angle) * radius;

        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(angle);

        ctx.fillStyle = `rgba(156, 39, 176, ${alpha})`;
        ctx.shadowColor = '#9c27b0';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(0, -bladeSize);
        ctx.lineTo(bladeSize * 1.3, 0);
        ctx.lineTo(0, bladeSize);
        ctx.lineTo(-bladeSize * 1.3, 0);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = `rgba(206, 147, 216, ${alpha * 0.7})`;
        ctx.beginPath();
        ctx.arc(0, 0, bladeSize * 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }
  }

  private renderCharacter(state: GameState): void {
    const ctx = this.ctx;
    const char = state.character;
    const sx = char.position.x - this.cameraX;
    const sy = char.position.y - this.cameraY;
    const dir = state.mouseDirection;
    const angle = Math.atan2(dir.y, dir.x);

    if (char.invincibleTimer > 0 && Math.floor(char.invincibleTimer * 10) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);

    const skinColor = '#f5d0a9';
    const armorColor = '#4fc3f7';
    const armorDark = '#2980b9';
    const bootColor = '#5d4037';

    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;

    ctx.fillStyle = bootColor;
    ctx.fillRect(-8, 6, 5, 6);
    ctx.fillRect(3, 6, 5, 6);

    ctx.fillStyle = armorColor;
    ctx.strokeStyle = armorDark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-12, 4);
    ctx.lineTo(8, 4);
    ctx.lineTo(8, -4);
    ctx.lineTo(-12, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = armorDark;
    ctx.fillRect(-4, -4, 2, 8);
    ctx.fillRect(2, -4, 2, 8);

    ctx.fillStyle = skinColor;
    ctx.strokeStyle = '#8d6e63';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(10, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(12, -2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(12, 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(12, -2, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(12, 2, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = armorColor;
    ctx.strokeStyle = armorDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, -4);
    ctx.lineTo(26, 0);
    ctx.lineTo(16, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(-6, -10, 4, 6);
    ctx.fillRect(2, -10, 4, 6);

    ctx.restore();

    ctx.globalAlpha = 1;
  }

  private drawEnemyEyes(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string = '#ff0000'): void {
    const eyeOff = size * 0.3;
    const eyeR = size * 0.12;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x - eyeOff, y - eyeOff * 0.4, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + eyeOff, y - eyeOff * 0.4, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x - eyeOff, y - eyeOff * 0.4, eyeR * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + eyeOff, y - eyeOff * 0.4, eyeR * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderEnemies(enemies: Enemy[]): void {
    const ctx = this.ctx;
    for (const enemy of enemies) {
      const sx = enemy.position.x - this.cameraX;
      const sy = enemy.position.y - this.cameraY;
      if (sx < -50 || sx > SCREEN_WIDTH + 50 || sy < -50 || sy > SCREEN_HEIGHT + 50) continue;

      ctx.save();
      ctx.translate(sx, sy);

      const s = enemy.size;

      if (enemy.isMiniBoss) {
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#8e44ad';
        ctx.beginPath();
        ctx.moveTo(-s * 0.8, -s * 0.9);
        ctx.lineTo(0, -s * 1.4);
        ctx.lineTo(s * 0.8, -s * 0.9);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(-s * 0.3, -s * 0.1, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.3, -s * 0.1, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-s * 0.3, -s * 0.1, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.3, -s * 0.1, 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const healthRatio = enemy.health / enemy.maxHealth;
        const r = Math.floor(200 * (1 - healthRatio) + 100);
        const g = Math.floor(100 * healthRatio);

        switch (enemy.configId) {
          case 'walker': {
            ctx.fillStyle = `rgb(${r}, ${g}, 50)`;
            ctx.beginPath();
            ctx.arc(0, 0, s, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = `rgb(${r + 30}, ${g + 30}, 50)`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, s, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = `rgb(${r + 30}, ${g + 30}, 50)`;
            ctx.fillRect(-s * 0.2, s * 0.3, s * 0.4, s * 0.6);
            ctx.fillRect(-s * 0.2, s * 0.3, s * 0.4, s * 0.6);
            this.drawEnemyEyes(ctx, 0, 0, s, '#cc0000');
            ctx.fillStyle = `rgb(${r + 20}, ${g + 20}, 40)`;
            ctx.beginPath();
            ctx.arc(-s * 0.4, -s * 0.3, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(s * 0.4, -s * 0.3, 2, 0, Math.PI * 2);
            ctx.fill();
            break;
          }
          case 'runner': {
            ctx.fillStyle = `rgb(${r + 50}, ${g}, 80)`;
            ctx.beginPath();
            ctx.ellipse(0, 0, s * 1.2, s * 0.7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = `rgb(${r + 80}, ${g + 30}, 80)`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 0, s * 1.2, s * 0.7, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = `rgb(${r + 80}, ${g + 30}, 80)`;
            ctx.fillRect(-s * 0.5, s * 0.3, s * 0.3, s * 0.5);
            ctx.fillRect(s * 0.2, s * 0.3, s * 0.3, s * 0.5);
            this.drawEnemyEyes(ctx, 0, 0, s, '#8800aa');
            break;
          }
          case 'tank': {
            ctx.fillStyle = `rgb(${r - 30}, ${g}, 30)`;
            ctx.fillRect(-s * 0.9, -s * 0.7, s * 1.8, s * 1.4);
            ctx.strokeStyle = `rgb(${r}, ${g + 30}, 30)`;
            ctx.lineWidth = 3;
            ctx.strokeRect(-s * 0.9, -s * 0.7, s * 1.8, s * 1.4);
            ctx.fillStyle = `rgb(${r - 10}, ${g + 10}, 20)`;
            ctx.fillRect(-s * 0.7, -s * 0.3, s * 0.3, s * 0.3);
            ctx.fillRect(s * 0.4, -s * 0.3, s * 0.3, s * 0.3);
            ctx.fillRect(-s * 0.7, s * 0.2, s * 1.4, s * 0.2);
            this.drawEnemyEyes(ctx, 0, 0, s, '#aa4400');
            break;
          }
          case 'ranged': {
            ctx.fillStyle = `rgb(${r - 20}, ${g + 30}, 80)`;
            ctx.beginPath();
            ctx.arc(0, 0, s, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = `rgb(${r + 10}, ${g + 60}, 80)`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, s, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = `rgb(${r + 10}, ${g + 60}, 80)`;
            ctx.fillRect(s * 0.5, -3, s * 0.8, 6);
            ctx.fillStyle = `rgb(${r + 30}, ${g + 80}, 80)`;
            ctx.fillRect(s * 0.3, -5, s * 0.2, 10);
            this.drawEnemyEyes(ctx, 0, 0, s, '#0055aa');
            break;
          }
          case 'exploder': {
            ctx.fillStyle = `rgb(${r + 60}, ${g - 20}, 20)`;
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
              const r2 = i % 2 === 0 ? s * 1.3 : s * 0.9;
              const px = Math.cos(a) * r2;
              const py = Math.sin(a) * r2;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = `rgb(${r + 90}, ${g + 10}, 20)`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
              const r2 = i % 2 === 0 ? s * 1.3 : s * 0.9;
              const px = Math.cos(a) * r2;
              const py = Math.sin(a) * r2;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.fillStyle = `rgb(${r + 90}, ${g - 10}, 10)`;
            ctx.beginPath();
            ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(-s * 0.2, -s * 0.1, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(s * 0.2, -s * 0.1, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(-s * 0.2, -s * 0.1, 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(s * 0.2, -s * 0.1, 1.5, 0, Math.PI * 2);
            ctx.fill();
            break;
          }
          default: {
            ctx.fillStyle = `rgb(${r}, ${g}, 50)`;
            ctx.beginPath();
            ctx.arc(0, 0, s, 0, Math.PI * 2);
            ctx.fill();
            this.drawEnemyEyes(ctx, 0, 0, s);
            break;
          }
        }
      }

      ctx.restore();

      ctx.fillStyle = '#ffffff';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.floor(enemy.health)}/${Math.floor(enemy.maxHealth)}`, sx, sy - enemy.size - 8);
    }
  }

  private renderProjectiles(projectiles: Projectile[]): void {
    const ctx = this.ctx;
    for (const proj of projectiles) {
      const sx = proj.position.x - this.cameraX;
      const sy = proj.position.y - this.cameraY;
      if (sx < -20 || sx > SCREEN_WIDTH + 20 || sy < -20 || sy > SCREEN_HEIGHT + 20) continue;

      const angle = Math.atan2(proj.velocity.y, proj.velocity.x);
      const speed = Math.sqrt(proj.velocity.x ** 2 + proj.velocity.y ** 2);
      const trailLen = Math.min(12, speed * 0.02);

      switch (proj.weaponType) {
        case WeaponTypeId.MachineGun: {
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(angle);
          ctx.fillStyle = '#ffeb3b';
          ctx.shadowColor = '#ffeb3b';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(0, 0, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255, 235, 59, 0.3)';
          ctx.fillRect(-trailLen - 2, -1.5, trailLen + 2, 3);
          ctx.shadowBlur = 0;
          ctx.restore();
          break;
        }
        case WeaponTypeId.Shotgun: {
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(angle);
          ctx.fillStyle = '#ff9800';
          ctx.shadowColor = '#ff9800';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255, 152, 0, 0.25)';
          ctx.fillRect(-trailLen - 3, -2, trailLen + 3, 4);
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(255, 200, 100, 0.5)';
          ctx.beginPath();
          ctx.arc(0, 0, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        }
        case WeaponTypeId.Flamethrower: {
          const baseSize = Math.max(3, proj.projectileSize * 0.04);
          const flicker = baseSize + Math.random() * baseSize * 0.8;
          const lifeRatio = proj.maxLifetime > 0 ? proj.lifetime / proj.maxLifetime : 0;
          const progress = 1 - lifeRatio;
          const alpha = Math.max(0, Math.min(1, Math.sin(progress * Math.PI)));
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(angle);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = '#ff3d00';
          ctx.shadowColor = '#ff3d00';
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(0, 0, flicker, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ff6d00';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(0, 0, flicker + baseSize * 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255, 200, 50, 0.6)';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(0, 0, flicker * 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255, 60, 0, 0.2)';
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.ellipse(-trailLen * 0.5, (Math.random() - 0.5) * baseSize, trailLen, baseSize * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.restore();
          break;
        }
        case WeaponTypeId.LaserGun: {
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(angle);
          ctx.fillStyle = '#00e5ff';
          ctx.shadowColor = '#00e5ff';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(0, 0, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(0, 229, 255, 0.3)';
          ctx.fillRect(-trailLen - 4, -1, trailLen + 4, 2);
          ctx.fillStyle = 'rgba(200, 255, 255, 0.7)';
          ctx.shadowBlur = 4;
          ctx.beginPath();
          ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.restore();
          break;
        }
        case WeaponTypeId.Bow: {
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(angle);
          ctx.fillStyle = '#8bc34a';
          ctx.shadowColor = '#8bc34a';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#689f38';
          ctx.beginPath();
          ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(139, 195, 74, 0.3)';
          ctx.fillRect(-trailLen - 2, -1.5, trailLen + 2, 3);
          ctx.shadowBlur = 0;
          ctx.restore();
          break;
        }
        default: {
          const wt = proj.weaponType as string;
          let color = '#ce93d8';
          let size = 4;
          if (wt === 'missile') { color = '#ff7043'; size = 5; }
          else if (wt === 'aux_laser_gun') { color = '#00e5ff'; size = 3; }
          else if (wt === 'sword_energy') { color = '#ab47bc'; size = 6; }
          else if (wt === 'turret') { color = '#ffeb3b'; size = 3; }
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(angle);
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.fillRect(-trailLen - 2, -1.5, trailLen + 2, 3);
          ctx.restore();
          break;
        }
      }
    }
  }

  private renderDamageNumbers(numbers: DamageNumber[]): void {
    const ctx = this.ctx;
    for (const dn of numbers) {
      const sx = dn.position.x - this.cameraX;
      const sy = dn.position.y - this.cameraY;
      const alpha = Math.max(0, dn.timer / dn.maxTimer);
      ctx.fillStyle = `rgba(255, 50, 50, ${alpha})`;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${dn.value}`, sx, sy);
    }
  }

  private renderXpDrops(xpDrops: XPDrop[]): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#76ff03';
    for (const drop of xpDrops) {
      const sx = drop.position.x - this.cameraX;
      const sy = drop.position.y - this.cameraY;
      if (sx < -10 || sx > SCREEN_WIDTH + 10 || sy < -10 || sy > SCREEN_HEIGHT + 10) continue;
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderChests(chests: Chest[]): void {
    const ctx = this.ctx;
    for (const chest of chests) {
      const sx = chest.position.x - this.cameraX;
      const sy = chest.position.y - this.cameraY;
      if (sx < -10 || sx > SCREEN_WIDTH + 10 || sy < -10 || sy > SCREEN_HEIGHT + 10) continue;

      ctx.fillStyle = '#ff9800';
      ctx.fillRect(sx - 6, sy - 6, 12, 12);
      ctx.strokeStyle = '#ffc107';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 6, sy - 6, 12, 12);

      let label = '';
      switch (chest.type) {
        case ChestType.Health: label = '回血'; break;
        case ChestType.XPRange: label = '经验'; break;
        case ChestType.MaxHP: label = '血量'; break;
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, sx, sy + 3);
    }
  }

  private renderTurrets(turrets: TurretEntity[]): void {
    const ctx = this.ctx;
    for (const t of turrets) {
      const sx = t.position.x - this.cameraX;
      const sy = t.position.y - this.cameraY;
      if (sx < -20 || sx > SCREEN_WIDTH + 20 || sy < -20 || sy > SCREEN_HEIGHT + 20) continue;
      ctx.fillStyle = '#ff9800';
      ctx.fillRect(sx - 6, sy - 6, 12, 12);
      ctx.strokeStyle = '#ffc107';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 6, sy - 6, 12, 12);
      ctx.fillStyle = '#fff';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('炮', sx, sy + 3);
    }
  }

  private renderLandMines(mines: LandMineEntity[]): void {
    const ctx = this.ctx;
    for (const m of mines) {
      const sx = m.position.x - this.cameraX;
      const sy = m.position.y - this.cameraY;
      if (sx < -10 || sx > SCREEN_WIDTH + 10 || sy < -10 || sy > SCREEN_HEIGHT + 10) continue;
      ctx.fillStyle = m.armed ? '#f44336' : '#666';
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffeb3b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private renderHUD(state: GameState): void {
    const ctx = this.ctx;
    const char = state.character;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, SCREEN_WIDTH, 65);

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`等级 ${char.level}`, 10, 25);
    ctx.fillText(`生命: ${Math.floor(char.health)}/${char.maxHealth}`, 100, 25);
    ctx.fillText(`击杀: ${char.killCount}`, 400, 25);

    const elapsed = state.elapsedTime;
    let slotX = 10;
    const slotY = 42;
    const slotW = 50;
    const slotH = 22;
    const slotGap = 4;

    const drawWeaponSlot = (x: number, label: string, lv: number, ammoRatio: number, isReloading: boolean, reloadSpeed: number, isMelee: boolean) => {
      ctx.fillStyle = '#222';
      ctx.fillRect(x, slotY, slotW, slotH);
      ctx.strokeStyle = isReloading ? '#ff9800' : '#4fc3f7';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, slotY, slotW, slotH);

      if (isReloading) {
        const progress = 1 - reloadSpeed;
        ctx.save();
        ctx.translate(x + slotW / 2, slotY + slotH / 2);
        ctx.rotate(elapsed * 4);
        ctx.strokeStyle = '#ff9800';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 1.5 * progress);
        ctx.stroke();
        ctx.restore();
      }

      ctx.fillStyle = '#4fc3f7';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 3, slotY + 10);

      ctx.fillStyle = '#ffeb3b';
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`Lv${lv}`, x + slotW - 3, slotY + 10);

      if (!isMelee) {
        ctx.fillStyle = '#333';
        ctx.fillRect(x + 2, slotY + slotH - 5, slotW - 4, 3);
        ctx.fillStyle = ammoRatio > 0.3 ? '#4caf50' : ammoRatio > 0.1 ? '#ff9800' : '#f44336';
        ctx.fillRect(x + 2, slotY + slotH - 5, (slotW - 4) * Math.max(0, ammoRatio), 3);
      }
    };

    const mw = char.mainWeapon;
    const mwConfig = WEAPON_CONFIGS[mw.typeId];
    const mwAmmo = mw.stats.magazineCapacity === Infinity ? 1 : mw.currentAmmo / mw.stats.magazineCapacity;
    drawWeaponSlot(slotX, mwConfig.name.slice(0, 2), mw.level, mwAmmo, mw.reloadTimer > 0, mw.reloadTimer / mw.stats.reloadSpeed, mwConfig.isMelee);

    for (let i = 0; i < MAX_AUX_SLOTS; i++) {
      const x = slotX + (i + 1) * (slotW + slotGap);
      if (i < char.auxWeapons.length) {
        const aux = char.auxWeapons[i];
        const config = AUXILIARY_WEAPON_CONFIGS[aux.typeId];
        ctx.fillStyle = '#222';
        ctx.fillRect(x, slotY, slotW, slotH);
        ctx.strokeStyle = '#ce93d8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, slotY, slotW, slotH);
        ctx.fillStyle = '#ce93d8';
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(config.name.slice(0, 2), x + 3, slotY + 10);
        ctx.fillStyle = '#ffeb3b';
        ctx.font = '8px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`Lv${aux.level}`, x + slotW - 3, slotY + 10);
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(x, slotY, slotW, slotH);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, slotY, slotW, slotH);
      }
    }

    if (char.invincibleTimer > 0) {
      ctx.fillStyle = '#ffeb3b';
      ctx.textAlign = 'center';
      ctx.fillText('无敌', SCREEN_WIDTH / 2, 80);
    }

    const barY = SCREEN_HEIGHT - 3;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, barY, SCREEN_WIDTH, 3);
    const xpRatio = Math.min(1, char.xp / char.xpToNextLevel);
    ctx.fillStyle = '#76ff03';
    ctx.fillRect(0, barY, SCREEN_WIDTH * xpRatio, 3);
  }

  private renderWeaponSelect(state: GameState): void {
    const ctx = this.ctx;
    const { width, height } = this.canvas;

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#ffffff';
    ctx.font = '24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('选择你的武器', width / 2, 80);

    const weapons = INITIAL_WEAPON_POOL;
    const boxWidth = 150;
    const boxHeight = 150;
    const gap = 10;
    const totalWidth = weapons.length * boxWidth + (weapons.length - 1) * gap;
    const startX = (width - totalWidth) / 2;
    const startY = 150;

    for (let i = 0; i < weapons.length; i++) {
      const config = WEAPON_CONFIGS[weapons[i]];
      const x = startX + i * (boxWidth + gap);
      const isSelected = i === state.selectedIndex;

      if (isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.strokeRect(x - 2, startY - 2, boxWidth + 4, boxHeight + 4);
        ctx.shadowBlur = 0;
      }

      ctx.strokeStyle = '#4fc3f7';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, startY, boxWidth, boxHeight);

      ctx.fillStyle = isSelected ? '#ffffff' : '#4fc3f7';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(config.name, x + boxWidth / 2, startY + 30);

      ctx.fillStyle = '#aaa';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      const stats = [
        `伤害: ${config.baseStats.damage}`,
        `攻速: ${config.baseStats.fireRate}`,
        `弹匣: ${config.baseStats.magazineCapacity === Infinity ? '∞' : config.baseStats.magazineCapacity}`,
        `换弹: ${config.baseStats.reloadSpeed}秒`,
        `范围: ${config.baseStats.range}`,
      ];
      stats.forEach((s, idx) => {
        ctx.fillText(s, x + 10, startY + 55 + idx * 16);
      });
    }

    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('← → 选择  回车/A 确认', width / 2, startY + boxHeight + 40);
  }

  private renderLevelUp(state: GameState): void {
    const ctx = this.ctx;
    const { width, height } = this.canvas;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#76ff03';
    ctx.font = '20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('升级！', width / 2, 80);

    const boxWidth = 200;
    const boxHeight = 100;
    const totalWidth = state.upgradeOptions.length * boxWidth + (state.upgradeOptions.length - 1) * 20;
    const startX = (width - totalWidth) / 2;
    const startY = 150;

    for (let i = 0; i < state.upgradeOptions.length; i++) {
      const opt = state.upgradeOptions[i];
      const color = RARITY_COLORS[opt.rarity] ?? '#76ff03';
      const x = startX + i * (boxWidth + 20);
      const isSelected = i === state.selectedIndex;

      if (isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.strokeRect(x - 2, startY - 2, boxWidth + 4, boxHeight + 4);
        ctx.shadowBlur = 0;
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, startY, boxWidth, boxHeight);

      ctx.fillStyle = color;
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(opt.description, x + boxWidth / 2, startY + 50);
    }

    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('← → 选择  回车/A 确认', width / 2, startY + boxHeight + 40);
  }

  private renderPause(state: GameState): void {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    const char = state.character;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, width, height);

    const panelX = 0;
    const panelW = 300;

    ctx.fillStyle = 'rgba(10, 10, 30, 0.92)';
    ctx.fillRect(panelX, 0, panelW, height);
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX, 0, panelW, height);

    ctx.fillStyle = '#4fc3f7';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('角色属性', panelW / 2, 30);

    ctx.strokeStyle = 'rgba(79, 195, 247, 0.2)';
    ctx.beginPath();
    ctx.moveTo(10, 40);
    ctx.lineTo(panelW - 10, 40);
    ctx.stroke();

    const statX = 12;
    const valX = 160;
    let y = 62;
    const rowH = 20;

    const drawStat = (label: string, value: string, color: string = '#ffffff') => {
      ctx.fillStyle = '#8899aa';
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, statX, y);
      ctx.fillStyle = color;
      ctx.textAlign = 'right';
      ctx.fillText(value, panelW - 12, y);
      y += rowH;
    };

    drawStat('等级', `${char.level}`, '#4fc3f7');
    drawStat('生命', `${Math.floor(char.health)} / ${char.maxHealth}`, '#4caf50');
    drawStat('经验', `${Math.floor(char.xp)} / ${char.xpToNextLevel}`, '#76ff03');
    drawStat('击杀', `${char.killCount}`, '#ff9800');
    drawStat('经验范围', `${char.xpAbsorptionRadius}`, '#ce93d8');
    drawStat('移动速度', `${char.speed}`, '#81d4fa');

    y += 10;

    const drawMainWeaponBlock = (w: typeof char.mainWeapon) => {
      const config = WEAPON_CONFIGS[w.typeId];
      const isMelee = config.isMelee;
      const headerColor = isMelee ? '#ff7043' : '#4fc3f7';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(6, y, panelW - 12, isMelee ? 116 : 152);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(6, y, panelW - 12, isMelee ? 116 : 152);
      ctx.fillStyle = headerColor;
      ctx.fillRect(6, y, panelW - 12, 22);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${config.name}`, 16, y + 15);
      ctx.textAlign = 'right';
      ctx.fillText(`Lv.${w.level}`, panelW - 16, y + 15);
      y += 28;
      const ammoStr = w.stats.magazineCapacity === Infinity ? '∞' : `${Math.floor(w.currentAmmo)}/${w.stats.magazineCapacity}`;
      drawStat('弹药', ammoStr, isMelee ? '#aaa' : '#ffeb3b');
      drawStat('伤害', `${w.stats.damage}`, '#ef5350');
      drawStat('攻速', `${w.stats.fireRate}`, '#ab47bc');
      drawStat('范围', `${w.stats.range}`, '#26c6da');
      if (!isMelee) {
        drawStat('换弹', `${w.stats.reloadSpeed.toFixed(1)}s`, '#ff9800');
        drawStat('穿透', `${w.stats.penetration}`, '#7e57c2');
        drawStat('弹数', `${w.stats.bulletCount}`, '#66bb6a');
        drawStat('弹匣', `${w.stats.magazineCapacity}`, '#42a5f5');
      } else {
        const angleDeg = ((config.attackArc ?? Math.PI / 2) * 180 / Math.PI).toFixed(0);
        drawStat('扇形角', `${angleDeg}°`, '#ff7043');
      }
      y += 8;
    };

    const drawAuxWeaponBlock = (aux: typeof char.auxWeapons[0]) => {
      const config = AUXILIARY_WEAPON_CONFIGS[aux.typeId];
      const s = aux.stats;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(6, y, panelW - 12, 130);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(6, y, panelW - 12, 130);
      ctx.fillStyle = '#ce93d8';
      ctx.fillRect(6, y, panelW - 12, 22);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${config.name}`, 16, y + 15);
      ctx.textAlign = 'right';
      ctx.fillText(`Lv.${aux.level}`, panelW - 16, y + 15);
      y += 28;
      drawStat('伤害', `${s.damage}`, '#ef5350');
      drawStat('范围', `${s.range}`, '#26c6da');
      drawStat('充能', `${s.cooldown.toFixed(1)}s`, '#ff9800');
      drawStat('数量', `${s.count}`, '#66bb6a');
      if (s.explosionRadius > 0) drawStat('爆炸范围', `${s.explosionRadius}`, '#ff7043');
      if (s.rotationSpeed > 0) drawStat('转速', `${s.rotationSpeed.toFixed(1)}`, '#ab47bc');
      if (s.duration > 0) drawStat('持续', `${s.duration.toFixed(1)}s`, '#42a5f5');
      if (s.turretFireRate > 0) drawStat('炮台攻速', `${s.turretFireRate}`, '#4fc3f7');
      y += 8;
    };

    drawMainWeaponBlock(char.mainWeapon);
    for (const aux of char.auxWeapons) drawAuxWeaponBlock(aux);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ESC 继续', panelW / 2, height - 15);
  }

  private renderWeaponDrop(state: GameState): void {
    const ctx = this.ctx;
    const { width, height } = this.canvas;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#ff9800';
    ctx.font = '20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('武器掉落！', width / 2, 80);

    const boxWidth = 200;
    const boxHeight = 80;
    const totalWidth = state.weaponDropOptions.length * boxWidth + (state.weaponDropOptions.length - 1) * 20;
    const startX = (width - totalWidth) / 2;
    const startY = 150;

    for (let i = 0; i < state.weaponDropOptions.length; i++) {
      const typeId = state.weaponDropOptions[i];
      const config = AUXILIARY_WEAPON_CONFIGS[typeId];
      const x = startX + i * (boxWidth + 20);
      const isSelected = i === state.selectedIndex;

      if (isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.strokeRect(x - 2, startY - 2, boxWidth + 4, boxHeight + 4);
        ctx.shadowBlur = 0;
      }

      ctx.strokeStyle = '#ce93d8';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, startY, boxWidth, boxHeight);

      ctx.fillStyle = '#ce93d8';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(config.name, x + boxWidth / 2, startY + 45);
    }

    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.fillText('← → 选择  回车/A 确认', width / 2, startY + boxHeight + 40);
  }
}

