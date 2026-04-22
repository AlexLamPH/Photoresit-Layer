// ============================================================
// Module C: Workshop — Annotation Tools
//
// Pin, Note, Box, Arrow — create, move, resize, delete
// Undo/redo stack for all operations
// ============================================================

import type { Annotation, AnnotationType, Priority, AnnotationIntent } from '@photoresist/schema';
import { generateId } from '@photoresist/schema';
import { computeAnchor, captureDOMContext } from './anchor';

// --- Types ---
export type AnnotationTool = 'pin' | 'note' | 'box' | 'circle' | 'ellipse' | 'star' | 'arrow' | 'line' | 'curve' | 'freehand' | 'path' | 'select';

interface UndoAction {
  type: 'add' | 'remove' | 'move';
  annotation: Annotation;
  previousState?: Annotation;
}

// --- State ---
let annotations: Annotation[] = [];
let currentTool: AnnotationTool = 'select';
let selectedId: string | null = null;
let undoStack: UndoAction[] = [];
let redoStack: UndoAction[] = [];
let annotationLayer: HTMLElement | null = null;

// Drawing state
let isDrawing = false;
let drawStartX = 0;
let drawStartY = 0;

// Note input state — prevent spam
let activeNoteInput: HTMLElement | null = null;

// Draw settings (freehand, line, curve)
let drawColor = '#ef4444';
let drawWidth = 4;

// Freehand state
let freehandPoints: [number, number][] = [];

// Path tool state (click-to-add-points, double-click to finish)
let pathPoints: [number, number][] = [];
let pathPreviewEl: HTMLElement | null = null;

export function setDrawColor(c: string): void { drawColor = c; }
export function setDrawWidth(w: number): void { drawWidth = w; }

// Note color themes
const NOTE_THEMES = [
  { bg: '#22c55e', fg: '#ef4444' }, // Xanh lá - Đỏ
  { bg: '#f97316', fg: '#3b82f6' }, // Cam - Xanh dương
  { bg: '#eab308', fg: '#8b5cf6' }, // Vàng - Tím
  { bg: '#1a1a1a', fg: '#ffffff' }, // Đen - Trắng
];
let currentNoteThemeIdx = 0;
export function setNoteTheme(idx: number): void { currentNoteThemeIdx = idx; }

// --- Callbacks ---
let onChangeCallback: (() => void) | null = null;

export function onAnnotationsChange(cb: () => void): void {
  onChangeCallback = cb;
}

// --- Init ---
export function initAnnotations(layer: HTMLElement): void {
  annotationLayer = layer;
  layer.addEventListener('mousedown', onMouseDown);
  layer.addEventListener('mousemove', onMouseMove);
  layer.addEventListener('mouseup', onMouseUp);
  layer.addEventListener('click', onPathClick);
  layer.addEventListener('dblclick', onPathDoubleClick);
  document.addEventListener('keydown', onKeyDown);
}

export function cleanupAnnotations(): void {
  if (annotationLayer) {
    annotationLayer.removeEventListener('mousedown', onMouseDown);
    annotationLayer.removeEventListener('mousemove', onMouseMove);
    annotationLayer.removeEventListener('mouseup', onMouseUp);
  }
  document.removeEventListener('keydown', onKeyDown);
}

// --- Tool Selection ---
export function setTool(tool: AnnotationTool): void {
  currentTool = tool;
  selectedId = null;
  if (annotationLayer) {
    annotationLayer.style.cursor = tool === 'select' ? 'default' : 'crosshair';
  }
}

export function getTool(): AnnotationTool {
  return currentTool;
}

export function getCurrentTool(): string {
  return currentTool;
}

// --- Getters ---
export function getAnnotations(): Annotation[] {
  return [...annotations];
}

export function getSelectedAnnotation(): Annotation | null {
  return annotations.find((a) => a.id === selectedId) ?? null;
}

// --- Clear all annotations ---
export function clearAnnotations(): void {
  annotations.length = 0;
  selectedId = null;
  pathPoints = [];
  clearPathPreview();
  if (activeNoteInput) closeNoteInput();
  renderAll();
  onChangeCallback?.();
}

// --- Mouse Handlers ---
function onMouseDown(e: MouseEvent): void {
  // Ignore clicks on note input popups or annotation elements
  const target = e.target as HTMLElement;
  if (target.closest?.('.pr-note-input') || target.closest?.('.pr-annotation')) return;

  // If note input is open, close it first (don't create new stuff)
  if (activeNoteInput) {
    closeNoteInput();
    return;
  }

  if (currentTool === 'select') {
    const ann = findAnnotationAt(e.clientX, e.clientY);
    selectedId = ann?.id ?? null;
    renderAll();
    return;
  }

  if (currentTool === 'pin') {
    createPin(e.clientX, e.clientY);
    // Stay in pin mode — user can pin continuously until ESC
    return;
  }

  if (currentTool === 'note') {
    createNote(e.clientX, e.clientY);
    currentTool = 'select';
    return;
  }

  if (currentTool === 'path') {
    // Click to add point, handled separately
    return;
  }

  if (currentTool === 'freehand') {
    isDrawing = true;
    freehandPoints = [[e.clientX + window.scrollX, e.clientY + window.scrollY]];
    return;
  }

  // Box, Arrow, Line, Curve, shapes need drag
  isDrawing = true;
  drawStartX = e.clientX;
  drawStartY = e.clientY;
}

function onMouseMove(e: MouseEvent): void {
  // Path preview follows mouse
  if (currentTool === 'path' && pathPoints.length > 0) {
    renderPathPreview(e.clientX, e.clientY);
    return;
  }

  if (!isDrawing) return;

  if (currentTool === 'freehand') {
    freehandPoints.push([e.clientX + window.scrollX, e.clientY + window.scrollY]);
    renderFreehandPreview();
    return;
  }

  renderDrawPreview(drawStartX, drawStartY, e.clientX, e.clientY);
}

function onMouseUp(e: MouseEvent): void {
  if (!isDrawing) return;
  isDrawing = false;
  clearDrawPreview();

  if (currentTool === 'freehand') {
    annotationLayer?.querySelector('.pr-freehand-preview')?.remove();
    if (freehandPoints.length > 2) createFreehand();
    freehandPoints = [];
    return;
  }

  const endX = e.clientX;
  const endY = e.clientY;

  switch (currentTool) {
    case 'box':
      createBox(drawStartX, drawStartY, endX, endY);
      break;
    case 'circle':
    case 'ellipse':
    case 'star':
      createShape(currentTool, drawStartX, drawStartY, endX, endY);
      break;
    case 'arrow':
      createArrow(drawStartX, drawStartY, endX, endY);
      break;
    case 'line':
      createLine(drawStartX, drawStartY, endX, endY);
      break;
    case 'curve':
      createCurve(drawStartX, drawStartY, endX, endY);
      break;
  }
}

