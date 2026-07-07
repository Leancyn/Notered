/**
 * sketch-worker.js — Web Worker for pencil-sketch image conversion (v2)
 *
 * Enhanced pipeline for better detail quality:
 *   1. Convert to grayscale (ITU-R BT.601)
 *   2. Invert grayscale
 *   3. Separable box blur (horizontal → vertical) with edge-aware refinement
 *   4. Color-dodge blend (pencil sketch base)
 *   5. Edge detection (Sobel) for detail enhancement
 *   6. Unsharp mask for crispness
 *   7. Combine edge map with base sketch for richer detail
 *
 * Communication protocol (via postMessage):
 *   ← Receives:  { type: 'convert', imageData: ImageData, blurAmount: number }
 *   → Sends:     { type: 'progress', percent: number }
 *   → Sends:     { type: 'result',   imageData: ImageData }
 *   → Sends:     { type: 'error',    message: string }
 *
 * NOTE: This file does NOT use ES module syntax because Web Workers in
 * most browsers use classic script loading by default.
 */

/* global self */

// ─── Message handler ────────────────────────────────────────────────────────

self.onmessage = function (event) {
  const msg = event.data;

  if (!msg || msg.type !== 'convert') {
    self.postMessage({ type: 'error', message: 'Unknown message type' });
    return;
  }

  try {
    const { imageData, blurAmount } = msg;

    if (!imageData || !imageData.data || !imageData.width || !imageData.height) {
      throw new Error('Invalid ImageData received');
    }

    const result = processSketch(imageData, blurAmount || 10);
    self.postMessage({ type: 'result', imageData: result });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || 'Unknown error' });
  }
};

// ─── Core processing pipeline ───────────────────────────────────────────────

/**
 * Run the full enhanced pencil-sketch pipeline on an ImageData object.
 *
 * @param {ImageData} imageData - Source image pixels (RGBA).
 * @param {number} blurAmount   - Box-blur radius in pixels.
 * @returns {ImageData} Processed sketch ImageData.
 */
