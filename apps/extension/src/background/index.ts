// ============================================================
// Module: Background Service Worker (MV3)
// Part of: Cockpit (A) + Camera Bay (D)
//
// Responsibilities:
// - Track runtime mode per tab
// - Handle screenshot capture (captureVisibleTab)
// - Keep-alive management for MV3 lifecycle
// ============================================================

import type { RuntimeMode, MessageResponse } from '../shared/types';

// --- State ---
const tabModes = new Map<number, RuntimeMode>();

// --- Message Handler ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message.type) {
    case 'GET_MODE': {
      const mode = tabId ? (tabModes.get(tabId) ?? 'browse') : 'browse';
      sendResponse({ success: true, data: mode } satisfies MessageResponse<RuntimeMode>);
      return false;
    }

    case 'SET_MODE': {
      if (tabId && message.mode) {
        tabModes.set(tabId, message.mode);
        // Notify content script of mode change
        chrome.tabs.sendMessage(tabId, { type: 'MODE_CHANGED', mode: message.mode });
      }
      sendResponse({ success: true } satisfies MessageResponse);
      return false;
    }

    case 'CAPTURE_TAB': {
      // Async — must return true to keep sendResponse alive
      handleCaptureTab(sender.tab?.id).then(
        (dataUrl) => sendResponse({ success: true, data: dataUrl } satisfies MessageResponse<string>),
        (err) => sendResponse({ success: false, error: String(err) } satisfies MessageResponse)
      );
      return true; // keeps message channel open for async response
    }

    case 'BRIDGE_SEND': {
      // Forward bundle to local bridge (background SW has no CSP restrictions)
      fetch('http://127.0.0.1:9471/v1/bundles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message.bundle),
      })
        .then((r) => {
          if (r.ok) console.log('[Photoresist] Bridge: bundle sent');
          else console.warn('[Photoresist] Bridge: failed', r.status);
        })
        .catch(() => { /* Bridge not running — OK */ });
      sendResponse({ success: true } satisfies MessageResponse);
      return false;
    }

    case 'KEEP_ALIVE': {
      sendResponse({ success: true } satisfies MessageResponse);
      return false;
    }

    default:
      sendResponse({ success: false, error: 'Unknown message type' } satisfies MessageResponse);
      return false;
  }
});

// --- Screenshot Capture ---
async function handleCaptureTab(tabId: number | undefined): Promise<string> {
  if (!tabId) throw new Error('No tab ID for capture');

  const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
    format: 'png',
  });

  return dataUrl;
}

// --- Tab Cleanup ---
chrome.tabs.onRemoved.addListener((tabId) => {
  tabModes.delete(tabId);
});

// --- Extension Icon Click (toggle mode) ---
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const current = tabModes.get(tab.id) ?? 'browse';
  const next: RuntimeMode = current === 'browse' ? 'inspect' : 'browse';
  tabModes.set(tab.id, next);
  chrome.tabs.sendMessage(tab.id, { type: 'MODE_CHANGED', mode: next });
});

console.log('[Photoresist] Background service worker loaded');