// --- Keyboard Handlers ---
function onKeyDown(e: KeyboardEvent): void {
  // Don't capture if typing in an input
  if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;

  // Path tool: Enter = close path, Escape = cancel path
  if (currentTool === 'path' && pathPoints.length > 0) {
    if (e.key === 'Enter') { e.preventDefault(); finishPath(true); return; }
    if (e.key === 'Escape') { e.preventDefault(); pathPoints = []; clearPathPreview(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); pathPoints.pop(); renderPathPreview(); return; }
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedId) {
      removeAnnotation(selectedId);
    }
  }

  if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
    e.preventDefault();
    if (e.shiftKey) {
      redo();
    } else {
      undo();
    }
  }
}

// --- Create Annotations ---
// Pin counter + color cycling
let pinCounter = 0;

// 4 contrasting color pairs: bg → text
const PIN_THEMES: { bg: string; fg: string; name: string }[] = [
  { bg: '#22c55e', fg: '#ef4444', name: 'Green-Red' },      // Xanh lá - Đỏ
  { bg: '#f97316', fg: '#3b82f6', name: 'Orange-Blue' },    // Cam - Xanh dương
  { bg: '#eab308', fg: '#8b5cf6', name: 'Yellow-Purple' },  // Vàng - Tím
  { bg: '#1a1a1a', fg: '#ffffff', name: 'Black-White' },    // Đen - Trắng
];

export function getPinThemes() { return PIN_THEMES; }

let currentPinTheme = 0;
export function setPinTheme(idx: number): void { currentPinTheme = idx; }

function createPin(x: number, y: number): void {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const docX = x + scrollX;
  const docY = y + scrollY;

  pinCounter++;
  const theme = PIN_THEMES[currentPinTheme % PIN_THEMES.length];

  const ann: Annotation = {
    id: generateId(),
    type: 'pin',
    x: docX,
    y: docY,
    width: 32,
    height: 32,
    anchor: computeAnchor(x, y),
    dom_context: captureDOMContext(x, y),
    intent: 'highlight' as AnnotationIntent,
    label: String(pinCounter),
    priority: 'medium',
    locked: false,
    z_index: annotations.length + 1,
    payload: { note: `Pin ${pinCounter} | ${theme.bg}|${theme.fg}` },
  };

  addAnnotation(ann);
  selectedId = ann.id;
}

function createNote(x: number, y: number): void {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  const ann: Annotation = {
    id: generateId(),
    type: 'note',
    x: x + scrollX,
    y: y + scrollY,
    width: 200,
    height: 100,
    anchor: computeAnchor(x, y),
    dom_context: captureDOMContext(x, y),
    intent: 'general' as AnnotationIntent,
    label: '',
    priority: 'medium',
    locked: false,
    z_index: annotations.length + 1,
    payload: { text: '', themeIdx: currentNoteThemeIdx },
  };

  addAnnotation(ann);
  selectedId = ann.id;
  promptNoteInput(ann);
}

function createBox(x1: number, y1: number, x2: number, y2: number): void {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);

  if (w < 5 && h < 5) return; // too small

  const ann: Annotation = {
    id: generateId(),
    type: 'box',
    x: left + scrollX,
    y: top + scrollY,
    width: w,
    height: h,
    anchor: computeAnchor(left + w / 2, top + h / 2),
    dom_context: captureDOMContext(left + w / 2, top + h / 2),
    intent: 'highlight' as AnnotationIntent,
    label: '',
    priority: 'medium',
    locked: false,
    z_index: annotations.length + 1,
    payload: { color: drawColor, border_width: drawWidth, fill_opacity: 0 },
  };

  addAnnotation(ann);
  selectedId = ann.id;
}

function createArrow(x1: number, y1: number, x2: number, y2: number): void {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  if (dist < 10) return; // too short

  const ann: Annotation = {
    id: generateId(),
    type: 'arrow',
    x: Math.min(x1, x2) + scrollX,
    y: Math.min(y1, y2) + scrollY,
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
    anchor: computeAnchor((x1 + x2) / 2, (y1 + y2) / 2),
    dom_context: captureDOMContext((x1 + x2) / 2, (y1 + y2) / 2),
    intent: 'highlight' as AnnotationIntent,
    label: '',
    priority: 'medium',
    locked: false,
    z_index: annotations.length + 1,
    payload: {
      start_x: x1 + scrollX,
      start_y: y1 + scrollY,
      end_x: x2 + scrollX,
      end_y: y2 + scrollY,
      color: drawColor,
    },
  };

  addAnnotation(ann);
  selectedId = ann.id;
}

function createShape(shape: 'circle' | 'ellipse' | 'star', x1: number, y1: number, x2: number, y2: number): void {
  const sX = window.scrollX, sY = window.scrollY;
  const left = Math.min(x1, x2), top = Math.min(y1, y2);
  const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  if (w < 5 && h < 5) return;
  const ann: Annotation = {
    id: generateId(), type: shape,
    x: left + sX, y: top + sY, width: w, height: h,
    anchor: computeAnchor(left + w / 2, top + h / 2),
    dom_context: captureDOMContext(left + w / 2, top + h / 2),
    intent: 'highlight' as AnnotationIntent,
    label: '', priority: 'medium', locked: false, z_index: annotations.length + 1,
    payload: { color: drawColor, border_width: drawWidth, fill_opacity: 0, ...(shape === 'star' ? { points_count: 5 } : {}) },
  };
  addAnnotation(ann); selectedId = ann.id;
}

// --- Path tool: click to add points, double-click to finish ---
function onPathClick(e: MouseEvent): void {
  if (currentTool !== 'path') return;
  // Ignore clicks on note inputs or annotations
  const t = e.target as HTMLElement;
  if (t.closest?.('.pr-note-input') || t.closest?.('.pr-annotation')) return;

  const pt: [number, number] = [e.clientX + window.scrollX, e.clientY + window.scrollY];
  pathPoints.push(pt);
  renderPathPreview(e.clientX, e.clientY);
}

