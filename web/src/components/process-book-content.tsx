"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ProcessBookContent } from "@/sanity/lib/process-book";

type BookContext = ProcessBookContent & {
  firstWeekInPeriod: (period: number) => number | null;
  periodForWeek: (week: number) => number;
};
const ContentContext = createContext<BookContext | null>(null);

export function ProcessBookProvider({ content, children }: { content: ProcessBookContent; children: ReactNode }) {
  const value = useMemo<BookContext>(() => ({
    ...content,
    firstWeekInPeriod: period => content.periods[period]?.firstIndex ?? null,
    periodForWeek: week => content.weeks[week]?.period ?? 0,
  }), [content]);
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useProcessBookContent() {
  const content = useContext(ContentContext);
  if (!content) throw new Error("Process Book content provider is missing");
  return content;
}
