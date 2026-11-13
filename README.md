# AngelosOpenVectorize

**AngelosOpenVectorize 3.1** é um vetorizador web gratuito e de código aberto, criado para converter desenhos, ilustrações e logotipos em SVG com geometria editável e correção de linhas validada pela imagem de origem. A aplicação foi projetada para hospedagem estática, incluindo GitHub Pages, sem conta, assinatura ou servidor de processamento.

O motor de rastreamento é o **VTracer 1.0.0-alpha.4**, compilado para WebAssembly e executado em um Web Worker. Em seguida, o **Angelos Geometry** avalia segmentos quase retos contra os pixels originais: só troca uma curva por uma reta quando a transição de cor do raster também sustenta essa decisão. O processamento ocorre localmente no navegador. Um motor de compatibilidade continua disponível caso o pacote WebAssembly não seja carregado.

> **Estado desta entrega:** a nova etapa de validação geométrica por raster está implementada e coberta por testes sintéticos. O código-fonte contém o adaptador Rust/wasm-bindgen e o workflow de compilação do VTracer. O binário `.wasm` não foi compilado novamente nesta sessão porque o ambiente não possui Rust/Cargo/wasm-pack nem acesso DNS para baixar dependências. O workflow do GitHub Pages continua responsável por gerar esse artefato. A interface diferencia VTracer ativo do motor alternativo.

## Funcionalidades

- Importação PNG, JPG/JPEG, WEBP e BMP (conforme os decodificadores do navegador).
- Seleção de arquivos, arrastar e soltar e colagem de imagens.
- Quatro perfis de conversão: preto e branco, escala de cinza, colorido e foto estilizada.
- VTracer com ajuste de curvas `spline` ou `polygon`, composição `stacked`/`cutout`, agrupamento de cores, watershed para imagens complexas, filtro de pequenas regiões e otimização SVG.
- Angelos Geometry: amostragem subpixel da imagem original, identificação de trechos lineares, ajuste de reta por mínimos quadrados ortogonais e interseção de linhas em cantos.
- Validação da correção geométrica: se a borda raster não confirmar uma reta, a curva original é preservada em vez de ser achatada por uma heurística isolada.
- Limiar binário fixo e adaptativo (Bradley–Roth) para desenhos e digitalizações em preto e branco.
- Controles de detalhes, limiar, níveis, quantidade de cores, suavização, ruído, brilho, contraste, saturação e transparência.
- Comparação antes/depois, visualizações original/vetor, fundos configuráveis, zoom e movimentação da prévia.
- Exportação SVG e PNG em 1×, 2× e 4×; fundo transparente, branco ou personalizado.
- Visualização e cópia do código SVG.
- Tema claro/escuro com preferência local.
- Processamento em Web Worker.
- Sem telemetria, cadastro, APIs ou dependências remotas obrigatórias durante o uso.

## Como o motor VTracer é usado

O VTracer é um projeto open source escrito em Rust. A API do adaptador recebe pixels RGBA decodificados no navegador e devolve uma string SVG. O aplicativo não envia a imagem para qualquer servidor.

Os perfis da interface são mapeados assim:

| Perfil | Estratégia | Aplicação típica |
|---|---|---|
| Preto e branco | `clustering=bw`, limiar fixo ou adaptativo; `polygon` ou `spline` | Desenhos para colorir, silhuetas, line art e logos monocromáticos |
| Escala de cinza | Quantização prévia em níveis de cinza + `color-cluster` | Ilustrações em tons e sombras discretas |
| Colorido | `color-cluster` + composição `cutout`/mosaico + spline | Logotipos e ilustrações com regiões chapadas e paleta definida |
| Foto estilizada | preset `photo` + watershed + paleta limitada + composição `stacked` | Posterização e interpretação vetorial aproximada de fotografias |

O modo `cutout` do VTracer 1.0 forma uma tesselação sem frestas, ajustando uma fronteira compartilhada entre regiões adjacentes. O modo `stacked` empilha as formas na ordem de pintura e pode ser preferível quando há sobreposição de objetos. O perfil colorido usa agrupamento de cores em vez de watershed para reduzir a fragmentação de áreas chapadas; watershed fica reservado ao perfil de fotos.

