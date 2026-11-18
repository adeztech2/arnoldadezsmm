import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const publicDir = join(process.cwd(), ".output", "public");
const assetsDir = join(publicDir, "assets");
const assets = await readdir(assetsDir);
const entry = assets.find((name) => /^index-.*\.js$/.test(name));
const stylesheet = assets.find((name) => /^styles-.*\.css$/.test(name));

if (!entry || !stylesheet) {
  throw new Error("Could not find the built client entry or stylesheet in .output/public/assets.");
}

await mkdir(publicDir, { recursive: true });
await writeFile(
  join(publicDir, "index.html"),
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

console.log(`Created .output/public/index.html using ${entry}`);
