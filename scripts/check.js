// Syntax check for every module in web/js and the scripts, without running them.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const files = ['web/js', 'scripts'].flatMap(d => fs.readdirSync(d).filter(f => f.endsWith('.js')).map(f => path.join(d, f)))
  .concat(['web/config.js', 'web/sw.js']);
let failed = false;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { failed = true; console.error(String(e.stderr)); }
}
['web/manifest.webmanifest', 'web/vercel.json'].forEach(f => { try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { failed = true; console.error(f, e.message); } });
if (failed) process.exit(1);
console.log(`syntax ok (${files.length} files)`);
