import {
  Character,
  GameState,
  TalentNodeId,
  TalentNodeDef,
  TalentTreeDef,
  TalentTreeView,
  TalentNodeView,
  WeaponTypeId,
  WEAPON_CHARACTER_PRESETS,
  CRIT_MULTIPLIER,
  TALENT_MAX_LEVEL,
  TALENT_TIER2_REQ,
  TALENT_TIER3_REQ,
  TALENT_UPGRADE_COST,
  BASE_SPEED,
  BASE_MAX_HEALTH,
} from './types';

/* ------------------------------------------------------------------ */
/* 天赋树定义                                                          */
/* ------------------------------------------------------------------ */

/**
 * 每位主武器角色的天赋树。
 * 结构：1 阶 3 个、2 阶 2 个、3 阶 1 个；每个天赋最多 5 级。
 * 目前只有近战刀（MeleeBlade）完成设计，其余武器暂无天赋树。
 */
export const TALENT_TREES: Record<WeaponTypeId, TalentTreeDef | null> = {
  [WeaponTypeId.MeleeBlade]: {
    weaponType: WeaponTypeId.MeleeBlade,
    nodes: [
      // ── 1 阶（3 个）────────────────────────────────────────────
      {
        id: TalentNodeId.MoveSpeed,
        name: '疾风脚步',
        desc: '移动速度',
        tier: 1,
        maxLevel: TALENT_MAX_LEVEL,
        values: [8, 16, 24, 32, 40],
        unit: '%',
      },
      {
        id: TalentNodeId.AttackDamage,
        name: '利刃锋芒',
        desc: '攻击力',
        tier: 1,
        maxLevel: TALENT_MAX_LEVEL,
        values: [10, 20, 30, 40, 50],
        unit: '%',
      },
      {
        id: TalentNodeId.AttackSpeed,
        name: '连斩之势',
        desc: '攻击速度',
        tier: 1,
        maxLevel: TALENT_MAX_LEVEL,
        values: [8, 16, 24, 32, 40],
        unit: '%',
      },
      // ── 2 阶（2 个）────────────────────────────────────────────
      {
        id: TalentNodeId.AttackRange,
        name: '刀罡破空',
        desc: '攻击范围',
        tier: 2,
        maxLevel: TALENT_MAX_LEVEL,
        values: [10, 20, 30, 40, 50],
        unit: '%',
      },
      {
        id: TalentNodeId.CritRate,
        name: '会心一击',
        desc: '暴击率（暴击造成双倍伤害）',
        tier: 2,
        maxLevel: TALENT_MAX_LEVEL,
        values: [10, 20, 30, 40, 50],
        unit: '%',
      },
      // ── 3 阶（1 个）────────────────────────────────────────────
      {
        id: TalentNodeId.DoubleStrike,
        name: '十字连斩',
        desc: '挥砍时概率快速交叉挥出第二刀（全额伤害）',
        tier: 3,
        maxLevel: TALENT_MAX_LEVEL,
        values: [10, 20, 30, 40, 50],
        unit: '%',
      },
    ],
  },
  // 其余武器暂无天赋树
  [WeaponTypeId.MachineGun]: null,
  [WeaponTypeId.Shotgun]: null,
  [WeaponTypeId.Flamethrower]: null,
  [WeaponTypeId.LaserGun]: null,
  [WeaponTypeId.Bow]: null,
};

export function getTalentTree(weaponType: WeaponTypeId): TalentTreeDef | null {
  return TALENT_TREES[weaponType] ?? null;
}

/* ------------------------------------------------------------------ */
/* 持久化（localStorage）                                             */
/* fireworld_talents: { [weaponTypeId]: { points, levels: { id: lv } } } */
/* ------------------------------------------------------------------ */

const TALENTS_KEY = 'fireworld_talents';

export interface TalentProgress {
  points: number;
  levels: Partial<Record<TalentNodeId, number>>;
}

