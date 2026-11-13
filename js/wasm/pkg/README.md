# Pacote WebAssembly do VTracer

Os artefatos compilados (`angelos_open_vectorize_wasm.js` e `angelos_open_vectorize_wasm_bg.wasm`) são gerados localmente com:

```bash
npm run build:wasm
```

O binário não é incluído nesta cópia porque a sessão de criação não dispõe de Rust/Cargo/wasm-pack nem de acesso à rede para baixar e compilar as dependências. Até que o build seja executado, a aplicação utiliza o motor de compatibilidade anterior e informa isso na interface.
