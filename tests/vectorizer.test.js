const assert = require('node:assert/strict');
require('../js/vectorizer.js');
const { trace } = global.Vectorizer;

function image(width, height, pixel) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const color = pixel(x, y);
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = color[3] ?? 255;
    }
  }
  return { width, height, data };
}

const bwImage = image(10, 10, (x, y) => (x >= 2 && x <= 7 && y >= 2 && y <= 7) ? [10, 10, 10] : [245, 245, 245]);
const bw = trace(bwImage, { mode: 'bw', threshold: 128, noise: 0, smooth: 0 });
assert.match(bw.svg, /<path\b/);
assert.match(bw.svg, /fill-rule="evenodd"/);
assert.doesNotMatch(bw.svg, /<image\b|data:image\//i);
assert.equal(bw.stats.width, 10);
assert.equal(bw.stats.pathCount, 2);
assert.ok(bw.stats.contourCount >= 2);

const colors = image(12, 8, (x, y) => x < 6 ? [225, 35, 50] : [25, 85, 220]);
const colorResult = trace(colors, { mode: 'color', colors: 2, noise: 0, smooth: 0 });
assert.match(colorResult.svg, /fill="#/);
assert.ok(colorResult.stats.pathCount >= 2);
assert.doesNotMatch(colorResult.svg, /<image\b|data:image\//i);

const alpha = image(8, 8, (x, y) => (x < 4 ? [0, 0, 0, 0] : [30, 170, 120, 255]));
const alphaResult = trace(alpha, { mode: 'color', colors: 2, preserveTransparency: true, noise: 0 });
assert.match(alphaResult.svg, /<path\b/);
assert.ok(alphaResult.svg.includes('viewBox="0 0 8 8"'));
assert.equal(alphaResult.stats.contourCount, 1, 'região totalmente transparente não deve criar contorno');

const adjusted = trace(bwImage, { mode: 'gray', levels: 4, brightness: 10, contrast: 12, noise: 0 });
assert.match(adjusted.svg, /<svg\b/);
assert.equal(adjusted.stats.workWidth, 10);

const circle = image(60, 60, (x, y) => ((x - 30) ** 2 + (y - 30) ** 2 < 24 ** 2) ? [220, 40, 60] : [255, 255, 255]);
const smoothCircle = trace(circle, { mode: 'color', colors: 2, noise: 0, smooth: 4 });
assert.match(smoothCircle.svg, /Q/, 'suavização deve produzir segmentos quadráticos em curvas suaves');

const fullyTransparent = image(6, 6, () => [0, 0, 0, 0]);
const transparentResult = trace(fullyTransparent, { mode: 'color', colors: 4, preserveTransparency: true, noise: 0 });
assert.equal(transparentResult.stats.contourCount, 0);
assert.match(transparentResult.svg, /<svg/);

assert.throws(() => trace({ width: 0, height: 2, data: new Uint8ClampedArray(0) }, { mode: 'bw' }), /vazia/i);
console.log('OK — 4 cenários de vetorização, geometria SVG e validação de entrada.');

// Exercise the asynchronous module-worker contract and its honest fallback.
(async () => {
  const { pathToFileURL } = require('node:url');
  const path = require('node:path');
  let workerResponse = null;
  global.self = globalThis;
  global.self.postMessage = (payload) => { workerResponse = payload; };
  global.self.Vectorizer = global.Vectorizer;
  global.self.VTracerConfig = require('../js/vtracer-config.js');

  const workerUrl = pathToFileURL(path.resolve(__dirname, '../js/workers/vectorize.worker.mjs')).href;
  await import(workerUrl);
  const workerPixels = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < workerPixels.length; i += 4) {
    workerPixels[i] = 25; workerPixels[i + 1] = 35; workerPixels[i + 2] = 45; workerPixels[i + 3] = 255;
  }
  await global.self.onmessage({ data: { id: 17, buffer: workerPixels.buffer, width: 4, height: 4, options: { mode: 'bw', threshold: 128, noise: 0, smooth: 0 } } });
  assert.equal(workerResponse.id, 17);
  assert.equal(workerResponse.result.engine, 'legacy-fallback');
  assert.ok(workerResponse.result.svg.includes('<path'));
  delete global.self.postMessage;
  delete global.self;
  console.log('OK — contrato assíncrono do Web Worker e fallback sem o pacote WASM.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