function onPathDoubleClick(e: MouseEvent): void {
  if (currentTool !== 'path') return;
  e.preventDefault();
  finishPath(false);
}

function finishPath(closed: boolean): void {
  if (pathPoints.length >= 2) {
    createPath(closed);
  }
  pathPoints = [];
  clearPathPreview();
}

function renderPathPreview(mouseX?: number, mouseY?: number): void {
  if (!annotationLayer) return;
  if (!pathPreviewEl) {
    pathPreviewEl = document.createElement('div');
    pathPreviewEl.className = 'pr-path-preview';
    annotationLayer.appendChild(pathPreviewEl);
  }

  const svgW = window.innerWidth, svgH = window.innerHeight;
  pathPreviewEl.style.cssText = `position:fixed;left:0;top:0;width:${svgW}px;height:${svgH}px;pointer-events:none;z-index:2147483646;`;

  const sX = window.scrollX, sY = window.scrollY;
  let svgContent = '';

  // Draw completed segments
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const [x1, y1] = [pathPoints[i][0] - sX, pathPoints[i][1] - sY];
    const [x2, y2] = [pathPoints[i + 1][0] - sX, pathPoints[i + 1][1] - sY];
    svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${drawColor}" stroke-width="${drawWidth}" stroke-linecap="round"/>`;
  }

  // Draw dots at each point
  for (const [px, py] of pathPoints) {
    svgContent += `<circle cx="${px - sX}" cy="${py - sY}" r="4" fill="${drawColor}" stroke="#fff" stroke-width="1.5"/>`;
  }

  // Draw preview line to current mouse position
  if (mouseX !== undefined && mouseY !== undefined && pathPoints.length > 0) {
    const last = pathPoints[pathPoints.length - 1];
    svgContent += `<line x1="${last[0] - sX}" y1="${last[1] - sY}" x2="${mouseX}" y2="${mouseY}" stroke="${drawColor}" stroke-width="${drawWidth}" stroke-dasharray="5,4" stroke-linecap="round" opacity="0.5"/>`;
  }

  pathPreviewEl.innerHTML = `<svg width="${svgW}" height="${svgH}">${svgContent}</svg>`;
}

function clearPathPreview(): void {
  pathPreviewEl?.remove();
  pathPreviewEl = null;
}

function createPath(closed: boolean): void {
  if (pathPoints.length < 2) return;
  const xs = pathPoints.map(p => p[0]);
  const ys = pathPoints.map(p => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const maxX = Math.max(...xs), maxY = Math.max(...ys);
  const ann: Annotation = {
    id: generateId(), type: 'path',
    x: minX, y: minY, width: maxX - minX || 1, height: maxY - minY || 1,
    anchor: null, dom_context: null, intent: 'highlight' as AnnotationIntent, label: '', priority: 'medium', locked: false, z_index: annotations.length + 1,
    payload: { points: [...pathPoints], closed, color: drawColor, width: drawWidth },
  };
  addAnnotation(ann); selectedId = ann.id;
}

function createLine(x1: number, y1: number, x2: number, y2: number): void {
  const sX = window.scrollX, sY = window.scrollY;
  if (Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) < 10) return;
  const ann: Annotation = {
    id: generateId(), type: 'line',
    x: Math.min(x1, x2) + sX, y: Math.min(y1, y2) + sY,
    width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
    anchor: computeAnchor((x1 + x2) / 2, (y1 + y2) / 2),
    dom_context: captureDOMContext((x1 + x2) / 2, (y1 + y2) / 2),
    intent: 'highlight' as AnnotationIntent,
    label: '', priority: 'medium', locked: false, z_index: annotations.length + 1,
    payload: { start_x: x1 + sX, start_y: y1 + sY, end_x: x2 + sX, end_y: y2 + sY, color: drawColor, width: drawWidth },
  };
  addAnnotation(ann); selectedId = ann.id;
}

function createCurve(x1: number, y1: number, x2: number, y2: number): void {
  const sX = window.scrollX, sY = window.scrollY;
  if (Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) < 10) return;
  // Control point: midpoint offset perpendicular
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const cx = mx - dy * 0.3, cy = my + dx * 0.3;
  const ann: Annotation = {
    id: generateId(), type: 'curve',
    x: Math.min(x1, x2, cx) + sX, y: Math.min(y1, y2, cy) + sY,
    width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
    anchor: computeAnchor(mx, my),
    dom_context: captureDOMContext(mx, my),
    intent: 'highlight' as AnnotationIntent,
    label: '', priority: 'medium', locked: false, z_index: annotations.length + 1,
    payload: { start_x: x1 + sX, start_y: y1 + sY, end_x: x2 + sX, end_y: y2 + sY, control_x: cx + sX, control_y: cy + sY, color: drawColor, width: drawWidth },
  };
  addAnnotation(ann); selectedId = ann.id;
}

