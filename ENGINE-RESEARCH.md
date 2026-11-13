# Pesquisa de motores de vetorização — AngelosOpenVectorize

**Data da análise:** 13/11/2026

Este documento separa a arquitetura publicamente descrita pelos projetos pesquisados das decisões implementadas no AngelosOpenVectorize. Não afirma conhecer componentes proprietários que não foram divulgados.

## 1. Vectorizer.ai

A empresa descreve publicamente duas partes importantes: redes neurais treinadas para interpretar a imagem e uma representação geométrica própria chamada *Vector Graph*. A descrição pública menciona fronteiras compartilhadas, ajuste de curvas e cantos, simetria e construção de formas. O código-fonte, os pesos dos modelos e os detalhes internos dessa arquitetura não são abertos; portanto, não é possível reproduzir fielmente o sistema interno apenas com as informações públicas.

**Referência:** https://www.vectorizer.ai/about

## 2. VTracer

VTracer é um projeto open source em Rust. Sua arquitetura 1.0 descreve etapas substituíveis: segmentação/agrupamento de cores, composição de regiões, ajuste de curvas (por exemplo, pixel/polygon/spline) e otimização da saída SVG. A composição mosaico/cutout procura compartilhar fronteiras entre regiões vizinhas para evitar frestas.

**Uso no AngelosOpenVectorize:** motor geral de rastreamento raster→SVG, executado localmente como WebAssembly quando o pacote WASM está compilado e carregado.

**Referências:**
- https://github.com/visioncortex/vtracer
- https://github.com/visioncortex/vtracer/tree/master/docs/design

## 3. Open Vectorizer

Open Vectorizer (MIT) é um projeto open source particularmente relevante para logotipos, ícones e arte plana. Sua documentação descreve uma abordagem determinística: constrói a paleta a partir de pixels internos, interpreta pixels antialiasados como medidas de cobertura, recupera contornos subpixel, detecta trechos retos e cantos, testa hipóteses de primitivas e compara candidatos com a imagem rasterizada novamente. O próprio projeto declara que fotografias não são seu objetivo principal e que seus números de benchmark são limitados ao corpus descrito pelos autores.

**Uso no AngelosOpenVectorize:** referência arquitetural e de pesquisa. Nenhum código-fonte ou binário do projeto foi incorporado nesta entrega.

**Referências:**
- https://github.com/vardirhq/open-vectorizer
- https://github.com/vardirhq/open-vectorizer/blob/main/PROJECT.md

## 4. O que foi implementado nesta versão

O AngelosOpenVectorize 3.1 não afirma ser uma reimplementação completa do Open Vectorizer nem reproduzir o Vectorizer.ai. Foi implementada uma etapa independente de reconstrução linear com confirmação no raster:

1. recebe o SVG gerado pelo motor de rastreamento e o buffer RGBA usado na conversão;
2. seleciona grupos de segmentos que podem representar uma borda reta;
3. identifica o lado interno por comparação com a cor de preenchimento;
4. amostra a transição de cor em passos subpixel ao longo da normal da reta;
5. ajusta a linha por mínimos quadrados ortogonais;
6. aceita a substituição apenas quando o erro medido da borda está dentro da tolerância;
7. recalcula a interseção de retas em cantos; caso não haja evidência suficiente, mantém a curva original.

Essa etapa mira o problema específico de retas que ficam onduladas depois do rastreamento. Ela é determinística, não usa rede neural, não exige API, não envia imagens a servidores e permanece executada no navegador.

## 5. Limitações e próximos passos técnicos

A versão 3.1 ainda não implementa toda a pipeline de cobertura por cor do Open Vectorizer, ajuste de círculos/elipses como primitivas, recuperação de strokes, gradientes ou reconhecimento semântico. A confirmação raster depende de uma cor de preenchimento interpretável e de uma transição de cor suficientemente clara. Curvas, fotos, gradientes, transparências complexas e regiões com cores vizinhas muito parecidas podem exigir tratamento próprio.

A próxima evolução recomendada é criar um corpus local de benchmark com exemplos reais e imagens de referência conhecidas. O benchmark deve medir pelo menos: erro máximo de contorno, erro RMS, quantidade de nós SVG, contagem de regiões, tempo de processamento e fidelidade após rasterização reversa. Resultados de repositórios externos devem ser tratados como auto-relatados até serem reproduzidos no mesmo corpus.