## Angelos Geometry — reconstrução de retas com evidência raster

Um rastreador convencional pode transformar uma borda reta em vários trechos de curva, principalmente quando a imagem tem antialiasing, compressão ou pequenas variações de cor. Simplesmente aumentar a suavização pode deformar círculos, cantos arredondados e contornos orgânicos.

O Angelos Geometry usa a própria imagem como evidência: 

1. Lê o `d` dos caminhos SVG e encontra grupos de segmentos que poderiam formar uma reta.
2. Usa a cor de preenchimento do caminho para identificar qual lado da borda pertence à região.
3. Faz amostragem bilinear dos pixels em passos subpixel ao longo da normal da linha.
4. Localiza a transição entre o lado interno e o externo da região.
5. Ajusta uma reta por mínimos quadrados ortogonais e mede o maior desvio dos pontos de borda.
6. Só substitui a curva por uma reta quando o erro raster medido fica dentro da tolerância.
7. Quando duas retas corrigidas se encontram, calcula a interseção para recuperar o canto sem pequenas folgas.

Se a imagem indicar uma borda realmente curva, ou se não houver evidência suficiente, o segmento original é mantido. Isso evita que a correção geométrica transforme indiscriminadamente curvas suaves em polígonos. O controle **Correção de linhas retas** permite aumentar ou desativar a tolerância. No perfil Foto estilizada ele é desativado para evitar simplificações indevidas em bordas orgânicas.

A técnica é determinística e não usa modelo de IA, rede externa ou serviço pago. Ela melhora especialmente logotipos, ícones, formas planas e desenhos com segmentos retilíneos; não equivale à reconstrução semântica de uma ferramenta comercial treinada por deep learning.

A qualidade depende da imagem de entrada. Imagens de origem muito pequenas, desfocadas, comprimidas ou com contornos ambíguos podem continuar exigindo retoques manuais. A vetorização de fotos não produz uma cópia fotográfica perfeita.

## Compilar o WebAssembly do VTracer

### Pré-requisitos

- Rust instalado pelo rustup.
- Target `wasm32-unknown-unknown`.
- `wasm-pack`.
- Acesso à internet durante a primeira compilação para baixar as dependências Rust.

Instale o target e o wasm-pack:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

Na raiz deste projeto, execute:

```bash
npm run build:wasm
```

O script executa `wasm-pack build` com alvo `web`. A etapa opcional `wasm-opt` está desativada no perfil release porque a versão empacotada pelo `wasm-pack` pode rejeitar instruções WebAssembly modernas (como `memory.copy`, `memory.fill` e conversões float não trapping) usadas pelo compilador Rust. Isso não desativa esses recursos no módulo nem impede `wasm-bindgen` de gerar o pacote; apenas deixa de aplicar a otimização adicional do Binaryen. Os arquivos serão gerados em:

```text
js/wasm/pkg/
├── angelos_open_vectorize_wasm.js
├── angelos_open_vectorize_wasm_bg.wasm
└── ...arquivos auxiliares gerados pelo wasm-pack
```

Não renomeie o JavaScript ou o `.wasm` gerados: o worker espera os nomes definidos no script.

Depois da compilação, ao carregar uma imagem, o worker tenta iniciar o VTracer primeiro. Se não localizar o módulo, utiliza o motor de compatibilidade e a interface exibe o estado `MOTOR ALTERNATIVO · WASM AUSENTE`.

## Executar localmente

Requer Node.js 18 ou superior e um navegador moderno.

```bash
npm test
npm run check
npm run serve
```

Abra `http://127.0.0.1:8000`.

Também pode usar:

```bash
python -m http.server 8000
```

Para habilitar o motor VTracer antes da execução, rode primeiro `npm run build:wasm`.

## Publicar no GitHub Pages

### Publicação automática (recomendada)

