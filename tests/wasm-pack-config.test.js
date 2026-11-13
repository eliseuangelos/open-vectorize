const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cargoToml = fs.readFileSync(path.join(__dirname, '../wasm/Cargo.toml'), 'utf8');
const releaseSection = cargoToml.match(/\[package\.metadata\.wasm-pack\.profile\.release\]([\s\S]*?)(?=\n\[|$)/);

assert.ok(releaseSection, 'Cargo.toml deve declarar o perfil release do wasm-pack');
assert.match(
  releaseSection[1],
  /^\s*wasm-opt\s*=\s*false\s*$/m,
  'a otimização wasm-opt deve ficar desativada para evitar incompatibilidade com bulk-memory/nontrapping conversions'
);

console.log('OK — wasm-pack release não executa wasm-opt; correção para erro de validação WASM presente.');
