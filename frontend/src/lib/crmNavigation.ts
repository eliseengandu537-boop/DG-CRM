// Cross-module navigation helpers.
//
// The app is a single page (see app/page.tsx) that swaps modules based on a
// `currentPage` string, driven by the `navigation:page-change` window event.
// These helpers let one module deep-link into another and hand the destination
// a "focus target" it can pick up when it mounts (e.g. open the Map on a
// specific property, or open Property Funds on a specific company).

export type NavFocusKind = 'company' | 'fund' | 'property';

export interface NavFocus {
  kind: NavFocusKind;
  id?: string;
  name?: string;
}

const FOCUS_KEY = 'crm:navFocus';

// Page names must match the AppPage values in lib/pageAccess.ts
// (e.g. 'Maps', 'Property Funds', 'Leasing', 'Sales', 'Auction').

/** Switch the app to `page`, optionally carrying a focus target for it. */
export function navigateToPage(page: string, focus?: NavFocus): void {
  if (focus) {
    try {
      sessionStorage.setItem(FOCUS_KEY, JSON.stringify(focus));
    } catch {
      /* sessionStorage unavailable — navigation still works without focus */
    }
  }
  window.dispatchEvent(
    new CustomEvent('navigation:page-change', { detail: { page } })
  );
}

/**
 * Read and clear the pending focus target. Call this once when the destination
 * module mounts; returns null if there is nothing pending or it is for another
 * kind of destination.
 */
export function consumeNavFocus(expectedKind?: NavFocusKind): NavFocus | null {
  try {
    const raw = sessionStorage.getItem(FOCUS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NavFocus;
    if (expectedKind && parsed.kind !== expectedKind) return null;
    sessionStorage.removeItem(FOCUS_KEY);
    return parsed;
  } catch {
    return null;
  }
}

/** Look at the pending focus target without clearing it. */
export function peekNavFocus(): NavFocus | null {
  try {
    const raw = sessionStorage.getItem(FOCUS_KEY);
    return raw ? (JSON.parse(raw) as NavFocus) : null;
  } catch {
    return null;
  }
}
