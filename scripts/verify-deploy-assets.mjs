import { access, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const requiredAssets = [
  'public/lab-choice.css',
  'public/ai-landing.css',
  'public/src/ai-landing.js',
  'public/src/ai-landing-ui.js',
  'public/src/landing-contract.js',
  'public/flight-surface.css',
  'public/src/porto-aerial.js',
  'public/src/flight-signature-ui.js',
  'public/src/flight-signature.js',
  'public/terrain/porto/ortho-2025-2048.jpg',
  'public/terrain/porto/ortho-2025-4096.jpg',
  'public/src/lus222.js',
  'public/src/turntable.js',
  'public/src/world.js',
  'public/cockpit.css',
  'public/lab.css',
  'public/flight-lab.css',
  'public/src/lab-ui.js',
  'public/src/flight-lab-ui.js',
  'public/src/flight-training.js',
  'public/src/engine-model.js',
  'public/src/cockpit-frame.js',
  'public/src/runway-reference.js',
  'public/src/pista-visual.js',
  'public/src/porto-reference.js',
  'public/img/flight-lab-preview.jpg',
  'public/img/flight-lab-preview.webm',
  'public/src/cockpit-ui.js',
  'public/src/cockpit-model.js',
  'public/src/cockpit-shell.js',
  'public/src/cockpit-navigation.js',
];

await Promise.all(requiredAssets.map((path) => access(new URL(path, root))));

for (const path of ['public/src/world.js', 'public/src/turntable.js']) {
  const source = await readFile(new URL(path, root), 'utf8');
  if (!/from ['"]\.\/lus222\.js['"]/.test(source)) {
    throw new Error(`${path} não importa ./lus222.js`);
  }
}

console.log('Assets estáticos do LUS-222 validados.');
