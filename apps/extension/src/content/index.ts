// ============================================================
// Content Script — v6 (Logo ↔ Window transform)
// No modes — open window = all tools ready
// Logo transforms into window, click empty = collapse
// ============================================================

import type { RuntimeMode } from '../shared/types';
import type { Screenshot } from '@photoresist/schema';
import { initInspect, startInspect, stopInspect, getInspectStyles } from './inspect';
import {
  initAnnotations, cleanupAnnotations, setTool, getCurrentTool,
  getAnnotations, handleScroll, getAnnotationStyles,
  onAnnotationsChange, setDrawColor, setDrawWidth, undo, redo,
  getPinThemes, setPinTheme, setNoteTheme,
  type AnnotationTool,
} from './annotations';
import { startScreenshotSelection, onScreenshotCaptured, getScreenshotStyles } from './screenshot';
import { createBundle } from './bundle';
import { uploadBundle } from './cloud-sync';
import { scanWebsite, type UITBPackage } from './uitb-scanner';
import { getHistory, updateFeedbackStatus, timeAgo, statusColor } from './history';
import { exportPdf, exportTxt, exportMarkdown, downloadFile } from './export';
import {
  getLibraryItems, addLibraryItem, updateLibraryItem, deleteLibraryItem, deleteLibraryItems,
  addTagToItems,
  getViewMode, setViewMode, migrateIfNeeded, createScreenshotItem, createExportItem,
  TAG_PRESETS, type LibraryItem,
} from './library-manager';

const OVERLAY_ID = 'photoresist-layer-root';
const KEEP_ALIVE_MS = 20_000;
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
let overlayRoot: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let isOpen = false;
let isInspectActive = false;
let currentMode: RuntimeMode = 'browse';
let currentNoteTheme = 0;

// Library Manager state
let libFilterTags: string[] = [];
let libSearchQuery = '';
let libViewMode: 'list' | 'grid' = 'list';

onScreenshotCaptured(async (ss) => {
  const item = createScreenshotItem(ss.data_ref, location.href, document.title);
  await addLibraryItem(item);
  updateAll();
  updateLibrary();
});

// ===== ICONS =====
const I: Record<string, string> = {
  pin: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 3L7 7l-3 1 4 4 1-3 4-4-2-2z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 14l3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  note: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3.5" y="2.5" width="11" height="13" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 6h5M6.5 9h5M6.5 12h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  box: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3" y="3" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.4"/></svg>`,
  circle: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="1.4"/></svg>`,
  ellipse: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><ellipse cx="9" cy="9" rx="7" ry="5" stroke="currentColor" stroke-width="1.4"/></svg>`,
  star: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2l2.2 4.5 5 .7-3.6 3.5.85 5L9 13.5 4.55 15.7l.85-5L1.8 7.2l5-.7L9 2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" fill="none"/></svg>`,
  arrow: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 14L14 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M8 4h6v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  line: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 14L14 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  curve: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 14Q4 4 14 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>`,
  path: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 14L7 6l4 8 4-10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="3" cy="14" r="2" fill="currentColor"/><circle cx="7" cy="6" r="2" fill="currentColor"/><circle cx="11" cy="14" r="2" fill="currentColor"/><circle cx="15" cy="4" r="2" fill="currentColor"/></svg>`,
  freehand: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 12c2-4 4 2 6-2s3 1 6-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  camera: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="5" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.4"/><circle cx="9" cy="10" r="2.8" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 5L7.5 3h3l1 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  send: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9l13-5.5L10.5 16l-2-5.5L3 9z" fill="currentColor" opacity="0.15"/><path d="M3 9l13-5.5L10.5 16l-2-5.5L3 9z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  undo: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M5 9h8a3 3 0 010 6H9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 6L5 9l3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  redo: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M13 9H5a3 3 0 000 6h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 6l3 3-3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  chevDown: `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 4L5 6.5 7.5 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V3a1 1 0 011-1h2a1 1 0 011 1v1M4 4v7a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  inspect: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="8" cy="8" r="4.5" stroke="currentColor" stroke-width="1.4"/><path d="M11.5 11.5L15.5 15.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
};

const PALETTE = [
  '#000000','#404040','#808080','#bfbfbf','#d9d9d9','#ffffff',
  '#c00000','#ff0000','#ffc000','#ffff00','#92d050','#00b050',
  '#00b0f0','#0070c0','#002060','#7030a0','#ff00ff','#ff6699',
  '#f2dcdb','#fce4d6','#fff2cc','#e2efda','#d6e4f0','#dbe5f1',
  '#e6b8af','#f8cbad','#ffe599','#c6e0b4','#bdd7ee','#b4c7e7',
  '#cc4125','#e06666','#f1c232','#6aa84f','#6fa8dc','#3d85c6',
  '#990000','#cc0000','#e69138','#38761d','#45818e','#674ea7',
];

// ===== INIT =====
function init(): void {
  if (location.protocol === 'chrome-extension:' || location.protocol === 'chrome:') return;
  createOverlay();
  migrateIfNeeded().then(async () => {
    libViewMode = await getViewMode();
    updateAll();
    updateLibrary();
  });
  listenForMessages();
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const t = e.target as HTMLElement;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return;
      e.preventDefault();
      // ESC = deselect tool + stop inspect
      setTool('select');
      if (isInspectActive) { stopInspect(); isInspectActive = false; }
      updateToolHighlight('');
      updateDrawOpts();
    }
  }, true);
}

function createOverlay(): void {
  if (document.getElementById(OVERLAY_ID)) return;
  overlayRoot = document.createElement('div');
  overlayRoot.id = OVERLAY_ID;
  overlayRoot.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;';
  shadowRoot = overlayRoot.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = getCSS();
  shadowRoot.appendChild(style);
  shadowRoot.appendChild(createWidget());
  const annLayer = document.createElement('div');
  annLayer.id = 'pr-ann-layer';
  annLayer.className = 'ann-layer';
  shadowRoot.appendChild(annLayer);

  // Lightbox + Doc viewer — OUTSIDE widget (no transform interference)
  const lightbox = document.createElement('div');
  lightbox.id = 'pr-lightbox';
  lightbox.className = 'pr-lb';
  lightbox.innerHTML = `<img class="pr-lb-img" /><button class="pr-lb-close">&times;</button>`;
  lightbox.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('.pr-lb-close') || el === lightbox) lightbox.style.display = 'none';
  });
  shadowRoot.appendChild(lightbox);

  const docViewer = document.createElement('div');
  docViewer.id = 'pr-docview';
  docViewer.className = 'pr-dv';
  docViewer.innerHTML = `<div class="pr-dv-header"><span class="pr-dv-title"></span><button class="pr-dv-close">&times;</button></div><pre class="pr-dv-content"></pre>`;
  docViewer.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.pr-dv-close')) docViewer.style.display = 'none';
  });
  shadowRoot.appendChild(docViewer);

  // Library overlay — full-size panel OUTSIDE widget
  const libOverlay = document.createElement('div');
  libOverlay.id = 'pr-library-overlay';
  libOverlay.className = 'pr-lib-overlay';
  libOverlay.style.display = 'none';
  libOverlay.innerHTML = `
    <div class="pr-lib-window">
      <div class="pr-lib-header">
        <div class="pr-lib-title">📁 Library</div>
        <div class="pr-lib-header-center">
          <div class="pr-lib-tabs">
            <button class="w-lib-tab active" data-ltab="files">Files</button>
            <button class="w-lib-tab" data-ltab="history">History</button>
          </div>
        </div>
        <div class="pr-lib-header-right">
          <button class="w-view-btn active" data-view="list" title="List view">☰</button>
          <button class="w-view-btn" data-view="grid" title="Grid view">⊞</button>
          <button class="pr-lib-close">&times;</button>
        </div>
      </div>
      <div class="pr-lib-toolbar">
        <input type="text" class="w-lib-search" placeholder="Search files..." />
        <div class="w-lib-tag-filter"></div>
      </div>
      <div class="pr-lib-body">
        <div class="w-lib-content" data-ltab="files">
          <div class="w-lib-items"></div>
          <div class="w-lib-empty" style="display:none">No files yet</div>
        </div>
        <div class="w-lib-content" data-ltab="history" style="display:none">
          <div class="w-history-list"></div>
          <div class="w-history-empty" style="display:none">No feedback sent yet</div>
        </div>
      </div>
      <div class="pr-lib-actions">
        <span class="pr-lib-selected-count">0 selected</span>
        <div style="flex:1"></div>
        <button class="pr-lib-action" data-action="tag" title="Tag selected">🏷️ Tag</button>
        <button class="pr-lib-action" data-action="download" title="Download selected">⬇ Download</button>
        <button class="pr-lib-action pr-lib-action-danger" data-action="delete" title="Delete selected">🗑 Delete</button>
      </div>
      <div class="w-tag-picker" style="display:none">
        <div class="w-tag-picker-title">Select tag:</div>
        <div class="w-tag-picker-list"></div>
      </div>
    </div>
  `;
  libOverlay.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el === libOverlay) { libOverlay.style.display = 'none'; return; }
    handleLibraryOverlayClick(e);
  });
  // Search input events
  const libSearchInput = libOverlay.querySelector('.w-lib-search') as HTMLInputElement;
  if (libSearchInput) {
    libSearchInput.addEventListener('input', () => { libSearchQuery = libSearchInput.value; updateLibrary(); });
    libSearchInput.addEventListener('mousedown', (e) => e.stopPropagation());
    libSearchInput.addEventListener('keydown', (e) => e.stopPropagation());
  }
  shadowRoot.appendChild(libOverlay);

  document.documentElement.appendChild(overlayRoot);
  initInspect(shadowRoot);
  initAnnotations(annLayer);
  onAnnotationsChange(updateAll);
}

