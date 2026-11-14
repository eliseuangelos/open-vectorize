/* Define o tamanho de saída do SVG e garante um viewBox no espaço de coordenadas de trabalho.
   O VTracer não emite viewBox: sem ele, ao aplicar o tamanho original da imagem (maior que a
   resolução de trabalho) o desenho ocupa só um canto e aparece cortado. */
(function (root) {
  'use strict';
  function setDimensions(svg, outputWidth, outputHeight, workWidth, workHeight) {
    const start = typeof svg === 'string' ? svg.search(/<svg\b/i) : -1;
    const end = start < 0 ? -1 : svg.indexOf('>', start);
    if (start < 0 || end < 0) throw new Error('O VTracer não retornou um documento SVG válido.');
    let opening = svg.slice(start, end + 1);
    const read = (name) => {
      const match = new RegExp(`\\s${name}=(['"])\\s*([0-9.]+)(?:px)?\\s*\\1`, 'i').exec(opening);
      return match ? Number(match[2]) : 0;
    };
    const set = (name, value) => {
      const expression = new RegExp(`\\s${name}=(['"]).*?\\1`, 'i');
      if (expression.test(opening)) opening = opening.replace(expression, ` ${name}="${value}"`);
      else opening = opening.replace(/>$/, ` ${name}="${value}">`);
    };
    if (!/\sviewBox=/i.test(opening)) set('viewBox', `0 0 ${read('width') || workWidth} ${read('height') || workHeight}`);
    set('width', outputWidth);
    set('height', outputHeight);
    return svg.slice(0, start) + opening + svg.slice(end + 1);
  }
  root.SvgDimensions = { setDimensions };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SvgDimensions;
})(typeof self !== 'undefined' ? self : globalThis);
