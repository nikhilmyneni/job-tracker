// Syntax check for every module in web/js, web/api and the scripts, without running them. Also checks that the
// service worker precaches every module and that the JSON files parse.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const files = ['web/js', 'web/api', 'scripts'].flatMap(d => fs.readdirSync(d).filter(f => f.endsWith('.js')).map(f => path.join(d, f)))
  .concat(['web/config.js', 'web/sw.js']);
let failed = false;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { failed = true; console.error(String(e.stderr)); }
}
['web/manifest.webmanifest', 'web/vercel.json', 'web/package.json'].forEach(f => { try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { failed = true; console.error(f, e.message); } });
const sw = fs.readFileSync('web/sw.js', 'utf8');
fs.readdirSync('web/js').filter(f => f.endsWith('.js')).forEach(f => {
  if (!sw.includes(`'/js/${f}'`)) { failed = true; console.error(`web/sw.js: add '/js/${f}' to SHELL and bump CACHE`); }
});
if (failed) process.exit(1);
console.log(`syntax ok (${files.length} files)`);
