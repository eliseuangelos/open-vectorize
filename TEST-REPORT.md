# Relatório de testes — AngelosOpenVectorize 3.1.0

**Data:** 13/11/2026  
**Ambiente:** Node.js 22.16.0, npm 10.9.2.  
**Escopo validado:** motor geométrico próprio com confirmação raster, configuração VTracer, Worker, build estático e testes unitários sintéticos.

## Resultado desta entrega

| Verificação | Resultado | Evidência / limite |
|---|---|---|
| Testes do motor legado | **Aprovado** | `npm test` |
| Perfis de configuração VTracer | **Aprovado** | `tests/vtracer-config.test.js`; modo colorido usa color-cluster e foto usa watershed |
| Parser e reescrita SVG | **Aprovado** | Comandos relativos, curvas C/Q, junções e caminhos fechados testados |
| Linha reta reconstruída a partir de curva ondulada | **Aprovado em testes sintéticos** | Recupera uma borda y=10 a partir de uma Bézier ondulada; também agrupa várias Béziers consecutivas sobre a mesma borda |
| Curva circular legítima | **Aprovado em teste sintético** | O teste confirma que a curva circular não é achatada como reta |
| Correção baseada em pixels | **Aprovado em teste sintético** | Preenchimento preto/branco, amostragem bilinear e ajuste TLS; o caminho é corrigido apenas quando a borda é mensurável |
| Preservação de curva sem evidência | **Aprovado** | Segmentos curvos permanecem originais quando a amostragem não confirma uma linha |
| Sintaxe JavaScript | **Aprovado** | `npm run check` |
| Worker e fallback | **Aprovado no contrato Node.js** | Import assíncrono, resposta e fallback sem WASM |
| Preparação estática | **Aprovado** | `npm run build:site` cria `dist/` |
| Servidor HTTP | **Aprovado** | `/`, Worker e módulo `svg-geometry.js` responderam HTTP 200 localmente |
| Compilação VTracer WASM | **Não compilada nesta sessão** | Não há Rust/Cargo/wasm-pack nem resolução DNS no ambiente |
| Comparação com Vectorizer.ai e Open Vectorizer usando imagens reais | **Não realizada** | Não foram fornecidos arquivos de benchmark do usuário; alegações dos projetos foram tratadas como auto-relatadas |

## Nova etapa Angelos Geometry

A correção anterior analisava apenas a geometria do `path`. A versão 3.1 também recebe o buffer RGBA pré-processado e, para cada candidato a linha, amostra a imagem original em ambos os lados do contorno. O preenchimento do caminho identifica o lado interno; os pontos de transição são ajustados com mínimos quadrados ortogonais. A reta só é aceita se o erro máximo e RMS da evidência raster respeitarem os limites definidos.

Se a borda não estiver bem definida, se os lados não apresentarem contraste suficiente ou se a curva real for confirmada pelos pixels, o segmento original é preservado. Essa é uma correção de geometria determinística; não é um modelo de deep learning e não tenta adivinhar o significado do desenho.

## Melhorias no pipeline

- O perfil **Colorido** usa `color-cluster` com composição `cutout`, reduzindo a fragmentação de ilustrações chapadas.
- O perfil **Foto estilizada** reserva `watershed` e composição `stacked` para imagens com mais transições e sobreposições.
- O limite de processamento continua local e foi mantido em até 1,25 megapixel no fallback.
- A escala de trabalho oferece mais resolução que a versão inicial, até 1100 px no maior lado conforme o detalhe.
- O controle **Correção de linhas retas** regula a tolerância da etapa geométrica e fica desativado no modo Foto estilizada.

## Testes reproduzíveis

```bash
npm test
npm run check
npm run build:site
npm run serve
```

Depois, abrir `http://127.0.0.1:8000`. Para ativar o motor VTracer a partir do código-fonte, compilar com `npm run build:wasm` ou utilizar o workflow de GitHub Actions.

## Limitações conhecidas

1. A prova geométrica automatizada usa imagens sintéticas controladas. Ela verifica especificamente uma borda horizontal desenhada como uma Bézier ondulada e uma curva circular que deve ser preservada.
2. Ainda é necessário testar com amostras reais de desenhos infantis, logotipos digitalizados, ilustrações com várias cores e imagens JPEG comprimidas.
3. A etapa raster-aware depende de caminhos SVG com cor de preenchimento interpretável (`#hex` ou `rgb/rgba`) e de uma borda com contraste mensurável.
4. Linhas curtas, transparências complexas, gradientes, traços (strokes) e regiões com cores vizinhas quase iguais podem não ser corrigidos.
5. A saída do VTracer no navegador ainda depende de uma compilação WASM bem-sucedida no GitHub Actions; esta sessão não dispõe da toolchain Rust.
6. Fotos não são vetorizadas como fotografias perfeitas. Elas são interpretadas por regiões/paletas.

## Referência de arquitetura pesquisada

O projeto Open Vectorizer (MIT) documenta uma pipeline de paleta interior, campos de cobertura subpixel, contornos interpolados, ajuste de retas e cantos, hipóteses de primitivas e comparação por rasterização reversa. Essa estrutura foi estudada como referência técnica. O repositório e seu código não foram copiados nem incluídos; o Angelos Geometry aqui implementado é código próprio e possui escopo menor: confirmação raster de trechos retilíneos já presentes na saída SVG.
