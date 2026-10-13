"use client";

import type { ReactNode } from "react";
import { useSmoothCorners } from "./use-smooth-corners";
import styles from "./week-page.module.css";

export function WeekCover({ children }: { children: ReactNode }) {
  const root = useSmoothCorners();
  return <figure ref={root} className={styles.coverFrame}>
    <div className={styles.cover} data-smooth-corners="0.6">{children}</div>
  </figure>;
}
