import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const svg = await readFile(new URL('../assets/icon.svg', import.meta.url));
await sharp(svg).png().toFile(fileURLToPath(new URL('../assets/icon.png', import.meta.url)));
const foreground = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><g transform="translate(205 205) scale(.6)">${svg.toString().replace(/<svg[^>]*>|<\/svg>|<rect[^>]*\/>/g, '')}</g></svg>`);
await sharp(foreground).png().toFile(fileURLToPath(new URL('../assets/adaptive-icon.png', import.meta.url)));
