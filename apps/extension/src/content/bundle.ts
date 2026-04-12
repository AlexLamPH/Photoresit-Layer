// ============================================================
// Module E: Cargo Hold — Bundle Assembly + IndexedDB Queue
//
// Collects annotations + screenshots → creates FeedbackBundle
// Auto-generates Markdown summary for AI readability
// Stores in IndexedDB for offline resilience
// ============================================================

import type { FeedbackBundle, Annotation, Screenshot, HostContext } from '@photoresist/schema';
import { generateId, generateMarkdownSummary, SCHEMA_VERSION } from '@photoresist/schema';

// --- IndexedDB ---
const DB_NAME = 'photoresist-layer';
const DB_VERSION = 1;
const STORE_NAME = 'bundles';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'feedback_id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- Save bundle to IndexedDB ---
async function saveBundleToDB(bundle: FeedbackBundle): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(bundle);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Get all pending bundles ---
export async function getPendingBundles(): Promise<FeedbackBundle[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- Remove bundle from queue after successful sync ---
export async function removeBundleFromDB(feedbackId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(feedbackId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Read Host Context ---
function readHostContext(): HostContext | null {
  try {
    // Check for JS hook
    const hookFn = (window as any).__PHOTORESIST_CONTEXT__;
    if (typeof hookFn === 'function') {
      return hookFn();
    }

    // Check for data-pr-* attributes on nearest relevant element
    const body = document.body;
    const prLayer = body.querySelector('[data-pr-layer]');
    if (prLayer) {
      return {
        project_id: prLayer.getAttribute('data-pr-layer') ?? undefined,
        component_id: prLayer.getAttribute('data-pr-component') ?? undefined,
        entity_id: prLayer.getAttribute('data-pr-entity') ?? undefined,
      };
    }
  } catch {
    // Host context is optional — fail silently
  }
  return null;
}

// --- Detect Device Info ---
function detectDeviceType(): 'desktop' | 'tablet' | 'mobile' {
  const w = window.innerWidth;
  if (w <= 768) return 'mobile';
  if (w <= 1024) return 'tablet';
  return 'desktop';
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Arc/') || ua.includes('Arc ')) return 'Arc';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/')) return 'Safari';
  return 'Unknown';
}

function detectOS(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Mac OS')) return 'macOS';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return 'Unknown';
}

// --- PGOS: Intent Summary ---
function summarizeIntents(annotations: Annotation[]): string {
  const intents = annotations.map((a) => a.intent).filter((i) => i && i !== 'general');
  if (intents.length === 0) return 'General feedback';
  const counts: Record<string, number> = {};
  intents.forEach((i) => { counts[i] = (counts[i] || 0) + 1; });
  return Object.entries(counts).map(([k, v]) => `${k} (${v})`).join(', ');
}

// --- Create Bundle ---
export async function createBundle(
  annotations: Annotation[],
  screenshots: Screenshot[],
  projectId: string = 'default'
): Promise<FeedbackBundle> {
  const now = new Date().toISOString();

  const bundle: FeedbackBundle = {
    schema_version: SCHEMA_VERSION,

    feedback_id: generateId(),
    project_id: projectId,
    session_id: getSessionId(),

    page_url: window.location.href,
    page_title: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scroll_x: window.scrollX,
    scroll_y: window.scrollY,
    device_pixel_ratio: window.devicePixelRatio || 1,

    device_type: detectDeviceType(),
    browser: detectBrowser(),
    os: detectOS(),

    host_context: readHostContext(),

    annotations,
    screenshots,

    // PGOS: collect all DOM contexts from annotations
    dom_contexts: annotations
      .map((a) => a.dom_context)
      .filter((dc): dc is NonNullable<typeof dc> => dc !== null),

    // PGOS: summarize intents
    intent_summary: summarizeIntents(annotations),

    markdown_summary: '', // generated below
    status: 'open',

    created_at: now,
    updated_at: now,
    app_version: '0.1.0',
  };

  // Auto-generate markdown summary
  bundle.markdown_summary = generateMarkdownSummary(bundle);

  // Save to IndexedDB (offline-safe)
  await saveBundleToDB(bundle);

  // Send to local bridge (if running)
  sendToBridge(bundle);

  console.log(`[Photoresist] Bundle created: ${bundle.feedback_id} (${annotations.length} annotations, ${screenshots.length} screenshots)`);

  return bundle;
}

// --- Send to local bridge via background SW (avoids CSP blocks) ---
function sendToBridge(bundle: FeedbackBundle): void {
  // Send lightweight version (no base64 screenshots — too large for messaging)
  const lightBundle = {
    ...bundle,
    screenshots: bundle.screenshots.map((ss) => ({
      ...ss,
      data_ref: ss.data_ref.startsWith('data:') ? `[base64:${ss.data_ref.length}bytes]` : ss.data_ref,
    })),
  };

  chrome.runtime.sendMessage({
    type: 'BRIDGE_SEND',
    bundle: lightBundle,
  }).catch(() => {
    // Extension context invalidated — ignore
  });

  // Also try direct fetch as fallback (works on some sites)
  try {
    fetch('http://127.0.0.1:9471/v1/bundles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bundle),
    }).then((r) => {
      if (r.ok) console.log('[Photoresist] Bridge: direct send OK');
    }).catch(() => {});
  } catch {}
}

// --- Session ID (persists per browser session) ---
let sessionId: string | null = null;

function getSessionId(): string {
  if (sessionId) return sessionId;

  // Try sessionStorage first
  const stored = sessionStorage.getItem('pr-session-id');
  if (stored) {
    sessionId = stored;
    return stored;
  }

  sessionId = generateId();
  sessionStorage.setItem('pr-session-id', sessionId);
  return sessionId;
}
