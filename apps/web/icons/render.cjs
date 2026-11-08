// Builds the icons in public/ from the templates here. Needs Playwright with Chromium:
//   pnpm --filter @joepittsy/ui exec node ../../apps/web/icons/render.cjs
//
// For every colour in book-colours.json it writes public/book/<id>/: apple-touch-icon.png (180), icon-192.png,
// icon-512.png, icon-maskable-512.png and manifest.webmanifest. The first colour is the default, also written to
// the root of public/ (the same four PNGs, and icon.svg for the browser tab) for a visitor who hasn't picked one.
// public/manifest.webmanifest is the template for the per-colour manifests; edit that one, not the copies.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const here = __dirname;
const pub = path.join(here, '..', 'public');
const colours = JSON.parse(fs.readFileSync(path.join(here, 'book-colours.json'), 'utf8'));

const recolour = (svg, hex) => svg.replace(/\.book \{ fill: [^;]+; \}/, `.book { fill: ${hex}; }`);
// Maskable: the same art at 80% about its centre, inside Android's 40%-radius safe zone; the ground stays full bleed.
const maskable = (svg) =>
  svg.replace(
    /(<rect width="512" height="512" fill="#111418"\/>)([\s\S]*)<\/svg>/,
    '$1<g transform="translate(256 259) scale(.8) translate(-256 -259)">$2</g></svg>'
  );

const icon = fs.readFileSync(path.join(here, 'app-icon.svg'), 'utf8');
const favicon = fs.readFileSync(path.join(here, 'favicon.svg'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(pub, 'manifest.webmanifest'), 'utf8'));

const pngs = (svg) => [
  [svg, 'apple-touch-icon.png', 180],
  [svg, 'icon-192.png', 192],
  [svg, 'icon-512.png', 512],
  [maskable(svg), 'icon-maskable-512.png', 512],
];
const manifestFor = (dir) => ({
  ...manifest,
  icons: manifest.icons.map((i) => ({ ...i, src: `${dir}/${path.basename(i.src)}` })),
});

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const render = async (svg, file, size) => {
    await p.setViewportSize({ width: size, height: size });
    const src = Buffer.from(svg).toString('base64');
    await p.setContent(
      `<body style="margin:0"><img src="data:image/svg+xml;base64,${src}" width="${size}" height="${size}" style="display:block">`
    );
    await p.screenshot({ path: file });
  };

  for (const c of colours) {
    const dir = path.join(pub, 'book', c.id);
    fs.mkdirSync(dir, { recursive: true });
    for (const [svg, name, size] of pngs(recolour(icon, c.hex))) await render(svg, path.join(dir, name), size);
    fs.writeFileSync(path.join(dir, 'manifest.webmanifest'), JSON.stringify(manifestFor(`/book/${c.id}`), null, 2) + '\n');
    console.log(`book/${c.id}/ (${c.name}, ${c.hex})`);
  }

  const def = colours[0];
  for (const [svg, name, size] of pngs(recolour(icon, def.hex))) await render(svg, path.join(pub, name), size);
  fs.writeFileSync(path.join(pub, 'icon.svg'), recolour(favicon, def.hex));
  console.log(`root icons: ${def.name} (the default)`);
  await b.close();
})();
