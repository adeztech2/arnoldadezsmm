import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
let errors = 0;
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.status) { process.stderr.write(result.stderr); errors++; }
    }
  }
}
scan(join(root, 'server'));
if (existsSync(join(root, 'public'))) scan(join(root, 'public'));
for (const file of ['public/index.html', 'vercel.json', 'render.yaml']) {
  if (!existsSync(join(root, file))) { process.stderr.write(`Missing ${file}\n`); errors++; }
}
if (existsSync(join(root, 'vercel.json'))) JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
process.stdout.write(`Syntax and distribution checks: ${errors ? 'failed' : 'passed'}\n`);
process.exitCode = errors ? 1 : 0;
