// 验证旋转飞轮显示 + 轨道粒子：
// 1) 通过 __fw 钩子直接注入 WindWheel 辅助武器
// 2) 截两张图（间隔 1s），普查紫色像素（刀刃 #9c27b0 / 浅紫 #ce93d8）
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
await page.keyboard.press('Enter'); // 机关枪
await new Promise((r) => setTimeout(r, 300));

// 注入 WindWheel
const ok = await page.evaluate(() => {
  const fw = window.__fw;
  if (!fw) return false;
  const st = fw.state();
  st.character.auxWeapons.push({
    typeId: 'wind_wheel',
    stats: {
      damage: 10, range: 80, cooldown: 0, count: 3, explosionRadius: 0,
      rotationSpeed: 2, duration: 0, placementCooldown: 0, turretFireRate: 0, armTime: 0,
    },
    cooldownTimer: 0, level: 1, activeTimer: 0, placedCount: 0, rotationAngle: 0,
  });
  return true;
});
console.log('windwheel injected:', ok);

for (let i = 0; i < 2; i++) {
  await new Promise((r) => setTimeout(r, i === 0 ? 800 : 1000));
  await page.screenshot({ path: `/tmp/fireworld-shots/ww-${i}.png` });
}

// 紫色像素普查：刀刃紫 + 粒子浅紫，亮度 > 背景
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
for (const f of ['ww-0', 'ww-1']) {
  const { w, h, data } = decodePng(readFileSync(`/tmp/fireworld-shots/${f}.png`));
  let purple = 0, brightBlue = 0;
  const rows = new Set();
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    // 刀刃/粒子紫：红蓝偏高、绿低
    if (r > 110 && b > 150 && g < 190 && g > 40 && b > r - 30) {
      purple++;
      rows.add(Math.floor(i / w / 20));
    }
    if (b > 200 && r < 150 && g < 200) brightBlue++;
  }
  console.log(`${f}: purple=${purple} brightBlue=${brightBlue} rowsSpan=${rows.size * 20}px`);
}

await browser.close();