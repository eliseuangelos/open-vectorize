# Histórico de versões

## 3.2.2 — 14/11/2026

- Corrigido: o vetor era limitado a 880×610 px enquanto o original usava toda a área, então os dois ficavam com tamanhos diferentes e o vetor parecia cortado na comparação. Agora ocupam a mesma área e ficam alinhados.
- Corrigido: o painel de visualização passava da altura da janela (parte do vetor ficava abaixo da dobra). Em telas com mais de 680 px de largura o painel agora cabe na janela e acompanha a rolagem das configurações; após a primeira vetorização a página rola até ele.
- Ícone do tema no padrão dos sites: sol no tema claro e lua no tema escuro (antes mostrava o tema de destino).
- Teste de ponta a ponta com o caminho do VTracer simulado (módulo WASM falso interceptado só no teste) para imagens de 4000×3000 e 3000×6000.

## 3.2.1 — 14/11/2026

- Corrigido: imagens maiores que a resolução de trabalho (640 a 1100 px) apareciam cortadas. O SVG do VTracer não tem `viewBox`; o worker aplicava o tamanho original sem ele, e o desenho ocupava só um canto. Novo módulo `js/svg-dimensions.js` garante o `viewBox` no espaço de coordenadas de trabalho (afeta a prévia, o SVG e o PNG exportados).
- Corrigido: em imagens muito altas, a trilha da grade das camadas seguia o tamanho intrínseco do conteúdo; a prévia ficava deslocada e o original ficava com o dobro da altura da área, cortados pelo `overflow: hidden`. As trilhas agora seguem o tamanho da área.
- Novos testes: `tests/svg-dimensions.test.js` e, no e2e, imagens de 4000×3000 e 3000×6000 inteiras na tela e renderização do canto inferior direito.

## 3.2.0 — 14/11/2026

- Ativos oficiais da marca (`brand-symbol.svg`, `favicon.svg`, `apple-touch-icon.png`) copiados sem alteração para `assets/icons/`; o `favicon.svg` anterior foi substituído. Hashes SHA-256 registrados em `tests/brand-assets.sha256` e conferidos pelo teste e2e.
- Identidade EXECUTIVE DIGITAL aplicada por tokens em `css/themes.css`: tema claro institucional como padrão e variante escura; fim dos gradientes do símbolo, do título e do botão principal; rótulos principais em caixa normal; pilha tipográfica Inter/Manrope/IBM Plex Mono com fallbacks de sistema; símbolo oficial no cabeçalho; créditos e `©` com ano automático no rodapé.
- Novo editor de vetor (`js/editor.js`): selecionar, mover, trocar cor, excluir, desfazer e refazer; as edições alimentam o SVG exportado, o PNG e o código exibido. Recalcular o vetor descarta as edições e avisa.
- Rótulo do motor passou a refletir o que de fato rodou (`Reserva JS + Angelos Geometry` quando o WASM não foi carregado).
- CI: nova etapa que falha se o `.wasm` não for produzido ou não tiver a assinatura WebAssembly.
- Barra do canvas passou a quebrar linha; corrigido estouro horizontal em 1024 px.
- Novo teste de ponta a ponta no navegador (`npm run test:e2e`, requer Playwright).

## 3.1.0 — 13/11/2026

- Adicionada validação raster de segmentos de linha: a geometria candidata é comparada com as transições de cor na imagem original antes de ser reescrita.
- Adicionado ajuste de reta por mínimos quadrados ortogonais e interseção de linhas em junções.
- Adicionada amostragem bilinear subpixel na direção normal da borda.
- Curvas originais são preservadas quando o raster não fornece evidência suficiente para retificá-las.
- Perfil colorido alterado para `color-cluster` + `cutout`; `watershed` fica reservado ao modo de foto estilizada.
- Adicionados testes sintéticos para uma curva ondulada que representa uma borda reta, uma linha formada por várias Béziers e preservação de um círculo.
- Interface informa quantas retas foram efetivamente corrigidas.

## 3.0.0

- Integração VTracer/Rust/WebAssembly preparada.
- Workflow do GitHub Actions para compilar e publicar no GitHub Pages.
- Adicionado fallback local e correção geométrica inicial dos caminhos SVG.
