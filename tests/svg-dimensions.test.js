const assert = require('node:assert/strict');
const { setDimensions } = require('../js/svg-dimensions.js');

// Saída no estilo VTracer: sem viewBox, width/height no espaço de trabalho (880x660); original 4000x3000.
let out = setDimensions('<?xml version="1.0"?>\n<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="880" height="660"><path d="M0 0"/></svg>', 4000, 3000, 880, 660);
assert.match(out, /viewBox="0 0 880 660"/);
assert.match(out, /width="4000"/);
assert.match(out, /height="3000"/);
assert.ok(out.startsWith('<?xml'), 'o prólogo XML deve ser preservado');

// viewBox existente é preservado e não duplicado.
out = setDimensions('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 500 400"><path/></svg>', 4000, 3000, 880, 660);
assert.match(out, /viewBox="0 0 500 400"/);
assert.equal((out.match(/viewBox/g) || []).length, 1);

// Sem width/height: usa a resolução de trabalho informada.
out = setDimensions('<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>', 1000, 500, 800, 400);
assert.match(out, /viewBox="0 0 800 400"/);
assert.match(out, /width="1000"/);

// Documento inválido.
assert.throws(() => setDimensions('<div></div>', 1, 1, 1, 1));
console.log('OK — SVG do VTracer recebe viewBox no espaço de trabalho; imagens maiores que a resolução de trabalho aparecem inteiras.');
