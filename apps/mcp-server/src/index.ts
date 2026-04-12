#!/usr/bin/env node
// ============================================================
// Photoresist Layer — MCP Server
// Any AI tool can read feedback bundles from Firebase
// ============================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, query, orderBy, limit,
  getDocs, getDoc, doc, updateDoc,
} from 'firebase/firestore';

// --- Firebase ---
// Web API key (public by design — security is handled by Firebase Security Rules)
const app = initializeApp({
  apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyD_wpi0C6RHLaDKJTH2_GNjFANk8QmhNyc',
  projectId: process.env.FIREBASE_PROJECT_ID || 'photoresit',
});
const db = getFirestore(app);

// --- MCP Server ---
const server = new McpServer(
  { name: 'photoresist-layer', version: '0.1.0' },
  {
    instructions: `Photoresist Layer MCP — Read visual feedback bundles. Use get_latest for most recent feedback. Each bundle has annotations with CSS selectors, DOM context, and intent.`,
  }
);

// --- Helper ---
function text(t: string) {
  return { content: [{ type: 'text' as const, text: t }] };
}

// --- Tool: list_feedbacks ---
server.tool(
  'list_feedbacks',
  { maxItems: z.number().optional().default(10) },
  async ({ maxItems }) => {
    const q = query(collection(db, 'photoresist_bundles'), orderBy('created_at', 'desc'), limit(maxItems));
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => {
      const data = d.data();
      const libItems = data.library_items || [];
      return {
        id: d.id,
        page: (data.page_title || '').slice(0, 50),
        status: data.status || 'open',
        annotations: data.annotations?.length || 0,
        files: libItems.map((f: any) => f.name),
        intent: data.intent_summary || '',
        time: data.created_at || '',
      };
    });
    return text(JSON.stringify(items, null, 2));
  }
);

// --- Tool: get_feedback ---
server.tool(
  'get_feedback',
  { feedback_id: z.string() },
  async ({ feedback_id }) => {
    const d = await getDoc(doc(db, 'photoresist_bundles', feedback_id));
    if (!d.exists()) return text(`Not found: ${feedback_id}`);
    return text(d.data().markdown_summary || JSON.stringify(d.data(), null, 2));
  }
);

// --- Tool: get_latest ---
server.tool(
  'get_latest',
  {},
  async () => {
    const q = query(collection(db, 'photoresist_bundles'), orderBy('created_at', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return text('No feedbacks yet');
    const data = snap.docs[0].data();
    return text(data.markdown_summary || JSON.stringify(data, null, 2));
  }
);

// --- Tool: get_latest_graph ---
server.tool(
  'get_latest_graph',
  {},
  async () => {
    const q = query(collection(db, 'photoresist_bundles'), orderBy('created_at', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return text('No feedbacks yet');
    const d = snap.docs[0];
    const data = d.data();
    const graph = {
      feedback_id: d.id,
      page_url: data.page_url,
      page_title: data.page_title,
      viewport: data.viewport,
      annotations: data.annotations,
      dom_contexts: data.dom_contexts,
      intent_summary: data.intent_summary,
      library_items: data.library_items || [],
    };
    return text(JSON.stringify(graph, null, 2));
  }
);

// --- Tool: update_status ---
server.tool(
  'update_status',
  {
    feedback_id: z.string(),
    status: z.enum(['open', 'in_progress', 'done']),
  },
  async ({ feedback_id, status }) => {
    await updateDoc(doc(db, 'photoresist_bundles', feedback_id), {
      status,
      updated_at: new Date().toISOString(),
    });
    return text(`Updated: ${feedback_id} → ${status}`);
  }
);

// --- Tool: get_sdk ---
server.tool(
  'get_sdk',
  { framework: z.enum(['vanilla', 'react', 'vue', 'nextjs']).optional().default('vanilla') },
  async ({ framework }) => {
    const baseCode = `// Photoresist Layer — Host SDK Integration
// This code enables rich context for Photoresist Layer extension.
// AI tools will understand your app's routes, components, and entities precisely.

// === OPTION A: Standalone (no npm install needed) ===
(function() {
  window.__PHOTORESIST_CONTEXT__ = function() {
    return {
      projectId: 'YOUR_PROJECT_NAME',
      routeName: document.title,
      locale: document.documentElement.lang || 'en',
      theme: document.body.classList.contains('dark') ? 'dark' : 'light',
    };
  };
  document.body.setAttribute('data-pr-layer', 'YOUR_PROJECT_NAME');
})();

// === OPTION B: With npm package ===
// npm install @photoresist/host-sdk
//
// import { PhotoresistHost } from '@photoresist/host-sdk';
// PhotoresistHost.init({ projectId: 'YOUR_PROJECT_NAME' });`;

    const frameworks: Record<string, string> = {
      react: `
// === React Integration ===
// Add to your App.tsx or layout component:

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom'; // or next/navigation

function usePhotoresist(projectId: string) {
  const location = useLocation();

  useEffect(() => {
    window.__PHOTORESIST_CONTEXT__ = () => ({
      projectId,
      routeName: location.pathname,
      locale: document.documentElement.lang || 'en',
      theme: document.body.classList.contains('dark') ? 'dark' : 'light',
    });
    document.body.setAttribute('data-pr-layer', projectId);
  }, [location.pathname]);
}

// Usage in App:
// usePhotoresist('my-project');`,

      vue: `
// === Vue Integration ===
// Add to your App.vue or main.ts:

import { watch } from 'vue';
import { useRoute } from 'vue-router';

export function usePhotoresist(projectId: string) {
  const route = useRoute();

  watch(() => route.path, (path) => {
    window.__PHOTORESIST_CONTEXT__ = () => ({
      projectId,
      routeName: path,
      locale: document.documentElement.lang || 'en',
    });
    document.body.setAttribute('data-pr-layer', projectId);
  }, { immediate: true });
}`,

      nextjs: `
// === Next.js Integration ===
// Add to your app/layout.tsx:

'use client';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export function PhotoresistProvider({ projectId }: { projectId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    window.__PHOTORESIST_CONTEXT__ = () => ({
      projectId,
      routeName: pathname,
      locale: document.documentElement.lang || 'en',
    });
    document.body.setAttribute('data-pr-layer', projectId);
  }, [pathname]);

  return null;
}

// Usage in layout.tsx:
// <PhotoresistProvider projectId="my-project" />`,

      vanilla: '',
    };

    const extra = frameworks[framework] || '';

    return text(baseCode + (extra ? '\n\n' + extra : '') + `

// === Mark specific components (optional) ===
// Add data attributes to important elements:
//   <button data-pr-component="cta-button" data-pr-action="add-to-cart">Buy</button>
//   <div data-pr-entity="product:SKU-123">...</div>
//   <section data-pr-label="Hero Banner">...</section>
//
// These help AI understand exactly which element the user is annotating.`);
  }
);

// --- Start ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🔌 Photoresist Layer MCP Server running');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
