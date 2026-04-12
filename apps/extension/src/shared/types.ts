// ============================================================
// Shared types between background, content, and popup
// ============================================================

export type RuntimeMode = 'browse' | 'inspect' | 'annotate';

/** Messages between content script ↔ background service worker */
export type MessageType =
  | { type: 'GET_MODE' }
  | { type: 'SET_MODE'; mode: RuntimeMode }
  | { type: 'MODE_CHANGED'; mode: RuntimeMode }
  | { type: 'CAPTURE_TAB' }
  | { type: 'CAPTURE_RESULT'; dataUrl: string }
  | { type: 'KEEP_ALIVE' };

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
