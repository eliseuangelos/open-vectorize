/* Editor SVG enxuto: seleção, mover, cor, excluir e desfazer/refazer sobre o SVG gerado.
   O histórico guarda estados do documento e vale enquanto a edição está aberta. */
(function (root) {
  'use strict';
  const SHAPES = 'path,rect,circle,ellipse,polygon,polyline';
  let cfg = null, svg = null, sel = null, hist = [], hi = -1, active = false, dirty = false;

  const clean = () => {
    const copy = svg.cloneNode(true);
    copy.querySelectorAll('[data-sel]').forEach((el) => el.removeAttribute('data-sel'));
    return copy;
  };
  const serialize = () => {
    const copy = clean();
    copy.removeAttribute('role');
    copy.removeAttribute('aria-label');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(copy);
  };
  const toHex = (value) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value || '');
    return m ? '#' + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('') : '#000000';
  };
  function refresh() {
    cfg.undo.disabled = hi <= 0;
    cfg.redo.disabled = hi >= hist.length - 1;
    cfg.del.disabled = !sel;
    cfg.color.disabled = !sel;
  }
  function pick(el) {
    if (sel) sel.removeAttribute('data-sel');
    sel = el;
    if (el) { el.setAttribute('data-sel', ''); cfg.color.value = toHex(getComputedStyle(el).fill); }
    refresh();
  }
  function commit() {
    hist = hist.slice(0, hi + 1);
    hist.push(clean().innerHTML);
    if (hist.length > 60) hist.shift();
    hi = hist.length - 1;
    dirty = hi > 0;
    cfg.onChange(serialize());
    refresh();
  }
  function go(n) {
    if (!active || n < 0 || n >= hist.length) return;
    hi = n; svg.innerHTML = hist[hi]; sel = null; dirty = hi > 0;
    cfg.onChange(serialize());
    refresh();
  }
  function remove() { if (!sel) return; sel.remove(); sel = null; commit(); }
  function paint(value) {
    if (!sel) return;
    sel.setAttribute((sel.getAttribute('fill') || 'x') !== 'none' ? 'fill' : 'stroke', value);
  }
  function onDown(event) {
    if (!active) return;
    const el = event.target.closest && event.target.closest(SHAPES);
    if (!el || !svg.contains(el)) { pick(null); return; }
    event.stopPropagation(); event.preventDefault();
    pick(el);
    const inverse = svg.getScreenCTM().inverse();
    const point = (x, y) => new DOMPoint(x, y).matrixTransform(inverse);
    const origin = point(event.clientX, event.clientY);
    const list = el.transform.baseVal, shift = svg.createSVGTransform();
    list.insertItemBefore(shift, 0);
    let moved = false;
    el.setPointerCapture(event.pointerId);
    const move = (e) => { const p = point(e.clientX, e.clientY); shift.setTranslate(p.x - origin.x, p.y - origin.y); moved = true; };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (moved) commit(); else list.removeItem(0);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  function setActive(on) {
    if (on) {
      svg = cfg.host.querySelector('svg');
      if (!svg) return;
      active = true; sel = null; hist = [clean().innerHTML]; hi = 0;
      cfg.toggle.textContent = 'Concluir edição';
      cfg.onEnter();
    } else {
      if (svg) svg.querySelectorAll('[data-sel]').forEach((el) => el.removeAttribute('data-sel'));
      active = false; sel = null; hist = []; hi = -1;
      cfg.toggle.textContent = 'Editar vetor';
    }
    cfg.toggle.setAttribute('aria-pressed', String(active));
    cfg.layer.classList.toggle('editing', active);
    cfg.bar.classList.toggle('hidden', !active);
    if (active) refresh();
  }
  function init(config) {
    cfg = config;
    cfg.host.addEventListener('pointerdown', onDown);
    cfg.toggle.addEventListener('click', () => setActive(!active));
    cfg.undo.addEventListener('click', () => go(hi - 1));
    cfg.redo.addEventListener('click', () => go(hi + 1));
    cfg.del.addEventListener('click', remove);
    cfg.color.addEventListener('input', (e) => paint(e.target.value));
    cfg.color.addEventListener('change', () => { if (sel) commit(); });
    document.addEventListener('keydown', (e) => {
      if (!active) return;
      if (e.target.matches && e.target.matches('input:not([type=color]):not([type=range]):not([type=checkbox]),textarea,select,[contenteditable]')) return;
      const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
      if (mod && k === 'z') { e.preventDefault(); go(e.shiftKey ? hi + 1 : hi - 1); }
      else if (mod && k === 'y') { e.preventDefault(); go(hi + 1); }
      else if ((k === 'delete' || k === 'backspace') && sel) { e.preventDefault(); remove(); }
      else if (k === 'escape') pick(null);
    });
  }
  /* Chamado quando o SVG é recalculado ou removido: devolve true se havia edições a descartar. */
  function reset() { const was = dirty; dirty = false; if (cfg) setActive(false); svg = null; return was; }
  root.SvgEditor = { init, reset, enable: (on) => { if (cfg) cfg.toggle.disabled = !on; }, isActive: () => active };
})(window);
