/* Module worker: VTracer WASM is preferred; legacy vectorizer is an explicit fallback. */
import '../vtracer-config.js';
import '../vectorizer.js';
import '../svg-geometry.js';

let vtracerPromise;

async function loadVTracer() {
  if (!vtracerPromise) {
    const moduleUrl = new URL('../wasm/pkg/angelos_open_vectorize_wasm.js', import.meta.url);
    vtracerPromise = import(moduleUrl.href).then(async (module) => {
      await module.default();
      return module;
    }).catch(() => null);
  }
  return vtracerPromise;
}

function updateSvgDimensions(svg, width, height) {
  const start = svg.search(/<svg\b/i);
  const end = svg.indexOf('>', start);
  if (start < 0 || end < 0) throw new Error('O VTracer não retornou um documento SVG válido.');
  let opening = svg.slice(start, end + 1);
  const setAttribute = (name, value) => {
    const expression = new RegExp(`\\s${name}=(['"]).*?\\1`, 'i');
    if (expression.test(opening)) opening = opening.replace(expression, ` ${name}="${value}"`);
    else opening = opening.replace(/>$/, ` ${name}="${value}">`);
  };
  setAttribute('width', width);
  setAttribute('height', height);
  return svg.slice(0, start) + opening + svg.slice(end + 1);
}

function buildStats(svg, width, height, workWidth, workHeight) {
  const pathCount = (svg.match(/<path\b/gi) || []).length;
  return {
    width,
    height,
    workWidth,
    workHeight,
    pathCount,
    contourCount: pathCount,
    svgBytes: new TextEncoder().encode(svg).length
  };
}

self.onmessage = async function (event) {
  const { id, buffer, width, height, options = {} } = event.data || {};
  try {
    const vtracer = await loadVTracer();
    let result;
    const source = new Uint8ClampedArray(buffer);
    // The same locally prepared pixels are supplied to the geometric verifier.
    // This lets the postprocessor validate candidate straight edges against
    // the source raster instead of smoothing paths based on shape alone.
    const evidencePixels = self.VTracerConfig.preparePixels({ data: source, width, height }, options);

    if (vtracer) {
      const pixels = evidencePixels;
      const config = self.VTracerConfig.buildOptions(options);
      let svg = vtracer.convert(pixels, width, height, JSON.stringify(config));
      if (typeof svg !== 'string' || !/<svg\b/i.test(svg) || !/<path\b/i.test(svg)) {
        throw new Error('O VTracer não gerou caminhos SVG. Experimente outro modo ou uma imagem mais nítida.');
      }
      if (/<image\b|data:image\//i.test(svg)) {
        throw new Error('A saída do motor contém conteúdo raster incorporado e foi recusada.');
      }
      svg = updateSvgDimensions(svg, options.outputWidth || width, options.outputHeight || height);
      result = {
        svg,
        engine: 'vtracer',
        stats: buildStats(svg, options.outputWidth || width, options.outputHeight || height, width, height)
      };
    } else {
      const fallback = self.Vectorizer.trace({ data: source, width, height }, options);
      fallback.engine = 'legacy-fallback';
      fallback.stats.engine = 'legacy-fallback';
      result = fallback;
    }

    const geometry = self.SvgGeometry.regularizeSvg(result.svg, {
      ...options,
      width,
      height,
      outputWidth: options.outputWidth || width,
      outputHeight: options.outputHeight || height,
      rasterData: { data: evidencePixels, width, height }
    });
    result.svg = geometry.svg;
    result.stats = { ...result.stats, ...geometry.stats };
    result.geometryEngine = 'angelos-geometry';

    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error && error.message ? error.message : 'Falha inesperada na vetorização.' });
  }
};
