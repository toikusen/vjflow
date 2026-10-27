// Invites a person to the beta from the terminal and prints their login link (the first admin is made this way).
// Run it while the beta server is stopped: the server keeps the records in memory and would overwrite the file.
// npx tsx scripts/lyric-vj/beta/invite.mts "<name>" [--limit 25] [--admin] [--url https://…]
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { invite, load, save } from './store.mts';

const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { limit: { type: 'string', default: '25' }, admin: { type: 'boolean', default: false }, url: { type: 'string', default: process.env.VJ_BETA_URL ?? 'http://127.0.0.1:4320' } } });
const name = positionals[0]?.trim();
if (!name) throw new Error('usage: invite.mts "<name>" [--limit 25] [--admin] [--url …]');
const file = resolve(process.env.VJ_BETA_ROOT ?? 'out/beta', 'db.json');
const db = load(file);
const { token } = invite(db, name, Number(a.limit), a.admin);
save(file, db);
console.log(`${a.url}/beta/login?t=${token}`);
