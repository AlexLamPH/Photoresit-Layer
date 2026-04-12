// ============================================================
// Module F: Comms Tower — Cloud Sync
//
// Firebase Auth (anonymous) + Firestore (metadata) + GCS (assets)
// Handles: auth, upload bundle, upload screenshots, retry
// ============================================================

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadString,
  getDownloadURL,
  type FirebaseStorage,
} from 'firebase/storage';
import type { FeedbackBundle, Screenshot } from '@photoresist/schema';
import { firebaseConfig } from './firebase-config';

// --- Singleton ---
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let userId: string | null = null;
let initPromise: Promise<void> | null = null;

// --- Initialize Firebase (lazy, once) ---
function ensureInit(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = new Promise<void>((resolve, reject) => {
    try {
      app = initializeApp(firebaseConfig);
      auth = getAuth(app);
      db = getFirestore(app);
      storage = getStorage(app);

      // Anonymous sign-in
      signInAnonymously(auth)
        .then(() => {
          onAuthStateChanged(auth!, (user) => {
            userId = user?.uid ?? null;
            if (userId) {
              console.log('[Photoresist] Firebase auth OK, uid:', userId);
              resolve();
            }
          });
        })
        .catch((err) => {
          console.error('[Photoresist] Firebase auth failed:', err);
          reject(err);
        });
    } catch (err) {
      console.error('[Photoresist] Firebase init failed:', err);
      reject(err);
    }
  });

  return initPromise;
}

// --- Flatten nested arrays for Firestore (doesn't support arrays-in-arrays) ---
function flattenForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => flattenForFirestore(item));
  }
  if (typeof obj === 'object' && obj.constructor === Object) {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value) && value.some(Array.isArray)) {
        // Nested array → convert to JSON string
        result[key] = JSON.stringify(value);
      } else if (Array.isArray(value) && value.some((v) => Array.isArray(v))) {
        result[key] = JSON.stringify(value);
      } else if (key === 'classes' && Array.isArray(value)) {
        // classes array inside dom_context inside annotations array → flatten to string
        result[key] = (value as string[]).join(' ');
      } else if (key === 'points' && Array.isArray(value) && value.length > 0 && Array.isArray(value[0])) {
        // [[x,y], [x,y]] → JSON string
        result[key] = JSON.stringify(value);
      } else {
        result[key] = flattenForFirestore(value);
      }
    }
    return result;
  }
  return obj;
}

// --- Upload Bundle to Cloud ---
export async function uploadBundle(bundle: FeedbackBundle): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureInit();
    if (!db || !storage || !userId) {
      return { success: false, error: 'Firebase not initialized' };
    }

    // 1. Upload screenshots to GCS, replace data_ref with download URLs
    const uploadedScreenshots = await uploadScreenshots(bundle.screenshots, bundle.feedback_id);

    // 2. Create bundle metadata — flatten nested arrays for Firestore
    const metadata = flattenForFirestore({
      ...bundle,
      screenshots: uploadedScreenshots.map((ss) => ({
        ...ss,
        data_ref: ss.data_ref,
      })),
      uploaded_by: userId,
      uploaded_at: serverTimestamp(),
    });

    // 3. Save to Firestore
    const docRef = doc(collection(db, 'photoresist_bundles'), bundle.feedback_id);
    await setDoc(docRef, metadata);

    console.log(`[Photoresist] Bundle uploaded: ${bundle.feedback_id}`);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Photoresist] Upload failed:', msg);
    return { success: false, error: msg };
  }
}

// --- Upload Screenshots to GCS ---
async function uploadScreenshots(screenshots: Screenshot[], feedbackId: string): Promise<Screenshot[]> {
  if (!storage) return screenshots;

  const results: Screenshot[] = [];

  for (const ss of screenshots) {
    try {
      // Only upload base64 data (data: URLs)
      if (!ss.data_ref.startsWith('data:')) {
        results.push(ss);
        continue;
      }

      const path = `photoresist/${feedbackId}/${ss.id}.png`;
      const storageRef = ref(storage, path);

      // Upload base64 string
      await uploadString(storageRef, ss.data_ref, 'data_url');

      // Get download URL
      const downloadUrl = await getDownloadURL(storageRef);

      results.push({ ...ss, data_ref: downloadUrl });
      console.log(`[Photoresist] Screenshot uploaded: ${ss.id}`);
    } catch (err) {
      console.error(`[Photoresist] Screenshot upload failed: ${ss.id}`, err);
      // Keep original data_ref if upload fails
      results.push(ss);
    }
  }

  return results;
}

// --- Check connection status ---
export function isCloudReady(): boolean {
  return userId !== null;
}