// ===== SINGLE WIDGET: Logo ↔ Window =====
function createWidget(): HTMLElement {
  const w = document.createElement('div');
  w.id = 'pr-widget';
  w.className = 'widget collapsed';
  const logoUrl = chrome.runtime.getURL('icons/logo.png');

  w.innerHTML = `
    <div class="w-logo-face">
      <img src="${logoUrl}" width="34" height="34" alt="PR" />
      <span class="w-badge">0</span>
    </div>
    <div class="w-panel">
      <div class="w-header">
        <img src="${logoUrl}" width="20" height="20" class="w-header-logo" />
        <span class="w-title">Photoresist Layer</span>
        <button class="w-close" title="Close (ESC)">&times;</button>
      </div>
      <div class="w-section-label">Tools</div>
      <div class="w-tools">
        <button class="w-btn" data-tool="pin" data-label="Pin">${I.pin}</button>
        <div class="w-pin-themes" style="display:none">
          ${getPinThemes().map((t, i) => `<button class="w-pin-theme" data-theme="${i}" style="background:${t.bg};color:${t.fg};${t.bg === '#ffffff' ? 'border:1px solid rgba(0,0,0,0.2);' : ''}" title="${t.name}">${i + 1}</button>`).join('')}
        </div>
        <button class="w-btn" data-tool="note" data-label="Note">${I.note}</button>
        <div class="w-dd">
          <button class="w-btn w-dd-trigger" data-tool="box" data-label="Shapes">${I.box}${I.chevDown}</button>
          <div class="w-dd-menu">
            <button class="w-dd-item" data-tool="box">${I.box}<span>Rectangle</span></button>
            <button class="w-dd-item" data-tool="circle">${I.circle}<span>Circle</span></button>
            <button class="w-dd-item" data-tool="ellipse">${I.ellipse}<span>Ellipse</span></button>
            <button class="w-dd-item" data-tool="star">${I.star}<span>Star</span></button>
          </div>
        </div>
        <div class="w-dd">
          <button class="w-btn w-dd-trigger" data-tool="arrow" data-label="Lines">${I.arrow}${I.chevDown}</button>
          <div class="w-dd-menu">
            <button class="w-dd-item" data-tool="arrow">${I.arrow}<span>Arrow</span></button>
            <button class="w-dd-item" data-tool="line">${I.line}<span>Line</span></button>
            <button class="w-dd-item" data-tool="curve">${I.curve}<span>Curve</span></button>
            <button class="w-dd-item" data-tool="path">${I.path}<span>Path</span></button>
          </div>
        </div>
        <button class="w-btn" data-tool="freehand" data-label="Draw">${I.freehand}</button>
        <button class="w-btn" data-tool="inspect" data-label="Inspect">${I.inspect}</button>
        <button class="w-btn" data-tool="screenshot" data-label="Capture">${I.camera}</button>
      </div>
      <div class="w-draw-opts" style="display:none">
        <div class="w-color-wrap">
          <button class="w-btn w-palette-btn"><div class="w-color-dot"></div></button>
          <div class="w-palette-popup">
            <div class="w-ptabs"><button class="w-ptab active" data-tab="grid">Presets</button><button class="w-ptab" data-tab="spectrum">Spectrum</button></div>
            <div class="w-pgrid w-tc" data-tab="grid"></div>
            <div class="w-spec-wrap w-tc" data-tab="spectrum" style="display:none"><canvas class="w-spec" width="180" height="120"></canvas><input type="range" class="w-hue" min="0" max="360" value="0" /></div>
            <div class="w-hex-row"><span class="w-hex-lbl">HEX</span><input type="text" class="w-hex" value="#ef4444" maxlength="7" /><button class="w-hex-ok">OK</button></div>
          </div>
        </div>
        <div class="w-thick-wrap">
          <button class="w-thick" data-w="2"><svg width="20" height="14"><line x1="3" y1="7" x2="17" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
          <button class="w-thick active" data-w="4"><svg width="20" height="14"><line x1="3" y1="7" x2="17" y2="7" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></button>
          <button class="w-thick" data-w="8"><svg width="20" height="14"><line x1="3" y1="7" x2="17" y2="7" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg></button>
        </div>
      </div>
      <div class="w-bottom-bar">
        <button class="w-scan-btn" data-label="Scan UI">🔍 Scan</button>
        <button class="w-lib-btn" data-label="Library">📁 Library</button>
        <button class="w-mcp-btn" data-label="MCP">⚡ MCP</button>
      </div>
      <div class="w-mcp-panel" style="display:none">
        <div class="w-lib-header">
          <span class="w-section-label">MCP — Connect AI Tools</span>
          <button class="w-mcp-close">&times;</button>
        </div>
        <div class="w-sdk-content">
          <p class="w-sdk-desc">Connect any AI coding tool to Photoresist Layer. AI will read your feedback directly — no terminal needed.</p>
          <div class="w-sdk-step">Claude Code / Cursor / Codex</div>
          <div class="w-sdk-code" data-copy='{"mcpServers":{"photoresist-layer":{"command":"npx","args":["tsx","apps/mcp-server/src/index.ts"],"cwd":"/path/to/photoresist-layer"}}}'>{
  "mcpServers": {
    "photoresist-layer": {
      "command": "npx",
      "args": ["tsx", "apps/mcp-server/src/index.ts"]
    }
  }
}</div>
          <div class="w-sdk-step">Available Tools</div>
          <div class="w-mcp-tools">
            <div class="w-mcp-tool">📋 <b>list_feedbacks</b> — Danh sách feedback</div>
            <div class="w-mcp-tool">📄 <b>get_latest</b> — Feedback mới nhất</div>
            <div class="w-mcp-tool">📊 <b>get_latest_graph</b> — PGOS data (nhẹ)</div>
            <div class="w-mcp-tool">🔍 <b>get_feedback</b> — Chi tiết theo ID</div>
            <div class="w-mcp-tool">✅ <b>update_status</b> — Đổi trạng thái</div>
            <div class="w-mcp-tool">⚡ <b>get_sdk</b> — Code tích hợp SDK</div>
          </div>
          <div class="w-sdk-step">Firebase Project</div>
          <div class="w-sdk-code" data-copy="Project: photoresit | Collection: photoresist_bundles">Project: photoresit
Collection: photoresist_bundles</div>
          <p class="w-sdk-note">Click code blocks to copy. AI connects once → reads all feedback automatically.</p>
        </div>
      </div>
      <div class="w-mini-lib">
        <div class="w-mini-lib-list"></div>
      </div>
      <div class="w-footer">
        <button class="w-btn w-undo" data-label="Undo">${I.undo}</button>
        <button class="w-btn w-redo" data-label="Redo">${I.redo}</button>
        <div class="w-dd">
          <button class="w-btn w-export-trigger" data-label="Export">💾</button>
          <div class="w-dd-menu w-export-menu">
            <button class="w-dd-item" data-export="pdf">📄 <span>Save as PDF</span></button>
            <button class="w-dd-item" data-export="md">📝 <span>Save as Markdown</span></button>
            <button class="w-dd-item" data-export="txt">📃 <span>Save as TXT</span></button>
          </div>
        </div>
        <div style="flex:1"></div>
        <span class="w-badge-foot">0</span>
        <button class="w-send">${I.send}<span>Send</span></button>
      </div>
    </div>
  `;

  // Build palette
  const grid = w.querySelector('.w-pgrid') as HTMLElement;
  PALETTE.forEach((c) => {
    const s = document.createElement('button');
    s.className = 'w-swatch'; s.dataset.color = c; s.style.background = c;
    if (['#ffffff','#ffff00','#fff2cc','#d9d9d9','#bfbfbf'].includes(c)) s.style.borderColor = 'rgba(0,0,0,0.15)';
    grid.appendChild(s);
  });

  setupWidgetEvents(w);
  return w;
}

// ===== EXPAND / COLLAPSE =====
let lastToggle = 0;

function expand(): void {
  if (Date.now() - lastToggle < 300) return; // guard rapid toggle
  lastToggle = Date.now();
  isOpen = true;
  const w = shadowRoot?.querySelector('#pr-widget') as HTMLElement;
  if (w) { w.classList.remove('collapsed'); w.classList.add('expanded'); }
  currentMode = 'annotate';
  chrome.runtime.sendMessage({ type: 'SET_MODE', mode: 'annotate' });
  updateAll();
  updateLibrary(); // always refresh library when opening
  updateKeepAlive();
}

function collapse(): void {
  if (Date.now() - lastToggle < 300) return; // guard rapid toggle
  lastToggle = Date.now();
  isOpen = false;
  const w = shadowRoot?.querySelector('#pr-widget') as HTMLElement;
  if (w) { w.classList.remove('expanded'); w.classList.add('collapsed'); }
  currentMode = 'browse';
  stopInspect();
  setTool('select');
  chrome.runtime.sendMessage({ type: 'SET_MODE', mode: 'browse' });
  const annLayer = shadowRoot?.querySelector('#pr-ann-layer') as HTMLElement;
  if (annLayer) annLayer.style.pointerEvents = 'none';
  updateKeepAlive();
}

