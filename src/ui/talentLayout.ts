import { SCREEN_WIDTH, TalentNodeView } from '../game/types';

/* 天赋树面板布局（渲染器与 main.ts 共用，避免跨层访问内部实现） */

export const TALENT_TIER_ROWS: { tier: number; labelY: number; y: number }[] = [
  { tier: 1, labelY: 112, y: 136 },
  { tier: 2, labelY: 268, y: 292 },
  { tier: 3, labelY: 424, y: 448 },
];
export const TALENT_CARD_W = 210;
export const TALENT_CARD_H = 108;
export const TALENT_CARD_GAP = 16;
export const TALENT_TIER_COLORS: Record<number, number> = { 1: 0x76ff03, 2: 0x4fc3f7, 3: 0xffc107 };

/** 由节点下标计算卡片矩形（nodes 按 1 阶3个 → 2 阶2个 → 3 阶1个 排序） */
export function talentNodeRect(nodes: TalentNodeView[], index: number): { x: number; y: number; w: number; h: number } | null {
  const node = nodes[index];
  if (!node) return null;
  const row = TALENT_TIER_ROWS.find((r) => r.tier === node.tier);
  if (!row) return null;
  const count = nodes.filter((n) => n.tier === node.tier).length;
  const totalW = count * TALENT_CARD_W + (count - 1) * TALENT_CARD_GAP;
  const startX = (SCREEN_WIDTH - totalW) / 2;
  const col = nodes.filter((n) => n.tier === node.tier && nodes.indexOf(n) < index).length;
  return { x: startX + col * (TALENT_CARD_W + TALENT_CARD_GAP), y: row.y, w: TALENT_CARD_W, h: TALENT_CARD_H };
}

/** 命中检测：返回点击坐标落在哪张天赋卡片（节点下标），未命中返回 -1 */
export function findTalentNodeAt(nodes: TalentNodeView[], mx: number, my: number): number {
  for (let i = 0; i < nodes.length; i++) {
    const r = talentNodeRect(nodes, i);
    if (r && mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return i;
  }
  return -1;
}