function loadStore(): Record<string, TalentProgress> {
  try {
    const raw = localStorage.getItem(TALENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TalentProgress>;
    return parsed;
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, TalentProgress>): void {
  try {
    localStorage.setItem(TALENTS_KEY, JSON.stringify(store));
  } catch {
    // 隐私模式等场景忽略存储失败
  }
}

export function getTalentProgress(weaponType: WeaponTypeId): TalentProgress {
  const store = loadStore();
  const entry = store[weaponType] ?? { points: 0, levels: {} };
  return { points: Math.max(0, Math.floor(entry.points) || 0), levels: { ...(entry.levels ?? {}) } };
}

/** 给某武器角色增加天赋点（如通关奖励），返回新的可用天赋点 */
export function addTalentPoints(weaponType: WeaponTypeId, amount: number): number {
  const store = loadStore();
  const entry = store[weaponType] ?? { points: 0, levels: {} };
  entry.points = Math.max(0, entry.points + Math.max(0, Math.floor(amount)));
  store[weaponType] = entry;
  saveStore(store);
  return entry.points;
}

function getLevel(tree: TalentTreeDef, levels: Partial<Record<TalentNodeId, number>>, node: TalentNodeDef): number {
  return Math.max(0, Math.min(node.maxLevel, levels[node.id] ?? 0));
}

function tierTotal(tree: TalentTreeDef, levels: Partial<Record<TalentNodeId, number>>, tier: number): number {
  return tree.nodes
    .filter((n) => n.tier === tier)
    .reduce((sum, n) => sum + getLevel(tree, levels, n), 0);
}

/**
 * 尝试消耗天赋点提升某节点一级。
 * 校验：前置天赋解锁、未满级、天赋点充足。成功则持久化并返回 true。
 */
export function spendTalentPoint(weaponType: WeaponTypeId, nodeId: TalentNodeId): boolean {
  const tree = getTalentTree(weaponType);
  if (!tree) return false;
  const node = tree.nodes.find((n) => n.id === nodeId);
  if (!node) return false;

  const store = loadStore();
  const entry = store[weaponType] ?? { points: 0, levels: {} };
  const level = getLevel(tree, entry.levels, node);
  if (level >= node.maxLevel) return false;
  if (!isNodeUnlocked(tree, entry.levels, node)) return false;
  if (entry.points < TALENT_UPGRADE_COST) return false;

  entry.points -= TALENT_UPGRADE_COST;
  entry.levels[nodeId] = level + 1;
  store[weaponType] = entry;
  saveStore(store);
  return true;
}

/** 节点是否可用（2/3 阶受前置等级约束） */
export function isNodeUnlocked(
  tree: TalentTreeDef,
  levels: Partial<Record<TalentNodeId, number>>,
  node: TalentNodeDef,
): boolean {
  if (node.tier <= 1) return true;
  const prevTier = node.tier - 1;
  const req = node.tier === 2 ? TALENT_TIER2_REQ : TALENT_TIER3_REQ;
  return tierTotal(tree, levels, prevTier) >= req;
}

function lockHint(node: TalentNodeDef, tierLevels: number[]): string {
  if (node.tier === 2) return `需 1 阶合计投入 ${TALENT_TIER2_REQ} 级（当前 ${tierLevels[0] ?? 0}）`;
  if (node.tier === 3) return `需 2 阶合计投入 ${TALENT_TIER3_REQ} 级（当前 ${tierLevels[1] ?? 0}）`;
  return '';
}

/** 构建某个武器天赋树的界面快照（渲染器只消费此视图，不接触存储） */
export function buildTalentTreeView(weaponType: WeaponTypeId): TalentTreeView | null {
  const tree = getTalentTree(weaponType);
  if (!tree) return null;
  const progress = getTalentProgress(weaponType);
  const tierLevels: number[] = [tierTotal(tree, progress.levels, 1), tierTotal(tree, progress.levels, 2), tierTotal(tree, progress.levels, 3)];

  const nodes: TalentNodeView[] = tree.nodes.map((node) => {
    const level = getLevel(tree, progress.levels, node);
    const unlocked = isNodeUnlocked(tree, progress.levels, node);
    const maxed = level >= node.maxLevel;
    const curValue = node.values[Math.max(0, level - 1)];
    const nextValue = node.values[level] ?? 0;
    return {
      id: node.id,
      name: node.name,
      desc: node.desc,
      tier: node.tier,
      maxLevel: node.maxLevel,
      level,
      curValue: level > 0 ? `+${curValue}${node.unit}` : '未激活',
      nextValue: maxed ? '' : `+${nextValue}${node.unit}`,
      unlocked,
      canUpgrade: unlocked && !maxed && progress.points >= TALENT_UPGRADE_COST,
      maxed,
      lockHint: unlocked ? '' : lockHint(node, tierLevels),
      cost: TALENT_UPGRADE_COST,
    };
  });

  return { weaponType: tree.weaponType, nodes, points: progress.points, tierLevels };
}

/** 重新从持久化同步 GameState 中的天赋点数/等级快照（供界面与结算使用） */
export function syncTalentState(state: GameState): void {
  const store = loadStore();
  for (const [wk, entry] of Object.entries(store)) {
    state.talentPointsPerWeapon[wk] = entry.points;
    state.talentLevelsPerWeapon[wk] = { ...(entry.levels ?? {}) };
  }
}

/* ------------------------------------------------------------------ */
/* 属性应用                                                           */
/* ------------------------------------------------------------------ */

function levelOf(tree: TalentTreeDef, levels: Partial<Record<TalentNodeId, number>>, id: TalentNodeId): number {
  const node = tree.nodes.find((n) => n.id === id);
  if (!node) return 0;
  const lv = getLevel(tree, levels, node);
  return lv > 0 ? (node.values[lv - 1] ?? 0) : 0;
}

/** 把该角色天赋树中已点天赋应用到新建角色（在 createCharacter 之后调用） */
export function applyTalentStats(char: Character): void {
  const tree = getTalentTree(char.mainWeapon.typeId);
  if (!tree) return;
  const progress = getTalentProgress(char.mainWeapon.typeId);
  const levels = progress.levels;

  const speedPct = levelOf(tree, levels, TalentNodeId.MoveSpeed);
  const dmgPct = levelOf(tree, levels, TalentNodeId.AttackDamage);
  const atkSpdPct = levelOf(tree, levels, TalentNodeId.AttackSpeed);
  const rangePct = levelOf(tree, levels, TalentNodeId.AttackRange);
  const critPct = levelOf(tree, levels, TalentNodeId.CritRate);
  const doublePct = levelOf(tree, levels, TalentNodeId.DoubleStrike);

  const preset = WEAPON_CHARACTER_PRESETS[char.mainWeapon.typeId] ?? { speedMultiplier: 1, health: BASE_MAX_HEALTH };
  char.speed = BASE_SPEED * preset.speedMultiplier * (1 + speedPct / 100);
  char.mainWeapon.stats.damage *= 1 + dmgPct / 100;
  char.mainWeapon.stats.fireRate *= 1 + atkSpdPct / 100;
  char.mainWeapon.stats.range *= 1 + rangePct / 100;
  char.critChance = critPct / 100;
  char.doubleStrikeChance = doublePct / 100;
}

/** 伤害结算辅助：按角色暴击率掷骰，返回 (最终伤害, 是否暴击) */
export function rollCrit(char: Character, baseDamage: number): { damage: number; crit: boolean } {
  if (char.critChance <= 0) return { damage: baseDamage, crit: false };
  const crit = Math.random() < char.critChance;
  return { damage: crit ? baseDamage * CRIT_MULTIPLIER : baseDamage, crit };
}