// ===== WIDGET EVENTS =====
function setupWidgetEvents(w: HTMLElement): void {
  let currentHue = 0;

  // --- Logo face: click = expand, drag = move ---
  const logoFace = w.querySelector('.w-logo-face') as HTMLElement;
  let dragging = false, wasDragged = false, sx = 0, sy = 0, ox = 0, oy = 0;

  logoFace.addEventListener('mousedown', (e: MouseEvent) => {
    dragging = true; wasDragged = false;
    sx = e.clientX; sy = e.clientY;
    const r = w.getBoundingClientRect();
    ox = r.left; oy = r.top;
    e.preventDefault(); e.stopPropagation();
    window.addEventListener('mousemove', dragMv, true);
    window.addEventListener('mouseup', dragUp, true);
  });

  function dragMv(e: MouseEvent) {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasDragged = true;
    w.style.left = `${ox + dx}px`;
    w.style.top = `${oy + dy}px`;
    w.style.right = 'auto'; w.style.bottom = 'auto';
  }
  function dragUp() {
    dragging = false;
    window.removeEventListener('mousemove', dragMv, true);
    window.removeEventListener('mouseup', dragUp, true);
    if (!wasDragged) expand();
  }

  // --- Header: drag only (no collapse on click — use X button) ---
  const header = w.querySelector('.w-header') as HTMLElement;
  header.addEventListener('mousedown', (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.w-close')) return; // let close button handle
    let hdrag = false;
    const hsx = e.clientX, hsy = e.clientY;
    const hr = w.getBoundingClientRect();
    const hox = hr.left, hoy = hr.top;
    e.preventDefault(); e.stopPropagation();

    const hmv = (e2: MouseEvent) => {
      const dx = e2.clientX - hsx, dy = e2.clientY - hsy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hdrag = true;
      if (hdrag) {
        w.style.left = `${hox + dx}px`;
        w.style.top = `${hoy + dy}px`;
        w.style.right = 'auto'; w.style.bottom = 'auto';
      }
    };
    const hup = () => {
      window.removeEventListener('mousemove', hmv, true);
      window.removeEventListener('mouseup', hup, true);
    };
    window.addEventListener('mousemove', hmv, true);
    window.addEventListener('mouseup', hup, true);
  });

  // --- Tool clicks ---
  w.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;

    // Export items (must check BEFORE generic dd-item)
    const exportItem = el.closest('[data-export]') as HTMLElement | null;
    if (exportItem) { handleExport(exportItem.dataset.export!); closeDDs(); return; }

    // Tool dropdown items
    const ddItem = el.closest('.w-dd-item') as HTMLElement | null;
    if (ddItem && ddItem.dataset.tool) {
      const tool = ddItem.dataset.tool;
      const trigger = ddItem.closest('.w-dd')?.querySelector('.w-dd-trigger') as HTMLElement;
      if (trigger) { trigger.innerHTML = (I[tool] || I.box) + I.chevDown; trigger.dataset.tool = tool; }
      activateTool(tool); closeDDs(); return;
    }

    const ddTrigger = el.closest('.w-dd-trigger') as HTMLElement | null;
    if (ddTrigger) {
      e.stopPropagation();
      const menu = ddTrigger.parentElement?.querySelector('.w-dd-menu') as HTMLElement;
      if (menu) { const open = menu.style.display === 'flex'; closeDDs(); if (!open) menu.style.display = 'flex'; }
      return;
    }

    const toolBtn = el.closest('[data-tool]') as HTMLElement | null;
    if (toolBtn && !toolBtn.classList.contains('w-dd-trigger')) {
      const t = toolBtn.dataset.tool!;
      if (t === 'screenshot') {
        const layer = shadowRoot?.querySelector('#pr-ann-layer') as HTMLElement;
        if (layer) startScreenshotSelection(layer);
      } else if (t === 'inspect') {
        if (isInspectActive) {
          stopInspect(); isInspectActive = false;
          updateToolHighlight('');
        } else {
          startInspect(); isInspectActive = true;
          updateToolHighlight('inspect');
        }
      } else {
        activateTool(t);
      }
      return;
    }

    // Close button
    if (el.closest('.w-close')) { collapse(); return; }

    // UITB Scan
    if (el.closest('.w-scan-btn')) { handleScan(); return; }

    // SDK panel toggle
    if (el.closest('.w-mcp-btn')) {
      const panel = w.querySelector('.w-mcp-panel') as HTMLElement;
      if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
      return;
    }
    if (el.closest('.w-mcp-close')) {
      const panel = w.querySelector('.w-mcp-panel') as HTMLElement;
      if (panel) panel.style.display = 'none';
      return;
    }

    // Copy code block
    const codeBlock = el.closest('.w-sdk-code') as HTMLElement | null;
    if (codeBlock) {
      const text = (codeBlock.dataset.copy || codeBlock.textContent || '').replace(/\\n/g, '\n');
      navigator.clipboard.writeText(text).then(() => {
        showToast('Copied!');
        codeBlock.classList.add('copied');
        setTimeout(() => codeBlock.classList.remove('copied'), 1500);
      });
      return;
    }

    // Library toggle → open overlay
    if (el.closest('.w-lib-btn')) {
      openLibraryOverlay();
      return;
    }

    // Mini library item click → preview
    const miniItem = el.closest('.w-mini-item') as HTMLElement | null;
    if (miniItem) {
      viewLibraryItem(miniItem.dataset.id!);
      return;
    }

    if (el.closest('.w-undo')) { undo(); updateAll(); return; }
    if (el.closest('.w-redo')) { redo(); updateAll(); return; }
    if (el.closest('.w-send')) { handleSend(); return; }

    // Swatch
    const swatch = el.closest('.w-swatch') as HTMLElement | null;
    if (swatch) { applyColor(swatch.dataset.color!, w); closePalette(w); e.stopPropagation(); return; }

    // Palette trigger
    if (el.closest('.w-palette-btn')) {
      e.stopPropagation();
      const popup = w.querySelector('.w-palette-popup') as HTMLElement;
      if (popup) { const open = popup.style.display === 'block'; popup.style.display = open ? 'none' : 'block'; if (!open) drawSpec(w, currentHue); }
      return;
    }

    // Palette tabs
    const ptab = el.closest('.w-ptab') as HTMLElement | null;
    if (ptab) {
      e.stopPropagation();
      const t = ptab.dataset.tab!;
      w.querySelectorAll('.w-ptab').forEach((tt) => (tt as HTMLElement).classList.toggle('active', (tt as HTMLElement).dataset.tab === t));
      w.querySelectorAll('.w-tc').forEach((c) => (c as HTMLElement).style.display = (c as HTMLElement).dataset.tab === t ? '' : 'none');
      if (t === 'spectrum') drawSpec(w, currentHue);
      return;
    }

    // Thickness
    const thick = el.closest('.w-thick') as HTMLElement | null;
    if (thick) { setDrawWidth(Number(thick.dataset.w)); w.querySelectorAll('.w-thick').forEach((b) => (b as HTMLElement).classList.toggle('active', b === thick)); return; }

    // Export trigger (open dropdown)
    if (el.closest('.w-export-trigger')) {
      e.stopPropagation();
      const menu = el.closest('.w-dd')?.querySelector('.w-export-menu') as HTMLElement;
      if (menu) { const open = menu.style.display === 'flex'; closeDDs(); if (!open) menu.style.display = 'flex'; }
      return;
    }

    // Note theme
    const noteTheme = el.closest('.w-note-theme') as HTMLElement | null;
    if (noteTheme) {
      currentNoteTheme = Number(noteTheme.dataset.ntheme);
      setNoteTheme(currentNoteTheme);
      w.querySelectorAll('.w-note-theme').forEach((b) => (b as HTMLElement).classList.toggle('selected', b === noteTheme));
      return;
    }

    // Pin theme
    const pinTheme = el.closest('.w-pin-theme') as HTMLElement | null;
    if (pinTheme) {
      setPinTheme(Number(pinTheme.dataset.theme));
      w.querySelectorAll('.w-pin-theme').forEach((b) => (b as HTMLElement).classList.toggle('selected', b === pinTheme));
      return;
    }
  });


  // Spectrum canvas
  const spec = w.querySelector('.w-spec') as HTMLCanvasElement;
  if (spec) {
    let sd = false;
    spec.addEventListener('mousedown', (e) => { sd = true; pickSpec(e, spec, w); e.stopPropagation(); });
    spec.addEventListener('mousemove', (e) => { if (sd) pickSpec(e, spec, w); });
    spec.addEventListener('mouseup', () => sd = false);
  }
  const hue = w.querySelector('.w-hue') as HTMLInputElement;
  if (hue) hue.addEventListener('input', (e) => { currentHue = Number((e.target as HTMLInputElement).value); drawSpec(w, currentHue); e.stopPropagation(); });

  // Hex
  const hexIn = w.querySelector('.w-hex') as HTMLInputElement;
  const hexOk = w.querySelector('.w-hex-ok') as HTMLElement;
  if (hexIn) { hexIn.addEventListener('mousedown', (e) => e.stopPropagation()); hexIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') applyHex(hexIn, w); }); }
  if (hexOk) hexOk.addEventListener('click', (e) => { e.stopPropagation(); if (hexIn) applyHex(hexIn, w); });

  // Color input
  w.addEventListener('input', (e) => { const el = e.target as HTMLElement; if (el.classList.contains('w-color-input')) applyColor((el as HTMLInputElement).value, w); });

  // Close dropdowns on outside click
  document.addEventListener('click', () => { closeDDs(); closePalette(w); });
}

function activateTool(tool: string): void {
  const cur = getCurrentTool();
  if (cur === tool) { setTool('select'); updateToolHighlight(''); }
  else { setTool(tool as AnnotationTool); updateToolHighlight(tool); }
  // Enable annotation layer
  const annLayer = shadowRoot?.querySelector('#pr-ann-layer') as HTMLElement;
  if (annLayer) annLayer.style.pointerEvents = 'auto';
  updateDrawOpts();
}

function updateToolHighlight(t: string): void {
  shadowRoot?.querySelectorAll('[data-tool]').forEach((b) =>
    (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.tool === t));
}

function updateDrawOpts(): void {
  const drawTools = ['freehand','arrow','line','curve','path','box','circle','ellipse','star'];
  const opts = shadowRoot?.querySelector('.w-draw-opts') as HTMLElement;
  if (opts) opts.style.display = drawTools.includes(getCurrentTool()) ? 'flex' : 'none';
  // Pin themes
  const pinThemes = shadowRoot?.querySelector('.w-pin-themes') as HTMLElement;
  if (pinThemes) pinThemes.style.display = getCurrentTool() === 'pin' ? 'flex' : 'none';
  // (Note themes removed — will add custom colors later)
}

