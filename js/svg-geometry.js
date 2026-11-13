/*
 * AngelosOpenVectorize — geometric SVG regularizer.
 *
 * Purpose: remove raster-induced wobble from nearly straight vector segments
 * without flattening genuinely curved sections. It parses SVG path commands,
 * recognizes almost-collinear cubic/quadratic segments, and merges connected
 * straight runs using a total-least-squares line fit.
 *
 * This is a deterministic geometric postprocessor; it does not pretend to be
 * a semantic/neural image recognizer.
 */
(function (root) {
  'use strict';

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const EPS = 1e-8;
  const TOKEN_RE = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;

  function point(x, y) { return [Number(x), Number(y)]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function length(a) { return Math.hypot(a[0], a[1]); }
  function distance(a, b) { return length(sub(a, b)); }
  function cross2(a, b) { return a[0] * b[1] - a[1] * b[0]; }

  function distanceToInfiniteLine(p, a, b) {
    const direction = sub(b, a);
    const size = length(direction);
    if (size < EPS) return distance(p, a);
    return Math.abs(cross2(direction, sub(p, a))) / size;
  }

  function reflect(control, around) {
    return [2 * around[0] - control[0], 2 * around[1] - control[1]];
  }

  function tokenize(data) {
    return data.match(TOKEN_RE) || [];
  }

  function parsePath(data) {
    const tokens = tokenize(data);
    const subpaths = [];
    let current = [0, 0];
    let currentStart = [0, 0];
    let active = null;
    let command = null;
    let previousCubicControl = null;
    let previousQuadControl = null;
    let i = 0;

    const isCommand = (value) => typeof value === 'string' && /^[a-z]$/i.test(value);
    const ensureSubpath = () => {
      if (!active) {
        active = { start: current.slice(), segments: [], closed: false };
        currentStart = current.slice();
      }
    };
    const readNumbers = (count) => {
      if (i + count > tokens.length) throw new Error('Comando SVG incompleto.');
      const values = [];
      for (let n = 0; n < count; n++) {
        if (isCommand(tokens[i])) throw new Error('Comando SVG sem parâmetros suficientes.');
        const value = Number(tokens[i++]);
        if (!Number.isFinite(value)) throw new Error('Coordenada SVG inválida.');
        values.push(value);
      }
      return values;
    };
    const absolute = (x, y, relative) => relative ? [current[0] + x, current[1] + y] : [x, y];
    const push = (segment) => {
      ensureSubpath();
      active.segments.push(segment);
      current = segment.p1.slice();
    };
    const flush = () => {
      if (active) {
        subpaths.push(active);
        active = null;
      }
    };

    while (i < tokens.length) {
      if (isCommand(tokens[i])) command = tokens[i++];
      if (!command) throw new Error('Dados de caminho SVG sem comando inicial.');

      const upper = command.toUpperCase();
      const relative = command !== upper;

      if (upper === 'Z') {
        ensureSubpath();
        active.closed = true;
        current = currentStart.slice();
        previousCubicControl = null;
        previousQuadControl = null;
        flush();
        command = null;
        continue;
      }

      if (upper === 'M') {
        const [x, y] = readNumbers(2);
        flush();
        current = absolute(x, y, relative);
        currentStart = current.slice();
        active = { start: current.slice(), segments: [], closed: false };
        // Subsequent coordinate pairs after M are implicit L commands.
        command = relative ? 'l' : 'L';
        previousCubicControl = null;
        previousQuadControl = null;
        continue;
      }

      ensureSubpath();
      if (upper === 'L') {
        const [x, y] = readNumbers(2);
        const end = absolute(x, y, relative);
        push({ type: 'L', p0: current.slice(), p1: end });
        previousCubicControl = previousQuadControl = null;
      } else if (upper === 'H') {
        const [x] = readNumbers(1);
        const end = [relative ? current[0] + x : x, current[1]];
        push({ type: 'L', p0: current.slice(), p1: end });
        previousCubicControl = previousQuadControl = null;
      } else if (upper === 'V') {
        const [y] = readNumbers(1);
        const end = [current[0], relative ? current[1] + y : y];
        push({ type: 'L', p0: current.slice(), p1: end });
        previousCubicControl = previousQuadControl = null;
      } else if (upper === 'C') {
        const v = readNumbers(6);
        const c1 = absolute(v[0], v[1], relative);
        const c2 = absolute(v[2], v[3], relative);
        const end = absolute(v[4], v[5], relative);
        push({ type: 'C', p0: current.slice(), c1, c2, p1: end });
        previousCubicControl = c2;
        previousQuadControl = null;
      } else if (upper === 'S') {
        const v = readNumbers(4);
        const c1 = previousCubicControl ? reflect(previousCubicControl, current) : current.slice();
        const c2 = absolute(v[0], v[1], relative);
        const end = absolute(v[2], v[3], relative);
        push({ type: 'C', p0: current.slice(), c1, c2, p1: end });
        previousCubicControl = c2;
        previousQuadControl = null;
      } else if (upper === 'Q') {
        const v = readNumbers(4);
        const control = absolute(v[0], v[1], relative);
        const end = absolute(v[2], v[3], relative);
        push({ type: 'Q', p0: current.slice(), control, p1: end });
        previousQuadControl = control;
        previousCubicControl = null;
      } else if (upper === 'T') {
        const v = readNumbers(2);
        const control = previousQuadControl ? reflect(previousQuadControl, current) : current.slice();
        const end = absolute(v[0], v[1], relative);
        push({ type: 'Q', p0: current.slice(), control, p1: end });
        previousQuadControl = control;
        previousCubicControl = null;
      } else if (upper === 'A') {
        const v = readNumbers(7);
        const end = absolute(v[5], v[6], relative);
        push({ type: 'A', p0: current.slice(), p1: end, args: [v[0], v[1], v[2], v[3], v[4], end[0], end[1]] });
        previousCubicControl = previousQuadControl = null;
      } else {
        throw new Error(`Comando SVG não suportado: ${command}`);
      }
    }
    flush();
    return subpaths;
  }

  function sampleCurve(segment, steps = 5) {
    const points = [];
    for (let i = 1; i <= steps; i++) {
      const t = i / (steps + 1);
      const u = 1 - t;
      if (segment.type === 'C') {
        const p = add(
          add(mul(segment.p0, u * u * u), mul(segment.c1, 3 * u * u * t)),
          add(mul(segment.c2, 3 * u * t * t), mul(segment.p1, t * t * t))
        );
        points.push(p);
      } else if (segment.type === 'Q') {
        points.push(add(add(mul(segment.p0, u * u), mul(segment.control, 2 * u * t)), mul(segment.p1, t * t)));
      }
    }
    return points;
  }

  function flatCurve(segment, tolerance) {
    const chordLength = distance(segment.p0, segment.p1);
    if (chordLength < EPS) return false;
    const controls = segment.type === 'C' ? [segment.c1, segment.c2] : [segment.control];
    const maxDeviation = Math.max(...controls.map((p) => distanceToInfiniteLine(p, segment.p0, segment.p1)));
    return maxDeviation <= tolerance;
  }

  function fitLine(points) {
    if (points.length < 2) return null;
    const mean = points.reduce((sum, p) => add(sum, p), [0, 0]).map((v) => v / points.length);
    let xx = 0, yy = 0, xy = 0;
    for (const p of points) {
      const dx = p[0] - mean[0], dy = p[1] - mean[1];
      xx += dx * dx; yy += dy * dy; xy += dx * dy;
    }
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
    const direction = [Math.cos(angle), Math.sin(angle)];
    const normal = [-direction[1], direction[0]];
    let maxError = 0, sumError = 0;
    let minProjection = Infinity, maxProjection = -Infinity;
    for (const p of points) {
      const delta = sub(p, mean);
      const projection = dot(delta, direction);
      const error = Math.abs(dot(delta, normal));
      minProjection = Math.min(minProjection, projection);
      maxProjection = Math.max(maxProjection, projection);
      maxError = Math.max(maxError, error);
      sumError += error * error;
    }
    return {
      direction,
      normal,
      mean,
      maxError,
      rmsError: Math.sqrt(sumError / points.length),
      span: maxProjection - minProjection
    };
  }

  function lineSamples(segment) {
    if (segment.type === 'L') return [segment.p0, segment.p1];
    return [segment.p0, ...sampleCurve(segment, 5), segment.p1];
  }

  function canJoinLineRun(run, next, tolerance, maxTurnRadians) {
    if (next.type !== 'L' || run.type !== 'L') return false;
    const prevVector = sub(run.p1, run.p0);
    const nextVector = sub(next.p1, next.p0);
    const denom = length(prevVector) * length(nextVector);
    if (denom < EPS) return false;
    const cosine = clamp(dot(prevVector, nextVector) / denom, -1, 1);
    const turn = Math.acos(cosine);
    if (turn > maxTurnRadians) return false;
    const candidate = [...run.fitPoints, ...lineSamples(next).slice(1)];
    const fit = fitLine(candidate);
    return Boolean(fit && fit.span >= 3 && fit.maxError <= tolerance);
  }

  function stabilizeLineFit(fit) {
    if (!fit) return fit;
    let direction = fit.direction.slice();
    const angle = Math.atan2(direction[1], direction[0]);
    const axisTolerance = 1.6 * Math.PI / 180;
    const horizontalDistance = Math.min(Math.abs(angle), Math.abs(Math.PI - Math.abs(angle)));
    const verticalDistance = Math.abs(Math.PI / 2 - Math.abs(angle));
    // Snap only near-axis lines. This removes tiny raster-induced slopes from
    // borders and diagram edges, without rotating genuinely diagonal artwork.
    if (horizontalDistance <= axisTolerance) direction = [1, 0];
    else if (verticalDistance <= axisTolerance) direction = [0, 1];
    return { ...fit, direction, normal: [-direction[1], direction[0]] };
  }

  function intersectFits(first, second) {
    if (!first || !second) return null;
    const denominator = cross2(first.direction, second.direction);
    if (Math.abs(denominator) < 0.035) return null;
    const t = cross2(sub(second.mean, first.mean), second.direction) / denominator;
    return add(first.mean, mul(first.direction, t));
  }

  function projectPointToFit(fit, value) {
    const projection = dot(sub(value, fit.mean), fit.direction);
    return add(fit.mean, mul(fit.direction, projection));
  }

  function sampleRasterPixel(raster, x, y) {
    const { data, width, height } = raster;
    const fx = x - 0.5;
    const fy = y - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const output = [0, 0, 0, 0];
    for (let oy = 0; oy <= 1; oy++) {
      for (let ox = 0; ox <= 1; ox++) {
        const px = x0 + ox, py = y0 + oy;
        const weight = (ox ? tx : 1 - tx) * (oy ? ty : 1 - ty);
        if (px < 0 || px >= width || py < 0 || py >= height) {
          // Pixels outside the canvas are transparent, not an invented white
          // background. The alpha channel distinguishes this from white art.
          continue;
        }
        const offset = (py * width + px) * 4;
        for (let channel = 0; channel < 4; channel++) output[channel] += data[offset + channel] * weight;
      }
    }
    return output;
  }

  function colorDistance(sample, target) {
    const dr = sample[0] - target[0];
    const dg = sample[1] - target[1];
    const db = sample[2] - target[2];
    const da = (sample[3] - target[3]) * 0.72;
    return Math.sqrt(dr * dr + dg * dg + db * db + da * da);
  }

  function parsePaintColor(tag) {
    const style = (tag.match(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/i) || [])[2] || '';
    const explicit = (tag.match(/\sfill\s*=\s*(["'])([\s\S]*?)\1/i) || [])[2];
    const value = explicit || ((style.match(/(?:^|;)\s*fill\s*:\s*([^;]+)/i) || [])[1] || '').trim();
    if (!value || value === 'none' || value === 'currentColor' || value.startsWith('url(')) return null;
    let match = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (match) {
      const hex = match[1].length === 3 ? match[1].split('').map((ch) => ch + ch).join('') : match[1];
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255];
    }
    match = value.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*([\d.]+))?\s*\)$/i);
    if (match) return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 255 : clamp(Number(match[4]), 0, 1) * 255];
    return null;
  }

  function rasterBoundaryFit(points, candidateFit, raster, fillColor, tolerance) {
    if (!raster || !raster.data || !raster.width || !raster.height || !fillColor || !candidateFit) return null;
    const span = candidateFit.span;
    if (span < 20 || points.length < 3) return null;

    const viewScaleX = Number(raster.scaleX || 1);
    const viewScaleY = Number(raster.scaleY || 1);
    if (!(viewScaleX > 0 && viewScaleY > 0)) return null;
    const rasterDirection = [candidateFit.direction[0] * viewScaleX, candidateFit.direction[1] * viewScaleY];
    const directionLength = length(rasterDirection);
    if (directionLength < EPS) return null;
    const direction = mul(rasterDirection, 1 / directionLength);
    const normal = [-direction[1], direction[0]];
    const radius = clamp(Math.max(7, tolerance * 4.2), 7, 14);
    const sampleCount = clamp(Math.ceil(span / 7), 6, 48);
    const probes = [];

    for (let i = 0; i < sampleCount; i++) {
      const t = 0.08 + 0.84 * (i / Math.max(1, sampleCount - 1));
      const documentPoint = add(candidateFit.mean, mul(candidateFit.direction, (t - 0.5) * span));
      const base = [documentPoint[0] * viewScaleX, documentPoint[1] * viewScaleY];
      const plus = sampleRasterPixel(raster, base[0] + normal[0] * radius, base[1] + normal[1] * radius);
      const minus = sampleRasterPixel(raster, base[0] - normal[0] * radius, base[1] - normal[1] * radius);
      probes.push({ base, plusDistance: colorDistance(plus, fillColor), minusDistance: colorDistance(minus, fillColor) });
    }

    const median = (values) => {
      const sorted = values.slice().sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    const plusMean = median(probes.map((probe) => probe.plusDistance));
    const minusMean = median(probes.map((probe) => probe.minusDistance));
    const insideSign = plusMean <= minusMean ? 1 : -1;
    const insideDistance = Math.min(plusMean, minusMean);
    const outsideDistance = Math.max(plusMean, minusMean);
    // A flat fill must be measurably closer to one side. This rejects vague
    // boundaries in photos and prevents geometry from being guessed by shape.
    if (outsideDistance - insideDistance < 34) return null;
    const threshold = insideDistance + (outsideDistance - insideDistance) * 0.48;
    const edgePoints = [];
    const step = 0.25;

    for (const probe of probes) {
      let previousOffset = insideSign * radius;
      let previousDistance = colorDistance(
        sampleRasterPixel(raster, probe.base[0] + normal[0] * previousOffset, probe.base[1] + normal[1] * previousOffset),
        fillColor
      );
      let crossing = null;
      for (let offset = insideSign * (radius - step); Math.abs(offset) <= radius + EPS; offset -= insideSign * step) {
        const currentDistance = colorDistance(
          sampleRasterPixel(raster, probe.base[0] + normal[0] * offset, probe.base[1] + normal[1] * offset),
          fillColor
        );
        if (previousDistance <= threshold && currentDistance > threshold) {
          const denominator = currentDistance - previousDistance;
          const mix = Math.abs(denominator) < EPS ? 0.5 : clamp((threshold - previousDistance) / denominator, 0, 1);
          crossing = previousOffset + (offset - previousOffset) * mix;
          break;
        }
        previousOffset = offset;
        previousDistance = currentDistance;
      }
      if (crossing === null) continue;
      const rasterPoint = add(probe.base, mul(normal, crossing));
      edgePoints.push([rasterPoint[0] / viewScaleX, rasterPoint[1] / viewScaleY]);
    }

    if (edgePoints.length < Math.min(6, sampleCount - 1)) return null;
    const fit = fitLine(edgePoints);
    const maxAllowedError = clamp(Math.max(0.8, tolerance * 0.42), 0.8, 1.35);
    if (!fit || fit.maxError > maxAllowedError || fit.rmsError > maxAllowedError * 0.52) return null;
    return { ...fit, evidencePoints: edgePoints };
  }

  function regularizeSubpath(subpath, tolerance, maxTurnRadians, raster, fillColor) {
    const candidateTolerance = clamp(Math.max(tolerance * 6.2, 7), 7, 18);
    const flattened = subpath.segments.map((segment) => {
      if (segment.type === 'L') {
        return { type: 'L', p0: segment.p0, p1: segment.p1, fitPoints: lineSamples(segment), wasCurve: false, original: segment };
      }
      if ((segment.type === 'C' || segment.type === 'Q') && flatCurve(segment, candidateTolerance)) {
        return {
          type: 'L', p0: segment.p0, p1: segment.p1,
          fitPoints: lineSamples(segment), wasCurve: true, original: segment
        };
      }
      return { type: 'ORIGINAL', original: segment };
    });

    const output = [];
    let index = 0;
    let straightenedCurves = 0;
    let mergedSegments = 0;
    let rasterLinesRecovered = 0;
    let rasterLineCandidatesRejected = 0;

    while (index < flattened.length) {
      const first = flattened[index];
      if (first.type !== 'L') {
        output.push(first.original);
        index++;
        continue;
      }

      let run = {
        ...first,
        fitPoints: first.fitPoints.slice(),
        originalSegments: [first.original],
        segmentCount: 1,
        hadCurve: Boolean(first.wasCurve)
      };
      let nextIndex = index + 1;
      while (nextIndex < flattened.length && flattened[nextIndex].type === 'L') {
        const next = flattened[nextIndex];
        if (!canJoinLineRun(run, next, candidateTolerance, maxTurnRadians)) break;
        run.p1 = next.p1;
        run.fitPoints.push(...next.fitPoints.slice(1));
        run.originalSegments.push(next.original);
        run.segmentCount++;
        run.hadCurve = run.hadCurve || Boolean(next.wasCurve);
        nextIndex++;
      }

      const pathFit = stabilizeLineFit(fitLine(run.fitPoints));
      const evidenceFit = rasterBoundaryFit(run.fitPoints, pathFit, raster, fillColor, tolerance);
      let acceptedFit = null;
      if (evidenceFit) {
        acceptedFit = stabilizeLineFit(evidenceFit);
        rasterLinesRecovered++;
      } else if ((!raster || !fillColor) && pathFit && pathFit.maxError <= tolerance) {
        // Without source pixels (e.g. standalone SVG repair), use a conservative
        // geometry-only tolerance. During image tracing, a candidate edge must
        // be confirmed by the original raster before it replaces a curve.
        acceptedFit = pathFit;
      } else if (raster && fillColor && (run.hadCurve || run.segmentCount > 1)) {
        rasterLineCandidatesRejected++;
      }

      if (acceptedFit) {
        const start = projectPointToFit(acceptedFit, run.p0);
        const end = projectPointToFit(acceptedFit, run.p1);
        if (run.hadCurve) straightenedCurves++;
        mergedSegments += Math.max(0, run.segmentCount - 1);
        output.push({ type: 'L', p0: start, p1: end, lineFit: acceptedFit });
      } else {
        // A curve not supported by source pixels remains untouched. This is
        // the key safety valve: only simplify when geometry or raster evidence
        // supports a straight edge.
        output.push(...run.originalSegments);
      }
      index = nextIndex;
    }

    // The SVG M command is stored separately from segment.p0. When the first
    // edge is recovered, move M to its projected start as well.
    if (output[0]?.type === 'L' && output[0].lineFit) subpath.start = output[0].p0.slice();

    // When two nearly straight edges meet at a corner, intersect their fitted
    // lines. This gives the two edges one shared, clean vertex instead of a
    // tiny mismatch caused by raster stair-steps.
    const count = output.length;
    const firstCorner = subpath.closed ? 0 : 1;
    const lastCorner = subpath.closed ? count : count - 1;
    for (let i = firstCorner; i < lastCorner; i++) {
      const previousIndex = (i - 1 + count) % count;
      const currentIndex = i % count;
      const previous = output[previousIndex];
      const current = output[currentIndex];
      if (previous?.type !== 'L' || current?.type !== 'L') continue;
      const intersection = intersectFits(previous.lineFit, current.lineFit);
      const anchor = i === 0 ? subpath.start : current.p0;
      if (!intersection || distance(intersection, anchor) > tolerance * 2.5) continue;
      previous.p1 = intersection;
      current.p0 = intersection;
      if (i === 0) subpath.start = intersection;
    }

    return {
      ...subpath,
      segments: output,
      straightenedCurves,
      mergedSegments,
      rasterLinesRecovered,
      rasterLineCandidatesRejected,
      commandsBefore: subpath.segments.length,
      commandsAfter: output.length
    };
  }

  function fmt(value) {
    const rounded = Math.abs(value) < 0.005 ? 0 : Number(value.toFixed(2));
    return String(rounded);
  }

  function writePath(subpaths) {
    const parts = [];
    for (const subpath of subpaths) {
      parts.push(`M${fmt(subpath.start[0])} ${fmt(subpath.start[1])}`);
      for (const segment of subpath.segments) {
        if (segment.type === 'L') {
          parts.push(`L${fmt(segment.p1[0])} ${fmt(segment.p1[1])}`);
        } else if (segment.type === 'C') {
          parts.push(`C${fmt(segment.c1[0])} ${fmt(segment.c1[1])} ${fmt(segment.c2[0])} ${fmt(segment.c2[1])} ${fmt(segment.p1[0])} ${fmt(segment.p1[1])}`);
        } else if (segment.type === 'Q') {
          parts.push(`Q${fmt(segment.control[0])} ${fmt(segment.control[1])} ${fmt(segment.p1[0])} ${fmt(segment.p1[1])}`);
        } else if (segment.type === 'A') {
          const a = segment.args.map((v, n) => n < 5 ? fmt(v) : fmt(v));
          parts.push(`A${a.join(' ')}`);
        }
      }
      if (subpath.closed) parts.push('Z');
    }
    return parts.join(' ');
  }

  function regularizePathData(data, options = {}) {
    const tolerance = clamp(Number(options.tolerance ?? 1.6), 0, 8);
    const maxTurnRadians = clamp(Number(options.maxTurnDegrees ?? 35), 2, 42) * Math.PI / 180;
    const parsed = parsePath(data);
    const subpaths = parsed.map((subpath) => regularizeSubpath(subpath, tolerance, maxTurnRadians, options.rasterData, options.fillColor));
    return {
      d: writePath(subpaths),
      commandsBefore: subpaths.reduce((sum, item) => sum + item.commandsBefore, 0),
      commandsAfter: subpaths.reduce((sum, item) => sum + item.commandsAfter, 0),
      straightenedCurves: subpaths.reduce((sum, item) => sum + item.straightenedCurves, 0),
      mergedSegments: subpaths.reduce((sum, item) => sum + item.mergedSegments, 0),
      rasterLinesRecovered: subpaths.reduce((sum, item) => sum + item.rasterLinesRecovered, 0),
      rasterLineCandidatesRejected: subpaths.reduce((sum, item) => sum + item.rasterLineCandidatesRejected, 0)
    };
  }

  function toleranceFromStrength(strength, width, height) {
    const setting = clamp(Number(strength ?? 3), 0, 5);
    if (setting === 0) return 0;
    const base = [0, 0.55, 1.0, 1.55, 2.35, 3.25][setting];
    const scale = clamp(Math.hypot(width || 700, height || 700) / 990, 0.75, 1.35);
    return base * scale;
  }

  function regularizeSvg(svg, options = {}) {
    if (typeof svg !== 'string' || !/<svg\b/i.test(svg)) throw new TypeError('Documento SVG inválido para correção geométrica.');
    const strength = clamp(Number(options.lineCorrection ?? 3), 0, 5);
    const width = Number(options.outputWidth || options.width || 700);
    const height = Number(options.outputHeight || options.height || 700);
    const tolerance = toleranceFromStrength(strength, width, height);
    if (tolerance <= 0) {
      return { svg, stats: { geometryTolerance: 0, geometryCommandsBefore: 0, geometryCommandsAfter: 0, straightenedCurves: 0, mergedSegments: 0 } };
    }

    const viewBox = (svg.match(/\bviewBox\s*=\s*(["'])([\s\S]*?)\1/i) || [])[2] || '';
    const vb = viewBox.trim().split(/[ ,]+/).map(Number);
    const raster = options.rasterData && options.rasterData.data ? {
      ...options.rasterData,
      scaleX: vb.length === 4 && vb[2] > 0 ? options.rasterData.width / vb[2] : 1,
      scaleY: vb.length === 4 && vb[3] > 0 ? options.rasterData.height / vb[3] : 1
    } : null;
    let commandsBefore = 0, commandsAfter = 0, straightenedCurves = 0, mergedSegments = 0;
    let rasterLinesRecovered = 0, rasterLineCandidatesRejected = 0, pathsProcessed = 0;
    const output = svg.replace(/<path\b[^>]*>/gi, (tag) => {
      const match = tag.match(/\sd\s*=\s*(["'])([\s\S]*?)\1/i);
      if (!match || match[2].length > 2_000_000) return tag;
      let result;
      try { result = regularizePathData(match[2], { tolerance, rasterData: raster, fillColor: parsePaintColor(tag) }); }
      catch { return tag; }
      pathsProcessed++;
      commandsBefore += result.commandsBefore;
      commandsAfter += result.commandsAfter;
      straightenedCurves += result.straightenedCurves;
      mergedSegments += result.mergedSegments;
      rasterLinesRecovered += result.rasterLinesRecovered;
      rasterLineCandidatesRejected += result.rasterLineCandidatesRejected;
      return tag.replace(match[0], ` d="${result.d}"`);
    });

    return {
      svg: output,
      stats: {
        geometryTolerance: Number(tolerance.toFixed(2)),
        geometryPathsProcessed: pathsProcessed,
        geometryCommandsBefore: commandsBefore,
        geometryCommandsAfter: commandsAfter,
        straightenedCurves,
        mergedSegments,
        rasterLinesRecovered,
        rasterLineCandidatesRejected,
        geometryCommandsRemoved: Math.max(0, commandsBefore - commandsAfter)
      }
    };
  }

  root.SvgGeometry = { parsePath, regularizePathData, regularizeSvg, toleranceFromStrength };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SvgGeometry;
})(typeof self !== 'undefined' ? self : globalThis);