function createFreehand(): void {
  if (freehandPoints.length < 3) return;
  const xs = freehandPoints.map(p => p[0]);
  const ys = freehandPoints.map(p => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const maxX = Math.max(...xs), maxY = Math.max(...ys);
  const ann: Annotation = {
    id: generateId(), type: 'freehand',
    x: minX, y: minY, width: maxX - minX, height: maxY - minY,
    anchor: null, dom_context: null, intent: 'highlight' as AnnotationIntent, label: '', priority: 'medium', locked: false, z_index: annotations.length + 1,
    payload: { points: [...freehandPoints], color: drawColor, width: drawWidth },
  };
  addAnnotation(ann); selectedId = ann.id;
}

// --- Add/Remove with Undo ---
function addAnnotation(ann: Annotation): void {
  annotations.push(ann);
  undoStack.push({ type: 'add', annotation: { ...ann } });
  redoStack = [];
  renderAll();
  onChangeCallback?.();
}

function removeAnnotation(id: string): void {
  const idx = annotations.findIndex((a) => a.id === id);
  if (idx === -1) return;
  const removed = annotations.splice(idx, 1)[0];
  undoStack.push({ type: 'remove', annotation: { ...removed } });
  redoStack = [];
  selectedId = null;
  renderAll();
  onChangeCallback?.();
}

export function updateAnnotation(id: string, updates: Partial<Annotation>): void {
  const ann = annotations.find((a) => a.id === id);
  if (!ann) return;
  Object.assign(ann, updates);
  renderAll();
  onChangeCallback?.();
}

// --- Undo/Redo ---
export function undo(): void {
  const action = undoStack.pop();
  if (!action) return;

  if (action.type === 'add') {
    const idx = annotations.findIndex((a) => a.id === action.annotation.id);
    if (idx !== -1) annotations.splice(idx, 1);
  } else if (action.type === 'remove') {
    annotations.push({ ...action.annotation });
  }

  redoStack.push(action);
  renderAll();
  onChangeCallback?.();
}

export function redo(): void {
  const action = redoStack.pop();
  if (!action) return;

  if (action.type === 'add') {
    annotations.push({ ...action.annotation });
  } else if (action.type === 'remove') {
    const idx = annotations.findIndex((a) => a.id === action.annotation.id);
    if (idx !== -1) annotations.splice(idx, 1);
  }

  undoStack.push(action);
  renderAll();
  onChangeCallback?.();
}

// --- Find annotation at position ---
function findAnnotationAt(clientX: number, clientY: number): Annotation | null {
  const docX = clientX + window.scrollX;
  const docY = clientY + window.scrollY;

  // Search in reverse z-order (top-most first)
  for (let i = annotations.length - 1; i >= 0; i--) {
    const ann = annotations[i];
    if (ann.type === 'pin') {
      const dx = docX - ann.x;
      const dy = docY - ann.y;
      if (Math.sqrt(dx * dx + dy * dy) < 16) return ann;
    } else {
      if (docX >= ann.x && docX <= ann.x + ann.width && docY >= ann.y && docY <= ann.y + ann.height) {
        return ann;
      }
    }
  }
  return null;
}

// --- Close any open note input ---
function closeNoteInput(): void {
  if (activeNoteInput) {
    activeNoteInput.remove();
    activeNoteInput = null;
  }
}

// --- Note Input Prompt (draggable) ---
function promptNoteInput(ann: Annotation): void {
  if (!annotationLayer) return;
  closeNoteInput();

  const viewX = ann.x - window.scrollX;
  const viewY = ann.y - window.scrollY;

  const input = document.createElement('div');
  input.className = 'pr-note-input';
  input.style.cssText = `position:fixed;left:${viewX + 28}px;top:${viewY - 8}px;z-index:2147483647;pointer-events:auto;`;
  input.innerHTML = `
    <div class="pr-note-drag-handle">Drag to move | Note</div>
    <textarea class="pr-note-textarea" placeholder="Type your note... (Cmd+Enter to save)" rows="4"></textarea>
    <div class="pr-note-actions">
      <select class="pr-priority-select">
        <option value="low">Low</option>
        <option value="medium" selected>Medium</option>
        <option value="high">High</option>
      </select>
      <button class="pr-note-save">Save</button>
      <button class="pr-note-cancel">Cancel</button>
    </div>
  `;

  // Stop events from propagating
  input.addEventListener('mousedown', (e) => {
    if (!(e.target as HTMLElement).classList.contains('pr-note-drag-handle')) {
      e.stopPropagation();
    }
  });
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

  // --- Make note input draggable ---
  const dragHandle = input.querySelector('.pr-note-drag-handle') as HTMLElement;
  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
  dragHandle.addEventListener('mousedown', (e: MouseEvent) => {
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    const r = input.getBoundingClientRect();
    ox = r.left; oy = r.top;
    e.preventDefault(); e.stopPropagation();
    const mv = (e2: MouseEvent) => {
      if (!dragging) return;
      input.style.left = `${ox + e2.clientX - sx}px`;
      input.style.top = `${oy + e2.clientY - sy}px`;
    };
    const up = () => { dragging = false; window.removeEventListener('mousemove', mv, true); window.removeEventListener('mouseup', up, true); };
    window.addEventListener('mousemove', mv, true);
    window.addEventListener('mouseup', up, true);
  });

  annotationLayer.appendChild(input);
  activeNoteInput = input;

  const textarea = input.querySelector('textarea')!;
  const prioritySelect = input.querySelector('select')!;
  const saveBtn = input.querySelector('.pr-note-save')!;
  const cancelBtn = input.querySelector('.pr-note-cancel')!;

  textarea.focus();

  const save = () => {
    const text = textarea.value; // Keep original formatting (newlines)
    const priority = prioritySelect.value as Priority;
    if (ann.type === 'note') {
      updateAnnotation(ann.id, { label: text, priority, payload: { text } });
    }
    closeNoteInput();
  };

  const cancel = () => {
    if (!textarea.value.trim()) removeAnnotation(ann.id);
    closeNoteInput();
  };

  saveBtn.addEventListener('click', save);
  cancelBtn.addEventListener('click', cancel);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
    if (e.key === 'Escape') cancel();
    e.stopPropagation();
  });
}

// --- Rendering ---
function renderAll(): void {
  if (!annotationLayer) return;

  // Clear existing rendered annotations (but keep note inputs)
  annotationLayer.querySelectorAll('.pr-annotation').forEach((el) => el.remove());

  for (const ann of annotations) {
    const el = renderAnnotation(ann);
    annotationLayer.appendChild(el);
  }
}

function addDeleteButton(el: HTMLElement, annId: string): void {
  const btn = document.createElement('button');
  btn.className = 'pr-delete-btn';
  btn.innerHTML = '&times;';
  btn.title = 'Delete';
  btn.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    removeAnnotation(annId);
  });
  el.appendChild(btn);
}

// Make an element draggable — updates ann.x/ann.y on drag
function makeDraggable(el: HTMLElement, ann: Annotation): void {
  let dragging = false, startMouseX = 0, startMouseY = 0, startAnnX = 0, startAnnY = 0;
  el.addEventListener('mousedown', (e: MouseEvent) => {
    // Don't start drag on delete button
    if ((e.target as HTMLElement).closest('.pr-ann-delete')) return;
    dragging = true;
    startMouseX = e.clientX;
    startMouseY = e.clientY;
    startAnnX = ann.x;
    startAnnY = ann.y;
    selectedId = ann.id;
    e.preventDefault();
    e.stopPropagation();
    const mv = (e2: MouseEvent) => {
      if (!dragging) return;
      const dx = e2.clientX - startMouseX;
      const dy = e2.clientY - startMouseY;
      updateAnnotation(ann.id, { x: startAnnX + dx, y: startAnnY + dy });
    };
    const up = () => { dragging = false; window.removeEventListener('mousemove', mv, true); window.removeEventListener('mouseup', up, true); };
    window.addEventListener('mousemove', mv, true);
    window.addEventListener('mouseup', up, true);
  });
}

