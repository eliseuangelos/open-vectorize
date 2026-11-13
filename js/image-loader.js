(function (root) {
  'use strict';

  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp']);
  const EXTENSIONS = /\.(png|jpe?g|webp|bmp)$/i;

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2).replace('.', ',')} MB`;
  }

  async function decodeFile(file) {
    if (!(file instanceof Blob)) throw new TypeError('Arquivo inválido.');
    if (file.size > MAX_FILE_BYTES) throw new Error('O arquivo ultrapassa o limite de 20 MB.');
    const extensionValid = EXTENSIONS.test(file.name || '');
    const typeValid = ALLOWED.has(file.type);
    if (!extensionValid && !typeValid) throw new Error('Formato não suportado. Utilize PNG, JPG, WEBP ou BMP.');

    let bitmap;
    if ('createImageBitmap' in root) {
      try { bitmap = await root.createImageBitmap(file); } catch (error) { /* fallback below */ }
    }
    let image = bitmap;
    if (!image) {
      const objectUrl = URL.createObjectURL(file);
      try {
        image = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Não foi possível decodificar a imagem.'));
          img.src = objectUrl;
        });
      } finally { URL.revokeObjectURL(objectUrl); }
    }
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) {
      if (bitmap && bitmap.close) bitmap.close();
      throw new Error('A imagem não possui dimensões válidas.');
    }
    const objectUrl = URL.createObjectURL(file);
    const displayName = (file.name || 'imagem').replace(/[\\/:*?"<>|]/g, '_').slice(0, 160);
    return { file, image, width, height, objectUrl, name: displayName, type: file.type || 'image/bmp', size: file.size };
  }

  function makeImageData(source, maxDimension) {
    const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D não está disponível neste navegador.');
    context.clearRect(0, 0, width, height);
    context.drawImage(source.image, 0, 0, width, height);
    return { imageData: context.getImageData(0, 0, width, height), width, height, canvas };
  }

  function release(source) {
    if (!source) return;
    if (source.objectUrl) URL.revokeObjectURL(source.objectUrl);
    if (source.image && typeof source.image.close === 'function') source.image.close();
  }

  root.ImageLoader = { decodeFile, makeImageData, release, formatBytes, MAX_FILE_BYTES };
})(window);
