# AngelosOpenVectorize

**AngelosOpenVectorize** é um vetorizador web gratuito e de código aberto, criado para converter desenhos, ilustrações, logotipos e imagens em SVG com geometria editável. A aplicação foi projetada para hospedagem estática, incluindo GitHub Pages, sem conta, assinatura ou servidor de processamento.

O motor principal planejado e integrado ao código é o **VTracer 1.0.0-alpha.4**, compilado para WebAssembly e executado em um Web Worker. O processamento da imagem ocorre localmente no navegador. O projeto mantém um motor geométrico de compatibilidade para funcionar enquanto o pacote WebAssembly ainda não tiver sido compilado.

> **Estado desta entrega:** o adaptador JavaScript, o crate Rust/wasm-bindgen, o worker, o script de compilação e os testes de configuração estão incluídos. O binário `.wasm` não foi gerado nesta sessão porque o ambiente de desenvolvimento não tinha Rust, Cargo, `wasm-pack` nem conectividade DNS para instalar dependências. Antes de publicar, execute `npm run build:wasm`. A interface identifica claramente quando está usando o motor de compatibilidade.

## Funcionalidades

- Importação PNG, JPG/JPEG, WEBP e BMP (conforme os decodificadores do navegador).
- Seleção de arquivos, arrastar e soltar e colagem de imagens.
- Quatro perfis de conversão: preto e branco, escala de cinza, colorido e foto estilizada.
- VTracer com ajuste de curvas `spline` ou `polygon`, composição `stacked`/`cutout`, agrupamento por cores e watershed, filtro de pequenas regiões e otimização SVG.
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
| Colorido | `watershed` + composição `cutout`/mosaico + spline | Ilustrações com regiões coloridas adjacentes |
| Foto estilizada | preset `photo` + paleta limitada + composição `stacked` | Posterização e interpretação vetorial aproximada de fotografias |

O modo `cutout` do VTracer 1.0 forma uma tesselação sem frestas, ajustando uma fronteira compartilhada entre regiões adjacentes. O modo `stacked` empilha as formas na ordem de pintura e pode ser preferível quando há sobreposição de objetos.

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

O script executa `wasm-pack build` com alvo `web` e saída otimizada para produção. Os arquivos serão gerados em:

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

Para ativar, envie todos os arquivos para o GitHub e, em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**. Na primeira execução, o workflow compila as dependências Rust e gera o arquivo WebAssembly utilizado pelo navegador.

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
    └── vtracer-config.test.js
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

- VTracer: https://github.com/visioncortex/vtracer
- Documentação do motor: https://www.visioncortex.org/vtracer-docs/
- Biblioteca JavaScript/Node oficial: https://www.npmjs.com/package/@visioncortex/vtracer
- Rust e WebAssembly: https://rustwasm.github.io/docs/book/
- wasm-pack: https://rustwasm.github.io/wasm-pack/

## Créditos

Desenvolvido por [Eliseu Fernandes Laurindo](https://eliseuangelos.github.io/).
