const assert = require('node:assert/strict');
const { preparePixels, buildOptions } = require('../js/vtracer-config.js');

const imageData = {
  width: 3,
  height: 1,
  data: new Uint8ClampedArray([
    255, 0, 0, 255,
    120, 120, 120, 255,
    0, 0, 255, 0
  ])
};

const grayPixels = preparePixels(imageData, { mode: 'gray', levels: 3, preserveTransparency: true });
assert.equal(grayPixels[0], grayPixels[1]);
assert.equal(grayPixels[1], grayPixels[2], 'modo cinza gera canais iguais');
assert.equal(grayPixels[11], 0, 'pixels transparentes continuam transparentes');
assert.equal(grayPixels[8], 0, 'pixels totalmente transparentes são limpos');

const flattened = preparePixels(imageData, { mode: 'color', preserveTransparency: false });
assert.equal(flattened[11], 255, 'modo sem transparência deve compor o alfa sobre fundo branco');

const bw = buildOptions({ mode: 'bw', threshold: 146, adaptiveThreshold: true, detail: 5, smooth: 0, noise: 4 });
assert.equal(bw.clustering, 'bw');
assert.equal(bw.binaryThreshold, 146);
assert.equal(bw.adaptive, true);
assert.equal(bw.mode, 'polygon');
assert.equal(bw.preset, 'bw');

const illustration = buildOptions({ mode: 'color', colors: 16, detail: 4, smooth: 3 });
assert.equal(illustration.clustering, 'color-cluster');
assert.equal(illustration.hierarchical, 'cutout');
assert.equal(illustration.mode, 'spline');
assert.equal(illustration.maxColors, 16);
assert.ok(illustration.simplify >= 1 && illustration.simplify <= 2.5, 'simplificação fica na faixa recomendada pelo VTracer');

const photo = buildOptions({ mode: 'photo', colors: 10, detail: 2 });
assert.equal(photo.preset, 'photo');
assert.equal(photo.clustering, 'watershed');
assert.equal(photo.hierarchical, 'stacked');
assert.equal(photo.maxColors, 10);

const grayscale = buildOptions({ mode: 'gray', levels: 5 });
assert.equal(grayscale.maxColors, 5);
assert.equal(grayscale.clustering, 'color-cluster');

assert.throws(() => preparePixels(null, {}), /pixels válidos/);
console.log('OK — adaptador VTracer, perfis, pré-processamento RGBA e transparência.');