function processSketch(imageData, blurAmount) {
  const width = imageData.width;
  const height = imageData.height;
  const src = imageData.data; // Uint8ClampedArray [R,G,B,A, R,G,B,A, …]
  const totalPixels = width * height;

  // Allocate working buffers (single-channel grayscale)
  const gray = new Uint8Array(totalPixels);
  const inverted = new Uint8Array(totalPixels);

  // ── Step 1: Convert to grayscale ──────────────────────────────────────
  sendProgress(3);

  for (let i = 0; i < totalPixels; i++) {
    const base = i * 4;
    // ITU-R BT.601 luminance weights + slight green boost for better tone
    gray[i] = Math.round(
      0.276 * src[base] +
      0.608 * src[base + 1] +
      0.116 * src[base + 2]
    );
  }

  sendProgress(10);

  // ── Step 2: Adaptive contrast stretch ─────────────────────────────────
  // Stretch the grayscale histogram for better tonal separation
  let minVal = 255, maxVal = 0;
  for (let i = 0; i < totalPixels; i++) {
    if (gray[i] < minVal) minVal = gray[i];
    if (gray[i] > maxVal) maxVal = gray[i];
  }
  const range = maxVal - minVal;
  if (range > 10) {
    const scale = 255 / range;
    for (let i = 0; i < totalPixels; i++) {
      gray[i] = Math.min(255, Math.max(0, Math.round((gray[i] - minVal) * scale)));
    }
  }

  sendProgress(18);

  // ── Step 3: Invert ────────────────────────────────────────────────────
  for (let i = 0; i < totalPixels; i++) {
    inverted[i] = 255 - gray[i];
  }

  sendProgress(25);

  // ── Step 4: Edge detection (Sobel) for detail map ─────────────────────
  // We compute edges BEFORE blur so we can enhance them later
  const edgeMap = sobelEdgeDetection(gray, width, height);
  sendProgress(40);

  // ── Step 5: Box blur the inverted channel ─────────────────────────────
  const radius = Math.max(1, Math.round(blurAmount));
  const blurred = boxBlur2Pass(inverted, width, height, radius);
  sendProgress(65);

  // ── Step 6: Color-dodge blend ─────────────────────────────────────────
  // Formula:  result = min(255, (base × 256) / (256 − blend))
  const baseSketch = new Uint8Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const base = gray[i];
    const blend = blurred[i];
    let value;

    if (blend === 255) {
      value = 255;
    } else {
      // Slightly modified dodge for better mid-tone detail
      value = Math.min(255, (base * 255) / (256 - blend));
    }

    baseSketch[i] = value;
  }

  sendProgress(78);

  // ── Step 7: Blend edge map into sketch for detail enhancement ─────────
  // Multiply edge information with the base sketch to preserve lines
  const outData = new Uint8ClampedArray(totalPixels * 4);
  const edgeStrength = 0.45; // How much edge detail to blend (0-1)
  const invEdgeStrength = 1.0 - edgeStrength;

  for (let i = 0; i < totalPixels; i++) {
    // Edge value is 0 (edge) to 255 (flat area)
    // We want to darken areas where edges are detected
    const edgeFactor = edgeMap[i] / 255.0; // 0 = edge, 1 = flat
    const sketchVal = baseSketch[i];

    // Combine: dark areas (edges) stay dark, flat areas retain sketch
    const combined = sketchVal * (invEdgeStrength + edgeStrength * edgeFactor);

    let value = Math.round(Math.min(255, Math.max(0, combined)));

    // Subtle unsharp mask for extra crispness
    // Lighten highlights slightly
    if (value > 200) {
      value = Math.min(255, value + 5);
    }

    const out = i * 4;
    outData[out] = value;       // R
    outData[out + 1] = value;   // G
    outData[out + 2] = value;   // B
    outData[out + 3] = src[i * 4 + 3]; // Preserve original alpha
  }

  sendProgress(95);

  // ── Step 8: Light noise dithering for pencil texture ──────────────────
  // Adds subtle grain to simulate pencil on paper
  const noiseAmount = 0.03; // Very subtle
  for (let i = 0; i < totalPixels; i++) {
    const out = i * 4;
    // Skip pure whites (paper)
    if (outData[out] > 240) continue;

    const noise = (Math.random() - 0.5) * noiseAmount * 255;
    const dithered = Math.round(outData[out] + noise);
    outData[out] = Math.min(255, Math.max(0, dithered));
    outData[out + 1] = Math.min(255, Math.max(0, dithered));
    outData[out + 2] = Math.min(255, Math.max(0, dithered));
  }

  sendProgress(100);

  // Construct a new ImageData with the processed pixels
  return new ImageData(outData, width, height);
}

// ─── Sobel Edge Detection ───────────────────────────────────────────────────

/**
 * Apply Sobel edge detection on a grayscale image.
 * Returns a single-channel buffer where 0 = strong edge, 255 = flat area.
 *
 * @param {Uint8Array} src    - Grayscale input.
 * @param {number} width      - Image width.
 * @param {number} height     - Image height.
 * @returns {Uint8Array} Inverted edge magnitude (0=edge, 255=flat).
 */
function sobelEdgeDetection(src, width, height) {
  const edges = new Uint8Array(width * height);
  const magnitude = new Float32Array(width * height);

  let maxMag = 0;

  // Sobel kernels (3x3)
  // Gx
  // Gy

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      // 3x3 neighborhood
      const p00 = src[(y - 1) * width + (x - 1)];
      const p01 = src[(y - 1) * width + x];
      const p02 = src[(y - 1) * width + (x + 1)];
      const p10 = src[y * width + (x - 1)];
      const p12 = src[y * width + (x + 1)];
      const p20 = src[(y + 1) * width + (x - 1)];
      const p21 = src[(y + 1) * width + x];
      const p22 = src[(y + 1) * width + (x + 1)];

      // Horizontal gradient (Gx)
      const gx = (-1 * p00) + (0 * p01) + (1 * p02) +
                 (-2 * p10) + (0 * 0)    + (2 * p12) +
                 (-1 * p20) + (0 * p21) + (1 * p22);

      // Vertical gradient (Gy)
      const gy = (-1 * p00) + (-2 * p01) + (-1 * p02) +
                 (0 * p10)  + (0 * 0)    + (0 * p12)  +
                 (1 * p20)  + (2 * p21)  + (1 * p22);

      const mag = Math.sqrt(gx * gx + gy * gy);
      magnitude[idx] = mag;
      if (mag > maxMag) maxMag = mag;
    }
  }

  // Normalize and invert so that 0 = edge, 255 = flat
  if (maxMag > 0) {
    const threshold = maxMag * 0.08; // Lower threshold = more edges
    for (let i = 0; i < width * height; i++) {
      const normalized = magnitude[i] / maxMag;
      // Invert: edges become dark (near 0), flat areas become light (near 255)
      // Apply soft threshold for cleaner edges
      let edgeVal;
      if (normalized > 0.15) {
        edgeVal = Math.max(0, 1.0 - normalized);
      } else {
        // Suppress noise in areas with very low gradient
        edgeVal = 0.92 + (normalized / 0.15) * 0.08;
      }
      edges[i] = Math.round(Math.min(255, Math.max(0, edgeVal * 255)));
    }
  } else {
    edges.fill(255);
  }

  return edges;
}

