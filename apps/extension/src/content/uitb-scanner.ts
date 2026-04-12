// ============================================================
// UITB — UI Digital Twin Bundle Scanner
// Scan website → extract design tokens, DOM graph, components
// Completely separate from annotation/feedback mode
// ============================================================

export interface UITBPackage {
  meta: {
    url: string;
    title: string;
    viewport: { width: number; height: number };
    scanned_at: string;
  };

  // Design tokens extracted from CSS
  design_tokens: {
    colors: TokenColor[];
    fonts: TokenFont[];
    spacing: string[];
    borders: string[];
    shadows: string[];
    css_variables: Record<string, string>;
  };

  // DOM structure graph
  dom_graph: DOMNode[];

  // Detected UI components
  components: UIComponent[];

  // Layout blueprint
  layout: LayoutInfo;

  // Screenshot sections
  screenshots: { section: string; data_ref: string }[];
}

export interface TokenColor {
  value: string;
  usage: string; // 'background' | 'text' | 'border' | 'accent'
  count: number;
  elements: string[];
}

export interface TokenFont {
  family: string;
  sizes: string[];
  weights: string[];
  count: number;
}

export interface DOMNode {
  tag: string;
  id: string;
  classes: string[];
  children_count: number;
  depth: number;
  role: string; // semantic role
  bbox: { x: number; y: number; w: number; h: number };
}

export interface UIComponent {
  type: string; // 'button', 'card', 'nav', 'hero', 'footer', 'form', 'input', 'image'
  selector: string;
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
  styles: Record<string, string>;
}

export interface LayoutInfo {
  type: string; // 'single-column', 'two-column', 'grid', 'dashboard'
  sections: { tag: string; selector: string; role: string; bbox: { x: number; y: number; w: number; h: number } }[];
}

// ===== SCAN ENGINE =====

export async function scanWebsite(): Promise<UITBPackage> {
  console.log('[UITB] Starting scan...');

  const tokens = extractDesignTokens();
  const domGraph = extractDOMGraph();
  const components = detectComponents();
  const layout = analyzeLayout();

  const pkg: UITBPackage = {
    meta: {
      url: window.location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scanned_at: new Date().toISOString(),
    },
    design_tokens: tokens,
    dom_graph: domGraph,
    components,
    layout,
    screenshots: [], // filled separately via capture
  };

  console.log(`[UITB] Scan complete:
  - ${tokens.colors.length} colors
  - ${tokens.fonts.length} fonts
  - ${tokens.css_variables ? Object.keys(tokens.css_variables).length : 0} CSS variables
  - ${domGraph.length} DOM nodes
  - ${components.length} components
  - Layout: ${layout.type}`);

  return pkg;
}

// ===== DESIGN TOKENS =====

