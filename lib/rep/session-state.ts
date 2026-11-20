// Per-device rep session state that lives only in the browser (the design's
// "saves on this phone" model): which prospects were skipped today, and a
// one-shot toast handed from one page to the next across a navigation.
// Every access is guarded so private mode / blocked storage never throws.

const todayKey = () => new Date().toISOString().slice(0, 10);
const SKIP_KEY = () => `upfit:skipped:${todayKey()}`;
const TOAST_KEY = "upfit:toast";

export function getSkipped(): Set<string> {
  try {
    const raw = localStorage.getItem(SKIP_KEY());
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export function markSkipped(companyId: string): void {
  try {
    const set = getSkipped();
    set.add(companyId);
    localStorage.setItem(SKIP_KEY(), JSON.stringify([...set]));
  } catch {
    /* storage unavailable — skip state is best-effort */
  }
}

/** Queue a toast to show after the next navigation (read once by the ToastHost). */
export function queueToast(text: string): void {
  try {
    sessionStorage.setItem(TOAST_KEY, text);
  } catch {
    /* ignore */
  }
}

/** Read and clear a queued toast, if any. */
export function takeToast(): string | null {
  try {
    const t = sessionStorage.getItem(TOAST_KEY);
    if (t) sessionStorage.removeItem(TOAST_KEY);
    return t;
  } catch {
    return null;
  }
}
