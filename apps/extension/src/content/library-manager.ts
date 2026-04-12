// ============================================================
// Library Manager — CRUD, Tags, Search, Filter, View Mode
// ============================================================

export interface LibraryItem {
  id: string;
  type: 'screenshot' | 'pdf' | 'md' | 'txt' | 'uitb-scan';
  name: string;
  data_ref: string;       // base64 (screenshot) or text content
  tags: string[];          // tag IDs
  page_url: string;
  page_title: string;
  project: string;         // auto from URL domain or user-set
  created_at: string;
  size_bytes: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export const TAG_PRESETS: Tag[] = [
  { id: 'red',    color: '#ef4444', name: 'Red' },
  { id: 'orange', color: '#f97316', name: 'Orange' },
  { id: 'yellow', color: '#eab308', name: 'Yellow' },
  { id: 'green',  color: '#22c55e', name: 'Green' },
  { id: 'blue',   color: '#3b82f6', name: 'Blue' },
  { id: 'purple', color: '#8b5cf6', name: 'Purple' },
  { id: 'pink',   color: '#ec4899', name: 'Pink' },
  { id: 'cyan',   color: '#06b6d4', name: 'Cyan' },
  { id: 'gray',   color: '#6b7280', name: 'Gray' },
  { id: 'white',  color: '#ffffff', name: 'White' },
];

// ===== Storage Keys =====
const KEY_LIBRARY = 'pr_library';
const KEY_TAGS = 'pr_tags';
const KEY_VIEW = 'pr_library_view';

// ===== CRUD =====

export async function getLibraryItems(filter?: { tags?: string[]; search?: string }): Promise<LibraryItem[]> {
  const result = await chrome.storage.local.get(KEY_LIBRARY);
  let items: LibraryItem[] = result[KEY_LIBRARY] || [];

  if (filter?.tags && filter.tags.length > 0) {
    items = items.filter((item) => filter.tags!.some((t) => item.tags.includes(t)));
  }
  if (filter?.search) {
    const q = filter.search.toLowerCase();
    items = items.filter((item) =>
      item.name.toLowerCase().includes(q) ||
      item.page_title.toLowerCase().includes(q) ||
      item.project.toLowerCase().includes(q)
    );
  }
  return items;
}

export async function addLibraryItem(item: LibraryItem): Promise<void> {
  const result = await chrome.storage.local.get(KEY_LIBRARY);
  const items: LibraryItem[] = result[KEY_LIBRARY] || [];
  items.unshift(item);
  if (items.length > 100) items.length = 100;
  await chrome.storage.local.set({ [KEY_LIBRARY]: items });
}

export async function updateLibraryItem(id: string, updates: Partial<LibraryItem>): Promise<void> {
  const result = await chrome.storage.local.get(KEY_LIBRARY);
  const items: LibraryItem[] = result[KEY_LIBRARY] || [];
  const idx = items.findIndex((i) => i.id === id);
  if (idx >= 0) {
    items[idx] = { ...items[idx], ...updates };
    await chrome.storage.local.set({ [KEY_LIBRARY]: items });
  }
}

export async function deleteLibraryItem(id: string): Promise<void> {
  const result = await chrome.storage.local.get(KEY_LIBRARY);
  const items = (result[KEY_LIBRARY] || []).filter((i: LibraryItem) => i.id !== id);
  await chrome.storage.local.set({ [KEY_LIBRARY]: items });
}

export async function deleteLibraryItems(ids: string[]): Promise<void> {
  const idSet = new Set(ids);
  const result = await chrome.storage.local.get(KEY_LIBRARY);
  const items = (result[KEY_LIBRARY] || []).filter((i: LibraryItem) => !idSet.has(i.id));
  await chrome.storage.local.set({ [KEY_LIBRARY]: items });
}

// ===== Tags =====

export async function getTags(): Promise<Tag[]> {
  const result = await chrome.storage.local.get(KEY_TAGS);
  return result[KEY_TAGS] || [...TAG_PRESETS];
}

export async function createTag(name: string, color: string): Promise<Tag> {
  const tag: Tag = { id: `tag-${Date.now().toString(36)}`, name, color };
  const result = await chrome.storage.local.get(KEY_TAGS);
  const tags: Tag[] = result[KEY_TAGS] || [...TAG_PRESETS];
  tags.push(tag);
  await chrome.storage.local.set({ [KEY_TAGS]: tags });
  return tag;
}

export async function deleteTag(id: string): Promise<void> {
  const result = await chrome.storage.local.get(KEY_TAGS);
  const tags = (result[KEY_TAGS] || []).filter((t: Tag) => t.id !== id);
  await chrome.storage.local.set({ [KEY_TAGS]: tags });
}

// ===== Bulk Tag =====

export async function addTagToItems(ids: string[], tagId: string): Promise<void> {
  const result = await chrome.storage.local.get(KEY_LIBRARY);
  const items: LibraryItem[] = result[KEY_LIBRARY] || [];
  const idSet = new Set(ids);
  for (const item of items) {
    if (idSet.has(item.id) && !item.tags.includes(tagId)) {
      item.tags.push(tagId);
    }
  }
  await chrome.storage.local.set({ [KEY_LIBRARY]: items });
}

export async function removeTagFromItem(itemId: string, tagId: string): Promise<void> {
  const result = await chrome.storage.local.get(KEY_LIBRARY);
  const items: LibraryItem[] = result[KEY_LIBRARY] || [];
  const item = items.find((i) => i.id === itemId);
  if (item) {
    item.tags = item.tags.filter((t) => t !== tagId);
    await chrome.storage.local.set({ [KEY_LIBRARY]: items });
  }
}

// ===== View Mode =====

export async function getViewMode(): Promise<'list' | 'grid'> {
  const result = await chrome.storage.local.get(KEY_VIEW);
  return result[KEY_VIEW] || 'list';
}

export async function setViewMode(mode: 'list' | 'grid'): Promise<void> {
  await chrome.storage.local.set({ [KEY_VIEW]: mode });
}

// ===== Auto-naming =====

export function autoName(type: LibraryItem['type'], title: string, url: string): string {
  const ts = Date.now().toString(36).slice(-4);
  const domain = detectProject(url);
  switch (type) {
    case 'screenshot': return `${domain}-${ts}.png`;
    case 'pdf':        return shortTitle(title, 'pdf', ts);
    case 'md':         return shortTitle(title, 'md', ts);
    case 'txt':        return shortTitle(title, 'txt', ts);
    case 'uitb-scan':  return `scan-${domain}-${ts}.md`;
  }
}

function shortTitle(title: string, ext: string, ts: string): string {
  const clean = (title || 'feedback').replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF ]/g, '').trim();
  const short = clean.slice(0, 14) || 'feedback';
  return `${short}-${ts}.${ext}`;
}

