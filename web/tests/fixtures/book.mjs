// The original prototype data belongs only in regression fixtures now.
export const weeks = Array.from({ length: 28 }, (_, index) => ({
  id: `fixture-${index}`, href: `/weeks/fixture-${index}`, number: String(index + 1).padStart(2, "0"),
  title: "I don’t treat branding", period: Math.floor(index / 7),
  image: null, imageAlt: `Week ${index + 1}`,
}));
export const periods = ["Foundation", "Playgrounds  S1", "Personal Project", "Playgrounds  S2"].map((title, index) => ({
  title, firstIndex: index * 7, start: String(index * 7 + 1).padStart(2, "0"), end: String(index * 7 + 7).padStart(2, "0"),
  range: `Week ${index * 7 + 1}-${index * 7 + 7}`,
}));
export const book = { weeks, periods, firstWeekInPeriod: period => periods[period].firstIndex, periodForWeek: week => weeks[week].period };
