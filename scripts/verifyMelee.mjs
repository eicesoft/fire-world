// 近战刀特效最终验证：敌人只挨打（damage=0）→ 无红闪干扰 → 捕获弧光与刀光粒子
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const port = process.argv[2] ?? '3001';
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=820,640'],
  defaultViewport: { width: 800, height: 600 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[PAGEERROR]', (e.stack ?? e.message).split('\n').slice(0, 3).join(' | ')));

await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));
await page.keyboard.down('Enter');
await new Promise((r) => setTimeout(r, 120));
await page.keyboard.up('Enter');
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => {
  const st = window.__fw.state();
  st.character.mainWeapon.typeId = 'melee_blade';
  return true;
});

const ensure = () => page.evaluate(() => {
  const st = window.__fw.state();
  const c = st.character.position;
  for (let k = 0; k < 3; k++) {
    let e = st.enemies.find((x) => x.id === 'test_enemy_' + k);
    if (!e) {
      e = {
        id: 'test_enemy_' + k, configId: 'walker',
        position: { x: c.x + 38, y: c.y + (k - 1) * 22 },
        health: 20, maxHealth: 20, speed: 60, damage: 0, xpValue: 1,
        isMiniBoss: false, size: 20, attackCooldown: 0, burnDamage: 0, burnTimer: 0,
      };
      st.enemies.push(e);
    }
    e.position = { x: c.x + 38, y: c.y + (k - 1) * 22 };
    e.health = 20;
  }
});
await ensure();

function decodePng(buf) {
  let pos = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), t = buf.toString('ascii', pos + 4, pos + 8), d = buf.subarray(pos + 8, pos + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; }
    else if (t === 'IDAT') idat.push(d);
    else if (t === 'IEND') break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : 3, str = w * ch;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (str + 1)], rs = y * (str + 1) + 1, ps = (y - 1) * (str + 1) + 1;
    for (let x = 0; x < str; x++) {
      let v = raw[rs + x];
      const l = x >= ch ? raw[rs + x - ch] : 0, u = y > 0 ? raw[ps + x] : 0, ul = y > 0 && x >= ch ? raw[ps + x - ch] : 0;
      if (f === 1) v += l; else if (f === 2) v += u; else if (f === 3) v += (l + u) >> 1;
      else if (f === 4) { const p = l + u - ul, pa = Math.abs(p - l), pb = Math.abs(p - u), pc = Math.abs(p - ul); v += (pa <= pb && pa <= pc) ? l : (pb <= pc ? u : ul); }
      raw[rs + x] = v & 255;
    }
  }
  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = y * (str + 1) + 1 + x * ch, d = (y * w + x) * 3;
    out[d] = raw[s]; out[d + 1] = raw[s + 1]; out[d + 2] = raw[s + 2];
  }
  return { w, h, data: out };
}

let maxWhite = 0, spikes = 0;
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 90));
  await ensure();
  const slashes = await page.evaluate(() => window.__fw.state().slashEffects.length);
  const f = `/tmp/fireworld-shots/melee-${String(i).padStart(2, '0')}.png`;
  await page.screenshot({ path: f });
  const { w, h, data } = decodePng(readFileSync(f));
  let white = 0;
  for (let p = 0; p < w * h; p++) {
    const r = data[p * 3], g = data[p * 3 + 1], b = data[p * 3 + 2];
    if ((r + g + b) / 3 > 140) white++;
  }
  if (white > 900) spikes++;
  maxWhite = Math.max(maxWhite, white);
  if (i % 4 === 0) console.log(`frame ${i}: slash=${slashes} bright=${white}`);
}
console.log(`结果：亮度峰值=${maxWhite}，挥砍爆发帧=${spikes}/20（HUD+角色基线 ~700，挥砍瞬间应 >1200）`);
await browser.close();