function extractDesignTokens() {
  const colorMap = new Map<string, { usage: string; count: number; elements: string[] }>();
  const fontMap = new Map<string, { sizes: Set<string>; weights: Set<string>; count: number }>();
  const spacingSet = new Set<string>();
  const borderSet = new Set<string>();
  const shadowSet = new Set<string>();

  // Scan visible elements
  const elements = document.querySelectorAll('body *');
  const limit = Math.min(elements.length, 500); // cap for performance

  for (let i = 0; i < limit; i++) {
    const el = elements[i];
    if (el.closest('#photoresist-layer-root')) continue;

    try {
      const cs = window.getComputedStyle(el);
      const tag = el.tagName.toLowerCase();
      const sel = quickSelector(el);

      // Colors
      addColor(colorMap, cs.color, 'text', sel);
      addColor(colorMap, cs.backgroundColor, 'background', sel);
      addColor(colorMap, cs.borderColor, 'border', sel);

      // Fonts
      const family = cs.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
      if (family) {
        const existing = fontMap.get(family) || { sizes: new Set(), weights: new Set(), count: 0 };
        existing.sizes.add(cs.fontSize);
        existing.weights.add(cs.fontWeight);
        existing.count++;
        fontMap.set(family, existing);
      }

      // Spacing
      if (cs.padding && cs.padding !== '0px') spacingSet.add(cs.padding);
      if (cs.margin && cs.margin !== '0px') spacingSet.add(cs.margin);
      if (cs.gap && cs.gap !== 'normal') spacingSet.add(cs.gap);

      // Borders
      if (cs.border && cs.border !== 'none' && !cs.border.includes('0px')) borderSet.add(cs.border);
      if (cs.borderRadius && cs.borderRadius !== '0px') borderSet.add(`radius: ${cs.borderRadius}`);

      // Shadows
      if (cs.boxShadow && cs.boxShadow !== 'none') shadowSet.add(cs.boxShadow);
    } catch { /* skip */ }
  }

  // Extract CSS custom properties (variables)
  const cssVars: Record<string, string> = {};
  try {
    const rootStyles = window.getComputedStyle(document.documentElement);
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          const text = rule.cssText;
          const matches = text.matchAll(/--([a-zA-Z0-9-_]+)\s*:\s*([^;]+)/g);
          for (const m of matches) {
            cssVars[`--${m[1]}`] = m[2].trim();
          }
        }
      } catch { /* cross-origin */ }
    }
  } catch { /* skip */ }

  // Convert maps to arrays
  const colors: TokenColor[] = Array.from(colorMap.entries())
    .map(([value, info]) => ({ value, usage: info.usage, count: info.count, elements: info.elements.slice(0, 3) }))
    .filter((c) => !c.value.includes('rgba(0, 0, 0, 0)') && c.value !== 'rgb(0, 0, 0)')
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const fonts: TokenFont[] = Array.from(fontMap.entries())
    .map(([family, info]) => ({ family, sizes: Array.from(info.sizes), weights: Array.from(info.weights), count: info.count }))
    .sort((a, b) => b.count - a.count);

  return {
    colors,
    fonts,
    spacing: Array.from(spacingSet).slice(0, 15),
    borders: Array.from(borderSet).slice(0, 10),
    shadows: Array.from(shadowSet).slice(0, 5),
    css_variables: cssVars,
  };
}

function addColor(map: Map<string, any>, value: string, usage: string, selector: string): void {
  if (!value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)') return;
  const existing = map.get(value) || { usage, count: 0, elements: [] };
  existing.count++;
  if (existing.elements.length < 3) existing.elements.push(selector);
  map.set(value, existing);
}

// ===== DOM GRAPH =====

function extractDOMGraph(): DOMNode[] {
  const nodes: DOMNode[] = [];
  walkDOM(document.body, 0, nodes);
  return nodes.slice(0, 100); // cap
}

function walkDOM(el: Element, depth: number, nodes: DOMNode[]): void {
  if (depth > 6 || nodes.length >= 100) return;
  if (el.closest('#photoresist-layer-root')) return;

  const tag = el.tagName.toLowerCase();
  if (['script', 'style', 'link', 'meta', 'noscript'].includes(tag)) return;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const role = getSemanticRole(el);

  nodes.push({
    tag,
    id: el.id || '',
    classes: typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3) : [],
    children_count: el.children.length,
    depth,
    role,
    bbox: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
  });

  for (const child of el.children) {
    walkDOM(child, depth + 1, nodes);
  }
}

function getSemanticRole(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');
  if (role) return role;

  const roleMap: Record<string, string> = {
    header: 'header', nav: 'navigation', main: 'main', footer: 'footer',
    section: 'section', article: 'article', aside: 'complementary',
    form: 'form', button: 'button', a: 'link', img: 'image',
    input: 'input', textarea: 'textbox', select: 'select',
    h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading',
    ul: 'list', ol: 'list', li: 'listitem', table: 'table',
  };
  return roleMap[tag] || 'generic';
}

// ===== COMPONENT DETECTION =====

