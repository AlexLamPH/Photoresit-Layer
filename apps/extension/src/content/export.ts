// ============================================================
// Export Module — Save bundle as PDF, TXT, MD
// Now uses LibraryItem via library-manager
// ============================================================

import type { FeedbackBundle } from '@photoresist/schema';
import { generateMarkdownSummary } from '@photoresist/schema';
import { addLibraryItem, createExportItem, type LibraryItem } from './library-manager';

// --- Short filename (max 20 chars) ---
function shortName(title: string, ext: string): string {
  const clean = (title || 'feedback').replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF ]/g, '').trim();
  const short = clean.slice(0, 14) || 'feedback';
  const ts = Date.now().toString(36).slice(-4);
  return `${short}-${ts}.${ext}`;
}

// --- Export Markdown ---
export async function exportMarkdown(bundle: FeedbackBundle): Promise<LibraryItem> {
  const md = generateMarkdownSummary(bundle);
  const name = shortName(bundle.page_title, 'md');
  const item = createExportItem('md', name, md, bundle.page_url, bundle.page_title);
  await addLibraryItem(item);
  return item;
}

// --- Export TXT ---
export async function exportTxt(bundle: FeedbackBundle): Promise<LibraryItem> {
  const lines = [
    `FEEDBACK REPORT`,
    `URL: ${bundle.page_url}`,
    `Title: ${bundle.page_title}`,
    `Date: ${bundle.created_at}`,
    `Viewport: ${bundle.viewport.width}x${bundle.viewport.height}`,
    ``,
    `ANNOTATIONS (${bundle.annotations.length})`,
    `---`,
  ];
  for (const ann of bundle.annotations) {
    lines.push(`[${ann.type.toUpperCase()}] at (${ann.x},${ann.y}): ${ann.label || (ann.payload as any).text || ''}`);
  }
  if (bundle.screenshots.length > 0) {
    lines.push('', `SCREENSHOTS (${bundle.screenshots.length})`);
    bundle.screenshots.forEach((ss, i) => lines.push(`${i + 1}. (${ss.crop.x},${ss.crop.y}) ${ss.crop.width}x${ss.crop.height}`));
  }

  const name = shortName(bundle.page_title, 'txt');
  const item = createExportItem('txt', name, lines.join('\n'), bundle.page_url, bundle.page_title);
  await addLibraryItem(item);
  return item;
}

// --- Export PDF (capture actual viewport WITH annotations) ---
export async function exportPdf(bundle: FeedbackBundle): Promise<LibraryItem> {
  let screenshotUrl = '';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' });
    if (response.success) screenshotUrl = response.data;
  } catch (e) { console.error('[Photoresist] Capture failed:', e); }

  const html = buildVisualPdf(bundle, screenshotUrl);
  const name = shortName(bundle.page_title, 'pdf');
  const item = createExportItem('pdf', name, html, bundle.page_url, bundle.page_title);
  await addLibraryItem(item);

  const blob = new Blob([html], { type: 'text/html' });
  window.open(URL.createObjectURL(blob), '_blank');

  return item;
}

function buildVisualPdf(b: FeedbackBundle, screenshotUrl: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${b.page_title} — Feedback</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,'Segoe UI',sans-serif;background:#fff;color:#1a1a1a}
.hint{background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin:16px 24px;font-size:13px;color:#1e40af}
.hint strong{color:#1e40af}
.info{padding:12px 24px;font-size:11px;color:#666;border-bottom:1px solid #eee}
.screenshot{padding:16px 24px}
.screenshot img{width:100%;border:1px solid #ddd;border-radius:6px;box-shadow:0 2px 12px rgba(0,0,0,0.08)}
.notes{padding:16px 24px}
h2{font-size:14px;color:#7c3aed;margin-bottom:8px}
.ann{padding:6px 10px;margin:3px 0;border-left:3px solid #7c3aed;background:#f8f7ff;border-radius:4px;font-size:12px}
.ann strong{color:#7c3aed}
.extra-ss{padding:8px 24px}
.extra-ss img{max-width:400px;border:1px solid #ddd;border-radius:4px;margin:4px}
.footer{text-align:center;padding:16px;font-size:10px;color:#aaa;border-top:1px solid #eee;margin-top:16px}
@media print{.hint{display:none} .screenshot img{box-shadow:none}}
</style></head><body>
<div class="hint">
  <strong>Save as PDF:</strong> Press <strong>Cmd+P</strong> (Mac) or <strong>Ctrl+P</strong> → "Save as PDF" → Save
</div>
<div class="info">
  <strong>${b.page_title}</strong> — ${b.page_url}<br>
  ${new Date(b.created_at).toLocaleString()} | ${b.viewport.width}x${b.viewport.height} | ${b.device_type}
</div>
${screenshotUrl ? `<div class="screenshot"><img src="${screenshotUrl}" alt="Page with annotations" /></div>` : ''}
${b.annotations.length > 0 ? `<div class="notes"><h2>Notes (${b.annotations.length})</h2>${b.annotations.map(a => {
  const text = a.label || (a.payload as any).text || (a.payload as any).note || '';
  return text ? `<div class="ann"><strong>${a.type} #${a.label || ''}</strong> — ${text}</div>` : '';
}).filter(Boolean).join('')}</div>` : ''}
${b.screenshots.length > 0 ? `<div class="extra-ss"><h2>Cropped Screenshots</h2>${b.screenshots.map(s => `<img src="${s.data_ref}" />`).join('')}</div>` : ''}
<div class="footer">Photoresist Layer — Cosmos AI Lab</div>
</body></html>`;
}

// --- Download helper ---
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
