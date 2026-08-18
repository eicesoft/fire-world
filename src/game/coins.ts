const COINS_KEY = 'fireworld_coins';

export function loadCoins(): number {
  try {
    const v = Number(localStorage.getItem(COINS_KEY) ?? 0);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

export function storeCoins(coins: number): void {
  try {
    localStorage.setItem(COINS_KEY, String(Math.max(0, Math.floor(coins))));
  } catch {
    // 隐私模式等场景忽略存储失败
  }
}

export function addCoins(amount: number): number {
  const next = loadCoins() + Math.max(0, amount);
  storeCoins(next);
  return next;
}