// ============================================================
// Module B: Sensor Array — Inspect Mode (v2 — fixed flicker)
//
// Key fix: throttle mousemove, ignore overlay elements,
// use requestAnimationFrame for smooth highlight
// ============================================================

export interface InspectTarget {
  element: Element;
  tagName: string;
  id: string;
  className: string;
  textContent: string;
  rect: DOMRect;
  prComponent: string | null;
  prEntity: string | null;
  prLabel: string | null;
  prLayer: string | null;
  prAction: string | null;
  selector: string;
}

let highlightEl: HTMLElement | null = null;
let tooltipEl: HTMLElement | null = null;
let infoPanelEl: HTMLElement | null = null;
let overlayRootRef: HTMLElement | null = null;
let shadowRootRef: ShadowRoot | null = null;
let lastTarget: Element | null = null;
let active = false;
let rafId = 0;

export function initInspect(sr: ShadowRoot): void {
  shadowRootRef = sr;
  overlayRootRef = document.getElementById('photoresist-layer-root');

  highlightEl = document.createElement('div');
  highlightEl.className = 'inspect-highlight';
  sr.appendChild(highlightEl);

  tooltipEl = document.createElement('div');
  tooltipEl.className = 'inspect-tooltip';
  sr.appendChild(tooltipEl);

  infoPanelEl = document.createElement('div');
  infoPanelEl.className = 'inspect-info-panel';
  sr.appendChild(infoPanelEl);
}

export function startInspect(): void {
  if (active) return; // prevent double-start
  active = true;
  lastTarget = null;
  document.addEventListener('mousemove', onMouseMove, { passive: true, capture: false });
  document.addEventListener('click', onInspectClick, true);
}

export function stopInspect(): void {
  active = false;
  document.removeEventListener('mousemove', onMouseMove, { capture: false } as any);
  document.removeEventListener('click', onInspectClick, true);
  cancelAnimationFrame(rafId);
  hideHighlight();
  if (infoPanelEl) infoPanelEl.style.display = 'none';
  lastTarget = null;
}

let onSelectCallback: ((target: InspectTarget) => void) | null = null;
export function onInspectSelect(cb: (target: InspectTarget) => void): void {
  onSelectCallback = cb;
}

// --- Throttled mousemove using rAF (no flicker) ---
let pendingMouse: { x: number; y: number } | null = null;

function onMouseMove(e: MouseEvent): void {
  if (!active) return;
  pendingMouse = { x: e.clientX, y: e.clientY };

  if (!rafId) {
    rafId = requestAnimationFrame(processMouseMove);
  }
}

function processMouseMove(): void {
  rafId = 0;
  if (!pendingMouse || !active) return;

  const { x, y } = pendingMouse;
  pendingMouse = null;

  // Use elementsFromPoint to find real page element WITHOUT hiding overlay
  // This avoids flickering the widget/toolbar
  const elements = document.elementsFromPoint(x, y);
  const target = elements.find((el) => !el.closest('#photoresist-layer-root')) ?? null;

  if (!target || target === lastTarget) return;

  lastTarget = target;
  showHighlight(target);
  showTooltip(target, x, y);
}

function onInspectClick(e: MouseEvent): void {
  if (!active) return;

  // Let toolbar clicks through — don't block our own UI
  const clickedEl = e.target as Element;
  if (clickedEl?.closest?.('#photoresist-layer-root')) return;

  e.preventDefault();
  e.stopPropagation();

  const elements = document.elementsFromPoint(e.clientX, e.clientY);
  const target = elements.find((el) => !el.closest('#photoresist-layer-root')) ?? null;

  if (!target) return;
  showInfoPanel(readTarget(target));
  if (onSelectCallback) onSelectCallback(readTarget(target));
}

