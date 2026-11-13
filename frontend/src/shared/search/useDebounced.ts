import { useEffect, useState } from 'react';

/** Wert erst nach `ms` Ruhe übernehmen (Eingabefelder mit Suche). */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
