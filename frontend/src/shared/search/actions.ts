import { useEffect, useRef } from 'react';
import { create } from 'zustand';

/**
 * Aktionen, die eine Seite dem Befehlsfeld (Strg+K) und den Tastenkürzeln anbietet.
 * Eine Seite meldet sich mit `useRegisterAction` an, solange sie die Aktion kann; beim Verlassen
 * der Seite verschwindet der Befehl wieder aus dem Feld.
 */
export type ActionId =
  | 'new-item' | 'save' | 'review' | 'graph'
  | 'view-table' | 'view-list'
  | 'import' | 'export' | 'pdf' | 'ask';

interface ActionStore {
  handlers: Partial<Record<ActionId, () => void>>;
  register: (id: ActionId, fn: () => void) => void;
  unregister: (id: ActionId, fn: () => void) => void;
}

export const useActionStore = create<ActionStore>((set) => ({
  handlers: {},
  register: (id, fn) => set((s) => ({ handlers: { ...s.handlers, [id]: fn } })),
  unregister: (id, fn) =>
    set((s) => {
      if (s.handlers[id] !== fn) return s;
      const { [id]: _removed, ...rest } = s.handlers;
      return { handlers: rest };
    }),
}));

/** Meldet eine Aktion an (`enabled` false = nicht anbieten). Der Handler darf sich bei jedem Render ändern. */
export function useRegisterAction(id: ActionId, handler: () => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const fn = () => ref.current();
    useActionStore.getState().register(id, fn);
    return () => useActionStore.getState().unregister(id, fn);
  }, [id, enabled]);
}
