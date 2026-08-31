"use client";

import { useEffect, useState } from "react";

// localStorage isn't available during SSR, so the initial render always uses
// defaultValue and this effect syncs in the persisted value once mounted on
// the client — the standard "read an external system on mount" exception to
// the set-state-in-effect rule.
export function useLocalStorageState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from localStorage on mount, SSR-unavailable
      if (raw != null) setValue(JSON.parse(raw));
    } catch {
      // ignore malformed/inaccessible storage
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore quota/access errors
    }
  }, [key, value, hydrated]);

  return [value, setValue] as const;
}