// Make line/arrow/curve draggable — updates start_x/y and end_x/y by delta
function makeLineDraggable(el: HTMLElement, ann: Annotation): void {
  let dragging = false, startMouseX = 0, startMouseY = 0;
  let startSX = 0, startSY = 0, startEX = 0, startEY = 0, startCX = 0, startCY = 0;
  el.addEventListener('mousedown', (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.pr-ann-delete')) return;
    dragging = true;
    startMouseX = e.clientX;
    startMouseY = e.clientY;
    const p = ann.payload as any;
    startSX = p.start_x; startSY = p.start_y;
    startEX = p.end_x; startEY = p.end_y;
    startCX = p.control_x ?? 0; startCY = p.control_y ?? 0;
    selectedId = ann.id;
    e.preventDefault();
    e.stopPropagation();
    const mv = (e2: MouseEvent) => {
      if (!dragging) return;
      const dx = e2.clientX - startMouseX;
      const dy = e2.clientY - startMouseY;
      const newPayload: any = {
        ...ann.payload,
        start_x: startSX + dx, start_y: startSY + dy,
        end_x: startEX + dx, end_y: startEY + dy,
      };
      if ('control_x' in (ann.payload as any)) {
        newPayload.control_x = startCX + dx;
        newPayload.control_y = startCY + dy;
      }
      updateAnnotation(ann.id, { payload: newPayload });
    };
    const up = () => { dragging = false; window.removeEventListener('mousemove', mv, true); window.removeEventListener('mouseup', up, true); };
    window.addEventListener('mousemove', mv, true);
    window.addEventListener('mouseup', up, true);
  });
}

// Make path/freehand draggable — shifts all points by delta
function makePathDraggable(el: HTMLElement, ann: Annotation): void {
  let dragging = false, startMouseX = 0, startMouseY = 0;
  let startPoints: [number, number][] = [];
  el.addEventListener('mousedown', (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.pr-ann-delete')) return;
    dragging = true;
    startMouseX = e.clientX;
    startMouseY = e.clientY;
    const p = ann.payload as any;
    startPoints = (p.points as [number, number][]).map(([x, y]) => [x, y] as [number, number]);
    selectedId = ann.id;
    e.preventDefault();
    e.stopPropagation();
    const mv = (e2: MouseEvent) => {
      if (!dragging) return;
      const dx = e2.clientX - startMouseX;
      const dy = e2.clientY - startMouseY;
      const newPoints = startPoints.map(([x, y]) => [x + dx, y + dy] as [number, number]);
      updateAnnotation(ann.id, { payload: { ...(ann.payload as any), points: newPoints } });
    };
    const up = () => { dragging = false; window.removeEventListener('mousemove', mv, true); window.removeEventListener('mouseup', up, true); };
    window.addEventListener('mousemove', mv, true);
    window.addEventListener('mouseup', up, true);
  });
}

