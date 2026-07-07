/**
 * sketch-worker.js — Web Worker for pencil-sketch image conversion
 *
 * Implements the "Color Dodge Pencil Sketch" technique:
 *   1. Convert to grayscale
 *   2. Invert the grayscale
 *   3. Apply a separable box blur (horizontal → vertical)
 *   4. Color-dodge blend the original grayscale with the blurred inversion
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
 * Run the full pencil-sketch pipeline on an ImageData object.
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
  sendProgress(5);

  for (let i = 0; i < totalPixels; i++) {
    const base = i * 4;
    // ITU-R BT.601 luminance weights
    gray[i] = Math.round(
      0.299 * src[base] +
      0.587 * src[base + 1] +
      0.114 * src[base + 2]
    );
  }

  sendProgress(15);

  // ── Step 2: Invert ────────────────────────────────────────────────────
  for (let i = 0; i < totalPixels; i++) {
    inverted[i] = 255 - gray[i];
  }

  sendProgress(25);

  // ── Step 3: Box blur the inverted channel ─────────────────────────────
  // Separable two-pass blur (horizontal then vertical) gives O(n) per
  // pixel regardless of radius — much faster than a naïve 2D kernel.
  const radius = Math.max(1, Math.round(blurAmount));
  const blurred = boxBlur2Pass(inverted, width, height, radius);

  sendProgress(75);

  // ── Step 4: Color-dodge blend ─────────────────────────────────────────
  // Formula:  result = min(255, (base × 256) / (256 − blend))
  // Where base = original gray, blend = blurred inverted.
  const outData = new Uint8ClampedArray(totalPixels * 4);

  for (let i = 0; i < totalPixels; i++) {
    const base = gray[i];
    const blend = blurred[i];
    let value;

    if (blend === 255) {
      // Avoid division by zero; pure white stays white
      value = 255;
    } else {
      value = Math.min(255, (base * 256) / (256 - blend));
    }

    const out = i * 4;
    outData[out] = value;       // R
    outData[out + 1] = value;   // G
    outData[out + 2] = value;   // B
    outData[out + 3] = src[i * 4 + 3]; // Preserve original alpha
  }

  sendProgress(100);

  // Construct a new ImageData with the processed pixels
  return new ImageData(outData, width, height);
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
      sendProgress(25 + Math.round((y / height) * 25));
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
      sendProgress(50 + Math.round((x / width) * 25));
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
