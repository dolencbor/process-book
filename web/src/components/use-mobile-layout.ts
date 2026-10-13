"use client";

import { useSyncExternalStore } from "react";

const query = "(max-width: 700px)";
let mediaQuery: MediaQueryList | null = null;
const getMediaQuery = () => mediaQuery ??= window.matchMedia(query);
const subscribe = (notify: () => void) => {
  const media = getMediaQuery();
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const snapshot = () => getMediaQuery().matches;
const serverSnapshot = () => false;

export function useMobileLayout() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