function renderAnnotation(ann: Annotation): HTMLElement {
  const el = document.createElement('div');
  el.className = `pr-annotation pr-ann-${ann.type}`;
  el.dataset.annId = ann.id;

  const viewX = ann.x - window.scrollX;
  const viewY = ann.y - window.scrollY;
  const isSelected = ann.id === selectedId;

  switch (ann.type) {
    case 'pin': {
      const pinNum = ann.label || '?';
      // Parse theme colors from payload
      const pinPayload = (ann.payload as { note: string }).note || '';
      const colorParts = pinPayload.split('|');
      const pinBg = colorParts.length >= 2 ? colorParts[colorParts.length - 2].trim() : getPriorityColor(ann.priority);
      const pinFg = colorParts.length >= 2 ? colorParts[colorParts.length - 1].trim() : '#fff';
      const size = 32;
      el.style.cssText = `
        position: fixed;
        left: ${viewX - size / 2}px;
        top: ${viewY - size / 2}px;
        width: ${size}px;
        height: ${size}px;
        pointer-events: auto;
        cursor: pointer;
        z-index: ${ann.z_index};
      `;
      el.innerHTML = `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">
          <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${pinBg}" opacity="0.95" ${pinBg === '#ffffff' ? 'stroke="rgba(0,0,0,0.2)" stroke-width="1"' : ''}/>
          ${isSelected ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" stroke="${pinFg}" stroke-width="2" fill="none"/>` : ''}
          <text x="${size / 2}" y="${size / 2 + 1}" text-anchor="middle" dominant-baseline="central" fill="${pinFg}" font-size="14" font-weight="700" font-family="-apple-system,system-ui,sans-serif">${pinNum}</text>
        </svg>
      `;
      break;
    }

    case 'note': {
      const notePayload = ann.payload as { text: string };
      const noteText = notePayload.text || '(empty note)';
      const noteBg = '#facc15';
      const noteFg = '#1a1a1a';
      el.style.cssText = `
        position: fixed;
        left: ${viewX}px;
        top: ${viewY}px;
        width: 240px;
        max-width: 360px;
        min-height: 36px;
        padding: 8px 10px;
        background: ${noteBg};
        border-radius: 6px;
        font-size: 13px;
        line-height: 1.5;
        color: ${noteFg};
        box-shadow: 0 2px 12px rgba(0,0,0,0.2);
        pointer-events: auto;
        cursor: move;
        z-index: ${ann.z_index};
        white-space: pre-wrap;
        word-wrap: break-word;
        ${isSelected ? 'outline: 2px solid #a78bfa;' : ''}
      `;
      el.textContent = noteText;

      // --- Make saved note draggable ---
      let noteDragging = false, nsx = 0, nsy = 0;
      el.addEventListener('mousedown', (e: Event) => {
        const me = e as MouseEvent;
        noteDragging = true;
        nsx = me.clientX - viewX;
        nsy = me.clientY - viewY;
        me.stopPropagation();
        const nmv = (e2: MouseEvent) => {
          if (!noteDragging) return;
          const newX = e2.clientX - nsx + window.scrollX;
          const newY = e2.clientY - nsy + window.scrollY;
          updateAnnotation(ann.id, { x: newX, y: newY });
        };
        const nup = () => { noteDragging = false; window.removeEventListener('mousemove', nmv, true); window.removeEventListener('mouseup', nup, true); };
        window.addEventListener('mousemove', nmv, true);
        window.addEventListener('mouseup', nup, true);
      });
      // Double-click = copy note text to clipboard
      el.addEventListener('dblclick', (e: Event) => {
        e.stopPropagation();
        const text = (ann.payload as { text: string }).text || '';
        navigator.clipboard.writeText(text).then(() => {
          el.style.outline = '2px solid #4ade80';
          setTimeout(() => { el.style.outline = isSelected ? '2px solid #a78bfa' : ''; }, 800);
        });
      });
      break;
    }

    case 'box':
      el.style.cssText = `
        position: fixed;
        left: ${viewX}px;
        top: ${viewY}px;
        width: ${ann.width}px;
        height: ${ann.height}px;
        border: ${(ann.payload as { border_width: number }).border_width}px solid ${(ann.payload as { color: string }).color};
        background: ${(ann.payload as { color: string }).color}${Math.round((ann.payload as { fill_opacity: number }).fill_opacity * 255).toString(16).padStart(2, '0')};
        border-radius: 3px;
        pointer-events: auto;
        cursor: move;
        z-index: ${ann.z_index};
        ${isSelected ? 'box-shadow: 0 0 0 2px #fff;' : ''}
      `;
      if (ann.label) {
        const labelEl = document.createElement('div');
        labelEl.textContent = ann.label;
        labelEl.style.cssText = `
          position: absolute;
          bottom: -20px;
          left: 0;
          font-size: 10px;
          color: ${(ann.payload as { color: string }).color};
          white-space: nowrap;
        `;
        el.appendChild(labelEl);
      }
      makeDraggable(el, ann);
      break;

    case 'circle': {
      const p = ann.payload as { color: string; border_width: number; fill_opacity: number };
      const r = Math.min(ann.width, ann.height) / 2;
      const cx = ann.width / 2, cy = ann.height / 2;
      el.style.cssText = `position:fixed;left:${viewX}px;top:${viewY}px;width:${ann.width}px;height:${ann.height}px;pointer-events:auto;cursor:move;z-index:${ann.z_index};${isSelected ? 'filter:drop-shadow(0 0 2px #fff);' : ''}`;
      el.innerHTML = `<svg width="${ann.width}" height="${ann.height}"><circle cx="${cx}" cy="${cy}" r="${r - p.border_width / 2}" stroke="${p.color}" stroke-width="${p.border_width}" fill="${p.color}" fill-opacity="${p.fill_opacity}"/></svg>`;
      makeDraggable(el, ann);
      break;
    }

    case 'ellipse': {
      const p = ann.payload as { color: string; border_width: number; fill_opacity: number };
      const rx = ann.width / 2, ry = ann.height / 2;
      el.style.cssText = `position:fixed;left:${viewX}px;top:${viewY}px;width:${ann.width}px;height:${ann.height}px;pointer-events:auto;cursor:move;z-index:${ann.z_index};${isSelected ? 'filter:drop-shadow(0 0 2px #fff);' : ''}`;
      el.innerHTML = `<svg width="${ann.width}" height="${ann.height}"><ellipse cx="${rx}" cy="${ry}" rx="${rx - p.border_width / 2}" ry="${ry - p.border_width / 2}" stroke="${p.color}" stroke-width="${p.border_width}" fill="${p.color}" fill-opacity="${p.fill_opacity}"/></svg>`;
      makeDraggable(el, ann);
      break;
    }

    case 'star': {
      const p = ann.payload as { color: string; border_width: number; fill_opacity: number; points_count: number };
      const cx = ann.width / 2, cy = ann.height / 2;
      const outerR = Math.min(cx, cy) - p.border_width;
      const innerR = outerR * 0.4;
      const n = p.points_count || 5;
      let pts = '';
      for (let i = 0; i < n * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI / n) * i - Math.PI / 2;
        pts += `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)} `;
      }
      el.style.cssText = `position:fixed;left:${viewX}px;top:${viewY}px;width:${ann.width}px;height:${ann.height}px;pointer-events:auto;cursor:move;z-index:${ann.z_index};${isSelected ? 'filter:drop-shadow(0 0 2px #fff);' : ''}`;
      el.innerHTML = `<svg width="${ann.width}" height="${ann.height}"><polygon points="${pts}" stroke="${p.color}" stroke-width="${p.border_width}" fill="${p.color}" fill-opacity="${p.fill_opacity}" stroke-linejoin="round"/></svg>`;
      makeDraggable(el, ann);
      break;
    }

    case 'arrow': {
      const payload = ann.payload as { start_x: number; start_y: number; end_x: number; end_y: number; color: string };
      const sx = payload.start_x - window.scrollX;
      const sy = payload.start_y - window.scrollY;
      const ex = payload.end_x - window.scrollX;
      const ey = payload.end_y - window.scrollY;

      const minX = Math.min(sx, ex) - 10;
      const minY = Math.min(sy, ey) - 10;
      const svgW = Math.abs(ex - sx) + 20;
      const svgH = Math.abs(ey - sy) + 20;

      el.style.cssText = `
        position: fixed;
        left: ${minX}px;
        top: ${minY}px;
        width: ${svgW}px;
        height: ${svgH}px;
        pointer-events: auto;
        cursor: move;
        z-index: ${ann.z_index};
      `;

      const lsx = sx - minX;
      const lsy = sy - minY;
      const lex = ex - minX;
      const ley = ey - minY;

      el.innerHTML = `
        <svg width="${svgW}" height="${svgH}" style="overflow:visible">
          <defs>
            <marker id="arrowhead-${ann.id}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="${payload.color}"/>
            </marker>
          </defs>
          <line x1="${lsx}" y1="${lsy}" x2="${lex}" y2="${ley}"
            stroke="${payload.color}" stroke-width="${isSelected ? 3 : 2}"
            marker-end="url(#arrowhead-${ann.id})"/>
        </svg>
      `;
      makeLineDraggable(el, ann);
      break;
    }

    case 'line': {
      const p = ann.payload as { start_x: number; start_y: number; end_x: number; end_y: number; color: string; width: number };
      const sx = p.start_x - window.scrollX, sy = p.start_y - window.scrollY;
      const ex = p.end_x - window.scrollX, ey = p.end_y - window.scrollY;
      const minX = Math.min(sx, ex) - 10, minY = Math.min(sy, ey) - 10;
      const svgW = Math.abs(ex - sx) + 20, svgH = Math.abs(ey - sy) + 20;
      el.style.cssText = `position:fixed;left:${minX}px;top:${minY}px;width:${svgW}px;height:${svgH}px;pointer-events:auto;cursor:move;z-index:${ann.z_index};`;
      el.innerHTML = `<svg width="${svgW}" height="${svgH}" style="overflow:visible"><line x1="${sx - minX}" y1="${sy - minY}" x2="${ex - minX}" y2="${ey - minY}" stroke="${p.color}" stroke-width="${p.width}" stroke-linecap="round"/></svg>`;
      makeLineDraggable(el, ann);
      break;
    }

    case 'curve': {
      const p = ann.payload as { start_x: number; start_y: number; end_x: number; end_y: number; control_x: number; control_y: number; color: string; width: number };
      const sx = p.start_x - window.scrollX, sy = p.start_y - window.scrollY;
      const ex = p.end_x - window.scrollX, ey = p.end_y - window.scrollY;
      const cx = p.control_x - window.scrollX, cy = p.control_y - window.scrollY;
      const minX = Math.min(sx, ex, cx) - 10, minY = Math.min(sy, ey, cy) - 10;
      const maxX = Math.max(sx, ex, cx) + 10, maxY = Math.max(sy, ey, cy) + 10;
      const svgW = maxX - minX, svgH = maxY - minY;
      el.style.cssText = `position:fixed;left:${minX}px;top:${minY}px;width:${svgW}px;height:${svgH}px;pointer-events:auto;cursor:move;z-index:${ann.z_index};`;
      el.innerHTML = `<svg width="${svgW}" height="${svgH}" style="overflow:visible"><path d="M${sx - minX},${sy - minY} Q${cx - minX},${cy - minY} ${ex - minX},${ey - minY}" stroke="${p.color}" stroke-width="${p.width}" fill="none" stroke-linecap="round"/></svg>`;
      makeLineDraggable(el, ann);
      break;
    }

    case 'path': {
      const p = ann.payload as { points: [number, number][]; closed: boolean; color: string; width: number };
      if (p.points.length < 2) break;
      const xs = p.points.map(pt => pt[0] - window.scrollX);
      const ys = p.points.map(pt => pt[1] - window.scrollY);
      const minX = Math.min(...xs) - 10, minY = Math.min(...ys) - 10;
      const maxX = Math.max(...xs) + 10, maxY = Math.max(...ys) + 10;
      const svgW = maxX - minX, svgH = maxY - minY;
      let lines = '';
      for (let i = 0; i < p.points.length - 1; i++) {
        lines += `<line x1="${xs[i] - minX}" y1="${ys[i] - minY}" x2="${xs[i + 1] - minX}" y2="${ys[i + 1] - minY}" stroke="${p.color}" stroke-width="${p.width}" stroke-linecap="round"/>`;
      }
      if (p.closed && p.points.length > 2) {
        const li = p.points.length - 1;
        lines += `<line x1="${xs[li] - minX}" y1="${ys[li] - minY}" x2="${xs[0] - minX}" y2="${ys[0] - minY}" stroke="${p.color}" stroke-width="${p.width}" stroke-linecap="round"/>`;
      }
      // Draw dots at vertices
      for (let i = 0; i < p.points.length; i++) {
        lines += `<circle cx="${xs[i] - minX}" cy="${ys[i] - minY}" r="3" fill="${p.color}" stroke="#fff" stroke-width="1"/>`;
      }
      el.style.cssText = `position:fixed;left:${minX}px;top:${minY}px;width:${svgW}px;height:${svgH}px;pointer-events:auto;cursor:move;z-index:${ann.z_index};`;
      el.innerHTML = `<svg width="${svgW}" height="${svgH}" style="overflow:visible">${lines}</svg>`;
      makePathDraggable(el, ann);
      break;
    }

    case 'freehand': {
      const p = ann.payload as { points: [number, number][]; color: string; width: number };
      if (p.points.length < 2) break;
      const xs = p.points.map(pt => pt[0] - window.scrollX);
      const ys = p.points.map(pt => pt[1] - window.scrollY);
      const minX = Math.min(...xs) - 10, minY = Math.min(...ys) - 10;
      const maxX = Math.max(...xs) + 10, maxY = Math.max(...ys) + 10;
      const svgW = maxX - minX, svgH = maxY - minY;
      const pts = p.points.map(pt => `${pt[0] - window.scrollX - minX},${pt[1] - window.scrollY - minY}`).join(' ');
      el.style.cssText = `position:fixed;left:${minX}px;top:${minY}px;width:${svgW}px;height:${svgH}px;pointer-events:auto;cursor:move;z-index:${ann.z_index};`;
      el.innerHTML = `<svg width="${svgW}" height="${svgH}" style="overflow:visible"><polyline points="${pts}" stroke="${p.color}" stroke-width="${p.width}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      makePathDraggable(el, ann);
      break;
    }
  }

  // Add delete button to every annotation
  addDeleteButton(el, ann.id);

  return el;
}