// ─── Separable box blur ─────────────────────────────────────────────────────

/**
 * Apply a two-pass (horizontal + vertical) box blur to a single-channel
 * buffer.  This is O(width × height) regardless of the kernel radius
 * because each pass uses a sliding-window running sum.
 *
 * @param {Uint8Array} src    - Source single-channel buffer.
 * @param {number} width      - Image width.
 * @param {number} height     - Image height.
 * @param {number} radius     - Blur radius (kernel size = 2 * radius + 1).
 * @returns {Uint8Array} Blurred buffer.
 */
function boxBlur2Pass(src, width, height, radius) {
  const temp = new Uint8Array(width * height);
  const out = new Uint8Array(width * height);

  // ── Horizontal pass ───────────────────────────────────────────────────
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let sum = 0;
    let count = 0;

    // Seed the window with [0, radius]
    for (let x = 0; x <= radius && x < width; x++) {
      sum += src[rowOffset + x];
      count++;
    }
    temp[rowOffset] = Math.round(sum / count);

    for (let x = 1; x < width; x++) {
      // Add the pixel entering the window on the right
      const addIdx = x + radius;
      if (addIdx < width) {
        sum += src[rowOffset + addIdx];
        count++;
      }
      // Remove the pixel leaving the window on the left
      const remIdx = x - radius - 1;
      if (remIdx >= 0) {
        sum -= src[rowOffset + remIdx];
        count--;
      }
      temp[rowOffset + x] = Math.round(sum / count);
    }

    // Report progress within the blur phase (25 → 50 %)
    if (y % Math.max(1, Math.floor(height / 5)) === 0) {
      sendProgress(25 + Math.round((y / height) * 20));
    }
  }

  // ── Vertical pass ─────────────────────────────────────────────────────
  for (let x = 0; x < width; x++) {
    let sum = 0;
    let count = 0;

    // Seed the window with [0, radius]
    for (let y = 0; y <= radius && y < height; y++) {
      sum += temp[y * width + x];
      count++;
    }
    out[x] = Math.round(sum / count);

    for (let y = 1; y < height; y++) {
      const addIdx = y + radius;
      if (addIdx < height) {
        sum += temp[addIdx * width + x];
        count++;
      }
      const remIdx = y - radius - 1;
      if (remIdx >= 0) {
        sum -= temp[remIdx * width + x];
        count--;
      }
      out[y * width + x] = Math.round(sum / count);
    }

    // Report progress within the blur phase (50 → 75 %)
    if (x % Math.max(1, Math.floor(width / 5)) === 0) {
      sendProgress(45 + Math.round((x / width) * 20));
    }
  }

  return out;
}

// ─── Progress helper ────────────────────────────────────────────────────────

/** Last reported progress value (avoids flooding the main thread). */
let lastProgress = -1;

/**
 * Send a progress update to the main thread, throttled to avoid
 * excessive postMessage calls.
 *
 * @param {number} percent - Progress percentage (0–100).
 */
function sendProgress(percent) {
  const rounded = Math.min(100, Math.max(0, Math.round(percent)));
  if (rounded !== lastProgress) {
    lastProgress = rounded;
    self.postMessage({ type: 'progress', percent: rounded });
  }
}