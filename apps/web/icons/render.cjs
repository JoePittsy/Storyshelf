// Renders the PNG icons in public/ from the SVGs here. Needs Playwright with Chromium:
//   pnpm --filter @joepittsy/ui exec node ../../apps/web/icons/render.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const here = __dirname, pub = path.join(here, '..', 'public');
const jobs = [
  ['app-icon.svg', 'apple-touch-icon.png', 180],
  ['app-icon.svg', 'icon-192.png', 192],
  ['app-icon.svg', 'icon-512.png', 512],
  ['app-icon-maskable.svg', 'icon-maskable-512.png', 512],
];
(async () => {
  const b = await chromium.launch();
  for (const [svg, out, size] of jobs) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    const src = fs.readFileSync(path.join(here, svg)).toString('base64');
    await p.setContent(`<body style="margin:0"><img src="data:image/svg+xml;base64,${src}" width="${size}" height="${size}" style="display:block">`);
    await p.screenshot({ path: path.join(pub, out) });
    await p.close();
    console.log(`${out} (${size}px)`);
  }
  await b.close();
})();