function showInfoPanel(info: InspectTarget): void {
  if (!infoPanelEl) return;
  const rect = info.rect;
  const prData = [info.prComponent, info.prEntity, info.prLabel].filter(Boolean).join(', ');

  infoPanelEl.innerHTML = `
    <div class="ip-header">Element Info</div>
    <div class="ip-row"><span class="ip-key">Tag</span><span class="ip-val">&lt;${info.tagName.toLowerCase()}&gt;</span></div>
    ${info.id ? `<div class="ip-row"><span class="ip-key">ID</span><span class="ip-val">#${info.id}</span></div>` : ''}
    ${info.className ? `<div class="ip-row"><span class="ip-key">Class</span><span class="ip-val">.${info.className.split(' ').slice(0, 3).join('.')}</span></div>` : ''}
    <div class="ip-row"><span class="ip-key">Size</span><span class="ip-val">${Math.round(rect.width)} x ${Math.round(rect.height)}</span></div>
    <div class="ip-row"><span class="ip-key">Selector</span><span class="ip-val ip-mono">${escapeHtml(info.selector)}</span></div>
    ${prData ? `<div class="ip-row"><span class="ip-key">PR Data</span><span class="ip-val">${escapeHtml(prData)}</span></div>` : ''}
    ${info.textContent ? `<div class="ip-row"><span class="ip-key">Text</span><span class="ip-val">${escapeHtml(info.textContent.slice(0, 80))}</span></div>` : ''}
    <div class="ip-hint">Press ESC to close</div>
  `;

  // Position near clicked element
  let px = rect.right + 12;
  let py = rect.top;
  if (px + 280 > window.innerWidth) px = rect.left - 290;
  if (py + 200 > window.innerHeight) py = window.innerHeight - 210;
  if (py < 10) py = 10;

  Object.assign(infoPanelEl.style, { display: 'block', left: `${px}px`, top: `${py}px` });
}

function showHighlight(element: Element): void {
  if (!highlightEl) return;
  const rect = element.getBoundingClientRect();
  Object.assign(highlightEl.style, {
    display: 'block',
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

function hideHighlight(): void {
  if (highlightEl) highlightEl.style.display = 'none';
  if (tooltipEl) tooltipEl.style.display = 'none';
}

function showTooltip(element: Element, mx: number, my: number): void {
  if (!tooltipEl) return;
  const info = readTarget(element);
  const tag = info.tagName.toLowerCase();
  const id = info.id ? `#${info.id}` : '';
  const cls = info.className ? `.${info.className.split(' ').slice(0, 2).join('.')}` : '';
  const pr = info.prComponent ? ` [${info.prComponent}]` : '';
  const text = info.textContent.slice(0, 40) + (info.textContent.length > 40 ? '...' : '');

  tooltipEl.innerHTML = `
    <div class="tooltip-tag">${tag}${id}${cls}${pr}</div>
    ${text ? `<div class="tooltip-text">${escapeHtml(text)}</div>` : ''}
  `;

  let tx = mx + 16;
  let ty = my + 16;
  if (tx + 260 > window.innerWidth) tx = mx - 260;
  if (ty + 60 > window.innerHeight) ty = my - 60;

  Object.assign(tooltipEl.style, { display: 'block', top: `${ty}px`, left: `${tx}px` });
}

function readTarget(element: Element): InspectTarget {
  return {
    element,
    tagName: element.tagName,
    id: element.id || '',
    className: typeof element.className === 'string' ? element.className : '',
    textContent: (element.textContent || '').trim().slice(0, 200),
    rect: element.getBoundingClientRect(),
    prComponent: element.getAttribute('data-pr-component'),
    prEntity: element.getAttribute('data-pr-entity'),
    prLabel: element.getAttribute('data-pr-label'),
    prLayer: element.getAttribute('data-pr-layer'),
    prAction: element.getAttribute('data-pr-action'),
    selector: computeSelector(element),
  };
}

function computeSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  const pr = el.getAttribute('data-pr-component');
  if (pr) return `[data-pr-component="${pr}"]`;
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && depth < 3) {
    let p = cur.tagName.toLowerCase();
    if (cur.id) { parts.unshift(`#${cur.id}`); break; }
    if (cur.className && typeof cur.className === 'string') {
      const c = cur.className.trim().split(/\s+/)[0];
      if (c) p += `.${c}`;
    }
    parts.unshift(p);
    cur = cur.parentElement;
    depth++;
  }
  return parts.join(' > ');
}

export function getInspectStyles(): string {
  return `
    .inspect-highlight {
      position: fixed;
      display: none;
      background: rgba(167, 139, 250, 0.12);
      border: 2px solid rgba(167, 139, 250, 0.7);
      border-radius: 3px;
      pointer-events: none;
      z-index: 2147483646;
      transition: top 0.08s, left 0.08s, width 0.08s, height 0.08s;
    }

    .inspect-tooltip {
      position: fixed;
      display: none;
      max-width: 260px;
      padding: 6px 10px;
      background: rgba(15, 15, 25, 0.95);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(167, 139, 250, 0.3);
      border-radius: 6px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 11px;
      line-height: 1.4;
      color: #e2e2e8;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      pointer-events: none;
      z-index: 2147483647;
    }

    .tooltip-tag { color: #a78bfa; font-weight: 600; margin-bottom: 2px; }
    .tooltip-text { color: rgba(255,255,255,0.5); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Info panel (on click) */
    .inspect-info-panel {
      position: fixed;
      display: none;
      width: 270px;
      padding: 10px 12px;
      background: rgba(12, 12, 20, 0.92);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(167, 139, 250, 0.25);
      border-radius: 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
      font-size: 11px;
      color: #e2e2e8;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      z-index: 2147483647;
      pointer-events: auto;
      animation: ip-in 0.2s ease;
    }
    @keyframes ip-in {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    .ip-header { font-size: 12px; font-weight: 700; color: #a78bfa; margin-bottom: 8px; letter-spacing: 0.3px; }
    .ip-row { display: flex; gap: 8px; margin-bottom: 4px; line-height: 1.5; }
    .ip-key { color: rgba(255,255,255,0.4); min-width: 50px; flex-shrink: 0; }
    .ip-val { color: #e2e2e8; word-break: break-all; }
    .ip-mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 10px; color: #c4b5fd; }
    .ip-hint { margin-top: 8px; font-size: 10px; color: rgba(255,255,255,0.25); text-align: center; }
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
