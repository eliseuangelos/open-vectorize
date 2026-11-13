(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const defaults = {
    mode: 'bw', detail: 3, threshold: 128, levels: 6, colors: 12,
    smooth: 2, noise: 3, brightness: 0, contrast: 0, saturation: 0,
    preserveTransparency: true, adaptiveThreshold: false
  };

  let state = {
    source: null,
    imageData: null,
    resultSvg: '',
    stats: null,
    mode: defaults.mode,
    currentView: 'compare',
    zoom: 1,
    panX: 0,
    panY: 0,
    requestId: 0,
    worker: null,
    workerDisabled: false,
    engine: 'pending',
    traceTimer: null,
    isBusy: false,
    pointerStart: null
  };

  const rangeConfig = [
    ['detailRange', 'detailValue', (v) => ({1:'Muito baixo',2:'Baixo',3:'Médio',4:'Alto',5:'Máximo'}[v])],
    ['thresholdRange', 'thresholdValue', (v) => v],
    ['levelsRange', 'levelsValue', (v) => v],
    ['colorsRange', 'colorsValue', (v) => v],
    ['smoothRange', 'smoothValue', (v) => v],
    ['noiseRange', 'noiseValue', (v) => `${v} px`],
    ['brightnessRange', 'brightnessValue', (v) => Number(v) > 0 ? `+${v}` : v],
    ['contrastRange', 'contrastValue', (v) => Number(v) > 0 ? `+${v}` : v],
    ['saturationRange', 'saturationValue', (v) => Number(v) > 0 ? `+${v}` : v]
  ];

  function optionsFromUI() {
    return {
      mode: state.mode,
      detail: Number($('#detailRange').value),
      threshold: Number($('#thresholdRange').value),
      levels: Number($('#levelsRange').value),
      colors: Number($('#colorsRange').value),
      smooth: Number($('#smoothRange').value),
      noise: Number($('#noiseRange').value),
      brightness: Number($('#brightnessRange').value),
      contrast: Number($('#contrastRange').value),
      saturation: Number($('#saturationRange').value),
      preserveTransparency: $('#transparencyToggle').checked,
      adaptiveThreshold: $('#adaptiveThresholdToggle').checked,
      outputWidth: state.source ? state.source.width : undefined,
      outputHeight: state.source ? state.source.height : undefined
    };
  }

  function updateRangeLabels() {
    for (const [inputId, outputId, formatter] of rangeConfig) {
      const input = document.getElementById(inputId);
      const output = document.getElementById(outputId);
      if (input && output) output.textContent = formatter(input.value);
    }
  }

  function setMode(mode) {
    const modeChanged = state.mode !== mode;
    state.mode = mode;
    $$('.mode-card').forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('#thresholdBlock').classList.toggle('hidden', mode !== 'bw');
    $('#adaptiveThresholdRow').classList.toggle('hidden', mode !== 'bw');
    $('#levelsBlock').classList.toggle('hidden', mode !== 'gray');
    $('#colorsBlock').classList.toggle('hidden', mode !== 'color' && mode !== 'photo');
    $('#colorsRange').max = mode === 'photo' ? '18' : '24';
    if (modeChanged) $('#colorsRange').value = mode === 'photo' ? '10' : '12';
    updateRangeLabels();
    $('#saturationBlock').classList.toggle('hidden', mode === 'bw' || mode === 'gray');
    if (state.source) scheduleTrace();
  }

  function getMaxDimension(detail) {
    return 390 + Number(detail) * 55;
  }

  function setBusy(active, message = 'Analisando pixels e contornos') {
    state.isBusy = active;
    $('#busyOverlay').classList.toggle('hidden', !active);
    $('#progressText').textContent = message;
    $('#generateButton').disabled = !state.source || active;
    $('#generateButton').querySelector('span').textContent = active ? 'Processando...' : 'Vetorização';
  }

  function setFileUi(source) {
    $('#dropZone').classList.toggle('hidden', Boolean(source));
    $('#fileCard').classList.toggle('hidden', !source);
    $('#generateButton').disabled = !source;
    if (!source) {
      $('#canvasFileLabel').textContent = 'Nenhuma imagem carregada';
      $('#fileThumb').innerHTML = '<svg><use href="#i-image"/></svg>';
      $('#fileName').textContent = '';
      $('#fileMeta').textContent = '';
      return;
    }
    const extension = source.name.split('.').pop().toUpperCase();
    $('#fileName').textContent = source.name;
    $('#fileMeta').textContent = `${extension} · ${source.width} × ${source.height} · ${ImageLoader.formatBytes(source.size)}`;
    $('#fileThumb').innerHTML = '';
    const thumb = document.createElement('img');
    thumb.src = source.objectUrl;
    thumb.alt = '';
    $('#fileThumb').appendChild(thumb);
    $('#canvasFileLabel').textContent = `${source.name} · ${source.width} × ${source.height}`;
  }

  function fitImageData() {
    if (!state.source) return;
    const maxDimension = getMaxDimension($('#detailRange').value);
    const prepared = ImageLoader.makeImageData(state.source, maxDimension);
    state.imageData = prepared.imageData;
  }

  function ensureWorker() {
    if (state.worker) return state.worker;
    if (!('Worker' in window) || state.workerDisabled) return null;
    try {
      state.worker = new Worker('./js/workers/vectorize.worker.mjs', { type: 'module' });
      state.worker.onmessage = (event) => {
        const payload = event.data || {};
        if (payload.id !== state.requestId) return;
        if (payload.error) {
          setBusy(false);
          UIControls.toast(payload.error, 'error');
          return;
        }
        applyResult(payload.result);
      };
      state.worker.onerror = () => {
        state.worker?.terminate();
        state.worker = null;
        state.workerDisabled = true;
        if (state.source && state.imageData) {
          const requestId = state.requestId;
          runMainFallback(requestId, optionsFromUI());
        } else {
          setBusy(false);
          UIControls.toast('Não foi possível iniciar o processamento em segundo plano.', 'error');
        }
      };
      return state.worker;
    } catch (error) {
      state.worker = null;
      return null;
    }
  }

  function setEngineStatus(engine) {
    state.engine = engine || 'pending';
    const chip = $('#engineStatus');
    if (!chip) return;
    if (state.engine === 'vtracer') {
      chip.textContent = 'VTRACER WASM · ATIVO';
      chip.dataset.engine = 'vtracer';
      chip.title = 'Conversão realizada pelo VTracer WebAssembly local.';
    } else if (state.engine === 'legacy-fallback') {
      chip.textContent = 'MOTOR ALTERNATIVO · WASM AUSENTE';
      chip.dataset.engine = 'fallback';
      chip.title = 'O pacote VTracer WebAssembly ainda não foi compilado. Consulte README.md.';
    } else {
      chip.textContent = 'VTRACER WASM · VERIFICANDO';
      chip.dataset.engine = 'pending';
    }
  }

  function applyResult(result) {
    if (!result || !result.svg || !result.stats) {
      setBusy(false);
      UIControls.toast('O motor não retornou um SVG válido.', 'error');
      return;
    }
    state.resultSvg = result.svg;
    state.stats = result.stats;
    setEngineStatus(result.engine || result.stats.engine || 'legacy-fallback');
    $('#vectorPreview').innerHTML = result.svg;
    const svgElement = $('#vectorPreview svg');
    if (svgElement) {
      svgElement.setAttribute('role', 'img');
      svgElement.setAttribute('aria-label', 'Resultado vetorial SVG');
    }
    $('#emptyState').classList.add('hidden');
    $('#visualStage').classList.remove('hidden');
    $('#originalPreview').src = state.source.objectUrl;
    $('#resultMeta').classList.remove('hidden');
    $('#pathCount').textContent = (result.stats.pathCount ?? result.stats.contourCount ?? 0).toLocaleString('pt-BR');
    $('#dimensionLabel').textContent = `${result.stats.width} × ${result.stats.height}`;
    $('#svgSizeLabel').textContent = formatBytes(result.stats.svgBytes);
    $('#downloadSvgButton').disabled = false;
    $('#downloadPngButton').disabled = false;
    $('#viewCodeButton').disabled = false;
    $('#modalDownloadButton').disabled = false;
    $('#canvasFileLabel').textContent = `${state.source.name} · vetorização concluída`;
    setBusy(false);
    updateStageView();
    setZoom(state.zoom, false);
    const pathCount = (result.stats.pathCount ?? result.stats.contourCount ?? 0).toLocaleString('pt-BR');
    UIControls.toast(state.engine === 'vtracer'
      ? `VTracer gerou um SVG com ${pathCount} caminhos.`
      : `Conversão alternativa concluída com ${pathCount} caminhos. Compile o VTracer WASM para ativar o motor principal.`);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function runMainFallback(requestId, options) {
    window.setTimeout(() => {
      try {
        if (requestId !== state.requestId || !state.imageData) return;
        const result = Vectorizer.trace(state.imageData, options);
        result.engine = 'legacy-fallback';
        result.stats.engine = 'legacy-fallback';
        applyResult(result);
      } catch (error) {
        setBusy(false);
        UIControls.toast(error.message || 'Falha na vetorização alternativa.', 'error');
      }
    }, 25);
  }

  function traceNow() {
    if (!state.source || state.isBusy) return;
    try {
      fitImageData();
    } catch (error) {
      UIControls.toast(error.message || 'Não foi possível preparar a imagem.', 'error');
      return;
    }
    const options = optionsFromUI();
    const requestId = ++state.requestId;
    setBusy(true, 'Agrupando regiões e calculando caminhos vetoriais');
    const worker = ensureWorker();
    if (worker) {
      const pixelCopy = new Uint8ClampedArray(state.imageData.data).buffer;
      worker.postMessage({ id: requestId, buffer: pixelCopy, width: state.imageData.width, height: state.imageData.height, options }, [pixelCopy]);
    } else {
      // Explicit compatibility mode for environments without module workers.
      runMainFallback(requestId, options);
    }
  }

  function scheduleTrace() {
    if (!state.source) return;
    window.clearTimeout(state.traceTimer);
    state.traceTimer = window.setTimeout(() => {
      if (state.isBusy) {
        // A worker may still be processing the previous request. The new request
        // is queued after it; request IDs ensure stale results are not displayed.
        state.requestId++;
        setBusy(false);
      }
      traceNow();
    }, 360);
  }

  async function openFile(file) {
    if (!file) return;
    try {
      const decoded = await ImageLoader.decodeFile(file);
      if (state.source) ImageLoader.release(state.source);
      state.source = decoded;
      state.resultSvg = '';
      state.stats = null;
      state.zoom = 1; state.panX = 0; state.panY = 0;
      setFileUi(decoded);
      $('#emptyState').classList.add('hidden');
      $('#visualStage').classList.remove('hidden');
      $('#originalPreview').src = decoded.objectUrl;
      $('#vectorPreview').innerHTML = '';
      $('#resultMeta').classList.add('hidden');
      $('#downloadSvgButton').disabled = true;
      $('#downloadPngButton').disabled = true;
      $('#viewCodeButton').disabled = true;
      $('#modalDownloadButton').disabled = true;
      state.currentView = 'compare';
      $$('.canvas-tab').forEach((tab) => { const active = tab.dataset.view === 'compare'; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
      updateStageView();
      setBusy(false);
      traceNow();
    } catch (error) {
      UIControls.toast(error.message || 'Não foi possível abrir esta imagem.', 'error');
    }
  }

  function removeFile() {
    if (state.source) ImageLoader.release(state.source);
    state.source = null;
    state.imageData = null;
    state.resultSvg = '';
    state.stats = null;
    state.requestId++;
    setBusy(false);
    setFileUi(null);
    $('#emptyState').classList.remove('hidden');
    $('#visualStage').classList.add('hidden');
    $('#resultMeta').classList.add('hidden');
    $('#compareControl').classList.add('hidden');
    $('#downloadSvgButton').disabled = true;
    $('#downloadPngButton').disabled = true;
    $('#viewCodeButton').disabled = true;
    $('#vectorPreview').innerHTML = '';
    $('#originalPreview').removeAttribute('src');
    $('#zoomLabel').textContent = '100%';
    state.currentView = 'compare';
  }

  function updateStageView() {
    const compare = state.currentView === 'compare';
    const original = state.currentView === 'original';
    const vector = state.currentView === 'vector';
    $('#compareControl').classList.toggle('hidden', !compare || !state.resultSvg);
    $('#originalLayer').style.display = vector ? 'none' : 'grid';
    $('#vectorLayer').style.display = original || !state.resultSvg ? 'none' : 'grid';
    $('#comparisonLine').style.display = compare && state.resultSvg ? 'block' : 'none';
    $$('.canvas-tab').forEach((tab) => {
      const active = tab.dataset.view === state.currentView;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    const compareValue = Number($('#compareRange').value);
    $('#vectorLayer').style.clipPath = compare ? `inset(0 0 0 ${compareValue}%)` : 'inset(0 0 0 0)';
    $('#comparisonLine').style.left = `${compareValue}%`;
  }

  function setZoom(value, resetPan = true) {
    state.zoom = Math.max(0.4, Math.min(3.5, Number(value)));
    if (resetPan) { state.panX = 0; state.panY = 0; }
    const transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    $('#originalPreview').style.transform = transform;
    $('#vectorPreview').style.transform = transform;
    $('#zoomLabel').textContent = `${Math.round(state.zoom * 100)}%`;
  }

  function resetSettings() {
    for (const [key, value] of Object.entries(defaults)) {
      const map = {
        detail: 'detailRange', threshold: 'thresholdRange', levels: 'levelsRange', colors: 'colorsRange',
        smooth: 'smoothRange', noise: 'noiseRange', brightness: 'brightnessRange', contrast: 'contrastRange',
        saturation: 'saturationRange'
      };
      if (map[key]) document.getElementById(map[key]).value = value;
      if (key === 'preserveTransparency') $('#transparencyToggle').checked = value;
      if (key === 'adaptiveThreshold') $('#adaptiveThresholdToggle').checked = value;
    }
    setMode(defaults.mode);
    $('#colorsRange').value = defaults.colors;
    updateRangeLabels();
    if (state.source) scheduleTrace();
  }

  function initRanges() {
    for (const [inputId] of rangeConfig) {
      const input = document.getElementById(inputId);
      input.addEventListener('input', () => {
        updateRangeLabels();
        scheduleTrace();
      });
    }
    $('#transparencyToggle').addEventListener('change', scheduleTrace);
    $('#adaptiveThresholdToggle').addEventListener('change', scheduleTrace);
    updateRangeLabels();
  }

  function initFileInputs() {
    const fileInput = $('#fileInput');
    $('#browseButton').addEventListener('click', (event) => { event.stopPropagation(); fileInput.click(); });
    $('#emptyBrowseButton').addEventListener('click', () => fileInput.click());
    $('#dropZone').addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      fileInput.click();
    });
    $('#dropZone').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) openFile(file);
      fileInput.value = '';
    });
    $('#removeFileButton').addEventListener('click', removeFile);

    const dropTargets = [$('#dropZone'), $('#stageWrap')];
    dropTargets.forEach((target) => {
      ['dragenter', 'dragover'].forEach((name) => target.addEventListener(name, (event) => {
        event.preventDefault(); target.classList.add('drag-over');
      }));
      ['dragleave', 'drop'].forEach((name) => target.addEventListener(name, (event) => {
        event.preventDefault(); target.classList.remove('drag-over');
      }));
      target.addEventListener('drop', (event) => {
        const file = event.dataTransfer?.files?.[0];
        if (file) openFile(file);
      });
    });
    window.addEventListener('paste', (event) => {
      const items = Array.from(event.clipboardData?.items || []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) openFile(file);
      }
    });
  }

  function initCanvasControls() {
    $$('.mode-card').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
    $$('.canvas-tab').forEach((button) => button.addEventListener('click', () => {
      state.currentView = button.dataset.view;
      updateStageView();
    }));
    $('#compareRange').addEventListener('input', updateStageView);
    $$('[data-bg]').forEach((button) => button.addEventListener('click', () => {
      $('#stageWrap').classList.remove('bg-checker', 'bg-light', 'bg-dark');
      $('#stageWrap').classList.add(button.dataset.bg === 'checker' ? 'bg-checker' : `bg-${button.dataset.bg}`);
      $$('[data-bg]').forEach((item) => item.classList.toggle('active', item === button));
    }));
    $('#zoomInButton').addEventListener('click', () => setZoom(state.zoom + 0.15, false));
    $('#zoomOutButton').addEventListener('click', () => setZoom(state.zoom - 0.15, false));
    $('#fitButton').addEventListener('click', () => setZoom(1, true));
    $('#resetButton').addEventListener('click', resetSettings);
    $('#generateButton').addEventListener('click', traceNow);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && state.source && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const target = event.target;
        const typing = target && (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) || target.isContentEditable);
        if (!typing) { event.preventDefault(); traceNow(); }
      }
    });

    // Pointer-based pan for zoomed previews. The native comparison slider keeps
    // its normal input behavior because only the image viewport receives this.
    const stage = $('#visualStage');
    stage.addEventListener('pointerdown', (event) => {
      if (!state.resultSvg || state.zoom <= 1) return;
      if (event.target.closest('input,button,select')) return;
      state.pointerStart = { x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
      stage.setPointerCapture(event.pointerId);
      stage.classList.add('is-panning');
    });
    stage.addEventListener('pointermove', (event) => {
      if (!state.pointerStart) return;
      state.panX = state.pointerStart.panX + event.clientX - state.pointerStart.x;
      state.panY = state.pointerStart.panY + event.clientY - state.pointerStart.y;
      setZoom(state.zoom, false);
    });
    const stopPan = () => { state.pointerStart = null; stage.classList.remove('is-panning'); };
    stage.addEventListener('pointerup', stopPan);
    stage.addEventListener('pointercancel', stopPan);
    stage.addEventListener('lostpointercapture', stopPan);
  }

  function initExports() {
    $('#downloadSvgButton').addEventListener('click', () => {
      try { SvgExport.download(state.resultSvg, state.source?.name); }
      catch (error) { UIControls.toast(error.message, 'error'); }
    });
    const exportPng = async () => {
      try {
        await PngExport.download(
          state.resultSvg,
          state.source?.name,
          Number($('#pngScale').value),
          $('#pngBackground').value,
          $('#pngCustomColor').value
        );
        UIControls.toast('PNG exportado com sucesso.');
      } catch (error) { UIControls.toast(error.message || 'Falha ao exportar PNG.', 'error'); }
    };
    $('#downloadPngButton').addEventListener('click', exportPng);
    $('#pngBackground').addEventListener('change', () => {
      $('#pngCustomColor').hidden = $('#pngBackground').value !== 'custom';
    });
    $('#viewCodeButton').addEventListener('click', () => {
      if (!state.resultSvg) return;
      $('#svgCode').textContent = state.resultSvg;
      const stats = state.stats;
      $('#codeStats').innerHTML = '';
      [
        `${stats.pathCount} grupos de paths`,
        `${stats.contourCount} contornos`,
        `${stats.width} × ${stats.height} px`,
        formatBytes(stats.svgBytes)
      ].forEach((label) => {
        const item = document.createElement('span'); item.textContent = label; $('#codeStats').appendChild(item);
      });
      UIControls.openDialog($('#codeModal'));
    });
    $('#copySvgButton').addEventListener('click', async () => {
      try {
        await SvgExport.copy(state.resultSvg);
        UIControls.toast('Código SVG copiado.');
      } catch (error) {
        // Fallback for environments where Clipboard API is unavailable.
        const textarea = document.createElement('textarea');
        textarea.value = state.resultSvg; document.body.appendChild(textarea); textarea.select();
        const copied = document.execCommand('copy'); textarea.remove();
        UIControls.toast(copied ? 'Código SVG copiado.' : 'Não foi possível copiar automaticamente.', copied ? 'success' : 'error');
      }
    });
    $('#modalDownloadButton').addEventListener('click', () => {
      try { SvgExport.download(state.resultSvg, state.source?.name); }
      catch (error) { UIControls.toast(error.message, 'error'); }
    });
  }

  function init() {
    UIControls.initTheme();
    UIControls.initDialogs();
    initRanges();
    initFileInputs();
    initCanvasControls();
    initExports();
    setMode(defaults.mode);
    window.addEventListener('beforeunload', () => {
      if (state.source) ImageLoader.release(state.source);
      if (state.worker) state.worker.terminate();
    });
  }

  init();
})();
