// Teste de ponta a ponta no navegador real. Uso: npm run test:e2e
// Requer o pacote "playwright" e um Chromium instalados. Sobe serve.mjs em porta local.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const PORT = Number(process.env.E2E_PORT || 8765);
const base = `http://127.0.0.1:${PORT}/`;
const WASM_PKG = /angelos_open_vectorize_wasm/;
let ok = 0, bad = 0;
const t = (name, cond, extra = '') => { cond ? ok++ : bad++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function run(page, errors, failed) {
  await page.goto(base);
  // Identidade e ativos oficiais
  const expected = Object.fromEntries(fs.readFileSync(path.join(__dirname, 'brand-assets.sha256'), 'utf8').trim().split('\n').map((l) => l.trim().split(/\s+/).reverse()));
  for (const [name, hash] of Object.entries(expected)) t(`ativo oficial preservado: ${name}`, sha(path.join(root, 'assets/icons', name)) === hash);
  const head = await page.evaluate(() => {
    const img = document.querySelector('.brand-mark img');
    return {
      icon: document.querySelector('link[rel=icon]')?.getAttribute('href'),
      apple: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'),
      mark: !!img && img.complete && img.naturalWidth > 0,
      theme: document.body.dataset.theme,
      bg: getComputedStyle(document.body).backgroundColor,
      footer: document.querySelector('.site-footer').innerText
    };
  });
  t('favicon SVG e Apple Touch Icon com caminhos relativos', head.icon === 'assets/icons/favicon.svg' && head.apple === 'assets/icons/apple-touch-icon.png');
  t('símbolo oficial carregado no cabeçalho', head.mark);
  t('tema claro institucional por padrão (#F4F7FB)', head.theme === 'light' && head.bg === 'rgb(244, 247, 251)', head.bg);
  t('rodapé com créditos e ano automático', head.footer.includes('Desenvolvido por Eliseu Fernandes Laurindo') && head.footer.includes(`© ${new Date().getFullYear()} Eliseu Fernandes Laurindo. Todos os direitos reservados.`));
  await page.click('#themeButton');
  t('tema escuro institucional (#0F1B2A)', await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(15, 27, 42)', null, { timeout: 3000 }).then(() => true, () => false));
  await page.click('#themeButton');
  t('retorno ao tema claro (#F4F7FB)', await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(244, 247, 251)', null, { timeout: 3000 }).then(() => true, () => false));

  // Importação e vetorização reais (motor que estiver disponível)
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 200;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 200);
    x.fillStyle = '#000'; x.fillRect(30, 20, 100, 60); x.beginPath(); x.arc(200, 70, 40, 0, 7); x.fill();
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.setInputFiles('#fileInput', { name: 'teste.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForSelector('#vectorPreview svg path', { timeout: 30000 });
  const chip = await page.textContent('#engineStatus');
  const wasmBuilt = fs.existsSync(path.join(root, 'js/wasm/pkg/angelos_open_vectorize_wasm_bg.wasm'));
  t('rótulo do motor corresponde ao que de fato rodou (VTracer WASM só se o pacote existe)', /Reserva JS/.test(chip) || (/VTracer WASM/.test(chip) && wasmBuilt), chip);

  // Editor
  const hit = () => page.evaluate(() => {
    const s = document.querySelector('#vectorPreview svg'), r = s.getBoundingClientRect();
    for (let y = r.top + 4; y < r.bottom; y += 6) for (let x = r.left + 4; x < r.right; x += 6) {
      const e = document.elementFromPoint(x, y);
      if (e && e.closest('#vectorPreview svg') && /^(path|rect|circle|ellipse|polygon|polyline)$/i.test(e.tagName)) return [x, y];
    }
    return null;
  });
  const red = () => page.evaluate(() => document.querySelectorAll('#vectorPreview svg [fill="#ff0000" i]').length);
  const paths = () => page.evaluate(() => document.querySelectorAll('#vectorPreview svg path').length);
  t('botão Editar vetor habilitado após o resultado', await page.isEnabled('#editToggle'));
  await page.click('#editToggle');
  t('barra de edição visível e vista Vetor ativa', await page.isVisible('#editBar') && await page.evaluate(() => document.querySelector('.canvas-tab.active').dataset.view === 'vector'));
  let pt = await hit();
  t('região recebe ponteiro no modo de edição', !!pt);
  await page.mouse.click(pt[0], pt[1]);
  t('clique seleciona a região', await page.evaluate(() => !!document.querySelector('#vectorPreview svg [data-sel]')));
  await page.fill('#editColor', '#ff0000');
  t('alterar cor da região selecionada', await red() === 1);
  await page.keyboard.press('Control+z');
  const afterUndo = await red();
  await page.keyboard.press('Control+Shift+z');
  t('desfazer e refazer (teclado)', afterUndo === 0 && await red() === 1, `após desfazer=${afterUndo}`);
  pt = await hit(); await page.mouse.click(pt[0], pt[1]);
  await page.mouse.move(pt[0], pt[1]); await page.mouse.down(); await page.mouse.move(pt[0] + 30, pt[1] + 20, { steps: 6 }); await page.mouse.up();
  t('arrastar move a região (transform translate)', await page.evaluate(() => /translate/.test(document.querySelector('#vectorPreview svg [data-sel]')?.getAttribute('transform') || '')));
  const n0 = await paths();
  await page.click('#editDelete'); const n1 = await paths();
  await page.keyboard.press('Control+z'); const n2 = await paths();
  t('excluir região e desfazer a exclusão', n1 === n0 - 1 && n2 === n0, `${n0}→${n1}→${n2}`);

  // Exportação reflete as edições
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#downloadSvgButton')]);
  const svg = fs.readFileSync(await dl.path(), 'utf8');
  const invalid = await page.evaluate((s) => !!new DOMParser().parseFromString(s, 'image/svg+xml').querySelector('parsererror'), svg);
  t('SVG exportado é XML válido', !invalid && svg.startsWith('<?xml'));
  t('SVG exportado reflete cor e movimento editados', /#ff0000/i.test(svg) && /translate/.test(svg));
  t('SVG exportado sem <image>, href externo, marcas de seleção ou aria', !/<image/i.test(svg) && !/(href|src)\s*=\s*["']https?:/i.test(svg) && !/data-sel/.test(svg) && !/aria-label/.test(svg));
  const [dp] = await Promise.all([page.waitForEvent('download'), page.click('#downloadPngButton')]);
  const pb = fs.readFileSync(await dp.path());
  t('PNG 2× exportado com assinatura PNG e 600×400', pb.slice(1, 4).toString() === 'PNG' && pb.readUInt32BE(16) === 600 && pb.readUInt32BE(20) === 400);

  // Recalcular o vetor sai do modo de edição e descarta edições (com aviso)
  await page.fill('#detailRange', '4');
  await page.waitForFunction(() => document.querySelector('#editToggle').getAttribute('aria-pressed') === 'false', null, { timeout: 20000 });
  t('recalcular descarta edições e sai do modo de edição', await red() === 0);

  // Responsividade
  for (const w of [320, 375, 390, 768, 1024, 1366, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    t(`sem rolagem horizontal em ${w}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), String(await page.evaluate(() => document.documentElement.scrollWidth)));
  }
  const wasm404 = failed.filter((u) => WASM_PKG.test(u));
  t('nenhum recurso ausente além do pacote WASM não compilado', failed.filter((u) => !WASM_PKG.test(u)).length === 0, failed.filter((u) => !WASM_PKG.test(u)).join(' | '));
  t('sem erros de console além do 404 do pacote WASM não compilado', errors.filter((e) => !WASM_PKG.test(e)).length === 0, errors.filter((e) => !WASM_PKG.test(e)).join(' | '));
  if (wasm404.length) console.log(`NOTA ${wasm404.length} requisição(ões) ao pacote WASM falharam: o build Rust/wasm-pack não foi executado neste ambiente.`);
}

(async () => {
  const server = spawn(process.execPath, ['serve.mjs'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 700));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const errors = [], failed = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.text()} @${m.location().url || ''}`); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  try { await run(page, errors, failed); } catch (e) { t('execução sem exceção', false, String((e && e.stack) || e).split('\n').slice(0, 4).join(' / ')); }
  await browser.close(); server.kill();
  console.log(`\n${ok} aprovados, ${bad} falhas`);
  process.exit(bad ? 1 : 0);
})();
