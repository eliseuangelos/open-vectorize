/*
 * AngelosOpenVectorize — VTracer browser adapter.
 * Maps the interface controls to the documented VTracer 1.0 configuration
 * and performs lightweight pixel adjustments before passing RGBA to WASM.
 */
(function (root) {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  function preparePixels(imageData, options = {}) {
    if (!imageData || !imageData.data || !imageData.width || !imageData.height) {
      throw new Error('A imagem não contém dados de pixels válidos.');
    }

    const source = imageData.data;
    const pixels = new Uint8Array(source.length);
    const brightness = Number(options.brightness || 0) * 2;
    const contrast = Number(options.contrast || 0);
    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    const saturation = 1 + Number(options.saturation || 0) / 50;
    const preserveTransparency = options.preserveTransparency !== false;
    const mode = options.mode || 'color';
    const grayLevels = clamp(Number(options.levels || 6), 2, 16);

    for (let i = 0; i < source.length; i += 4) {
      let r = source[i];
      let g = source[i + 1];
      let b = source[i + 2];
      let a = source[i + 3];

      if (!preserveTransparency && a < 255) {
        const alpha = a / 255;
        r = r * alpha + 255 * (1 - alpha);
        g = g * alpha + 255 * (1 - alpha);
        b = b * alpha + 255 * (1 - alpha);
        a = 255;
      } else if (preserveTransparency && a < 16) {
        pixels[i] = 0;
        pixels[i + 1] = 0;
        pixels[i + 2] = 0;
        pixels[i + 3] = 0;
        continue;
      }

      r = contrastFactor * (r - 128) + 128 + brightness;
      g = contrastFactor * (g - 128) + 128 + brightness;
      b = contrastFactor * (b - 128) + 128 + brightness;
      const gray = luminance(r, g, b);
      r = clamp(gray + (r - gray) * saturation, 0, 255);
      g = clamp(gray + (g - gray) * saturation, 0, 255);
      b = clamp(gray + (b - gray) * saturation, 0, 255);

      if (mode === 'gray') {
        const level = Math.round((luminance(r, g, b) / 255) * (grayLevels - 1));
        const tone = Math.round((level / (grayLevels - 1)) * 255);
        r = g = b = tone;
      }

      pixels[i] = Math.round(r);
      pixels[i + 1] = Math.round(g);
      pixels[i + 2] = Math.round(b);
      pixels[i + 3] = a;
    }
    return pixels;
  }

  function buildOptions(options = {}) {
    const mode = options.mode || 'color';
    const detail = clamp(Number(options.detail || 3), 1, 5);
    const smooth = clamp(Number(options.smooth ?? 2), 0, 5);
    const noise = clamp(Number(options.noise ?? 3), 0, 20);
    const lineCorrection = clamp(Number(options.lineCorrection ?? 3), 0, 5);
    const isBw = mode === 'bw';
    const isGray = mode === 'gray';
    const isPhoto = mode === 'photo';

    return {
      preset: isBw ? 'bw' : (isPhoto ? 'photo' : (mode === 'color' ? 'poster' : 'default')),
      // Flat-color artwork benefits from global color clustering; watershed
      // is reserved for photos where edge-aware over-segmentation is useful.
      clustering: isBw ? 'bw' : (isPhoto ? 'watershed' : 'color-cluster'),
      hierarchical: mode === 'color' ? 'cutout' : 'stacked',
      mode: smooth === 0 ? 'polygon' : 'spline',
      filterSpeckle: Math.round(noise * 0.65),
      colorPrecision: clamp(4 + detail, 5, 8),
      layerDifference: isPhoto ? 34 : (isGray ? 8 : 12),
      cornerThreshold: Math.round(60 + (smooth - 2) * 2),
      lengthThreshold: [7, 5.5, 4, 3, 2][detail - 1],
      maxIterations: 10,
      spliceThreshold: 45,
      // VTracer 1.0 recommends about 1–2.5 px. We bias toward fewer,
      // cleaner curves, then let Angelos Geometry correct near-straight runs.
      simplify: smooth === 0 ? null : Number(clamp(0.85 + smooth * 0.22 + lineCorrection * 0.1, 0.8, 2.8).toFixed(2)),
      pathPrecision: 2,
      maxColors: isBw ? null : (isGray ? clamp(Number(options.levels || 6), 2, 16) : clamp(Number(options.colors || 12), 2, 32)),
      optimize: 2,
      binaryThreshold: clamp(Number(options.threshold ?? 128), 0, 255),
      adaptive: Boolean(options.adaptiveThreshold),
      adaptiveWindow: 0,
      adaptiveT: 15,
      watershedDetail: Math.round(48 + ((detail - 1) / 4) * 160)
    };
  }

  root.VTracerConfig = { preparePixels, buildOptions };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.VTracerConfig;
})(typeof self !== 'undefined' ? self : globalThis);