function showLightbox(src: string): void {
  if (!shadowRoot) return;
  const lb = shadowRoot.querySelector('#pr-lightbox') as HTMLElement;
  const img = shadowRoot.querySelector('.pr-lb-img') as HTMLImageElement;
  if (lb && img) { img.src = src; lb.style.display = 'flex'; }
}

function showDocViewer(title: string, content: string): void {
  if (!shadowRoot) return;
  const dv = shadowRoot.querySelector('#pr-docview') as HTMLElement;
  const titleEl = dv?.querySelector('.pr-dv-title') as HTMLElement;
  const contentEl = dv?.querySelector('.pr-dv-content') as HTMLElement;
  if (dv && titleEl && contentEl) {
    titleEl.textContent = title;
    contentEl.textContent = content;
    dv.style.display = 'flex';
  }
}

// ===== Library Manager Helpers =====

function openLibraryOverlay(): void {
  const overlay = shadowRoot?.querySelector('#pr-library-overlay') as HTMLElement;
  if (overlay) { overlay.style.display = 'flex'; updateLibrary(); }
}

function closeLibraryOverlay(): void {
  const overlay = shadowRoot?.querySelector('#pr-library-overlay') as HTMLElement;
  if (overlay) overlay.style.display = 'none';
  hideTagPicker();
}

function getSelectedIds(): string[] {
  const ids: string[] = [];
  shadowRoot?.querySelectorAll('.w-item-check').forEach((cb) => {
    if ((cb as HTMLInputElement).checked) ids.push((cb as HTMLInputElement).dataset.id!);
  });
  return ids;
}

function updateSelectedCount(): void {
  const count = getSelectedIds().length;
  const el = shadowRoot?.querySelector('.pr-lib-selected-count') as HTMLElement;
  if (el) el.textContent = count > 0 ? `${count} selected` : '0 selected';
}

async function viewLibraryItem(id: string): Promise<void> {
  const items = await getLibraryItems();
  const item = items.find((i) => i.id === id);
  if (!item) return;
  if (item.type === 'screenshot') {
    showLightbox(item.data_ref);
  } else if (item.type === 'pdf') {
    const blob = new Blob([item.data_ref], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  } else {
    showDocViewer(item.name, item.data_ref);
  }
}

function startInlineRename(nameEl: HTMLElement): void {
  const id = nameEl.dataset.id!;
  const oldName = nameEl.textContent || '';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = oldName;
  input.className = 'w-rename-input';
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const save = () => {
    const newName = input.value.trim() || oldName;
    updateLibraryItem(id, { name: newName }).then(() => updateLibrary());
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') updateLibrary();
  });
  input.addEventListener('blur', save);
  input.addEventListener('mousedown', (e) => e.stopPropagation());
}

function showTagPicker(): void {
  if (!shadowRoot) return;
  const picker = shadowRoot.querySelector('.w-tag-picker') as HTMLElement;
  const list = shadowRoot.querySelector('.w-tag-picker-list') as HTMLElement;
  if (!picker || !list) return;
  list.innerHTML = TAG_PRESETS.map((t) =>
    `<button class="w-tag-pick-item" data-tid="${t.id}"><span class="w-tag-dot" style="background:${t.color}"></span> ${t.name}</button>`
  ).join('');
  picker.style.display = 'flex';
}

function hideTagPicker(): void {
  const picker = shadowRoot?.querySelector('.w-tag-picker') as HTMLElement;
  if (picker) picker.style.display = 'none';
}

async function handleBulkAction(action: string): Promise<void> {
  const ids = getSelectedIds();
  if (ids.length === 0) { showToast('Select items first'); return; }

  switch (action) {
    case 'tag': {
      showTagPicker();
      break;
    }
    case 'download': {
      const items = await getLibraryItems();
      for (const id of ids) {
        const item = items.find((i) => i.id === id);
        if (!item) continue;
        if (item.type === 'screenshot') {
          const a = document.createElement('a');
          a.href = item.data_ref; a.download = item.name;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } else if (item.type === 'pdf') {
          const blob = new Blob([item.data_ref], { type: 'text/html' });
          window.open(URL.createObjectURL(blob), '_blank');
        } else {
          downloadFile(item.name, item.data_ref, item.type === 'md' ? 'text/markdown' : 'text/plain');
        }
      }
      showToast(`Downloaded ${ids.length} files`);
      break;
    }
    case 'delete': {
      await deleteLibraryItems(ids);
      showToast(`Deleted ${ids.length} items`);
      updateLibrary();
      updateAll();
      break;
    }
  }
}

function handleLibraryOverlayClick(e: Event): void {
  const el = e.target as HTMLElement;

  // Close
  if (el.closest('.pr-lib-close')) { closeLibraryOverlay(); return; }

  // Tabs
  const tab = el.closest('.w-lib-tab') as HTMLElement | null;
  if (tab) {
    const t = tab.dataset.ltab!;
    shadowRoot?.querySelectorAll('.w-lib-tab').forEach((b) => (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.ltab === t));
    shadowRoot?.querySelectorAll('.w-lib-content').forEach((c) => (c as HTMLElement).style.display = (c as HTMLElement).dataset.ltab === t ? '' : 'none');
    if (t === 'history') {
      const w = shadowRoot?.querySelector('.pr-lib-window') as HTMLElement;
      if (w) loadHistory(w);
    }
    return;
  }

  // View toggle
  const viewBtn = el.closest('.w-view-btn') as HTMLElement | null;
  if (viewBtn) {
    libViewMode = (viewBtn.dataset.view as 'list' | 'grid') || 'list';
    setViewMode(libViewMode);
    updateLibrary();
    return;
  }

  // Tag filter
  const tagChip = el.closest('.w-tag-chip') as HTMLElement | null;
  if (tagChip) {
    const tagId = tagChip.dataset.tag!;
    if (!tagId) { libFilterTags = []; }
    else if (libFilterTags.includes(tagId)) { libFilterTags = libFilterTags.filter((t) => t !== tagId); }
    else { libFilterTags.push(tagId); }
    updateLibrary();
    return;
  }

  // Checkbox → update count
  if (el.closest('.w-item-check')) {
    setTimeout(updateSelectedCount, 0);
    return;
  }

  // Click item thumbnail or icon → preview
  const thumb = el.closest('.w-list-thumb, .w-grid-thumb, .w-grid-icon, .w-list-icon') as HTMLElement | null;
  if (thumb) {
    const itemEl = thumb.closest('[data-id]') as HTMLElement;
    if (itemEl) viewLibraryItem(itemEl.dataset.id!);
    return;
  }

  // Click name → inline rename
  const nameEl = el.closest('.w-list-name, .w-grid-name') as HTMLElement | null;
  if (nameEl) { startInlineRename(nameEl); return; }

  // Bulk action buttons
  const actionBtn = el.closest('.pr-lib-action') as HTMLElement | null;
  if (actionBtn) {
    e.stopPropagation();
    handleBulkAction(actionBtn.dataset.action!);
    return;
  }

  // Tag picker item
  const tagPickItem = el.closest('.w-tag-pick-item') as HTMLElement | null;
  if (tagPickItem) {
    e.stopPropagation();
    const tagId = tagPickItem.dataset.tid!;
    const ids = getSelectedIds();
    if (ids.length > 0) {
      addTagToItems(ids, tagId).then(() => {
        hideTagPicker();
        showToast(`Tagged ${ids.length} items`);
        updateLibrary();
      });
    }
    return;
  }

  // History status
  const statusBtn = el.closest('.w-status-btn') as HTMLElement | null;
  if (statusBtn) {
    const fid = statusBtn.dataset.fid!;
    const newStatus = statusBtn.dataset.status as 'open' | 'in_progress' | 'done';
    updateFeedbackStatus(fid, newStatus).then((ok) => {
      if (ok) {
        showToast(`Status → ${newStatus}`);
        const w = shadowRoot?.querySelector('.pr-lib-window') as HTMLElement;
        if (w) loadHistory(w);
      }
    });
    return;
  }

  // Click elsewhere → close tag picker
  hideTagPicker();
}

async function updateLibrary(): Promise<void> {
  if (!shadowRoot) return;
  const container = shadowRoot.querySelector('.w-lib-items') as HTMLElement;
  const emptyEl = shadowRoot.querySelector('.w-lib-empty') as HTMLElement;
  if (!container) return;

  const filter: { tags?: string[]; search?: string } = {};
  if (libFilterTags.length > 0) filter.tags = libFilterTags;
  if (libSearchQuery) filter.search = libSearchQuery;
  const items = await getLibraryItems(filter);

  if (emptyEl) emptyEl.style.display = items.length === 0 ? '' : 'none';
  container.innerHTML = '';
  container.className = libViewMode === 'grid' ? 'w-lib-items w-lib-grid' : 'w-lib-items w-lib-list';

  // Update view toggle
  shadowRoot.querySelectorAll('.w-view-btn').forEach((b) =>
    (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.view === libViewMode));

  // Render tag filter chips
  renderTagFilter();

  items.forEach((item) => {
    const el = document.createElement('div');
    const icon = getItemIcon(item);
    const tagDots = item.tags.map((tid) => {
      const t = TAG_PRESETS.find((p) => p.id === tid);
      return t ? `<span class="w-item-tag-dot" style="background:${t.color}" title="${t.name}"></span>` : '';
    }).join('');
    const domain = item.project || '';
    const timeStr = timeAgo(item.created_at);

    if (libViewMode === 'grid') {
      el.className = 'w-grid-item';
      el.dataset.id = item.id;
      const thumb = item.type === 'screenshot'
        ? `<img src="${item.data_ref}" class="w-grid-thumb" />`
        : `<div class="w-grid-icon">${icon}</div>`;
      el.innerHTML = `
        <input type="checkbox" class="w-item-check" data-id="${item.id}" />
        ${thumb}
        <div class="w-grid-info">
          <span class="w-grid-name" data-id="${item.id}" title="${item.name}">${item.name}</span>
          <div class="w-grid-tags">${tagDots}</div>
        </div>`;
    } else {
      el.className = 'w-list-item';
      el.dataset.id = item.id;
      const thumb = item.type === 'screenshot'
        ? `<img src="${item.data_ref}" class="w-list-thumb" />`
        : `<span class="w-list-icon">${icon}</span>`;
      el.innerHTML = `
        <input type="checkbox" class="w-item-check" data-id="${item.id}" />
        ${thumb}
        <div class="w-list-info">
          <span class="w-list-name" data-id="${item.id}" title="${item.name}">${item.name}</span>
          <span class="w-list-meta">${domain} · ${timeStr}</span>
        </div>
        <div class="w-list-tags">${tagDots}</div>`;
    }
    container.appendChild(el);
  });

  updateSelectedCount();
}

