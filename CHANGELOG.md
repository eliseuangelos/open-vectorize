# Histórico de versões

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
