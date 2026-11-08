// Builds the icons in public/ from the templates here. Needs Playwright with Chromium:
//   pnpm --filter @joepittsy/ui exec node ../../apps/web/icons/render.cjs [--book=#f2a65a]
// --book recolours the tallest spine ("the book") in every icon; leave it out for the default off-white.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const here = __dirname;
const pub = path.join(here, '..', 'public');
const arg = process.argv.find((a) => a.startsWith('--book='));
const book = arg ? arg.slice('--book='.length) : null;
if (book && !/^#[0-9a-f]{3,8}$/i.test(book)) throw new Error(`--book wants a hex colour, got ${book}`);

const read = (f) => {
  const s = fs.readFileSync(path.join(here, f), 'utf8');
  return book ? s.replace(/\.book \{ fill: [^;]+; \}/, `.book { fill: ${book}; }`) : s;
};
// Maskable: the same art at 80% about its centre, inside Android's 40%-radius safe zone; the ground stays full bleed.
const maskable = (svg) =>
  svg.replace(/(<rect width="512" height="512" fill="#111418"\/>)([\s\S]*)<\/svg>/, '$1<g transform="translate(256 259) scale(.8) translate(-256 -259)">$2</g></svg>');

const icon = read('app-icon.svg');
const jobs = [
  [icon, 'apple-touch-icon.png', 180],
  [icon, 'icon-192.png', 192],
  [icon, 'icon-512.png', 512],
  [maskable(icon), 'icon-maskable-512.png', 512],
];

(async () => {
  fs.writeFileSync(path.join(pub, 'icon.svg'), read('favicon.svg'));
  console.log('icon.svg (favicon)');
  const b = await chromium.launch();
  for (const [svg, out, size] of jobs) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    const src = Buffer.from(svg).toString('base64');
    await p.setContent(`<body style="margin:0"><img src="data:image/svg+xml;base64,${src}" width="${size}" height="${size}" style="display:block">`);
    await p.screenshot({ path: path.join(pub, out) });
    await p.close();
    console.log(`${out} (${size}px)`);
  }
  await b.close();
  console.log(book ? `The book is ${book}.` : 'The book is the default off-white.');
})();