// --- Freehand Preview ---
function renderFreehandPreview(): void {
  if (!annotationLayer || freehandPoints.length < 2) return;
  let preview = annotationLayer.querySelector('.pr-freehand-preview') as HTMLElement;
  if (!preview) {
    preview = document.createElement('div');
    preview.className = 'pr-freehand-preview';
    annotationLayer.appendChild(preview);
  }
  const xs = freehandPoints.map(p => p[0] - window.scrollX);
  const ys = freehandPoints.map(p => p[1] - window.scrollY);
  const minX = Math.min(...xs) - 5, minY = Math.min(...ys) - 5;
  const maxX = Math.max(...xs) + 5, maxY = Math.max(...ys) + 5;
  const pts = freehandPoints.map(p => `${p[0] - window.scrollX - minX},${p[1] - window.scrollY - minY}`).join(' ');
  preview.style.cssText = `position:fixed;left:${minX}px;top:${minY}px;width:${maxX - minX}px;height:${maxY - minY}px;pointer-events:none;z-index:2147483646;`;
  preview.innerHTML = `<svg width="${maxX - minX}" height="${maxY - minY}" style="overflow:visible"><polyline points="${pts}" stroke="${drawColor}" stroke-width="${drawWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/></svg>`;
}

// --- Draw Preview ---
function renderDrawPreview(x1: number, y1: number, x2: number, y2: number): void {
  if (!annotationLayer) return;

  let preview = annotationLayer.querySelector('.pr-draw-preview') as HTMLElement;
  if (!preview) {
    preview = document.createElement('div');
    preview.className = 'pr-draw-preview';
    annotationLayer.appendChild(preview);
  }

  if (currentTool === 'box' || currentTool === 'circle' || currentTool === 'ellipse' || currentTool === 'star') {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);

    if (currentTool === 'box') {
      preview.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${w}px;height:${h}px;border:${drawWidth}px dashed ${drawColor};background:${drawColor}10;pointer-events:none;z-index:2147483646;border-radius:3px;`;
      preview.innerHTML = '';
    } else {
      preview.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${w}px;height:${h}px;pointer-events:none;z-index:2147483646;`;
      let svg = '';
      if (currentTool === 'circle') {
        const r = Math.min(w, h) / 2;
        svg = `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" stroke="${drawColor}" stroke-width="${drawWidth}" fill="${drawColor}" fill-opacity="0.08" stroke-dasharray="4,3"/>`;
      } else if (currentTool === 'ellipse') {
        svg = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" stroke="${drawColor}" stroke-width="${drawWidth}" fill="${drawColor}" fill-opacity="0.08" stroke-dasharray="4,3"/>`;
      } else if (currentTool === 'star') {
        const cx = w / 2, cy = h / 2, outerR = Math.min(cx, cy), innerR = outerR * 0.4;
        let pts = '';
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const angle = (Math.PI / 5) * i - Math.PI / 2;
          pts += `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)} `;
        }
        svg = `<polygon points="${pts}" stroke="${drawColor}" stroke-width="${drawWidth}" fill="${drawColor}" fill-opacity="0.08" stroke-dasharray="4,3" stroke-linejoin="round"/>`;
      }
      preview.innerHTML = `<svg width="${w}" height="${h}">${svg}</svg>`;
    }
  } else if (currentTool === 'arrow' || currentTool === 'line' || currentTool === 'curve') {
    const svgW = window.innerWidth;
    const svgH = window.innerHeight;
    preview.style.cssText = `position:fixed;left:0;top:0;width:${svgW}px;height:${svgH}px;pointer-events:none;z-index:2147483646;`;

    let pathSvg = '';
    if (currentTool === 'arrow') {
      // Arrow with arrowhead preview
      pathSvg = `
        <defs><marker id="ph-arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="${drawColor}"/></marker></defs>
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${drawColor}" stroke-width="${drawWidth}" marker-end="url(#ph-arrow)" opacity="0.7"/>`;
    } else if (currentTool === 'line') {
      // Straight line preview
      pathSvg = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${drawColor}" stroke-width="${drawWidth}" stroke-linecap="round" opacity="0.7"/>`;
    } else if (currentTool === 'curve') {
      // Quadratic bezier curve preview — control point offset perpendicular
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const dx = x2 - x1, dy = y2 - y1;
      const cx = mx - dy * 0.3, cy = my + dx * 0.3;
      pathSvg = `<path d="M${x1},${y1} Q${cx},${cy} ${x2},${y2}" stroke="${drawColor}" stroke-width="${drawWidth}" fill="none" stroke-linecap="round" opacity="0.7"/>`;
    }
    preview.innerHTML = `<svg width="${svgW}" height="${svgH}">${pathSvg}</svg>`;
  }
}

