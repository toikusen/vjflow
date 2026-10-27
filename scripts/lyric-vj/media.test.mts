// npx tsx --test scripts/lyric-vj/media.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blackSpans } from './media.mts';

test('blackSpans reads every span blackdetect printed', () => {
  const log = '[blackdetect @ 0x1] black_start:170.2 black_end:255.133 black_duration:84.9\nframe=1\n[blackdetect @ 0x1] black_start:0 black_end:3.5 black_duration:3.5';
  assert.deepEqual(blackSpans(log), [[170.2, 255.133], [0, 3.5]]);
  assert.deepEqual(blackSpans('nothing'), []);
});

test('a drawn horizon band becomes a mask cropped to its top', async () => {
  const { keyStrip } = await import('./media.mts');
  const sharp = (await import('sharp')).default;
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'hz-'));
  // white sky over a black band from row 60 of 100
  const px = Buffer.alloc(100 * 100 * 3, 255);
  for (let y = 60; y < 100; y++) px.fill(0, y * 300, (y + 1) * 300);
  await sharp(px, { raw: { width: 100, height: 100, channels: 3 } }).jpeg({ quality: 95 }).toFile(join(dir, 'a.jpg'));
  await keyStrip(join(dir, 'a.jpg'), join(dir, 'a.png'));
  const { data, info } = await sharp(join(dir, 'a.png')).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  assert.ok(info.height >= 40 && info.height <= 46);
  assert.equal(data[3], 0); // sky above the band is clear
  assert.equal(data[(info.height - 1) * info.width * 4 + 3], 255); // the band is solid
});
