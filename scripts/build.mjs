import { mkdir, cp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
const files = [
  'index.html',
  'confidentialite.html',
  'conditions.html',
  'informations.css',
  'start.js',
  'resident-app.js',
  'messages-ui.js',
  'search.js',
  'html.js',
  'push-ui.js',
  'notification-links.js',
  'resident.css',
  'icons.js',
  'api-client.js',
  'auth.js',
  'auth-ui.js',
  'photos.js',
  'gpx.js',
  'trail-location.js',
  'trail-map.js',
  'trail-api.js',
  'trails-ui.js',
  'art.js',
  'style.css',
  'manifest.webmanifest',
  'assets',
  'vendor',
];
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const file of files) await cp(file, `dist/${file}`, { recursive: true });
await build({
  entryPoints: ['auth.js'],
  outfile: 'dist/auth.js',
  bundle: true,
  external: ['./api-client.js'],
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
});
const hash = createHash('sha256');
async function hashFile(file) {
  hash.update(file);
  hash.update(await readFile(file));
}
for (const file of [...files, 'sw.js', 'package-lock.json']) {
  if (['assets', 'vendor'].includes(file)) {
    for (const entry of (await readdir(file, { recursive: true, withFileTypes: true }))
      .filter((e) => e.isFile())
      .map((e) => `${e.parentPath}/${e.name}`)
      .sort())
      await hashFile(entry);
  } else await hashFile(file);
}
const sw = (await readFile('sw.js', 'utf8')).replace(
  'premeyzel-static-v1',
  `premeyzel-static-${hash.digest('hex').slice(0, 12)}`,
);
await writeFile('dist/sw.js', sw);
await writeFile('dist/.nojekyll', '');
console.log('Production app built in dist/');
