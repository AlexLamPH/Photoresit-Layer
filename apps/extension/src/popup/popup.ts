// ============================================================
// Module: Popup UI
// Part of: Cockpit (A) — Extension popup when clicking icon
// ============================================================

import type { RuntimeMode, MessageResponse } from '../shared/types';

const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-mode]');
const statusEl = document.getElementById('status')!;

// Get current mode from background
async function loadCurrentMode(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_MODE' }) as MessageResponse<RuntimeMode>;
  if (response.success && response.data) {
    updateUI(response.data);
  }
}

function updateUI(mode: RuntimeMode): void {
  statusEl.textContent = mode;
  modeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

// Mode button clicks
modeButtons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    const mode = btn.dataset.mode as RuntimeMode;
    const response = await chrome.runtime.sendMessage({ type: 'SET_MODE', mode }) as MessageResponse;
    if (response.success) {
      updateUI(mode);
    }
  });
});

loadCurrentMode();
