// ============================================================
// Module F2: History Tower — Feedback History + Status Flow
//
// Track feedback lifecycle: open → in_progress → done
// Store history in Firestore, display in extension
// ============================================================

import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  updateDoc,
} from 'firebase/firestore';

export interface FeedbackHistoryItem {
  feedback_id: string;
  page_url: string;
  page_title: string;
  status: 'open' | 'in_progress' | 'done';
  annotations_count: number;
  screenshots_count: number;
  intent_summary: string;
  created_at: string;
  updated_at: string;
}

// --- Fetch recent feedback history from Firestore ---
export async function getHistory(maxItems = 20): Promise<FeedbackHistoryItem[]> {
  try {
    const db = getFirestore();
    const q = query(
      collection(db, 'photoresist_bundles'),
      orderBy('created_at', 'desc'),
      limit(maxItems)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((d) => {
      const data = d.data();
      return {
        feedback_id: d.id,
        page_url: data.page_url || '',
        page_title: data.page_title || '',
        status: data.status || 'open',
        annotations_count: data.annotations?.length || 0,
        screenshots_count: data.screenshots?.length || 0,
        intent_summary: data.intent_summary || '',
        created_at: data.created_at || '',
        updated_at: data.updated_at || '',
      };
    });
  } catch (err) {
    console.error('[Photoresist] History fetch failed:', err);
    return [];
  }
}

// --- Update feedback status ---
export async function updateFeedbackStatus(
  feedbackId: string,
  status: 'open' | 'in_progress' | 'done'
): Promise<boolean> {
  try {
    const db = getFirestore();
    const docRef = doc(db, 'photoresist_bundles', feedbackId);
    await updateDoc(docRef, {
      status,
      updated_at: new Date().toISOString(),
    });
    console.log(`[Photoresist] Status updated: ${feedbackId} → ${status}`);
    return true;
  } catch (err) {
    console.error('[Photoresist] Status update failed:', err);
    return false;
  }
}

// --- Format time ago ---
export function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// --- Status badge color ---
export function statusColor(status: string): string {
  switch (status) {
    case 'open': return '#f97316'; // orange
    case 'in_progress': return '#3b82f6'; // blue
    case 'done': return '#22c55e'; // green
    default: return '#6b7280'; // gray
  }
}
