# Relatório de testes — AngelosOpenVectorize 2.0.0

**Data:** 13/11/2026  
**Ambiente disponível:** Node.js 22.16.0, npm 10.9.2.  
**Limitação de compilação:** Rust/Cargo/wasm-pack não estão instalados; o ambiente também não resolve DNS para baixar dependências.  
**Estado:** testes JavaScript, adaptador e sintaxe aprovados; compilação e execução efetiva do VTracer WASM pendentes.

## Testes executados nesta entrega

| Verificação | Resultado | Observação |
|---|---|---|
| Sintaxe dos arquivos JavaScript | **Aprovado** | `npm run check` executado sem erros |
| Motor de compatibilidade anterior | **Aprovado** | Quatro cenários, geometria SVG e validação de entrada |
| Mapeamento dos quatro perfis para VTracer | **Aprovado** | `tests/vtracer-config.test.js` |
| Pré-processamento RGBA | **Aprovado** | Cinza quantizado, transparência e composição sobre branco |
| Worker como módulo ES | **Aprovado no contrato Node.js** | Import assíncrono do módulo WASM e fallback sem o pacote; navegador não validado |
| Conversão VTracer em WASM | **Não validada nesta sessão** | Exige `npm run build:wasm` com Rust e wasm-pack |
| SVG produzido pelo VTracer | **Não validado nesta sessão** | O binário não pôde ser compilado/carregado neste ambiente |
| Exportações SVG/PNG e interface | Herdadas da aplicação anterior | Precisam de nova validação visual após build do novo motor |
| Preparação do site estático | **Aprovado** | `npm run build:site` criou `dist/` com HTML, CSS, JS, assets e `.nojekyll` |
| Servidor HTTP local | **Smoke test aprovado** | `/` e o Worker `.mjs` responderam HTTP 200; o módulo WASM respondeu 404 esperado porque ainda não foi compilado |
| Workflow GitHub Pages | Criado, não executado | `.github/workflows/pages.yml` compila o WASM e publica automaticamente após push em `main` ou `master` |

## Critérios para validar depois da compilação

1. Execute `npm run build:wasm` e confirme a presença de `.js` e `.wasm` em `js/wasm/pkg/`.
2. Inicie com `npm run serve` e abra o console do navegador.
3. Importe um PNG transparente e um JPG.
4. Teste P&B com limiar fixo e adaptativo.
5. Teste escala de cinza em 4 e 8 níveis.
6. Teste colorido com `watershed`/`cutout` em um desenho infantil de regiões chapadas.
7. Teste foto estilizada com paleta reduzida.
8. Confirme que o chip mostra `VTRACER WASM · ATIVO` após a primeira conversão.
9. Baixe o SVG e abra em Inkscape ou outro editor vetorial.
10. Confirme que o SVG contém caminhos reais e não contém `<image>` ou `data:image`.
11. Verifique a exportação PNG, a comparação antes/depois e a responsividade.
12. Teste a URL do projeto no GitHub Pages, inclusive sob subdiretório.

## Observações técnicas

- O adaptador Rust chama `vtracer::Config::build()` e `Pipeline::to_svg()` com o pacote fixado em `1.0.0-alpha.4`.
- O worker tenta carregar o artefato local `js/wasm/pkg/angelos_open_vectorize_wasm.js`. A ausência do pacote causa fallback explícito, sem fingir que VTracer foi executado.
- O perfil colorido usa o `cutout`/mosaico compartilhado para minimizar frestas entre regiões adjacentes; foto usa o modo `stacked`.
- O perfil de tons de cinza quantiza os pixels para tons discretos antes de enviar os dados RGBA ao VTracer.
- A saída final conserva `viewBox` do rastreamento e define os atributos de dimensão física de acordo com a imagem original.
- O fallback anterior permanece para não deixar o aplicativo sem conversão antes da geração do WebAssembly. Ele não tem a mesma qualidade esperada do VTracer.
