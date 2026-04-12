// ============================================================
// Photoresist Layer — Bundle Schema v3 (PGOS Integrated)
// Graph-first · DOM-anchored · Screenshot-optional
// ============================================================

// --- Annotation Types ---

export type AnnotationType = 'pin' | 'note' | 'box' | 'circle' | 'ellipse' | 'star' | 'arrow' | 'line' | 'curve' | 'freehand' | 'path';

export type Priority = 'low' | 'medium' | 'high';

// --- PGOS: Intent per annotation ---
export type AnnotationIntent =
  | 'fix_bug'
  | 'change_style'
  | 'change_layout'
  | 'change_content'
  | 'add_element'
  | 'remove_element'
  | 'highlight'
  | 'question'
  | 'general';

// --- PGOS: Triple Anchor Strategy ---
export interface AnnotationAnchor {
  /** Primary: CSS selector */
  anchor_element: string | null;
  /** Fallback 1: visible text content of target element */
  fallback_text: string | null;
  /** Fallback 2: relative position (percentage of viewport) */
  offset_x_pct: number;
  offset_y_pct: number;
}

// --- PGOS: DOM Context per annotation ---
export interface DOMContext {
  selector: string;
  tag: string;
  id: string;
  classes: string[];
  text_snippet: string;
  bounding_box: { x: number; y: number; width: number; height: number };
  computed_styles?: Record<string, string>;
  dom_path?: string;
}

export interface BaseAnnotation {
  id: string;
  type: AnnotationType;
  x: number;
  y: number;
  width: number;
  height: number;
  anchor: AnnotationAnchor | null;
  /** PGOS: DOM context of the target element */
  dom_context: DOMContext | null;
  /** PGOS: User intent for this annotation */
  intent: AnnotationIntent;
  label: string;
  priority: Priority;
  locked: boolean;
  z_index: number;
}

// --- Specific Annotation Payloads ---

export interface PinAnnotation extends BaseAnnotation {
  type: 'pin';
  payload: {
    note: string;
  };
}

export interface NoteAnnotation extends BaseAnnotation {
  type: 'note';
  payload: {
    text: string;
  };
}

export interface BoxAnnotation extends BaseAnnotation {
  type: 'box';
  payload: {
    color: string;
    border_width: number;
    fill_opacity: number;
  };
}

export interface CircleAnnotation extends BaseAnnotation {
  type: 'circle';
  payload: { color: string; border_width: number; fill_opacity: number; };
}

export interface EllipseAnnotation extends BaseAnnotation {
  type: 'ellipse';
  payload: { color: string; border_width: number; fill_opacity: number; };
}

export interface StarAnnotation extends BaseAnnotation {
  type: 'star';
  payload: { color: string; border_width: number; fill_opacity: number; points_count: number; };
}

export interface ArrowAnnotation extends BaseAnnotation {
  type: 'arrow';
  payload: {
    start_x: number;
    start_y: number;
    end_x: number;
    end_y: number;
    color: string;
  };
}

export interface LineAnnotation extends BaseAnnotation {
  type: 'line';
  payload: {
    start_x: number;
    start_y: number;
    end_x: number;
    end_y: number;
    color: string;
    width: number;
  };
}

export interface CurveAnnotation extends BaseAnnotation {
  type: 'curve';
  payload: {
    start_x: number;
    start_y: number;
    end_x: number;
    end_y: number;
    control_x: number;
    control_y: number;
    color: string;
    width: number;
  };
}

export interface FreehandAnnotation extends BaseAnnotation {
  type: 'freehand';
  payload: {
    points: [number, number][];
    color: string;
    width: number;
  };
}

export interface PathAnnotation extends BaseAnnotation {
  type: 'path';
  payload: {
    points: [number, number][];
    closed: boolean;
    color: string;
    width: number;
  };
}

export type Annotation = PinAnnotation | NoteAnnotation | BoxAnnotation | CircleAnnotation | EllipseAnnotation | StarAnnotation | ArrowAnnotation | LineAnnotation | CurveAnnotation | FreehandAnnotation | PathAnnotation;

// --- Screenshot ---

export interface Screenshot {
  id: string;
  /** Base64 data or asset reference URL */
  data_ref: string;
  /** Region captured (pixels) */
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Original viewport dimensions when captured */
  viewport_width: number;
  viewport_height: number;
}

// --- Bundle ---