function getItemIcon(item: LibraryItem): string {
  switch (item.type) {
    case 'screenshot': return '📷';
    case 'pdf': return '📄';
    case 'md': return '📝';
    case 'txt': return '📃';
    case 'uitb-scan': return '🔍';
  }
}

function renderTagFilter(): void {
  if (!shadowRoot) return;
  const container = shadowRoot.querySelector('.w-lib-tag-filter') as HTMLElement;
  if (!container) return;
  container.innerHTML = `<button class="w-tag-chip ${libFilterTags.length === 0 ? 'active' : ''}" data-tag="">All</button>` +
    TAG_PRESETS.map((t) =>
      `<button class="w-tag-chip ${libFilterTags.includes(t.id) ? 'active' : ''}" data-tag="${t.id}" title="${t.name}"><span class="w-tag-dot" style="background:${t.color}"></span></button>`
    ).join('');
}

async function loadHistory(w: HTMLElement): Promise<void> {
  const list = w.querySelector('.w-history-list') as HTMLElement;
  const empty = w.querySelector('.w-history-empty') as HTMLElement;
  if (!list) return;

  list.innerHTML = '<div style="text-align:center;padding:8px;color:rgba(255,255,255,0.3);font-size:11px">Loading...</div>';

  const items = await getHistory(15);
  list.innerHTML = '';

  if (items.length === 0) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  items.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'w-history-item';
    const sColor = statusColor(item.status);
    const nextStatus = item.status === 'open' ? 'in_progress' : item.status === 'in_progress' ? 'done' : 'open';
    const nextLabel = item.status === 'open' ? '→ Progress' : item.status === 'in_progress' ? '→ Done' : '→ Reopen';

    el.innerHTML = `
      <div class="w-hist-top">
        <span class="w-hist-status" style="background:${sColor}">${item.status.replace('_', ' ')}</span>
        <span class="w-hist-time">${timeAgo(item.created_at)}</span>
      </div>
      <div class="w-hist-title">${(item.page_title || item.page_url).slice(0, 35)}</div>
      <div class="w-hist-meta">${item.annotations_count} annotations · ${item.intent_summary || 'general'}</div>
      <button class="w-status-btn" data-fid="${item.feedback_id}" data-status="${nextStatus}">${nextLabel}</button>
    `;
    list.appendChild(el);
  });
}

function closeDDs(): void { shadowRoot?.querySelectorAll('.w-dd-menu').forEach((m) => (m as HTMLElement).style.display = 'none'); }
function closePalette(w: HTMLElement): void { const p = w.querySelector('.w-palette-popup') as HTMLElement; if (p) p.style.display = 'none'; }

// ===== COLOR =====
function applyColor(hex: string, w: HTMLElement): void {
  setDrawColor(hex);
  const dot = w.querySelector('.w-color-dot') as HTMLElement; if (dot) dot.style.background = hex;
  const hi = w.querySelector('.w-hex') as HTMLInputElement; if (hi) hi.value = hex;
  w.querySelectorAll('.w-swatch').forEach((s) => (s as HTMLElement).classList.toggle('active', (s as HTMLElement).dataset.color === hex));
}
function applyHex(input: HTMLInputElement, w: HTMLElement): void {
  let h = input.value.trim(); if (!h.startsWith('#')) h = '#' + h;
  if (/^#[0-9a-fA-F]{6}$/.test(h)) applyColor(h, w);
}
function drawSpec(w: HTMLElement, hue: number): void {
  const c = w.querySelector('.w-spec') as HTMLCanvasElement; if (!c) return;
  const ctx = c.getContext('2d')!, W = c.width, H = c.height;
  ctx.fillStyle = `hsl(${hue},100%,50%)`; ctx.fillRect(0,0,W,H);
  const wg = ctx.createLinearGradient(0,0,W,0); wg.addColorStop(0,'#fff'); wg.addColorStop(1,'transparent'); ctx.fillStyle = wg; ctx.fillRect(0,0,W,H);
  const bg = ctx.createLinearGradient(0,0,0,H); bg.addColorStop(0,'transparent'); bg.addColorStop(1,'#000'); ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);
}
function pickSpec(e: MouseEvent, c: HTMLCanvasElement, w: HTMLElement): void {
  const r = c.getBoundingClientRect();
  const x = Math.max(0,Math.min(e.clientX-r.left,c.width)), y = Math.max(0,Math.min(e.clientY-r.top,c.height));
  const p = c.getContext('2d')!.getImageData(x,y,1,1).data;
  applyColor(`#${p[0].toString(16).padStart(2,'0')}${p[1].toString(16).padStart(2,'0')}${p[2].toString(16).padStart(2,'0')}`, w);
}

// ===== UPDATE ALL =====
async function updateAll(): Promise<void> {
  if (!shadowRoot) return;
  const w = shadowRoot.querySelector('#pr-widget') as HTMLElement;
  const items = await getLibraryItems();
  const n = getAnnotations().length + items.length;

  // Badges
  w?.querySelectorAll('.w-badge, .w-badge-foot').forEach((b) => {
    (b as HTMLElement).style.display = n > 0 ? 'inline-flex' : 'none';
    (b as HTMLElement).textContent = String(n);
  });

  // Mini library preview in widget
  updateMiniLibrary(items);

  // Annotation layer pointer
  const annLayer = shadowRoot.querySelector('#pr-ann-layer') as HTMLElement;
  if (annLayer) annLayer.style.pointerEvents = isOpen ? 'auto' : 'none';

  // Widget pointer
  if (w) w.style.pointerEvents = 'auto';

  updateDrawOpts();
}

function updateMiniLibrary(items: LibraryItem[]): void {
  if (!shadowRoot) return;
  const list = shadowRoot.querySelector('.w-mini-lib-list') as HTMLElement;
  if (!list) return;
  list.innerHTML = '';
  const recent = items.slice(0, 10);
  if (recent.length === 0) return;
  recent.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'w-mini-item';
    el.dataset.id = item.id;
    if (item.type === 'screenshot') {
      el.innerHTML = `<img src="${item.data_ref}" class="w-mini-thumb" title="${item.name}" />`;
    } else {
      const icon = getItemIcon(item);
      el.innerHTML = `<span class="w-mini-icon" title="${item.name}">${icon}</span>`;
    }
    list.appendChild(el);
  });
}

// ===== SEND =====
// ===== UITB SCAN =====
async function handleScan(): Promise<void> {
  showToast('Scanning UI...');
  try {
    const pkg = await scanWebsite();

    // Save to bridge folder
    try {
      await fetch('http://127.0.0.1:9471/v1/bundles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback_id: `uitb-${Date.now().toString(36)}`,
          project_id: 'uitb-scans',
          page_url: pkg.meta.url,
          page_title: pkg.meta.title,
          annotations: [],
          screenshots: [],
          dom_contexts: [],
          intent_summary: 'UITB Scan',
          markdown_summary: generateUITBMarkdown(pkg),
          schema_version: '3.0',
          uitb_package: pkg,
        }),
      });
    } catch { /* bridge not running */ }

    // Also save via background SW
    chrome.runtime.sendMessage({
      type: 'BRIDGE_SEND',
      bundle: {
        feedback_id: `uitb-${Date.now().toString(36)}`,
        project_id: 'uitb-scans',
        page_url: pkg.meta.url,
        page_title: pkg.meta.title,
        annotations: [],
        screenshots: [],
        dom_contexts: [],
        intent_summary: 'UITB Scan',
        markdown_summary: generateUITBMarkdown(pkg),
        schema_version: '3.0',
      },
    }).catch(() => {});

    // Save to library via LibraryItem
    const md = generateUITBMarkdown(pkg);
    const scanItem = createExportItem('md', `scan-${(pkg.meta.title || 'page').slice(0, 10)}.md`, md, pkg.meta.url, pkg.meta.title);
    scanItem.type = 'uitb-scan';
    await addLibraryItem(scanItem);

    // Log to console
    console.log('[UITB] Package:', JSON.stringify(pkg, null, 2));
    console.log('[UITB] Markdown:\n' + md);

    updateLibrary();
    showToast(`Scan complete! ${pkg.design_tokens.colors.length} colors, ${pkg.design_tokens.fonts.length} fonts, ${pkg.components.length} components`);
  } catch (err) {
    console.error('[UITB] Scan error:', err);
    showToast('Scan failed');
  }
}