// ===== Auto-project =====

export function detectProject(url: string): string {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return domain.split('.')[0];
  } catch {
    return 'unknown';
  }
}

// ===== Migration =====
// Convert old pr_screenshots + pr_exports → pr_library

export async function migrateIfNeeded(): Promise<void> {
  const result = await chrome.storage.local.get([KEY_LIBRARY, 'pr_screenshots', 'pr_exports']);

  // Already migrated
  if (result[KEY_LIBRARY] && result[KEY_LIBRARY].length > 0) return;

  const items: LibraryItem[] = [];
  const url = location.href;
  const title = document.title;

  // Migrate screenshots
  const oldScreenshots = result.pr_screenshots || [];
  for (const ss of oldScreenshots) {
    items.push({
      id: ss.id || `ss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      type: 'screenshot',
      name: autoName('screenshot', title, url),
      data_ref: ss.data_ref,
      tags: [],
      page_url: url,
      page_title: title,
      project: detectProject(url),
      created_at: new Date().toISOString(),
      size_bytes: Math.round((ss.data_ref?.length || 0) * 0.75),
    });
  }

  // Migrate exports
  const oldExports = result.pr_exports || [];
  for (const f of oldExports) {
    const type: LibraryItem['type'] = f.format === 'pdf' ? 'pdf' : f.format === 'md' ? 'md' : 'txt';
    items.push({
      id: f.id,
      type,
      name: f.name,
      data_ref: f.content,
      tags: [],
      page_url: url,
      page_title: title,
      project: detectProject(url),
      created_at: f.createdAt || new Date().toISOString(),
      size_bytes: new Blob([f.content || '']).size,
    });
  }

  if (items.length > 0) {
    await chrome.storage.local.set({ [KEY_LIBRARY]: items });
  }
}

// ===== Helper: create LibraryItem from screenshot =====

export function createScreenshotItem(dataRef: string, url: string, title: string): LibraryItem {
  const id = `ss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  return {
    id,
    type: 'screenshot',
    name: autoName('screenshot', title, url),
    data_ref: dataRef,
    tags: [],
    page_url: url,
    page_title: title,
    project: detectProject(url),
    created_at: new Date().toISOString(),
    size_bytes: Math.round(dataRef.length * 0.75),
  };
}

// ===== Helper: create LibraryItem from export =====

export function createExportItem(
  format: 'pdf' | 'md' | 'txt',
  name: string,
  content: string,
  url: string,
  title: string,
): LibraryItem {
  const id = `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  return {
    id,
    type: format,
    name,
    data_ref: content,
    tags: [],
    page_url: url,
    page_title: title,
    project: detectProject(url),
    created_at: new Date().toISOString(),
    size_bytes: new Blob([content]).size,
  };
}
