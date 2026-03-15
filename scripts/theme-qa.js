const fs = require('fs');
const path = require('path');

function readTheme(name) {
  const p = path.join(process.cwd(), 'themes', name);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

function parseColor(s) {
  if (!s || typeof s !== 'string') return null;
  s = s.trim();
  // hex #rgb or #rrggbb
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return [r, g, b];
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0,2), 16);
      const g = parseInt(hex.slice(2,4), 16);
      const b = parseInt(hex.slice(4,6), 16);
      return [r, g, b];
    }
  }
  // rgb() or rgba()
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map(x=>x.trim());
    const r = parseFloat(parts[0]);
    const g = parseFloat(parts[1]);
    const b = parseFloat(parts[2]);
    return [r, g, b];
  }
  return null;
}

function luminance([r,g,b]){
  const srgb = [r,g,b].map(v => v/255);
  const lin = srgb.map(c => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4));
  return 0.2126*lin[0] + 0.7152*lin[1] + 0.0722*lin[2];
}

function contrast(rgb1, rgb2){
  const L1 = luminance(rgb1);
  const L2 = luminance(rgb2);
  const light = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (light + 0.05) / (dark + 0.05);
}

function checkTheme(name, theme) {
  const results = [];
  const keysNeeded = ['--text-primary','--text-muted','--surface-900'];
  keysNeeded.forEach(k=>{
    if (!(k in theme)) results.push({key:k,ok:false,reason:'missing'});
  });
  if (results.length) return {name,ok:false,details:results};
  const text = parseColor(theme['--text-primary']);
  const muted = parseColor(theme['--text-muted']);
  const bg = parseColor(theme['--surface-900']);
  if (!text || !muted || !bg) return {name,ok:false,details:[{reason:'parse-failed'}]};
  const c1 = contrast(text,bg);
  const c2 = contrast(muted,bg);
  return {name,ok: c1>=4.5 && c2>=3.0, contrast:{primary:c1,muted:c2}};
}

function main(){
  const dark = readTheme('dark.json');
  const light = readTheme('light.json');
  if (!dark) { console.error('dark.json missing or invalid'); process.exit(2) }
  if (!light) { console.error('light.json missing or invalid'); process.exit(2) }
  const rDark = checkTheme('dark', dark);
  const rLight = checkTheme('light', light);
  console.log('Dark theme check:', JSON.stringify(rDark, null, 2));
  console.log('Light theme check:', JSON.stringify(rLight, null, 2));
  const fail = !(rDark.ok && rLight.ok);
  if (fail) {
    console.error('Theme QA failed: contrast thresholds not met or missing keys.');
    process.exit(3);
  }
  console.log('Theme QA passed: contrast thresholds OK.');
}

main();
