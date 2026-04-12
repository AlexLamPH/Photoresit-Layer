// ============================================================
// Module D: Camera Bay — Screenshot Capture (v2)
//
// Fixes: overlay stacking, ESC not working, double-click issue
// ============================================================

import { SCREENSHOT_MAX_WIDTH, SCREENSHOT_QUALITY } from '@photoresist/schema';
import type { Screenshot } from '@photoresist/schema';
import { generateId } from '@photoresist/schema';

// --- State ---
let isSelecting = false;
let selectionOverlay: HTMLElement | null = null;
let isDragging = false;
let startX = 0;
let startY = 0;

let onCaptureCallback: ((screenshot: Screenshot) => void) | null = null;

export function onScreenshotCaptured(cb: (screenshot: Screenshot) => void): void {
  onCaptureCallback = cb;
}

// --- Start region selection ---
export function startScreenshotSelection(annotationLayer: HTMLElement): void {
  // FIX: Remove any existing overlay first — prevents stacking
  cancelSelection();

  isSelecting = true;
  isDragging = false;

  selectionOverlay = document.createElement('div');
  selectionOverlay.className = 'pr-screenshot-overlay';
  selectionOverlay.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    cursor: crosshair;
    z-index: 2147483647;
    pointer-events: auto;
    background: rgba(0, 0, 0, 0.3);
  `;

  const hint = document.createElement('div');
  hint.className = 'pr-screenshot-hint';
  hint.textContent = 'Drag to select area — ESC to cancel';
  hint.style.cssText = `
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    padding: 12px 24px;
    background: rgba(15, 15, 25, 0.9);
    border: 1px solid rgba(167, 139, 250, 0.4);
    border-radius: 8px;
    color: #e2e2e8;
    font-size: 13px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    pointer-events: none;
  `;
  selectionOverlay.appendChild(hint);

  const selBox = document.createElement('div');
  selBox.className = 'pr-screenshot-selection';
  selBox.style.cssText = 'position:fixed;border:2px solid #a78bfa;background:rgba(167,139,250,0.1);pointer-events:none;display:none;';
  selectionOverlay.appendChild(selBox);

  selectionOverlay.addEventListener('mousedown', onSelectionStart);
  selectionOverlay.addEventListener('mousemove', onSelectionMove);
  selectionOverlay.addEventListener('mouseup', onSelectionEnd);

  // FIX: ESC listener on window (divs can't receive keyboard events)
  window.addEventListener('keydown', onEscKey, true);

  annotationLayer.appendChild(selectionOverlay);
}

function onEscKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    cancelSelection();
  }
}

function onSelectionStart(e: MouseEvent): void {
  isDragging = true;
  startX = e.clientX;
  startY = e.clientY;

  // Hide hint
  const hint = selectionOverlay?.querySelector('.pr-screenshot-hint') as HTMLElement;
  if (hint) hint.style.display = 'none';

  const selBox = selectionOverlay?.querySelector('.pr-screenshot-selection') as HTMLElement;
  if (selBox) selBox.style.display = 'block';
}

function onSelectionMove(e: MouseEvent): void {
  if (!isDragging) return;

  const selBox = selectionOverlay?.querySelector('.pr-screenshot-selection') as HTMLElement;
  if (!selBox) return;

  const left = Math.min(startX, e.clientX);
  const top = Math.min(startY, e.clientY);
  const width = Math.abs(e.clientX - startX);
  const height = Math.abs(e.clientY - startY);

  Object.assign(selBox.style, {
    left: `${left}px`, top: `${top}px`,
    width: `${width}px`, height: `${height}px`,
  });
}

async function onSelectionEnd(e: MouseEvent): Promise<void> {
  if (!isDragging) return;
  isDragging = false;

  const endX = e.clientX;
  const endY = e.clientY;
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  // Cleanup overlay BEFORE capture (so it's not in the screenshot)
  cancelSelection();

  if (width < 10 || height < 10) return;

  // Wait for browser to render the cleanup (remove dark overlay)
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' });
    if (!response.success) {
      console.error('[Photoresist] Screenshot failed:', response.error);
      return;
    }

    const croppedDataUrl = await cropImage(response.data as string, left, top, width, height);

    const screenshot: Screenshot = {
      id: generateId(),
      data_ref: croppedDataUrl,
      crop: { x: left, y: top, width, height },
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
    };

    onCaptureCallback?.(screenshot);
  } catch (err) {
    console.error('[Photoresist] Screenshot error:', err);
  }
}

function cancelSelection(): void {
  isSelecting = false;
  isDragging = false;
  window.removeEventListener('keydown', onEscKey, true);
  if (selectionOverlay) {
    selectionOverlay.remove();
    selectionOverlay = null;
  }
  startX = 0;
  startY = 0;
}

// --- Crop Image ---
async function cropImage(dataUrl: string, x: number, y: number, width: number, height: number): Promise<string> {
  const img = await fetch(dataUrl).then(r => r.blob()).then(b => createImageBitmap(b));

  const dpr = window.devicePixelRatio || 1;
  const sx = x * dpr, sy = y * dpr, sw = width * dpr, sh = height * dpr;

  let outW = width, outH = height;
  if (outW > SCREENSHOT_MAX_WIDTH) {
    const scale = SCREENSHOT_MAX_WIDTH / outW;
    outW = SCREENSHOT_MAX_WIDTH;
    outH = Math.round(outH * scale);
  }

  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

  const blob = await canvas.convertToBlob({ type: 'image/png', quality: SCREENSHOT_QUALITY });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

// --- Styles ---
export function getScreenshotStyles(): string {
  return ``;
}
