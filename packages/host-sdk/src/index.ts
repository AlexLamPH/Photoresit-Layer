// ============================================================
// @photoresist/host-sdk — Host Adapter SDK
// Module H: Adapter Ring
//
// Cosmos apps add this SDK to provide rich context
// to Photoresist Layer extension.
//
// Usage in any Cosmos project:
//   import { PhotoresistHost } from '@photoresist/host-sdk';
//   PhotoresistHost.init({ projectId: 'hirono-shop', ... });
// ============================================================

export interface PhotoresistHostConfig {
  /** Project identifier (e.g., 'hirono-shop', 'multi-ai') */
  projectId: string;

  /** Current route/page name */
  routeName?: string;

  /** Current locale (e.g., 'vi', 'en') */
  locale?: string;

  /** Current theme (e.g., 'dark', 'light', 'midnight-gallery') */
  theme?: string;

  /** Layer type of the current view */
  layerType?: 'page' | 'modal' | 'drawer' | 'chatbox' | 'panel';

  /** Dynamic context provider — called by extension on each annotation */
  contextProvider?: () => DynamicContext;
}

export interface DynamicContext {
  /** Current route/page (may change as user navigates) */
  routeName?: string;

  /** Current entity being viewed (e.g., product ID, order ID) */
  entityId?: string;

  /** Current component in focus */
  componentId?: string;

  /** Current modal/drawer state */
  layerType?: 'page' | 'modal' | 'drawer' | 'chatbox' | 'panel';

  /** Any additional metadata */
  meta?: Record<string, string>;
}

// --- Global state ---
let config: PhotoresistHostConfig | null = null;

// --- Public API ---
export const PhotoresistHost = {
  /**
   * Initialize host adapter. Call once on app startup.
   *
   * @example
   * PhotoresistHost.init({
   *   projectId: 'hirono-shop',
   *   routeName: 'product-detail',
   *   locale: 'vi',
   *   theme: 'dark',
   * });
   */
  init(cfg: PhotoresistHostConfig): void {
    config = cfg;

    // Expose global hook for extension to read
    (window as any).__PHOTORESIST_CONTEXT__ = () => {
      const dynamic = config?.contextProvider?.() ?? {};
      return {
        projectId: config?.projectId,
        routeName: dynamic.routeName ?? config?.routeName,
        entityId: dynamic.entityId,
        componentId: dynamic.componentId,
        locale: config?.locale,
        theme: config?.theme,
        layerType: dynamic.layerType ?? config?.layerType,
        meta: dynamic.meta,
      };
    };

    // Set data-pr-layer attribute on body
    document.body.setAttribute('data-pr-layer', cfg.projectId);

    console.log(`[Photoresist Host] Initialized: ${cfg.projectId}`);
  },

  /**
   * Update route context (call on navigation).
   *
   * @example
   * // In your router:
   * PhotoresistHost.setRoute('product-detail', { entityId: 'product-123' });
   */
  setRoute(routeName: string, opts?: { entityId?: string; layerType?: DynamicContext['layerType'] }): void {
    if (!config) return;
    config.routeName = routeName;
    if (opts?.entityId) {
      config.contextProvider = () => ({
        routeName,
        entityId: opts.entityId,
        layerType: opts.layerType,
      });
    }
  },

  /**
   * Mark a DOM element as a Photoresist component.
   * Extension will read this metadata when user annotates near it.
   *
   * @example
   * PhotoresistHost.markComponent(buttonEl, 'cta-button', 'add-to-cart');
   */
  markComponent(element: HTMLElement, componentId: string, action?: string): void {
    element.setAttribute('data-pr-component', componentId);
    if (action) element.setAttribute('data-pr-action', action);
  },

  /**
   * Mark a DOM element as an entity reference.
   *
   * @example
   * PhotoresistHost.markEntity(productCard, 'product', 'SKU-12345');
   */
  markEntity(element: HTMLElement, entityType: string, entityId: string): void {
    element.setAttribute('data-pr-entity', `${entityType}:${entityId}`);
  },

  /**
   * Add a label to any element (shows in extension inspect).
   *
   * @example
   * PhotoresistHost.label(heroSection, 'Hero Banner - Summer Campaign');
   */
  label(element: HTMLElement, text: string): void {
    element.setAttribute('data-pr-label', text);
  },

  /**
   * Get current config (for debugging).
   */
  getConfig(): PhotoresistHostConfig | null {
    return config;
  },
};

// --- Auto-detect if Photoresist extension is present ---
// Extension injects #photoresist-layer-root into the page
export function isExtensionActive(): boolean {
  return !!document.getElementById('photoresist-layer-root');
}