function generateUITBMarkdown(pkg: UITBPackage): string {
  const lines = [
    `# UITB Scan: ${pkg.meta.title}`,
    '',
    `**URL**: ${pkg.meta.url}`,
    `**Viewport**: ${pkg.meta.viewport.width}x${pkg.meta.viewport.height}`,
    `**Scanned**: ${pkg.meta.scanned_at}`,
    '',
    `## Design Tokens`,
    '',
    `### Colors (${pkg.design_tokens.colors.length})`,
    ...pkg.design_tokens.colors.map((c) => `- \`${c.value}\` (${c.usage}, ${c.count}x)`),
    '',
    `### Fonts (${pkg.design_tokens.fonts.length})`,
    ...pkg.design_tokens.fonts.map((f) => `- **${f.family}** — sizes: ${f.sizes.join(', ')} | weights: ${f.weights.join(', ')} (${f.count}x)`),
    '',
    `### CSS Variables (${Object.keys(pkg.design_tokens.css_variables).length})`,
    ...Object.entries(pkg.design_tokens.css_variables).slice(0, 20).map(([k, v]) => `- \`${k}\`: ${v}`),
    '',
    `## Components (${pkg.components.length})`,
    ...pkg.components.slice(0, 20).map((c) => `- **${c.type}** \`${c.selector}\` (${c.bbox.w}x${c.bbox.h}) — "${c.text.slice(0, 30)}"`),
    '',
    `## Layout: ${pkg.layout.type}`,
    ...pkg.layout.sections.map((s) => `- ${s.role}: \`${s.selector}\` (${s.bbox.w}x${s.bbox.h})`),
  ];
  return lines.join('\n');
}

async function handleExport(format: string): Promise<void> {
  try {
    const anns = getAnnotations();
    const selectedSS = await getSelectedLibraryScreenshots();
    const bundle = await createBundle(anns, selectedSS);

    switch (format) {
      case 'pdf':
        await exportPdf(bundle);
        showToast('PDF saved to library');
        break;
      case 'md':
        await exportMarkdown(bundle);
        showToast('Markdown saved to library');
        break;
      case 'txt':
        await exportTxt(bundle);
        showToast('TXT saved to library');
        break;
      default: return;
    }
    await updateLibrary();
  } catch (err) {
    console.error('[Photoresist] Export error:', err);
    showToast('Export failed: ' + (err instanceof Error ? err.message : String(err)));
  }
}

async function getSelectedLibraryScreenshots(): Promise<Screenshot[]> {
  // Get selected items that are screenshots
  const selectedIds: string[] = [];
  shadowRoot?.querySelectorAll('.w-item-check').forEach((cb) => {
    if ((cb as HTMLInputElement).checked) selectedIds.push((cb as HTMLInputElement).dataset.id!);
  });
  const allItems = await getLibraryItems();
  const ssItems = selectedIds.length > 0
    ? allItems.filter((i) => selectedIds.includes(i.id) && i.type === 'screenshot')
    : allItems.filter((i) => i.type === 'screenshot');
  // Convert to Screenshot format for bundle
  return ssItems.map((i) => ({
    id: i.id,
    data_ref: i.data_ref,
    crop: { x: 0, y: 0, width: 0, height: 0 },
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
  }));
}

async function handleSend(): Promise<void> {
  const anns = getAnnotations();
  const selectedSS = await getSelectedLibraryScreenshots();

  // Get all selected item IDs
  const selectedIds: string[] = [];
  shadowRoot?.querySelectorAll('.w-item-check').forEach((cb) => {
    if ((cb as HTMLInputElement).checked) selectedIds.push((cb as HTMLInputElement).dataset.id!);
  });

  if (anns.length === 0 && selectedSS.length === 0 && selectedIds.length === 0) {
    showToast('Nothing to send — select items first');
    return;
  }
  showToast('Sending...');
  try {
    const bundle = await createBundle(anns, selectedSS);
    console.log('[Photoresist] Markdown:\n' + bundle.markdown_summary);
    const r = await uploadBundle(bundle);

    // Delete sent library items
    if (selectedIds.length > 0) {
      await deleteLibraryItems(selectedIds);
    } else {
      // If no specific selection, delete all screenshots
      const allItems = await getLibraryItems();
      const ssIds = allItems.filter((i) => i.type === 'screenshot').map((i) => i.id);
      if (ssIds.length > 0) await deleteLibraryItems(ssIds);
    }

    const totalSent = anns.length + selectedIds.length;
    if (r.success) {
      showToast(`Sent! ${totalSent} items`);
    } else {
      showToast(`Saved locally. Cloud will sync later.`);
    }
    updateAll();
    updateLibrary();
  } catch (err) { console.error('[Photoresist]', err); showToast('Saved locally.'); }
}

function showToast(msg: string): void {
  if (!shadowRoot) return;
  shadowRoot.querySelectorAll('.pr-toast').forEach((t) => t.remove());
  const t = document.createElement('div'); t.className = 'pr-toast'; t.textContent = msg;
  shadowRoot.appendChild(t); setTimeout(() => t.remove(), 3500);
}

function updateKeepAlive(): void {
  if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
  if (isOpen) keepAliveTimer = setInterval(() => chrome.runtime.sendMessage({ type: 'KEEP_ALIVE' }).catch(() => {}), KEEP_ALIVE_MS);
}

function listenForMessages(): void {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'MODE_CHANGED') { if (msg.mode === 'browse') collapse(); else expand(); }
  });
}

