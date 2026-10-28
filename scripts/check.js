// Syntax check for everything clasp pushes: all src/*.gs and the page script in src/app.html.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'src');
let failed = false;
const check = (name, code) => {
  try { new Function(code); } catch (e) { failed = true; console.error(`${name}: ${e.message}`); }
};
const gs = fs.readdirSync(dir).filter(f => f.endsWith('.gs'));
check('all .gs together', gs.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n'));
gs.forEach(f => check(f, fs.readFileSync(path.join(dir, f), 'utf8')));
const html = fs.readFileSync(path.join(dir, 'app.html'), 'utf8');
(html.match(/<script>([\s\S]*?)<\/script>/g) || []).forEach((s, i) => check(`app.html script ${i}`, s.replace(/^<script>|<\/script>$/g, '')));
JSON.parse(fs.readFileSync(path.join(dir, 'appsscript.json'), 'utf8'));
if (failed) process.exit(1);
console.log('syntax ok');
