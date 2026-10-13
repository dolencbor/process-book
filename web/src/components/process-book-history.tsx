"use client";

import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { ProcessWeek } from "@/sanity/lib/process-book";

export type ListLocation = { weekId: string; offset: number };
export type BookPosition = {
  view: "scroll" | "table";
  weekId: string;
  selected: number;
  list: ListLocation | null;
};
type PositionStore = {
  position: BookPosition | null;
  setPosition: Dispatch<SetStateAction<BookPosition | null>>;
};

const storageKey = "process-book-position-v1";
const PositionContext = createContext<PositionStore | null>(null);

function readSavedPosition(): BookPosition | null {
  if (typeof window === "undefined" || !window.location.pathname.startsWith("/weeks/")) return null;
  try {
    const value = window.sessionStorage.getItem(storageKey);
    return value ? JSON.parse(value) as BookPosition : null;
  } catch {
    return null;
  }
}

export function saveBookPosition(position: BookPosition) {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(position));
  } catch {
    // In-memory history still restores normal client-side Back navigation.
  }
}

export function resolveBookPosition(saved: BookPosition | null, weeks: ProcessWeek[]) {
  const week = saved ? weeks.findIndex(entry => entry.id === saved.weekId) : -1;
  if (!saved || week < 0) return { view: "scroll" as const, week: 0, selected: weeks[0]?.period ?? 0, list: null, restored: false };
  const listWeek = saved.list ? weeks.findIndex(entry => entry.id === saved.list?.weekId) : -1;
  return {
    view: saved.view === "table" ? "table" as const : "scroll" as const,
    week,
    selected: Number.isInteger(saved.selected) && saved.selected >= 0 && saved.selected < 4 ? saved.selected : weeks[week].period,
    list: listWeek >= 0 && Number.isFinite(saved.list?.offset)
      ? { week: listWeek, offset: Math.max(0, Math.min(1, saved.list!.offset)) } : null,
    restored: true,
  };
}

export function ProcessBookHistoryProvider({ children }: { children: ReactNode }) {
  const [position, setPosition] = useState<BookPosition | null>(readSavedPosition);
  const value = useMemo(() => ({ position, setPosition }), [position]);
  return <PositionContext.Provider value={value}>{children}</PositionContext.Provider>;
}

export function useProcessBookHistory() {
  const position = useContext(PositionContext);
  if (!position) throw new Error("Process Book history provider is missing");
  return position;
}
