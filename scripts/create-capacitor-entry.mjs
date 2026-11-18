import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function existingDirectory(candidates) {
  for (const candidate of candidates) {
    try {
      await access(join(candidate, 'assets'));
      return candidate;
    } catch {
      // Try the next build layout.
    }
  }
  throw new Error('Could not find a built client assets directory for Capacitor.');
}

const publicDir = await existingDirectory([
  join(process.cwd(), 'dist', 'client'),
  join(process.cwd(), '.output', 'public'),
]);
const assetsDir = join(publicDir, 'assets');
const assets = await readdir(assetsDir);
const entry = assets.find((name) => /^index-.*\.js$/.test(name));
const stylesheet = assets.find((name) => /^styles-.*\.css$/.test(name));

if (!entry || !stylesheet) {
  throw new Error('Could not find the built client entry or stylesheet in the Vite output.');
}

await mkdir(publicDir, { recursive: true });
await writeFile(
  join(publicDir, 'index.html'),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0f172a" />
    <title>Adez SMM</title>
    <link rel="stylesheet" href="assets/${stylesheet}" />
  </head>
  <body>
    <script type="module" src="assets/${entry}"></script>
  </body>
</html>
`,
);

console.log(`Created ${publicDir}/index.html using ${entry}`);
