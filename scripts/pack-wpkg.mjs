#!/usr/bin/env node
import { pack } from '../packages/wpkg/src/index.js';
const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: node scripts/pack-wpkg.mjs <srcDir> <out.wpkg>'); process.exit(1); }
const r = await pack(src, out);
console.log(`packed ${r.files} files ${ (r.bytes/1024).toFixed(0)}KB -> ${r.out}`);
