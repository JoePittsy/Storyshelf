// Local fixture art for stories: SVG data URIs, so nothing touches the network and every render is the same.

const svg = (body: string, size = 600) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 600 600">${body}</svg>`
  )}`;

const cover = (id: string, from: string, to: string, shape: string) =>
  svg(
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
      `<rect width="600" height="600" fill="url(#${id})"/>${shape}`
  );

/** Covers: saturated, so the dominant-colour wash has something to pick up. */
export const covers = {
  sunset: cover('a', '#ff7a45', '#7a1f5c', '<circle cx="300" cy="360" r="170" fill="#ffd27a" opacity="0.85"/>'),
  ocean: cover(
    'b',
    '#1f8fff',
    '#0b2a5c',
    '<path d="M0 380 Q150 320 300 380 T600 380 V600 H0Z" fill="#7fd6ff" opacity="0.7"/>'
  ),
  forest: cover('c', '#2fb66a', '#0d3b2a', '<polygon points="300,120 460,460 140,460" fill="#c9f5d8" opacity="0.7"/>'),
  neon: cover(
    'd',
    '#ff3d9a',
    '#3a1fa0',
    '<rect x="170" y="170" width="260" height="260" fill="none" stroke="#7ff" stroke-width="22"/>'
  ),
};

/** A 2:3 print-edition cover with text hard against the top and bottom edges, so any cropping is obvious. */
export const portraitCover = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">` +
    `<defs><linearGradient id="pc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9a441"/><stop offset="1" stop-color="#5c1f2e"/></linearGradient></defs>` +
    `<rect width="400" height="600" fill="url(#pc)"/>` +
    `<rect x="6" y="6" width="388" height="588" fill="none" stroke="#fff3d6" stroke-width="3"/>` +
    `<text x="200" y="40" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="30" fill="#fff3d6">ROBERT JORDAN</text>` +
    `<circle cx="200" cy="300" r="110" fill="#fff3d6" opacity="0.8"/>` +
    `<text x="200" y="580" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="30" fill="#fff3d6">A CROWN OF SWORDS</text></svg>`
)}`;

/** A portrait standing in for a person's photo. */
export const portrait = cover(
  'p',
  '#c98a5c',
  '#3b2a2a',
  '<circle cx="300" cy="230" r="95" fill="#f1d0b4"/><path d="M110 600 Q300 330 490 600Z" fill="#f1d0b4"/>'
);
