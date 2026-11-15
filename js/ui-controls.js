(function (root) {
  'use strict';
  const THEME_KEY = 'angelos-open-vectorize-theme';

  function setTheme(theme) {
    const selected = theme === 'light' ? 'light' : 'dark';
    document.body.dataset.theme = selected;
    const icon = document.querySelector('#themeIcon use');
    if (icon) icon.setAttribute('href', selected === 'dark' ? '#i-moon' : '#i-sun');
    const themeButton = document.getElementById('themeButton');
    if (themeButton) themeButton.setAttribute('aria-label', selected === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro');
    try { localStorage.setItem(THEME_KEY, selected); } catch (error) { /* private browsing */ }
  }

  function initTheme() {
    let stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (error) { /* private browsing */ }
    setTheme(stored || 'light');
    document.getElementById('themeButton')?.addEventListener('click', () => {
      setTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark');
    });
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function initDialogs() {
    document.getElementById('helpButton')?.addEventListener('click', () => openDialog(document.getElementById('helpModal')));
    document.querySelectorAll('[data-close-modal]').forEach((button) => {
      button.addEventListener('click', () => button.closest('dialog')?.close());
    });
    document.querySelectorAll('dialog.modal').forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    });
  }

  function toast(message, type = 'success') {
    const region = document.getElementById('toastRegion');
    if (!region) return;
    const item = document.createElement('div');
    item.className = 'toast';
    const icon = type === 'error' ? '!' : '✓';
    const symbol = document.createElement('span');
    symbol.textContent = icon;
    symbol.setAttribute('aria-hidden', 'true');
    symbol.style.cssText = `display:grid;place-items:center;width:16px;height:16px;border:1px solid currentColor;border-radius:50%;font:10px ${getComputedStyle(document.body).fontFamily};color:${type === 'error' ? '#e58a8a' : 'var(--accent-strong)'}`;
    const text = document.createElement('span');
    text.textContent = message;
    item.append(symbol, text);
    region.appendChild(item);
    setTimeout(() => item.remove(), 3300);
  }

  root.UIControls = { initTheme, initDialogs, toast, openDialog };
})(window);
