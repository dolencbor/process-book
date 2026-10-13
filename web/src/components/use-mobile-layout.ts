"use client";

import { useSyncExternalStore } from "react";

const query = "(max-width: 700px)";
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => false;

export function useMobileLayout() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
