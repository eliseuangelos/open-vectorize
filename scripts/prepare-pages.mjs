import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const publicItems = ['index.html', 'assets', 'css', 'js'];

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

for (const item of publicItems) {
  await fs.cp(path.join(root, item), path.join(output, item), { recursive: true });
}

// Disable Jekyll processing so WebAssembly and generated assets are served as-is.
await fs.writeFile(path.join(output, '.nojekyll'), '');
console.log('Site estático preparado na pasta dist/.');