// ===========================
// CSS
// ===========================
function getCSS(): string {
  return `
:host { all: initial; }
* { box-sizing: border-box; }

/* ===== WIDGET (single element: logo ↔ window) ===== */
.widget {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2147483647;
  pointer-events: auto;
  user-select: none;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif;
}

/* --- Collapsed = Logo --- */
.widget.collapsed {
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background: transparent;
  border: none;
  box-shadow: none;
  cursor: grab;
  overflow: visible;
}
.widget.collapsed:active { cursor: grabbing; }
.widget.collapsed .w-panel { display: none; }
.widget.collapsed .w-logo-face { display: flex; }

/* --- Expanded = Window --- */
.widget.expanded {
  width: 280px;
  border-radius: 16px;
  background: rgba(12, 12, 20, 0.9);
  backdrop-filter: blur(28px) saturate(1.4);
  -webkit-backdrop-filter: blur(28px) saturate(1.4);
  outline: 1.5px solid rgba(167, 139, 250, 0.35);
  box-shadow:
    0 8px 40px rgba(0,0,0,0.4),
    0 0 20px rgba(167,139,250,0.12),
    0 0 40px rgba(96,165,250,0.06);
  overflow: visible;
  animation: w-expand 0.25s cubic-bezier(0.16,1,0.3,1);
}
@keyframes w-expand { from { opacity:0; transform:scale(0.9); } to { opacity:1; transform:scale(1); } }
.widget.expanded .w-logo-face { display: none; }
.widget.expanded .w-panel { display: flex; }

/* Logo face */
.w-logo-face {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.w-logo-face img {
  animation: galaxy 20s linear infinite;
  pointer-events: none;
  object-fit: contain;
  filter: drop-shadow(0 2px 8px rgba(167,139,250,0.3));
}
@keyframes galaxy {
  0%   { transform: perspective(200px) rotate(0deg) rotateY(0deg); }
  50%  { transform: perspective(200px) rotate(180deg) rotateY(15deg); }
  100% { transform: perspective(200px) rotate(360deg) rotateY(0deg); }
}

.w-badge, .w-badge-foot {
  position: absolute;
  top: -3px; right: -3px;
  min-width: 16px; height: 16px;
  padding: 0 4px;
  background: #a78bfa;
  border-radius: 8px;
  font-size: 9px; font-weight: 700; color: #fff;
  display: none;
  align-items: center; justify-content: center;
  pointer-events: none;
}
.w-badge-foot { position: static; min-width: 20px; height: 20px; font-size: 10px; background: rgba(167,139,250,0.3); color: #ddd6fe; border-radius: 10px; padding: 0 5px; }

/* Panel */
.w-panel {
  display: none;
  flex-direction: column;
  padding: 12px;
  gap: 6px;
}

.w-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0 6px;
  cursor: grab;
}
.w-header:active { cursor: grabbing; }
.w-header-logo { animation: galaxy 25s linear infinite; pointer-events: none; border-radius: 50%; object-fit: contain; }
.w-title { font-size: 13px; font-weight: 700; color: #c4b5fd; pointer-events: none; flex: 1; }
.w-close { width:24px; height:24px; border:none; border-radius:6px; background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.4); font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.15s; padding:0; }
.w-close:hover { background:rgba(239,68,68,0.3); color:#fff; }

.w-section-label {
  font-size: 9px;
  color: rgba(255,255,255,0.25);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 2px;
}

/* Buttons */
.w-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px; height: 34px;
  border: none;
  border-radius: 8px;
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.6);
  cursor: pointer;
  transition: all 0.15s;
  padding: 0;
}
.w-btn svg { pointer-events: none; }
.w-btn span { pointer-events: none; }
.w-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
.w-btn.active { background: rgba(167,139,250,0.25); color: #c4b5fd; box-shadow: inset 0 0 0 1px rgba(167,139,250,0.35); }

.w-btn[data-label]:hover::after {
  content: attr(data-label);
  position: absolute; bottom: -20px; left: 50%; transform: translateX(-50%);
  padding: 2px 6px; background: rgba(0,0,0,0.9); color: #fff; font-size: 9px;
  border-radius: 3px; white-space: nowrap; pointer-events: none; z-index: 100;
}

.w-tools { display: flex; gap: 3px; flex-wrap: wrap; }
.w-pin-themes { display:none; gap:3px; align-items:center; padding:2px 0; }
.w-pin-theme { width:24px; height:24px; border:2px solid rgba(255,255,255,0.1); border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; transition:all 0.12s; }
.w-pin-theme:hover { transform:scale(1.1); border-color:rgba(255,255,255,0.4); }
.w-pin-theme.selected { border-color:#fff; box-shadow:0 0 0 2px rgba(255,255,255,0.3); transform:scale(1.1); }
.w-note-themes { display:none; gap:3px; align-items:center; padding:2px 0; }
.w-note-theme { width:24px; height:24px; border:2px solid rgba(255,255,255,0.1); border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; transition:all 0.12s; }
.w-note-theme:hover { transform:scale(1.1); border-color:rgba(255,255,255,0.4); }
.w-note-theme.selected { border-color:#fff; box-shadow:0 0 0 2px rgba(255,255,255,0.3); transform:scale(1.1); }

/* Draw options */
.w-draw-opts { display: none; flex-direction: row; gap: 6px; align-items: center; padding: 4px 0; }
.w-color-wrap { position: relative; }
.w-color-dot { width: 20px; height: 20px; border-radius: 5px; border: 2px solid rgba(255,255,255,0.2); background: #ef4444; pointer-events: none; }

/* Palette popup */
.w-palette-popup { display:none; position:absolute; bottom:100%; left:0; margin-bottom:6px; padding:8px; background:rgba(12,12,20,0.96); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.12); border-radius:10px; box-shadow:0 8px 32px rgba(0,0,0,0.5); z-index:200; width:200px; }
.w-ptabs { display:flex; gap:2px; margin-bottom:6px; }
.w-ptab { flex:1; padding:4px; border:none; border-radius:5px; background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.5); font-size:10px; cursor:pointer; font-family:inherit; }
.w-ptab.active { background:rgba(167,139,250,0.25); color:#c4b5fd; }
.w-pgrid { display:grid; grid-template-columns:repeat(6,1fr); gap:2px; }
.w-swatch { width:24px; height:24px; border:1.5px solid rgba(255,255,255,0.08); border-radius:3px; cursor:pointer; padding:0; transition:all 0.1s; }
.w-swatch:hover { transform:scale(1.15); border-color:rgba(255,255,255,0.5); z-index:1; }
.w-swatch.active { border-color:#fff; box-shadow:0 0 0 2px rgba(255,255,255,0.3); }
.w-spec-wrap { text-align:center; }
.w-spec { border-radius:6px; cursor:crosshair; display:block; margin:0 auto; border:1px solid rgba(255,255,255,0.1); }
.w-hue { width:100%; height:12px; margin-top:4px; -webkit-appearance:none; background:linear-gradient(to right,hsl(0,100%,50%),hsl(60,100%,50%),hsl(120,100%,50%),hsl(180,100%,50%),hsl(240,100%,50%),hsl(300,100%,50%),hsl(360,100%,50%)); border-radius:6px; outline:none; }
.w-hue::-webkit-slider-thumb { -webkit-appearance:none; width:12px; height:12px; border-radius:6px; background:#fff; border:2px solid rgba(0,0,0,0.3); cursor:pointer; }
.w-hex-row { display:flex; align-items:center; gap:4px; margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.08); }
.w-hex-lbl { font-size:10px; color:rgba(255,255,255,0.35); }
.w-hex { width:72px; padding:3px 6px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.12); border-radius:4px; color:#f0f0f5; font-size:11px; font-family:'SF Mono',monospace; outline:none; }
.w-hex:focus { border-color:rgba(167,139,250,0.5); }
.w-hex-ok { padding:3px 8px; background:rgba(167,139,250,0.25); border:1px solid rgba(167,139,250,0.4); border-radius:4px; color:#ddd6fe; font-size:10px; cursor:pointer; font-family:inherit; }

/* Thickness */
.w-thick-wrap { display:flex; gap:3px; }
.w-thick { display:flex; align-items:center; justify-content:center; width:30px; height:26px; border:none; border-radius:5px; background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.5); cursor:pointer; padding:0; transition:all 0.12s; }
.w-thick:hover { background:rgba(255,255,255,0.1); color:#fff; }
.w-thick.active { background:rgba(167,139,250,0.2); color:#c4b5fd; }
.w-thick svg { pointer-events:none; }

/* Dropdown */
.w-dd { position:relative; display:inline-flex; }
.w-dd-menu { display:none; flex-direction:column; position:absolute; top:100%; left:0; margin-top:4px; padding:4px; background:rgba(12,12,20,0.96); backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.1); border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.4); z-index:100; min-width:105px; }
.w-dd-item { display:flex; align-items:center; gap:6px; padding:5px 8px; border:none; border-radius:5px; background:transparent; color:rgba(255,255,255,0.7); cursor:pointer; font-size:11px; font-family:inherit; white-space:nowrap; transition:all 0.12s; }
.w-dd-item svg, .w-dd-item span { pointer-events:none; }
.w-dd-item:hover { background:rgba(255,255,255,0.1); color:#fff; }

/* ===== Library Overlay ===== */
.pr-lib-overlay { display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); z-index:2147483646; align-items:center; justify-content:center; pointer-events:auto; font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',system-ui,sans-serif; }
.pr-lib-window { width:560px; max-width:90vw; max-height:80vh; display:flex; flex-direction:column; background:rgba(12,12,20,0.96); backdrop-filter:blur(28px) saturate(1.4); border:1px solid rgba(255,255,255,0.12); border-radius:16px; box-shadow:0 16px 64px rgba(0,0,0,0.6); overflow:hidden; position:relative; }
.pr-lib-header { display:flex; align-items:center; padding:12px 16px; border-bottom:1px solid rgba(255,255,255,0.08); gap:8px; }
.pr-lib-title { font-size:14px; font-weight:700; color:#c4b5fd; white-space:nowrap; }
.pr-lib-header-center { flex:1; display:flex; justify-content:center; }
.pr-lib-header-right { display:flex; align-items:center; gap:4px; }
.pr-lib-close { width:28px; height:28px; border:none; border-radius:8px; background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.5); font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.12s; }
.pr-lib-close:hover { background:rgba(239,68,68,0.3); color:#fff; }

/* Toolbar (search + tags) */
.pr-lib-toolbar { padding:8px 16px; border-bottom:1px solid rgba(255,255,255,0.06); }
.w-lib-search { width:100%; padding:7px 10px; border:1px solid rgba(255,255,255,0.1); border-radius:8px; background:rgba(255,255,255,0.04); color:#e2e2e8; font-size:12px; font-family:inherit; outline:none; transition:border-color 0.15s; }
.w-lib-search:focus { border-color:rgba(167,139,250,0.5); }
.w-lib-search::placeholder { color:rgba(255,255,255,0.25); }
.w-lib-tag-filter { display:flex; gap:4px; flex-wrap:wrap; padding:8px 0 0; }
.w-tag-chip { display:inline-flex; align-items:center; gap:3px; padding:3px 8px; border:1px solid rgba(255,255,255,0.08); border-radius:12px; background:transparent; color:rgba(255,255,255,0.45); font-size:10px; font-weight:600; font-family:inherit; cursor:pointer; transition:all 0.12s; }
.w-tag-chip:hover { background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.7); }
.w-tag-chip.active { background:rgba(167,139,250,0.15); border-color:rgba(167,139,250,0.3); color:#c4b5fd; }
.w-tag-dot { width:8px; height:8px; border-radius:4px; flex-shrink:0; }

/* Tabs */
.w-lib-tab { padding:5px 12px; border:none; border-radius:6px; background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.45); font-size:11px; font-weight:600; cursor:pointer; font-family:inherit; transition:all 0.12s; }
.w-lib-tab:hover { background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.7); }
.w-lib-tab.active { background:rgba(167,139,250,0.2); color:#c4b5fd; }

/* View toggle */
.w-view-btn { width:28px; height:28px; border:none; border-radius:6px; background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.35); font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.12s; }
.w-view-btn:hover { background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.6); }
.w-view-btn.active { background:rgba(167,139,250,0.2); color:#c4b5fd; }

/* Body scroll */
.pr-lib-body { flex:1; overflow-y:auto; padding:8px 16px; min-height:200px; }
.w-lib-empty, .w-history-empty { text-align:center; padding:24px; font-size:12px; color:rgba(255,255,255,0.25); }

/* List view */
.w-lib-list { display:flex; flex-direction:column; gap:4px; }
.w-list-item { display:flex; align-items:center; gap:8px; padding:6px 8px; background:rgba(255,255,255,0.03); border-radius:8px; font-size:12px; transition:background 0.12s; }
.w-list-item:hover { background:rgba(255,255,255,0.06); }
.w-item-check { width:15px; height:15px; cursor:pointer; accent-color:#a78bfa; flex-shrink:0; }
.w-list-thumb { width:48px; height:36px; object-fit:cover; border-radius:4px; cursor:pointer; flex-shrink:0; border:1px solid rgba(255,255,255,0.1); }
.w-list-thumb:hover { outline:2px solid #a78bfa; }
.w-list-icon { font-size:18px; flex-shrink:0; width:24px; text-align:center; cursor:pointer; }
.w-list-info { flex:1; overflow:hidden; min-width:0; }
.w-list-name { display:block; color:rgba(255,255,255,0.7); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer; font-size:12px; }
.w-list-name:hover { color:#c4b5fd; }
.w-list-meta { display:block; color:rgba(255,255,255,0.3); font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.w-list-tags { display:flex; gap:3px; flex-shrink:0; }
.w-item-tag-dot { width:8px; height:8px; border-radius:4px; }

/* Grid view (caro/chessboard) */
.w-lib-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
.w-grid-item { position:relative; display:flex; flex-direction:column; background:rgba(255,255,255,0.03); border-radius:8px; overflow:hidden; font-size:11px; transition:background 0.12s; }
.w-grid-item:hover { background:rgba(255,255,255,0.06); }
.w-grid-item .w-item-check { position:absolute; top:4px; left:4px; z-index:2; }
.w-grid-thumb { width:100%; height:80px; object-fit:cover; cursor:pointer; }
.w-grid-thumb:hover { outline:2px solid #a78bfa; }
.w-grid-icon { width:100%; height:80px; display:flex; align-items:center; justify-content:center; font-size:32px; cursor:pointer; }
.w-grid-info { padding:5px 6px; }
.w-grid-name { display:block; color:rgba(255,255,255,0.6); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer; font-size:10px; }
.w-grid-name:hover { color:#c4b5fd; }
.w-grid-tags { display:flex; gap:2px; margin-top:3px; }

/* Inline rename */
.w-rename-input { width:100%; padding:3px 6px; border:1px solid rgba(167,139,250,0.5); border-radius:4px; background:rgba(0,0,0,0.3); color:#e2e2e8; font-size:12px; font-family:inherit; outline:none; }

/* Bulk action bar */
.pr-lib-actions { display:flex; align-items:center; padding:10px 16px; border-top:1px solid rgba(255,255,255,0.08); gap:6px; }
.pr-lib-selected-count { font-size:11px; color:rgba(255,255,255,0.35); font-weight:500; }
.pr-lib-action { display:inline-flex; align-items:center; gap:4px; padding:5px 12px; border:1px solid rgba(255,255,255,0.1); border-radius:6px; background:transparent; color:rgba(255,255,255,0.6); font-size:11px; font-weight:500; font-family:inherit; cursor:pointer; transition:all 0.12s; }
.pr-lib-action:hover { background:rgba(255,255,255,0.08); color:#fff; }
.pr-lib-action-danger:hover { background:rgba(239,68,68,0.2); color:#ef4444; border-color:rgba(239,68,68,0.3); }

/* Tag picker (popup) */
.w-tag-picker { display:none; flex-direction:column; position:absolute; bottom:52px; right:16px; padding:8px; background:rgba(12,12,20,0.98); backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.15); border-radius:10px; box-shadow:0 8px 32px rgba(0,0,0,0.5); z-index:300; min-width:140px; }
.w-tag-picker-title { font-size:11px; font-weight:600; color:rgba(255,255,255,0.5); margin-bottom:6px; }
.w-tag-picker-list { display:flex; flex-direction:column; gap:2px; }
.w-tag-pick-item { display:flex; align-items:center; gap:8px; padding:5px 10px; border:none; border-radius:5px; background:transparent; color:rgba(255,255,255,0.7); cursor:pointer; font-size:12px; font-family:inherit; transition:all 0.12s; }
.w-tag-pick-item:hover { background:rgba(255,255,255,0.1); color:#fff; }

/* History items */
.w-history-list { display:flex; flex-direction:column; gap:6px; }
.w-history-item { padding:10px; background:rgba(255,255,255,0.03); border-radius:8px; font-size:12px; }
.w-hist-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
.w-hist-status { padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700; color:#fff; text-transform:uppercase; letter-spacing:0.3px; }
.w-hist-time { font-size:10px; color:rgba(255,255,255,0.3); }
.w-hist-title { color:rgba(255,255,255,0.8); font-weight:500; margin-bottom:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.w-hist-meta { color:rgba(255,255,255,0.3); font-size:11px; margin-bottom:5px; }
.w-status-btn { padding:4px 10px; border:1px solid rgba(255,255,255,0.1); border-radius:5px; background:transparent; color:rgba(255,255,255,0.5); font-size:10px; cursor:pointer; font-family:inherit; transition:all 0.12s; }
.w-status-btn:hover { background:rgba(255,255,255,0.08); color:#fff; }

/* Lightbox — outside widget, directly in shadow root */
.pr-lb { display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.88); z-index:2147483647; align-items:center; justify-content:center; cursor:pointer; pointer-events:auto; }
.pr-lb-img { max-width:85vw; max-height:80vh; border-radius:8px; box-shadow:0 8px 40px rgba(0,0,0,0.5); object-fit:contain; pointer-events:none; }
.pr-lb-close { position:fixed; top:20px; right:20px; width:40px; height:40px; border:none; border-radius:20px; background:rgba(255,255,255,0.15); color:#fff; font-size:22px; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:2147483647; }
.pr-lb-close:hover { background:rgba(255,255,255,0.3); }

/* Doc Viewer — outside widget */
.pr-dv { display:none; position:fixed; top:5vh; left:10vw; width:80vw; max-height:85vh; flex-direction:column; background:rgba(12,12,20,0.95); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.12); border-radius:12px; box-shadow:0 8px 40px rgba(0,0,0,0.5); z-index:2147483647; pointer-events:auto; overflow:hidden; font-family:-apple-system,system-ui,sans-serif; }
.pr-dv-header { display:flex; align-items:center; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.08); }
.pr-dv-title { flex:1; font-size:13px; font-weight:600; color:#c4b5fd; }
.pr-dv-close { width:28px; height:28px; border:none; border-radius:6px; background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.5); font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.pr-dv-close:hover { background:rgba(239,68,68,0.3); color:#fff; }
.pr-dv-content { flex:1; overflow:auto; padding:16px; margin:0; font-size:12px; line-height:1.6; color:#e2e2e8; white-space:pre-wrap; word-wrap:break-word; font-family:'SF Mono','Fira Code',monospace; }

/* Footer */
/* Bottom bar (Scan + Library) */
.w-bottom-bar { display:flex; gap:4px; padding:6px 0; border-top:1px solid rgba(255,255,255,0.06); margin-top:4px; }
.w-scan-btn, .w-lib-btn { flex:1; display:flex; align-items:center; justify-content:center; gap:4px; height:32px; border:1px solid rgba(255,255,255,0.1); border-radius:8px; background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.6); font-size:11px; font-weight:600; font-family:inherit; cursor:pointer; transition:all 0.15s; }
.w-scan-btn { border-color:rgba(96,165,250,0.3); color:rgba(96,165,250,0.8); }
.w-mcp-btn { border-color:rgba(250,204,21,0.3); color:rgba(250,204,21,0.8); }
.w-mcp-btn:hover { background:rgba(250,204,21,0.12); color:#facc15; }
.w-scan-btn:hover { background:rgba(96,165,250,0.15); color:#60a5fa; }
.w-lib-btn:hover { background:rgba(255,255,255,0.08); color:#fff; }

/* Mini library preview in widget */
.w-mini-lib { border-top:1px solid rgba(255,255,255,0.06); margin-top:4px; padding:6px 0 2px; }
.w-mini-lib-list { display:flex; gap:4px; flex-wrap:wrap; }
.w-mini-lib-list:empty { display:none; }
.w-mini-lib-list:empty + .w-mini-lib { display:none; }
.w-mini-item { position:relative; width:42px; height:32px; border-radius:4px; overflow:hidden; border:1px solid rgba(255,255,255,0.08); cursor:pointer; transition:all 0.12s; flex-shrink:0; }
.w-mini-item:hover { border-color:rgba(167,139,250,0.5); }
.w-mini-thumb { width:100%; height:100%; object-fit:cover; pointer-events:none; }
.w-mini-icon { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:16px; background:rgba(255,255,255,0.03); pointer-events:none; }

/* SDK panel */
.w-mcp-panel { max-height:300px; overflow-y:auto; padding:6px 0; border-top:1px solid rgba(255,255,255,0.06); margin-top:4px; }
.w-sdk-content { font-size:11px; line-height:1.5; }
.w-sdk-desc { color:rgba(255,255,255,0.5); margin-bottom:8px; }
.w-sdk-step { color:#c4b5fd; font-weight:600; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; margin:8px 0 4px; }
.w-sdk-code { padding:6px 8px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08); border-radius:5px; font-family:'SF Mono','Fira Code',monospace; font-size:10px; color:#e2e2e8; white-space:pre-wrap; cursor:pointer; transition:all 0.15s; margin-bottom:4px; }
.w-sdk-code:hover { border-color:rgba(167,139,250,0.4); background:rgba(167,139,250,0.08); }
.w-sdk-code.copied { border-color:rgba(74,222,128,0.5); background:rgba(74,222,128,0.08); }
.w-sdk-note { color:rgba(255,255,255,0.3); font-size:10px; margin-top:8px; font-style:italic; }
.w-mcp-tools { display:flex; flex-direction:column; gap:3px; margin-bottom:6px; }
.w-mcp-tool { padding:4px 6px; background:rgba(255,255,255,0.03); border-radius:4px; font-size:10px; color:rgba(255,255,255,0.6); }
.w-mcp-tool b { color:#c4b5fd; }
.w-mcp-panel { max-height:300px; overflow-y:auto; padding:6px 0; border-top:1px solid rgba(255,255,255,0.06); margin-top:4px; }

.w-footer { display:flex; align-items:center; gap:4px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.06); margin-top:4px; }
.w-send { display:inline-flex; align-items:center; gap:5px; height:32px; padding:0 14px; border:none; border-radius:8px; background:rgba(74,222,128,0.18); color:rgba(74,222,128,0.85); cursor:pointer; font-size:12px; font-weight:600; font-family:inherit; transition:all 0.15s; }
.w-send:hover { background:rgba(74,222,128,0.3); color:#4ade80; }
.w-send svg, .w-send span { pointer-events:none; }

/* Annotation layer */
.ann-layer { position:fixed; top:0; left:0; width:100vw; height:100vh; pointer-events:none; }

/* Toast */
.pr-toast { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); padding:10px 24px; background:rgba(12,12,20,0.88); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.1); border-radius:12px; color:#f0f0f5; font-size:13px; font-weight:500; font-family:inherit; box-shadow:0 8px 24px rgba(0,0,0,0.3); pointer-events:none; animation:toast-in 0.3s cubic-bezier(0.16,1,0.3,1); z-index:2147483647; }
@keyframes toast-in { from{opacity:0;transform:translateX(-50%) translateY(12px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
` + getInspectStyles() + getAnnotationStyles() + getScreenshotStyles();
}

init();