function detectComponents(): UIComponent[] {
  const components: UIComponent[] = [];

  // Buttons
  document.querySelectorAll('button, [role="button"], a.btn, a.button, [class*="btn"], [class*="button"]').forEach((el) => {
    if (el.closest('#photoresist-layer-root')) return;
    addComponent(components, el, 'button');
  });

  // Navigation
  document.querySelectorAll('nav, [role="navigation"]').forEach((el) => {
    if (el.closest('#photoresist-layer-root')) return;
    addComponent(components, el, 'nav');
  });

  // Cards (heuristic: box with padding, border/shadow, contains image+text)
  document.querySelectorAll('[class*="card"], [class*="Card"], article').forEach((el) => {
    if (el.closest('#photoresist-layer-root')) return;
    addComponent(components, el, 'card');
  });

  // Hero sections
  document.querySelectorAll('[class*="hero"], [class*="Hero"], [class*="banner"], [class*="Banner"]').forEach((el) => {
    if (el.closest('#photoresist-layer-root')) return;
    addComponent(components, el, 'hero');
  });

  // Forms
  document.querySelectorAll('form').forEach((el) => {
    if (el.closest('#photoresist-layer-root')) return;
    addComponent(components, el, 'form');
  });

  // Inputs
  document.querySelectorAll('input, textarea, select').forEach((el) => {
    if (el.closest('#photoresist-layer-root')) return;
    addComponent(components, el, 'input');
  });

  // Images
  document.querySelectorAll('img[src], [class*="image"], [class*="Image"]').forEach((el) => {
    if (el.closest('#photoresist-layer-root')) return;
    const rect = (el as HTMLElement).getBoundingClientRect();
    if (rect.width > 50 && rect.height > 50) addComponent(components, el, 'image');
  });

  // Footer
  document.querySelectorAll('footer, [class*="footer"], [class*="Footer"]').forEach((el) => {
    if (el.closest('#photoresist-layer-root')) return;
    addComponent(components, el, 'footer');
  });

  return components.slice(0, 50);
}

function addComponent(list: UIComponent[], el: Element, type: string): void {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const styles: Record<string, string> = {};
  try {
    const cs = window.getComputedStyle(el);
    ['color', 'background-color', 'font-size', 'font-weight', 'border-radius', 'padding', 'box-shadow'].forEach((k) => {
      styles[k] = cs.getPropertyValue(k);
    });
  } catch {}

  list.push({
    type,
    selector: quickSelector(el),
    text: (el.textContent || '').trim().slice(0, 50),
    bbox: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    styles,
  });
}

// ===== LAYOUT ANALYSIS =====

function analyzeLayout(): LayoutInfo {
  const sections: LayoutInfo['sections'] = [];

  // Find major layout sections
  const landmarks = document.querySelectorAll('header, nav, main, section, article, aside, footer, [role="banner"], [role="main"], [role="contentinfo"]');
  landmarks.forEach((el) => {
    if (el.closest('#photoresist-layer-root')) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 20) return;
    sections.push({
      tag: el.tagName.toLowerCase(),
      selector: quickSelector(el),
      role: getSemanticRole(el),
      bbox: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    });
  });

  // Detect layout type
  const bodyCs = window.getComputedStyle(document.body);
  let type = 'single-column';
  if (document.querySelector('[class*="grid"], [class*="Grid"]') || bodyCs.display === 'grid') type = 'grid';
  else if (document.querySelector('aside, [class*="sidebar"], [class*="Sidebar"]')) type = 'two-column';
  else if (document.querySelector('[class*="dashboard"], [class*="Dashboard"]')) type = 'dashboard';

  return { type, sections };
}

// ===== HELPERS =====

function quickSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  let s = el.tagName.toLowerCase();
  if (el.className && typeof el.className === 'string') {
    const c = el.className.trim().split(/\s+/)[0];
    if (c) s += `.${c}`;
  }
  return s;
}