export interface FeedbackBundle {
  /** Schema version for compatibility checks */
  schema_version: '3.0';

  // Identity
  feedback_id: string;
  project_id: string;
  session_id: string;

  // Page context
  page_url: string;
  page_title: string;
  viewport: { width: number; height: number };
  scroll_x: number;
  scroll_y: number;
  device_pixel_ratio: number;

  // Device info (auto-detected)
  device_type: 'desktop' | 'tablet' | 'mobile';
  browser: string;
  os: string;

  // Host adapter context (optional, from data-pr-* or JS hook)
  host_context: HostContext | null;

  // Content
  annotations: Annotation[];
  screenshots: Screenshot[];

  // PGOS: Collected DOM contexts for all annotated elements
  dom_contexts: DOMContext[];

  // PGOS: Overall intent/goal
  intent_summary: string;

  // Auto-generated for AI readability
  markdown_summary: string;

  // Status
  status: 'draft' | 'open' | 'in_progress' | 'done';

  // Timestamps
  created_at: string;
  updated_at: string;

  // Version
  app_version: string;
}

// --- Host Adapter Context ---

export interface HostContext {
  project_id?: string;
  route_name?: string;
  component_id?: string;
  entity_id?: string;
  locale?: string;
  theme?: string;
  layer_type?: 'page' | 'modal' | 'drawer' | 'chatbox' | 'panel';
}

// --- Markdown Generator ---

export function generateMarkdownSummary(bundle: FeedbackBundle): string {
  const lines: string[] = [
    `# Feedback: ${bundle.page_title}`,
    '',
    `**URL**: ${bundle.page_url}`,
    `**Viewport**: ${bundle.viewport.width}x${bundle.viewport.height}`,
    `**Device**: ${bundle.device_type} | ${bundle.browser} | ${bundle.os}`,
    `**Created**: ${bundle.created_at}`,
    '',
  ];

  if (bundle.host_context) {
    lines.push(`**Project**: ${bundle.host_context.project_id ?? 'N/A'}`);
    lines.push(`**Route**: ${bundle.host_context.route_name ?? 'N/A'}`);
    lines.push('');
  }

  lines.push(`## Annotations (${bundle.annotations.length})`);
  lines.push('');

  if (bundle.intent_summary) {
    lines.push(`**Intent**: ${bundle.intent_summary}`);
    lines.push('');
  }

  for (const ann of bundle.annotations) {
    const priorityTag = ann.priority !== 'medium' ? ` [${ann.priority.toUpperCase()}]` : '';
    const intentTag = ann.intent !== 'general' ? ` (${ann.intent})` : '';
    const pos = `(${Math.round(ann.x)}, ${Math.round(ann.y)})`;
    const text = ann.label || (ann.payload as any).text || (ann.payload as any).note || '';

    lines.push(`- **${ann.type.toUpperCase()}**${priorityTag}${intentTag} at ${pos}: ${text}`);

    // PGOS: anchor info
    if (ann.anchor?.anchor_element) {
      lines.push(`  - Selector: \`${ann.anchor.anchor_element}\``);
    }
    if (ann.anchor?.fallback_text) {
      lines.push(`  - Text: "${ann.anchor.fallback_text}"`);
    }
    // PGOS: DOM context
    if (ann.dom_context) {
      const dc = ann.dom_context;
      lines.push(`  - Element: \`<${dc.tag}>\` ${dc.id ? `#${dc.id}` : ''} ${dc.classes.length ? `.${dc.classes.slice(0, 3).join('.')}` : ''} (${dc.bounding_box.width}x${dc.bounding_box.height})`);
    }
  }

  if (bundle.screenshots.length > 0) {
    lines.push('');
    lines.push(`## Screenshots (${bundle.screenshots.length})`);
    for (const ss of bundle.screenshots) {
      lines.push(`- Region: (${ss.crop.x},${ss.crop.y}) ${ss.crop.width}x${ss.crop.height}`);
    }
  }

  return lines.join('\n');
}

// --- Utility: Generate IDs ---

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// --- Constants ---

export const BUNDLE_SIZE_LIMIT_MB = 25;
export const SCREENSHOT_MAX_WIDTH = 1920;
export const SCREENSHOT_QUALITY = 0.8;
export const MAX_ANNOTATIONS_PER_BUNDLE = 20;
export const SCHEMA_VERSION = '3.0' as const;
