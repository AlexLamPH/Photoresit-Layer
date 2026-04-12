// ============================================================
// Anchor + DOM Context — PGOS Triple Anchor Strategy
// 1. CSS selector (primary)
// 2. Text content (fallback)
// 3. Relative position % (fallback)
// ============================================================

import type { AnnotationAnchor, DOMContext } from '@photoresist/schema';

/**
 * Compute Triple Anchor for an annotation point.
 */
export function computeAnchor(clientX: number, clientY: number): AnnotationAnchor | null {
  // Use elementsFromPoint to skip our overlay
  const elements = document.elementsFromPoint(clientX, clientY);
  const element = elements.find((el) => !el.closest('#photoresist-layer-root')) ?? null;
  if (!element) return null;

  const anchor = findAnchorElement(element);
  if (!anchor) return null;

  const rect = anchor.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  // Triple Anchor: selector + text + position
  return {
    anchor_element: computeSelector(anchor),
    fallback_text: getTextSnippet(anchor),
    offset_x_pct: (clientX - rect.left) / rect.width,
    offset_y_pct: (clientY - rect.top) / rect.height,
  };
}

/**
 * Capture DOM context for the element at a point.
 */
export function captureDOMContext(clientX: number, clientY: number): DOMContext | null {
  const elements = document.elementsFromPoint(clientX, clientY);
  const element = elements.find((el) => !el.closest('#photoresist-layer-root')) ?? null;
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  const styles: Record<string, string> = {};

  // Capture key computed styles
  try {
    const cs = window.getComputedStyle(element);
    const keys = ['color', 'background-color', 'font-size', 'font-family', 'padding', 'margin', 'border', 'display', 'position'];
    for (const k of keys) {
      styles[k] = cs.getPropertyValue(k);
    }
  } catch { /* cross-origin, skip */ }

  return {
    selector: computeSelector(element),
    tag: element.tagName.toLowerCase(),
    id: element.id || '',
    classes: typeof element.className === 'string' ? element.className.trim().split(/\s+/).filter(Boolean) : [],
    text_snippet: getTextSnippet(element),
    bounding_box: {
      x: Math.round(rect.x + window.scrollX),
      y: Math.round(rect.y + window.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    computed_styles: styles,
    dom_path: computeDOMPath(element),
  };
}

function findAnchorElement(el: Element): Element | null {
  let current: Element | null = el;
  let depth = 0;
  while (current && depth < 5) {
    if (current.id) return current;
    if (current.getAttribute('data-pr-component')) return current;
    if (current.getAttribute('data-pr-entity')) return current;
    const tag = current.tagName.toLowerCase();
    if (['header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'form', 'button', 'a'].includes(tag)) return current;
    current = current.parentElement;
    depth++;
  }
  return el;
}

function computeSelector(element: Element): string {
  if (element.id) return `#${element.id}`;
  const pr = element.getAttribute('data-pr-component');
  if (pr) return `[data-pr-component="${pr}"]`;
  let part = element.tagName.toLowerCase();
  if (element.className && typeof element.className === 'string') {
    const c = element.className.trim().split(/\s+/)[0];
    if (c) part += `.${c}`;
  }
  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter((c) => c.tagName === element.tagName);
    if (siblings.length > 1) part += `:nth-child(${siblings.indexOf(element) + 1})`;
  }
  return part;
}

function getTextSnippet(el: Element): string {
  const text = (el.textContent || '').trim();
  return text.slice(0, 80) || '';
}

function computeDOMPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && depth < 5) {
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