O repositório inclui `.github/workflows/pages.yml`. Ao enviar alterações para a branch `main` ou `master`, o GitHub Actions:

1. instala Rust e o target `wasm32-unknown-unknown`;
2. instala `wasm-pack`;
3. executa os testes e as verificações JavaScript;
4. compila o VTracer para WebAssembly;
5. prepara a pasta `dist/` e publica no GitHub Pages.

Para ativar, envie todos os arquivos para o GitHub e, em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**. Na primeira execução, o workflow compila as dependências Rust e gera o arquivo WebAssembly utilizado pelo navegador. O `wasm-opt` é intencionalmente ignorado nessa compilação para evitar a incompatibilidade de validação mostrada no log do GitHub Actions; o navegador executa o módulo WebAssembly normalmente.

### Publicação manual

1. Instale Rust, o target `wasm32-unknown-unknown` e `wasm-pack`.
2. Execute `npm run build:wasm` para gerar `js/wasm/pkg/`.
3. Execute `npm run build:site` para preparar `dist/`.
4. Publique o conteúdo de `dist/` pelo método de Pages escolhido.

Os endereços internos são relativos à aplicação, portanto funcionam em projetos publicados sob subdiretórios do GitHub Pages. O WebAssembly é servido pelo próprio domínio do site e não exige chamadas a terceiros durante a conversão.

## Estrutura

```text
AngelosOpenVectorize/
├── index.html
├── README.md
├── TEST-REPORT.md
├── THIRD-PARTY-NOTICES.md
├── LICENSE
├── package.json
├── serve.mjs
├── assets/icons/favicon.svg
├── css/
│   ├── style.css
│   ├── themes.css
│   └── responsive.css
├── js/
│   ├── app.js
│   ├── image-loader.js
│   ├── vtracer-config.js
│   ├── svg-geometry.js               # Angelos Geometry: retas validadas pelo raster
│   ├── vectorizer.js                 # fallback de compatibilidade
│   ├── svg-export.js
│   ├── png-export.js
│   ├── ui-controls.js
│   ├── workers/vectorize.worker.mjs
│   └── wasm/pkg/                     # artefatos criados pelo build
├── wasm/
│   ├── Cargo.toml
│   └── src/lib.rs                    # ponte wasm-bindgen para VTracer
├── scripts/
│   ├── build-wasm.mjs
│   └── prepare-pages.mjs
├── .github/workflows/pages.yml
└── tests/
    ├── vectorizer.test.js
    ├── vtracer-config.test.js
    └── svg-geometry.test.js           # retas recuperadas e curvas preservadas
```

## Privacidade e segurança

- As imagens são decodificadas por APIs locais do navegador.
- O worker recebe um buffer RGBA; não há endpoint de upload.
- O WebAssembly compilado é servido junto com o site.
- A aplicação não implementa analytics, telemetria ou coleta de dados.
- O tamanho máximo do arquivo e a resolução de trabalho são limitados para reduzir consumo excessivo de memória.

## Licenças

- Código do AngelosOpenVectorize: MIT (ver `LICENSE`).
- VTracer: `MIT OR Apache-2.0`; consulte `THIRD-PARTY-NOTICES.md` e preserve os avisos ao distribuir os artefatos compilados.
- O projeto não é afiliado ao VTracer ou ao Vectorizer.ai.

## Referências técnicas

- Arquitetura pública do Open Vectorizer (referência de pesquisa para cobertura subpixel, ajuste de retas, cantos e seleção geométrica; o código-fonte desse projeto não é incorporado nesta aplicação): https://github.com/vardirhq/open-vectorizer
- VTracer: https://github.com/visioncortex/vtracer
- Documentação do motor: https://www.visioncortex.org/vtracer-docs/
- Biblioteca JavaScript/Node oficial: https://www.npmjs.com/package/@visioncortex/vtracer
- Rust e WebAssembly: https://rustwasm.github.io/docs/book/
- wasm-pack: https://rustwasm.github.io/wasm-pack/

## Créditos

Desenvolvido por [Eliseu Fernandes Laurindo](https://eliseuangelos.github.io/).
