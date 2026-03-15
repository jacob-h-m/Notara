const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const _pngToIco = require('png-to-ico');
const pngToIco = _pngToIco.default || _pngToIco;
const _icns = require('icns');
const icns = (_icns && (_icns.default || _icns)) || null;

(async function(){
  const src = path.resolve(__dirname, '..', 'assets', 'logo.svg');
  const outDir = path.resolve(__dirname, '..', 'assets');
  if(!fs.existsSync(src)){
    console.error('Source SVG not found:', src);
    process.exit(2);
  }
  const sizes = [16,32,48,256,512];
  const tempPngs = [];
  for(const s of sizes){
    const pngPath = path.join(outDir, `icon-${s}.png`);
    await sharp(src).resize(s, s).png().toFile(pngPath);
    tempPngs.push(pngPath);
  }
  // create ico (uses 256 and below)
  const icoPath = path.join(outDir, 'icon.ico');
  // create ico (uses 256 and below)
  const icoSources = tempPngs.filter(p => !p.includes('512'));
  const buf = await pngToIco(icoSources);
  fs.writeFileSync(icoPath, buf);

  // create icns using icns package from PNG 512 (if available)
  const icnsPath = path.join(outDir, 'icon.icns');
  const png512 = path.join(outDir, 'icon-512.png');
  if (icns && typeof icns === 'function') {
    await icns(png512, icnsPath);
  } else {
    // fallback: write the 512 PNG as icon.icns placeholder (electron-builder can accept png for mac in some configs)
    fs.copyFileSync(png512, icnsPath);
  }

  // write a large png for linux
  const pngPath = path.join(outDir, 'icon.png');
  await sharp(src).resize(512,512).png().toFile(pngPath);

  console.log('Icons generated:', icoPath, icnsPath, pngPath);
})();