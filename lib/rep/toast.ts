// Tiny toast pub/sub so any client component can raise a toast that the single
// ToastHost (mounted in the rep layout) renders. Module-level so there is no
// provider to thread through the tree.

export interface Toast {
  id: number;
  text: string;
}

type Listener = (t: Toast) => void;

const listeners = new Set<Listener>();
let seq = 0;

export function showToast(text: string): void {
  const t: Toast = { id: ++seq, text };
  listeners.forEach((l) => l(t));
}

export function subscribeToasts(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
