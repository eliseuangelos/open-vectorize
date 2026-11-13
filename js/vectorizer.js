/*
 * AngelosOpenVectorize — compatibility fallback contour engine.
 * Converts quantized pixel regions into SVG path geometry. No raster image is
 * embedded in the SVG output. The processing code runs in a Web Worker when
 * available, with a main-thread fallback.
 */
(function (root) {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const toHex = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
  const rgbHex = (r, g, b) => `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  function applyAdjustments(imageData, options) {
    const source = imageData.data;
    const pixels = new Uint8ClampedArray(source.length);
    const brightness = Number(options.brightness || 0) * 2.0;
    const contrast = Number(options.contrast || 0);
    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    const saturation = 1 + Number(options.saturation || 0) / 50;
    const preserveTransparency = options.preserveTransparency !== false;

    for (let i = 0; i < source.length; i += 4) {
      let r = source[i];
      let g = source[i + 1];
      let b = source[i + 2];
      let a = source[i + 3];
      if (!preserveTransparency && a < 255) {
        const opacity = a / 255;
        r = r * opacity + 255 * (1 - opacity);
        g = g * opacity + 255 * (1 - opacity);
        b = b * opacity + 255 * (1 - opacity);
        a = 255;
      }
      r = contrastFactor * (r - 128) + 128 + brightness;
      g = contrastFactor * (g - 128) + 128 + brightness;
      b = contrastFactor * (b - 128) + 128 + brightness;
      const gray = luminance(r, g, b);
      r = gray + (r - gray) * saturation;
      g = gray + (g - gray) * saturation;
      b = gray + (b - gray) * saturation;
      pixels[i] = clamp(r, 0, 255);
      pixels[i + 1] = clamp(g, 0, 255);
      pixels[i + 2] = clamp(b, 0, 255);
      pixels[i + 3] = a;
    }
    return pixels;
  }

  function quantizeGray(pixels, width, height, options, mode) {
    const length = width * height;
    const labels = new Int16Array(length);
    const palette = [];
    const levels = mode === 'bw' ? 2 : clamp(Number(options.levels || 6), 2, 12);
    if (mode === 'bw') {
      palette.push('#171b22', '#ffffff');
      const threshold = clamp(Number(options.threshold ?? 128), 0, 255);
      for (let p = 0, i = 0; p < length; p++, i += 4) {
        if (pixels[i + 3] < 16) { labels[p] = -1; continue; }
        labels[p] = luminance(pixels[i], pixels[i + 1], pixels[i + 2]) < threshold ? 0 : 1;
      }
    } else {
      for (let level = 0; level < levels; level++) {
        const channel = Math.round((level / (levels - 1)) * 255);
        palette.push(rgbHex(channel, channel, channel));
      }
      for (let p = 0, i = 0; p < length; p++, i += 4) {
        if (pixels[i + 3] < 16) { labels[p] = -1; continue; }
        const gray = luminance(pixels[i], pixels[i + 1], pixels[i + 2]);
        labels[p] = clamp(Math.round((gray / 255) * (levels - 1)), 0, levels - 1);
      }
    }
    return { labels, palette };
  }

  function buildPalette(pixels, pixelCount, colorCount) {
    // Deterministic sample avoids random output and bounds k-means work.
    const sampleLimit = 14000;
    const stride = Math.max(1, Math.floor(pixelCount / sampleLimit));
    const samples = [];
    for (let p = 0, i = 0; p < pixelCount; p += stride, i = p * 4) {
      if (pixels[i + 3] < 16) continue;
      samples.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
    }
    if (!samples.length) return [[0, 0, 0, 255]];

    const kLimit = Math.min(colorCount, samples.length);
    const centroids = [[samples[0][0], samples[0][1], samples[0][2]]];
    // Deterministic farthest-point seeding gives distinct colors a fair chance
    // to enter the palette, even when a large background dominates the image.
    while (centroids.length < kLimit) {
      let farthestSample = null;
      let farthestDistance = -1;
      for (const sample of samples) {
        let nearestDistance = Infinity;
        for (const center of centroids) {
          const dr = sample[0] - center[0];
          const dg = sample[1] - center[1];
          const db = sample[2] - center[2];
          const distance = dr * dr + dg * dg + db * db;
          if (distance < nearestDistance) nearestDistance = distance;
        }
        if (nearestDistance > farthestDistance) {
          farthestDistance = nearestDistance;
          farthestSample = sample;
        }
      }
      if (!farthestSample || farthestDistance <= 0) break;
      centroids.push([farthestSample[0], farthestSample[1], farthestSample[2]]);
    }
    const k = centroids.length;

    for (let iteration = 0; iteration < 5; iteration++) {
      const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
      for (let s = 0; s < samples.length; s++) {
        const sample = samples[s];
        let best = 0;
        let bestDistance = Infinity;
        for (let c = 0; c < k; c++) {
          const center = centroids[c];
          const dr = sample[0] - center[0];
          const dg = sample[1] - center[1];
          const db = sample[2] - center[2];
          const distance = dr * dr + dg * dg + db * db;
          if (distance < bestDistance) { bestDistance = distance; best = c; }
        }
        const bucket = sums[best];
        bucket[0] += sample[0]; bucket[1] += sample[1]; bucket[2] += sample[2]; bucket[3]++;
      }
      for (let c = 0; c < k; c++) {
        const sum = sums[c];
        if (sum[3]) centroids[c] = [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]];
      }
    }
    return centroids;
  }

  function quantizeColor(pixels, width, height, options, mode) {
    const pixelCount = width * height;
    const colors = mode === 'photo'
      ? clamp(Number(options.colors || 10), 2, 18)
      : clamp(Number(options.colors || 12), 2, 24);
    if (mode === 'photo') {
      const posterSteps = 7;
      const scale = 255 / (posterSteps - 1);
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 16) continue;
        pixels[i] = Math.round(pixels[i] / scale) * scale;
        pixels[i + 1] = Math.round(pixels[i + 1] / scale) * scale;
        pixels[i + 2] = Math.round(pixels[i + 2] / scale) * scale;
      }
    }
    const centroids = buildPalette(pixels, pixelCount, colors);
    const labels = new Int16Array(pixelCount);
    const palette = centroids.map((c) => rgbHex(c[0], c[1], c[2]));

    for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
      if (pixels[i + 3] < 16) { labels[p] = -1; continue; }
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      let best = 0;
      let bestDistance = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const center = centroids[c];
        const dr = r - center[0];
        const dg = g - center[1];
        const db = b - center[2];
        const distance = dr * dr + dg * dg + db * db;
        if (distance < bestDistance) { bestDistance = distance; best = c; }
      }
      labels[p] = best;
    }
    return { labels, palette };
  }

  function removeSmallRegions(labels, width, height, minimumArea) {
    const minArea = Math.max(0, Number(minimumArea || 0));
    if (minArea < 2) return;
    const length = width * height;
    const visited = new Uint8Array(length);
    const queue = new Int32Array(length);
    const directions = [-1, 1, -width, width];

    for (let start = 0; start < length; start++) {
      const label = labels[start];
      if (label < 0 || visited[start]) continue;
      let head = 0, tail = 0;
      queue[tail++] = start;
      visited[start] = 1;
      const neighbors = new Map();
      while (head < tail) {
        const index = queue[head++];
        const x = index % width;
        const y = Math.floor(index / width);
        for (let d = 0; d < 4; d++) {
          const nx = x + (d === 0 ? -1 : d === 1 ? 1 : 0);
          const ny = y + (d === 2 ? -1 : d === 3 ? 1 : 0);
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (labels[next] === label) {
            if (!visited[next]) { visited[next] = 1; queue[tail++] = next; }
          } else if (labels[next] >= 0) {
            neighbors.set(labels[next], (neighbors.get(labels[next]) || 0) + 1);
          }
        }
      }
      if (tail < minArea && neighbors.size) {
        let replacement = label;
        let highest = -1;
        for (const [candidate, count] of neighbors) {
          if (count > highest) { highest = count; replacement = candidate; }
        }
        for (let q = 0; q < tail; q++) labels[queue[q]] = replacement;
      }
    }
  }

  function edgeLabel(vertex, direction, labels, width, height, stride) {
    const x = vertex % stride;
    const y = Math.floor(vertex / stride);
    let px = x, py = y;
    if (direction === 1) px--;
    else if (direction === 2) { px--; py--; }
    else if (direction === 3) py--;
    if (px < 0 || px >= width || py < 0 || py >= height) return -1;
    return labels[py * width + px];
  }

  function simplifyOpen(points, tolerance) {
    if (points.length < 3 || tolerance <= 0) return points;
    const keep = new Uint8Array(points.length);
    keep[0] = 1; keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    const sqTolerance = tolerance * tolerance;
    while (stack.length) {
      const [first, last] = stack.pop();
      const a = points[first], b = points[last];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const lengthSq = dx * dx + dy * dy;
      let maxDistance = sqTolerance;
      let index = -1;
      for (let i = first + 1; i < last; i++) {
        const p = points[i];
        let distance;
        if (lengthSq === 0) {
          const px = p[0] - a[0], py = p[1] - a[1];
          distance = px * px + py * py;
        } else {
          const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq, 0, 1);
          const px = a[0] + t * dx, py = a[1] + t * dy;
          const ex = p[0] - px, ey = p[1] - py;
          distance = ex * ex + ey * ey;
        }
        if (distance > maxDistance) { maxDistance = distance; index = i; }
      }
      if (index >= 0) { keep[index] = 1; stack.push([first, index], [index, last]); }
    }
    const result = [];
    for (let i = 0; i < points.length; i++) if (keep[i]) result.push(points[i]);
    return result;
  }

  function simplifyClosed(points, tolerance) {
    if (points.length < 5) return points;
    const clean = [];
    for (let i = 0; i < points.length; i++) {
      const previous = points[(i + points.length - 1) % points.length];
      const current = points[i];
      const next = points[(i + 1) % points.length];
      const collinear = (previous[0] === current[0] && current[0] === next[0]) || (previous[1] === current[1] && current[1] === next[1]);
      if (!collinear) clean.push(current);
    }
    if (clean.length < 4 || tolerance <= 0) return clean;
    let farthest = 1, maxDistance = -1;
    for (let i = 1; i < clean.length; i++) {
      const dx = clean[i][0] - clean[0][0], dy = clean[i][1] - clean[0][1];
      const distance = dx * dx + dy * dy;
      if (distance > maxDistance) { maxDistance = distance; farthest = i; }
    }
    const firstHalf = clean.slice(0, farthest + 1);
    const secondHalf = clean.slice(farthest).concat([clean[0]]);
    const a = simplifyOpen(firstHalf, tolerance);
    const b = simplifyOpen(secondHalf, tolerance);
    const result = a.concat(b.slice(1, -1));
    return result.length >= 3 ? result : clean;
  }

  function makeSvgPath(points, curveStrength = 0) {
    if (points.length < 3) return '';
    if (curveStrength <= 0) {
      let linear = `M${points[0][0]} ${points[0][1]}`;
      for (let i = 1; i < points.length; i++) linear += `L${points[i][0]} ${points[i][1]}`;
      return linear + 'Z';
    }

    const threshold = 0.28 + clamp(curveStrength, 0, 5) * 0.13;
    const corners = points.map((point, index) => {
      const previous = points[(index + points.length - 1) % points.length];
      const next = points[(index + 1) % points.length];
      const ax = point[0] - previous[0], ay = point[1] - previous[1];
      const bx = next[0] - point[0], by = next[1] - point[1];
      const cross = ax * by - ay * bx;
      const dot = ax * bx + ay * by;
      return Math.abs(Math.atan2(cross, dot)) > threshold;
    });
    const last = points[points.length - 1];
    const first = points[0];
    const start = corners[0] ? first : [(last[0] + first[0]) / 2, (last[1] + first[1]) / 2];
    let curved = `M${start[0]} ${start[1]}`;
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const next = points[(i + 1) % points.length];
      if (corners[i]) curved += `L${point[0]} ${point[1]}`;
      else curved += `Q${point[0]} ${point[1]} ${(point[0] + next[0]) / 2} ${(point[1] + next[1]) / 2}`;
    }
    return curved + 'Z';
  }

  function traceContours(labels, width, height, palette, options) {
    const stride = width + 1;
    const vertexCount = (width + 1) * (height + 1);
    const edgeCount = vertexCount * 4;
    const edges = new Uint8Array(edgeCount);
    const used = new Uint8Array(edgeCount);

    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const index = row + x;
        const label = labels[index];
        if (label < 0) continue;
        const top = y === 0 ? -1 : labels[index - width];
        const right = x === width - 1 ? -1 : labels[index + 1];
        const bottom = y === height - 1 ? -1 : labels[index + width];
        const left = x === 0 ? -1 : labels[index - 1];
        if (top !== label) edges[(y * stride + x) * 4] = 1;
        if (right !== label) edges[(y * stride + x + 1) * 4 + 1] = 1;
        if (bottom !== label) edges[((y + 1) * stride + x + 1) * 4 + 2] = 1;
        if (left !== label) edges[((y + 1) * stride + x) * 4 + 3] = 1;
      }
    }

    const pathParts = Array.from({ length: palette.length }, () => []);
    const contoursPerLabel = new Uint32Array(palette.length);
    const tolerance = clamp(Number(options.smooth || 0), 0, 5) * 0.48;
    const maxSteps = edgeCount;

    for (let startEdge = 0; startEdge < edgeCount; startEdge++) {
      if (!edges[startEdge] || used[startEdge]) continue;
      const startVertex = Math.floor(startEdge / 4);
      const startDirection = startEdge & 3;
      const label = edgeLabel(startVertex, startDirection, labels, width, height, stride);
      if (label < 0 || label >= palette.length) { used[startEdge] = 1; continue; }
      let currentVertex = startVertex;
      let currentDirection = startDirection;
      const points = [];
      let closed = false;

      for (let step = 0; step < maxSteps; step++) {
        const currentEdge = currentVertex * 4 + currentDirection;
        if (used[currentEdge]) break;
        used[currentEdge] = 1;
        const x = currentVertex % stride;
        const y = Math.floor(currentVertex / stride);
        points.push([x, y]);
        if (currentDirection === 0) currentVertex += 1;
        else if (currentDirection === 1) currentVertex += stride;
        else if (currentDirection === 2) currentVertex -= 1;
        else currentVertex -= stride;

        const candidates = [(currentDirection + 1) & 3, currentDirection, (currentDirection + 3) & 3, (currentDirection + 2) & 3];
        let nextEdge = -1;
        for (const nextDirection of candidates) {
          const candidate = currentVertex * 4 + nextDirection;
          if (candidate === startEdge) { nextEdge = candidate; closed = true; break; }
          if (candidate >= 0 && candidate < edgeCount && edges[candidate] && !used[candidate] && edgeLabel(currentVertex, nextDirection, labels, width, height, stride) === label) {
            nextEdge = candidate;
            break;
          }
        }
        if (closed || nextEdge < 0) break;
        currentDirection = nextEdge & 3;
      }

      if (!closed || points.length < 3) continue;
      const simplified = simplifyClosed(points, tolerance);
      const path = makeSvgPath(simplified, Number(options.smooth || 0));
      if (path) { pathParts[label].push(path); contoursPerLabel[label]++; }
    }

    const output = [];
    let pathCount = 0;
    let contourCount = 0;
    for (let label = 0; label < pathParts.length; label++) {
      if (!pathParts[label].length) continue;
      pathCount++;
      contourCount += contoursPerLabel[label];
      output.push(`<path d="${pathParts[label].join('')}" fill="${palette[label]}" fill-rule="evenodd"/>`);
    }
    return { markup: output.join(''), pathCount, contourCount };
  }

  function trace(imageData, options = {}) {
    if (!imageData || !imageData.data || !Number.isInteger(imageData.width) || !Number.isInteger(imageData.height)) {
      throw new TypeError('ImageData inválida para vetorização.');
    }
    const width = imageData.width;
    const height = imageData.height;
    if (width < 1 || height < 1) throw new RangeError('A imagem está vazia.');
    if (width * height > 1250000) throw new RangeError('A imagem de trabalho excede o limite seguro de 1,25 megapixel. Reduza o tamanho e tente novamente.');

    const mode = ['bw', 'gray', 'color', 'photo'].includes(options.mode) ? options.mode : 'color';
    const adjusted = applyAdjustments(imageData, options);
    const quantized = mode === 'bw' || mode === 'gray'
      ? quantizeGray(adjusted, width, height, options, mode)
      : quantizeColor(adjusted, width, height, options, mode);

    removeSmallRegions(quantized.labels, width, height, Number(options.noise || 0));
    const traced = traceContours(quantized.labels, width, height, quantized.palette, options);
    const originalWidth = Math.max(width, Number(options.outputWidth || width));
    const originalHeight = Math.max(height, Number(options.outputHeight || height));
    const svg = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg" width="${originalWidth}" height="${originalHeight}" viewBox="0 0 ${width} ${height}" version="1.1">`,
      `<title>AngelosOpenVectorize — imagem vetorizada</title>`,
      `<g stroke="none" stroke-linejoin="round">${traced.markup}</g>`,
      `</svg>`
    ].join('');

    return {
      svg,
      stats: {
        width: originalWidth,
        height: originalHeight,
        workWidth: width,
        workHeight: height,
        pathCount: traced.pathCount,
        contourCount: traced.contourCount,
        paletteCount: quantized.palette.length,
        svgBytes: new TextEncoder().encode(svg).length
      }
    };
  }

  root.Vectorizer = { trace };
})(typeof self !== 'undefined' ? self : globalThis);
