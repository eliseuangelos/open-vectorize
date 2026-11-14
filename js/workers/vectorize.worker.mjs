/* Module worker: VTracer WASM is preferred; legacy vectorizer is an explicit fallback. */
import '../vtracer-config.js';
import '../vectorizer.js';
import '../svg-geometry.js';
import '../svg-dimensions.js';

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
      svg = self.SvgDimensions.setDimensions(svg, options.outputWidth || width, options.outputHeight || height, width, height);
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
