(function (root) {
  'use strict';
  function sanitizeFilename(name) {
    return (name || 'angelos-open-vectorize').replace(/\.[^.]+$/, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'angelos-open-vectorize';
  }
  function download(svg, filename) {
    if (typeof svg !== 'string' || !svg.includes('<svg')) throw new Error('Não há um SVG válido para exportar.');
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeFilename(filename)}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  async function copy(svg) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('A área de transferência não está disponível.');
    await navigator.clipboard.writeText(svg);
  }
  root.SvgExport = { download, copy, sanitizeFilename };
})(window);
