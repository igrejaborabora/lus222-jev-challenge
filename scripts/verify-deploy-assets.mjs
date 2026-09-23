import { access, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const requiredAssets = [
  'public/src/lus222.js',
  'public/src/turntable.js',
  'public/src/world.js',
];

await Promise.all(requiredAssets.map((path) => access(new URL(path, root))));

for (const path of ['public/src/world.js', 'public/src/turntable.js']) {
  const source = await readFile(new URL(path, root), 'utf8');
  if (!/from ['"]\.\/lus222\.js['"]/.test(source)) {
    throw new Error(`${path} não importa ./lus222.js`);
  }
}

console.log('Assets estáticos do LUS-222 validados.');
