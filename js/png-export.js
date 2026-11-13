(function (root) {
  'use strict';
  async function createBlob(svg, scale = 1, background = 'transparent', customColor = '#ffffff') {
    const parser = new DOMParser();
    const documentSvg = parser.parseFromString(svg, 'image/svg+xml');
    if (documentSvg.querySelector('parsererror')) throw new Error('O SVG gerado não pôde ser interpretado.');
    const svgElement = documentSvg.documentElement;
    const viewBox = (svgElement.getAttribute('viewBox') || '').split(/[ ,]+/).map(Number);
    const baseWidth = Number(svgElement.getAttribute('width')) || viewBox[2] || 1;
    const baseHeight = Number(svgElement.getAttribute('height')) || viewBox[3] || 1;
    const factor = Math.max(1, Math.min(4, Number(scale) || 1));
    const width = Math.max(1, Math.round(baseWidth * factor));
    const height = Math.max(1, Math.round(baseHeight * factor));
    if (width * height > 48000000) throw new Error('A resolução selecionada é muito grande para este navegador. Reduza a escala.');

    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Não foi possível rasterizar o SVG.'));
        element.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D não está disponível.');
      if (background === 'white') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); }
      else if (background === 'custom') { context.fillStyle = /^#[0-9a-f]{6}$/i.test(customColor) ? customColor : '#ffffff'; context.fillRect(0, 0, width, height); }
      context.drawImage(image, 0, 0, width, height);
      return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Não foi possível criar o arquivo PNG.')), 'image/png'));
    } finally { URL.revokeObjectURL(url); }
  }
  async function download(svg, filename, scale, background, customColor) {
    const blob = await createBlob(svg, scale, background, customColor);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${root.SvgExport.sanitizeFilename(filename)}-${scale}x.png`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  root.PngExport = { createBlob, download };
})(window);
