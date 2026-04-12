// ============================================================
// Photoresist Bridge — Local Server
// Module G: Docking Port
//
// Receives bundles from extension → writes to folder
// Exposes localhost HTTP API for AI tools to read
// Binds ONLY to 127.0.0.1 (security)
// ============================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 9471; // Photoresist default port
const HOST = '127.0.0.1'; // localhost only — not exposed to network
const OUTBOX_DIR = path.join(os.homedir(), 'Photoresist', 'outbox');

// --- Ensure outbox directory exists ---
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created: ${dir}`);
  }
}

// --- Write bundle to folder ---
function writeBundle(bundle: any): { bundlePath: string; mdPath: string } {
  const projectId = bundle.project_id || 'default';
  const feedbackId = bundle.feedback_id;
  const bundleDir = path.join(OUTBOX_DIR, projectId, feedbackId);
  const assetsDir = path.join(bundleDir, 'assets');

  ensureDir(bundleDir);
  ensureDir(assetsDir);

  // Extract screenshots as separate PNG files
  const bundleCopy = { ...bundle };
  if (bundleCopy.screenshots && Array.isArray(bundleCopy.screenshots)) {
    bundleCopy.screenshots = bundleCopy.screenshots.map((ss: any, idx: number) => {
      if (ss.data_ref && ss.data_ref.startsWith('data:')) {
        const filename = `screenshot-${idx + 1}.png`;
        const filePath = path.join(assetsDir, filename);
        const base64Data = ss.data_ref.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
        return { ...ss, data_ref: `assets/${filename}` };
      }
      return ss;
    });
  }

  // Write bundle JSON
  const bundlePath = path.join(bundleDir, 'bundle.json');
  fs.writeFileSync(bundlePath, JSON.stringify(bundleCopy, null, 2));

  // Write markdown summary
  const mdPath = path.join(bundleDir, 'feedback.md');
  fs.writeFileSync(mdPath, bundle.markdown_summary || '');

  // Write PGOS graph-only (no screenshots — lightweight for AI)
  const graphOnly = {
    schema_version: bundle.schema_version,
    feedback_id: bundle.feedback_id,
    page_url: bundle.page_url,
    page_title: bundle.page_title,
    viewport: bundle.viewport,
    annotations: bundle.annotations,
    dom_contexts: bundle.dom_contexts,
    intent_summary: bundle.intent_summary,
    markdown_summary: bundle.markdown_summary,
  };
  const graphPath = path.join(bundleDir, 'graph.json');
  fs.writeFileSync(graphPath, JSON.stringify(graphOnly, null, 2));

  console.log(`📦 Bundle saved: ${bundleDir}`);
  console.log(`   ├── bundle.json (full)`);
  console.log(`   ├── graph.json (PGOS graph-only, lightweight)`);
  console.log(`   ├── feedback.md`);
  console.log(`   └── assets/ (${bundleCopy.screenshots?.length || 0} screenshots)`);

  return { bundlePath, mdPath };
}

// --- List all bundles ---
function listBundles(): any[] {
  const bundles: any[] = [];
  if (!fs.existsSync(OUTBOX_DIR)) return bundles;

  for (const project of fs.readdirSync(OUTBOX_DIR)) {
    const projectDir = path.join(OUTBOX_DIR, project);
    if (!fs.statSync(projectDir).isDirectory()) continue;

    for (const feedback of fs.readdirSync(projectDir)) {
      const bundlePath = path.join(projectDir, feedback, 'bundle.json');
      if (fs.existsSync(bundlePath)) {
        try {
          const data = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));
          bundles.push({
            project_id: project,
            feedback_id: feedback,
            page_url: data.page_url,
            page_title: data.page_title,
            annotations_count: data.annotations?.length || 0,
            screenshots_count: data.screenshots?.length || 0,
            intent_summary: data.intent_summary,
            created_at: data.created_at,
          });
        } catch { /* skip invalid */ }
      }
    }
  }

  return bundles.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

// --- Get single bundle ---
function getBundle(feedbackId: string): any | null {
  if (!fs.existsSync(OUTBOX_DIR)) return null;

  for (const project of fs.readdirSync(OUTBOX_DIR)) {
    const bundlePath = path.join(OUTBOX_DIR, project, feedbackId, 'bundle.json');
    if (fs.existsSync(bundlePath)) {
      return JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));
    }
    // Also check graph.json (lightweight)
    const graphPath = path.join(OUTBOX_DIR, project, feedbackId, 'graph.json');
    if (fs.existsSync(graphPath)) {
      return JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
    }
  }
  return null;
}

// --- HTTP Server ---
const server = http.createServer((req, res) => {
  // CORS for extension
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  // --- Health check ---
  if (req.method === 'GET' && url.pathname === '/v1/healthz') {
    json(res, { status: 'ok', version: '0.1.0', outbox: OUTBOX_DIR });
    return;
  }

  // --- POST bundle ---
  if (req.method === 'POST' && url.pathname === '/v1/bundles') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const bundle = JSON.parse(body);
        const result = writeBundle(bundle);
        json(res, { success: true, ...result }, 201);
      } catch (err) {
        json(res, { success: false, error: String(err) }, 400);
      }
    });
    return;
  }

  // --- List open feedback ---
  if (req.method === 'GET' && url.pathname === '/v1/feedback/open') {
    json(res, listBundles());
    return;
  }

  // --- Get feedback by ID ---
  if (req.method === 'GET' && url.pathname.startsWith('/v1/feedback/')) {
    const id = url.pathname.split('/').pop();
    if (!id) { json(res, { error: 'Missing ID' }, 400); return; }
    const bundle = getBundle(id);
    if (bundle) {
      json(res, bundle);
    } else {
      json(res, { error: 'Not found' }, 404);
    }
    return;
  }

  // --- Get latest graph (PGOS — lightweight, for AI tools) ---
  if (req.method === 'GET' && url.pathname === '/v1/latest-graph') {
    const bundles = listBundles();
    if (bundles.length === 0) { json(res, { error: 'No bundles' }, 404); return; }
    const latest = getBundle(bundles[0].feedback_id);
    json(res, latest);
    return;
  }

  // 404
  json(res, { error: 'Not found' }, 404);
});

function json(res: http.ServerResponse, data: any, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

// --- Start ---
ensureDir(OUTBOX_DIR);
server.listen(PORT, HOST, () => {
  console.log('');
  console.log('🔌 Photoresist Bridge running');
  console.log(`   URL: http://${HOST}:${PORT}`);
  console.log(`   Outbox: ${OUTBOX_DIR}`);
  console.log('');
  console.log('📡 API:');
  console.log(`   GET  /v1/healthz        → health check`);
  console.log(`   POST /v1/bundles        → receive bundle from extension`);
  console.log(`   GET  /v1/feedback/open   → list all bundles`);
  console.log(`   GET  /v1/feedback/:id    → get bundle by ID`);
  console.log(`   GET  /v1/latest-graph    → latest PGOS graph (lightweight)`);
  console.log('');
  console.log('🤖 AI tools can read from:');
  console.log(`   Folder: ${OUTBOX_DIR}/<project>/<feedback_id>/`);
  console.log(`   API:    http://${HOST}:${PORT}/v1/latest-graph`);
  console.log('');
});
