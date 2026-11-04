// Self-hosted fonts: every family in fonts.ts (and the site's own UI faces) fetched once from Google Fonts in its
// woff2 slices, written to out/fonts/<slug>/ with a stylesheet per family (out/fonts/<slug>.css) whose URLs point at
// /fonts/. The beta server and the render page serve that folder at /fonts/. A family added to fonts.ts is mirrored by
// running this again; files already there are kept. Each family's licence (OFL.txt from google/fonts) is saved beside it.
// npx tsx scripts/fonts-mirror.mts [--only "Family A,Family B"] [--out out/fonts]
import { existsSync, mkdirSync, statfsSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { FONTS, fontSlug, UI_FONTS } from '../src/app/lyric-vj/fonts';

const { values: a } = parseArgs({ options: { only: { type: 'string' }, out: { type: 'string', default: 'out/fonts' } } });
const out = a.out!;
// a desktop Chrome: Google answers it with woff2 split by unicode-range (a whole CJK face is megabytes)
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MIN_FREE = Number(process.env.MIN_FREE_GB ?? 2.5) * 1e9;
const OFL_DIR: Record<string, string> = { 'M PLUS Rounded 1c': 'roundedmplus1c' };
const free = () => { const s = statfsSync(out); return s.bavail * s.bsize; };

const families = [...FONTS.map((f) => ({ family: f.family, weights: f.weights })), ...UI_FONTS].filter((f) => !a.only || a.only.split(',').map((x) => x.trim()).includes(f.family));
mkdirSync(out, { recursive: true });
let bytes = 0;
const report: string[] = [];
for (const f of families) {
  if (free() < MIN_FREE) { console.error(`stopped: under ${MIN_FREE / 1e9} GB free before ${f.family}`); process.exit(2); }
  const slug = fontSlug(f.family);
  const wght = f.weights.length > 1 || f.weights[0] !== 400 ? `:wght@${f.weights.join(';')}` : '';
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${f.family.replace(/ /g, '+')}${wght}&display=block`, { headers: { 'user-agent': UA } })).text();
  if (!css.includes('@font-face')) { report.push(`${f.family}: no stylesheet (${css.slice(0, 80).replace(/\s+/g, ' ')})`); continue; }
  mkdirSync(join(out, slug), { recursive: true });
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
  let local = css;
  for (const u of urls) {
    // (the slice file names are unique within a family; the path keeps the font's own id so two weights never collide)
    const name = u.split('/').slice(-2).join('-').replace(/[^\w.-]/g, '_');
    const file = join(out, slug, name);
    if (!existsSync(file)) {
      const r = await fetch(u);
      if (!r.ok) { report.push(`${f.family}: ${r.status} for ${basename(u)}`); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      writeFileSync(file, buf);
      bytes += buf.length;
    }
    local = local.split(u).join(`/fonts/${slug}/${name}`);
  }
  writeFileSync(join(out, `${slug}.css`), local);
  // the licence travels with the files (SIL OFL needs its text alongside a redistributed font)
  const ofl = join(out, slug, 'OFL.txt');
  if (!existsSync(ofl) && !existsSync(join(out, slug, 'LICENSE.txt'))) {
    // (google/fonts names a few folders its own way)
    const dir = OFL_DIR[f.family] ?? f.family.toLowerCase().replace(/[^a-z0-9]/g, '');
    const r = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${dir}/OFL.txt`);
    // (a few Google families are Apache-2.0: their licence is LICENSE.txt under apache/)
    const apache = r.ok ? undefined : await fetch(`https://raw.githubusercontent.com/google/fonts/main/apache/${dir}/LICENSE.txt`);
    if (r.ok) writeFileSync(ofl, await r.text());
    else if (apache?.ok) writeFileSync(join(out, slug, 'LICENSE.txt'), await apache.text());
    else report.push(`${f.family}: no OFL.txt at ofl/${dir} (check its licence by hand)`);
  }
  console.log(`${f.family}: ${urls.length} files`);
}
console.log(`mirrored ${families.length} families, ${(bytes / 1e6).toFixed(0)} MB new`);
for (const r of report) console.log(`note: ${r}`);
