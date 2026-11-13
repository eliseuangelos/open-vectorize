import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasmCrate = path.join(root, 'wasm');
const args = [
  'build',
  '--target', 'web',
  '--release',
  '--out-dir', '../js/wasm/pkg',
  '--out-name', 'angelos_open_vectorize_wasm'
];

const result = spawnSync('wasm-pack', args, {
  cwd: wasmCrate,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (result.error?.code === 'ENOENT') {
  console.error('\nwasm-pack não foi encontrado. Instale Rust, o target wasm32-unknown-unknown e wasm-pack.');
  console.error('Instruções: https://rustwasm.github.io/wasm-pack/installer/');
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('\nWASM do VTracer compilado em js/wasm/pkg/.');
