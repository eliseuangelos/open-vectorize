const assert = require('node:assert/strict');
const SvgGeometry = require('../js/svg-geometry.js');

// A slightly wavy edge represented by short cubic segments should be rebuilt
// as one straight line while right-angle corners remain distinct.
const rectangle = SvgGeometry.regularizePathData(
  'M0 0 C3 0.8 7 -0.8 10 0 C13 0.7 17 -0.7 20 0 L20 20 L0 20 Z',
  { tolerance: 1.6 }
);
assert.match(rectangle.d, /M0 0 L20 0 L20 20 L0 20 Z/);
assert.doesNotMatch(rectangle.d, /C/);
assert.equal(rectangle.straightenedCurves, 1);
assert.ok(rectangle.commandsAfter < rectangle.commandsBefore);

// Genuine rounded geometry must not be flattened into a polygon.
const circle = SvgGeometry.regularizePathData(
  'M50 10 C72 10 90 28 90 50 C90 72 72 90 50 90 C28 90 10 72 10 50 C10 28 28 10 50 10 Z',
  { tolerance: 1.6 }
);
assert.equal((circle.d.match(/C/g) || []).length, 4);
assert.match(circle.d, /Z$/);

// Raster-like L segments along a noisy top edge are merged and corners are
// intersected into a shared, clean vertex.
const noisyPolygon = SvgGeometry.regularizePathData(
  'M0 0 L5 0.7 L10 -0.5 L15 0.4 L20 0 L20 20 L0 20 Z',
  { tolerance: 1.2 }
);
assert.match(noisyPolygon.d, /M0 [\d.-]+ L20 [\d.-]+ L20 20 L0 20 Z/);
assert.ok(noisyPolygon.mergedSegments >= 2);

// Relative commands are normalized safely, with a true curved section kept.
const relative = SvgGeometry.regularizePathData('m0 0 h20 v20 h-20 z', { tolerance: 1.0 });
assert.equal(relative.d, 'M0 0 L20 0 L20 20 L0 20 Z');

// SVG wrapper and paint attributes survive post-processing; no raster image is
// introduced, and summary metrics report simplification.
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill="#000" d="M0 0 C3 0.8 7 -0.8 10 0 C13 0.7 17 -0.7 20 0 L20 20 L0 20 Z"/></svg>';
const whole = SvgGeometry.regularizeSvg(svg, { width: 20, height: 20, lineCorrection: 4 });
assert.match(whole.svg, /fill="#000"/);
assert.doesNotMatch(whole.svg, /<image\b/);
assert.ok(whole.stats.geometryPathsProcessed === 1);
assert.ok(whole.stats.geometryCommandsRemoved >= 1);

// Zero correction is an explicit no-op.
const untouched = SvgGeometry.regularizeSvg(svg, { lineCorrection: 0 });
assert.equal(untouched.svg, svg);
assert.equal(untouched.stats.geometryTolerance, 0);

console.log('OK — correção de linhas quase retas, preservação de curvas, junções e parsing SVG.');

// Raster evidence should recover a genuinely horizontal edge even when the
// vector engine emitted a visibly wavy cubic. The recovered SVG must use one
// clean line and put the initial M point on the same fitted edge.
{
  const width = 64, height = 40;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const inside = x >= 10 && x < 50 && y >= 10 && y < 30;
      const channel = inside ? 0 : 255;
      data[offset] = data[offset + 1] = data[offset + 2] = channel;
      data[offset + 3] = 255;
    }
  }
  const sourceSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40"><path fill="#000000" d="M10 16 C20 0 40 24 50 9 L50 30 L10 30 Z"/></svg>';
  const corrected = SvgGeometry.regularizeSvg(sourceSvg, {
    width, height, lineCorrection: 5, rasterData: { data, width, height }
  });
  assert.equal(corrected.stats.rasterLinesRecovered, 1, 'a strongly wavy cubic over a straight raster edge must be raster-verified');
  assert.match(corrected.svg, /M10 10(?:\.\d+)? L50 10(?:\.\d+)?/);
  assert.doesNotMatch(corrected.svg, / C/);
}

// A true circular boundary must not be replaced by a straight line just
// because its individual spline pieces are locally shallow.
{
  const width = 80, height = 80;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const inside = (x - 40) ** 2 + (y - 40) ** 2 <= 30 ** 2;
      const channel = inside ? 220 : 255;
      data[offset] = channel; data[offset + 1] = inside ? 35 : 255; data[offset + 2] = inside ? 55 : 255; data[offset + 3] = 255;
    }
  }
  const circleSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><path fill="#dc2337" d="M40 10 C56.57 10 70 23.43 70 40 C70 56.57 56.57 70 40 70 C23.43 70 10 56.57 10 40 C10 23.43 23.43 10 40 10 Z"/></svg>';
  const corrected = SvgGeometry.regularizeSvg(circleSvg, {
    width, height, lineCorrection: 5, rasterData: { data, width, height }
  });
  assert.equal(corrected.stats.rasterLinesRecovered, 0, 'a curved source boundary must not be forced into a line');
  assert.match(corrected.svg, / C/);
}

console.log('OK — linhas confirmadas pela imagem raster e curvas reais preservadas.');

// A long straight border split into several noisy splines should be merged
// into one geometry line when the raster confirms that common boundary.
{
  const width = 100, height = 60;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const inside = x >= 10 && x < 90 && y >= 20 && y < 40;
      const channel = inside ? 18 : 248;
      data[offset] = data[offset + 1] = data[offset + 2] = channel;
      data[offset + 3] = 255;
    }
  }
  const d = 'M10 22 C18 17 24 23 30 20 C42 15 50 24 60 20 C72 17 82 23 90 19 L90 40 L10 40 Z';
  const sourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path fill="#121212" d="${d}"/></svg>`;
  const corrected = SvgGeometry.regularizeSvg(sourceSvg, {
    width, height, lineCorrection: 5, rasterData: { data, width, height }
  });
  assert.ok(corrected.stats.rasterLinesRecovered >= 1, 'continuous straight edge across multiple splines should be recovered');
  assert.match(corrected.svg, /M10 20(?:\.\d+)? L90 20(?:\.\d+)?/);
  assert.doesNotMatch(corrected.svg, / C/);
}

console.log('OK — segmentos Bézier consecutivos agrupados e retificados com evidência do raster.');
