import type { PROCESS_BOOK_QUERY_RESULT } from "../../../sanity.types";
import { urlFor } from "./image";

export const periodDefinitions = [
  { key: "foundation", title: "Foundation" },
  { key: "playgrounds-one", title: "Playgrounds  S1" },
  { key: "personal-project", title: "Personal Project" },
  { key: "playgrounds-two", title: "Playgrounds  S2" },
] as const;

export type ProcessWeek = {
  id: string; href: string; number: string; title: string; period: number;
  image: string | null; imageAlt: string;
};
export type ProcessPeriod = {
  title: string; firstIndex: number | null; start: string | null; end: string | null; range: string;
};
export type ProcessBookContent = { weeks: ProcessWeek[]; periods: ProcessPeriod[] };

export function createProcessBookContent(data: PROCESS_BOOK_QUERY_RESULT): ProcessBookContent {
  const categories = new Map(data.categories.map(category => [category._id, category]));
  const entries = data.posts.flatMap(entry => {
    const category = entry.categoryId ? categories.get(entry.categoryId) : undefined;
    const period = periodDefinitions.findIndex(definition => definition.key === category?.key);
    if (period < 0 || !Number.isInteger(entry.weekNumber) || (entry.weekNumber ?? 0) < 1) return [];
    return [{ entry, period }];
  }).sort((a, b) => a.period - b.period || a.entry.weekNumber! - b.entry.weekNumber! || a.entry._id.localeCompare(b.entry._id));
  const weeks = entries.map(({ entry, period }): ProcessWeek => ({
    id: entry._id,
    href: `/weeks/${encodeURIComponent(entry._id)}`,
    number: String(entry.weekNumber).padStart(2, "0"),
    title: entry.title?.trim() || "Untitled week",
    period,
    image: entry.coverImage?.asset ? urlFor(entry.coverImage).width(1060).height(1060).fit("crop").auto("format").quality(85).url() : null,
    imageAlt: entry.coverImage?.alt?.trim() || `Visual study for week ${entry.weekNumber}`,
  }));
  const periods = periodDefinitions.map((definition, period): ProcessPeriod => {
    const category = data.categories.find(category => category.key === definition.key);
    const firstIndex = weeks.findIndex(week => week.period === period);
    const periodWeeks = weeks.filter(week => week.period === period);
    const start = periodWeeks[0]?.number ?? null;
    const end = periodWeeks.at(-1)?.number ?? null;
    return {
      title: category?.title?.trim() || definition.title,
      firstIndex: firstIndex < 0 ? null : firstIndex,
      start, end,
      range: start && end ? `Week ${Number(start)}-${Number(end)}` : "No weeks",
    };
  });
  return { weeks, periods };
}