function clearDrawPreview(): void {
  annotationLayer?.querySelector('.pr-draw-preview')?.remove();
}

// --- Priority Colors ---
function getPriorityColor(priority: Priority): string {
  switch (priority) {
    case 'high': return '#ef4444';
    case 'medium': return '#a78bfa';
    case 'low': return '#60a5fa';
  }
}

// --- Annotation Styles (v2 polished) ---
export function getAnnotationStyles(): string {
  return `
    /* === Note input popup === */
    .pr-note-input {
      background: rgba(12, 12, 20, 0.92);
      backdrop-filter: blur(24px) saturate(1.4);
      -webkit-backdrop-filter: blur(24px) saturate(1.4);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      padding: 10px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
      animation: ann-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes ann-pop {
      from { opacity: 0; transform: scale(0.92); }
      to   { opacity: 1; transform: scale(1); }
    }

    .pr-note-drag-handle {
      padding: 4px 8px;
      margin: -2px -2px 6px -2px;
      background: rgba(255,255,255,0.08);
      border-radius: 6px 6px 0 0;
      font-size: 10px;
      color: rgba(255,255,255,0.35);
      cursor: grab;
      text-align: center;
      letter-spacing: 0.3px;
    }
    .pr-note-drag-handle:active { cursor: grabbing; }

    .pr-note-textarea {
      width: 260px;
      min-height: 72px;
      max-height: 200px;
      padding: 10px 12px;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      color: #f5f5fa;
      font-size: 14px;
      font-family: inherit;
      line-height: 1.6;
      resize: vertical;
      outline: none;
      transition: border-color 0.15s;
      overflow-y: auto;
      /* Enable trackpad scroll (2-finger) */
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }
    .pr-note-textarea:focus {
      border-color: rgba(167, 139, 250, 0.5);
    }
    .pr-note-textarea::placeholder {
      color: rgba(255, 255, 255, 0.25);
    }

    .pr-note-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
    }

    .pr-priority-select {
      padding: 5px 8px;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: #e2e2e8;
      font-size: 11px;
      outline: none;
    }

    .pr-note-save {
      padding: 5px 16px;
      background: rgba(167, 139, 250, 0.25);
      border: 1px solid rgba(167, 139, 250, 0.4);
      border-radius: 6px;
      color: #ddd6fe;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      margin-left: auto;
      transition: all 0.15s;
    }
    .pr-note-save:hover {
      background: rgba(167, 139, 250, 0.4);
      color: #fff;
    }

    .pr-note-cancel {
      padding: 5px 12px;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: rgba(255, 255, 255, 0.45);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .pr-note-cancel:hover {
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.8);
    }

    /* === Delete button on annotations === */
    .pr-delete-btn {
      position: absolute;
      top: -7px;
      right: -7px;
      width: 20px;
      height: 20px;
      border: 2px solid rgba(0,0,0,0.2);
      border-radius: 10px;
      background: #ef4444;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      line-height: 16px;
      text-align: center;
      cursor: pointer;
      pointer-events: auto;
      opacity: 0;
      transform: scale(0.7);
      transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      padding: 0;
      z-index: 10;
    }
    .pr-annotation:hover .pr-delete-btn {
      opacity: 1;
      transform: scale(1);
    }
    .pr-delete-btn:hover {
      background: #dc2626;
      transform: scale(1.1);
    }
  `;
}

// --- Re-render on scroll ---
export function handleScroll(): void {
  renderAll();
}
