"use client";

import { animate, AnimatePresence, motion, MotionConfig, useIsPresent, useMotionValue, useMotionValueEvent, useReducedMotion, useSpring, useTransform, type HTMLMotionProps, type MotionValue, type Transition } from "motion/react";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode, type TouchEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { preload } from "react-dom";
import styles from "./process-book.module.css";
import { useSmoothCorners } from "./use-smooth-corners";
import { useTabWidths } from "./use-tab-widths";
import { useMobileLayout } from "./use-mobile-layout";
import { SwitcherSurface, switcherClip } from "./switcher-surface";
import { ProcessBookProvider, useProcessBookContent } from "./process-book-content";
import { resolveBookPosition, saveBookPosition, useProcessBookHistory, type ListLocation } from "./process-book-history";
import type { ProcessBookContent } from "@/sanity/lib/process-book";

const MotionLink = motion.create(Link);

const interfaceTransition = { type: "tween", duration: 0.68, ease: [0.22, 1, 0.36, 1] } satisfies Transition;
const mobileRowHighlightTransition = { ...interfaceTransition, duration: 0.16 } satisfies Transition;
const mobileRowPreviewTransition = { ...interfaceTransition, duration: 0.24 } satisfies Transition;
// Tab controls always use finite tweens: no inherited spring or momentum.
const tabResizeTransition = { ...interfaceTransition, type: "tween" } satisfies Transition;
const instantTabTransition = { type: "tween", duration: 0 } satisfies Transition;
const switcherTransition = { ...tabResizeTransition, duration: 0.3 } satisfies Transition;
const switcherContentTransition = { type: "tween", duration: 0.3, ease: [0.25, 0.1, 0.35, 1] } satisfies Transition;
// Recreate the public custom-content cursor's expanding pill with open Motion
// primitives. Pointer following, shape changes, and content reveal are separate.
const exploreCursorSpring = { stiffness: 700, damping: 40, mass: 0.5 };
const exploreCursorShapeTransition = { type: "spring", stiffness: 500, damping: 32, mass: 0.6 } satisfies Transition;
const exploreCursorContentTransition = { type: "tween", ease: "easeOut", duration: 0.12 } satisfies Transition;
const railTextTransition = { ...interfaceTransition, duration: 0.36 } satisfies Transition;
const screenTransition = { ...interfaceTransition, duration: 1 } satisfies Transition;
const revealStep = 0.12;

// Shared endpoints make an interrupted entrance/exit reverse from its current state.
function screenReveal(reducedMotion: boolean | null, offset: number | string, enterDelay = 0, exitDelay = 0, mask = false) {
  const transition = (delay: number): Transition => reducedMotion ? { duration: 0, delay: 0 } : { ...interfaceTransition, delay };
  const hidden = { y: reducedMotion ? 0 : offset, opacity: 0, ...(mask ? { clipPath: "inset(100% 0% 0% 0%)" } : {}) };
  return {
    enter: { ...hidden, transition: transition(0) },
    visible: { y: 0, opacity: 1, ...(mask ? { clipPath: "inset(0% 0% 0% 0%)" } : {}), transition: transition(enterDelay) },
    exit: { ...hidden, transition: transition(exitDelay) },
  };
}

const screenStates = { enter: {}, visible: {}, exit: {} };

function ScreenPanel({ left, label, startVisible, children }: { left: string; label: string; startVisible?: boolean; children: ReactNode }) {
  const present = useIsPresent();
  return <motion.section className={styles.screenPanel} style={{ left }} aria-label={label}
    aria-hidden={!present} inert={!present} variants={screenStates} initial={startVisible ? false : "enter"} animate="visible" exit="exit">
    {children}
  </motion.section>;
}

const ViewSwitcher = memo(function ViewSwitcher({ view, onViewChange, startVisible }: { view: "scroll" | "table"; onViewChange: (view: "scroll" | "table") => void; startVisible?: boolean }) {
  const present = useIsPresent();
  const reducedMotion = useReducedMotion();
  return <motion.div className={styles.viewToggle} data-smooth-corners="0.6" data-smooth-surface style={{ clipPath: switcherClip }} role="group" aria-label="View mode"
    aria-hidden={!present} inert={!present} variants={screenReveal(reducedMotion, 16, revealStep * 3)}
    initial={startVisible ? false : "enter"} animate="visible" exit="exit">
    <SwitcherSurface className={styles.switcherSurface} />
    {/* Translate one persistent handle directly between its two endpoints.
        Avoid layout projection and spring settling on interrupted changes. */}
    <motion.span aria-hidden layout={false}
      className={styles.activeView} data-smooth-corners="0.6" data-smooth-surface initial={false}
      animate={{ x: view === "table" ? 96 : 0 }}
      transition={{ x: reducedMotion ? instantTabTransition : switcherTransition }}>
      <SwitcherSurface active className={styles.switcherSurface} />
    </motion.span>
    {(["scroll", "table"] as const).map(mode => <button key={mode} type="button" data-view={mode} data-smooth-corners="0.6"
      aria-pressed={view === mode} onClick={() => onViewChange(mode)}>
      <motion.span className={styles.viewLabel} initial={false}
        animate={{ color: view === mode ? "#f6f6f6" : "#808080" }}
        transition={reducedMotion ? { duration: 0 } : switcherContentTransition}>
        <span className={styles.viewIcon} aria-hidden>
          <motion.span initial={false} animate={{ opacity: view === mode ? 0 : 1 }} transition={reducedMotion ? { duration: 0 } : switcherContentTransition}>
            <Image unoptimized src={`/design/${mode}-inactive.svg`} width={14} height={14} alt="" />
          </motion.span>
          <motion.span initial={false} animate={{ opacity: view === mode ? 1 : 0 }} transition={reducedMotion ? { duration: 0 } : switcherContentTransition}>
            <Image unoptimized src={`/design/${mode}-active.svg`} width={14} height={14} alt="" />
          </motion.span>
        </span>
        <span className={styles.viewText}>{mode === "scroll" ? "Scroll" : "List"}</span>
      </motion.span>
    </button>)}
  </motion.div>;
});

// Both directions share a slower, almost critically damped response and landing.
const railSpring = { type: "spring", stiffness: 620, damping: 40, mass: 0.7, restDelta: 0.001, restSpeed: 0.01 } satisfies Transition;
const railSnapSpring = { ...railSpring, stiffness: 300, damping: 32, mass: 0.85 } satisfies Transition;
const railSwipeVelocityLimit = 0.75 * Math.sqrt(railSnapSpring.stiffness / railSnapSpring.mass);
const railMomentumPower = 0.18;
const railMomentumTransition = { type: "inertia", power: railMomentumPower, timeConstant: 160, restDelta: 0.005 } satisfies Transition;

// A soft limit keeps the card train tactile without selecting another week mid-drag.
const resistedRailOffset = (fingerY: number, step: number) => Math.tanh(-fingerY / step * 0.75) * 0.42;
const projectedRailTarget = (base: number, projected: number, direction: number, count: number) => {
  const maxSteps = Math.min(3, count - 1);
  if (maxSteps <= 0) return base;
  const steps = Math.min(maxSteps, Math.max(1, Math.round(Math.max(0, (projected - base) * direction))));
  return base + direction * steps;
};

const categories = [
  { name: "Foundation", icon: "foundation", color: "#000000", ink: "#f6f6f6", tabWidth: 113, labelWidth: 63, iconGap: 10 },
  { name: "Playgrounds  S1", icon: "playgrounds-one", color: "#ff00ff", ink: "#ffffff", tabWidth: 140, labelWidth: 90, iconGap: 10 },
  { name: "Personal Project", icon: "personal-project", color: "#22e300", ink: "#0a0a0a", tabWidth: 141, labelWidth: 91, iconGap: 10 },
  { name: "Playgrounds  S2", icon: "playgrounds-two", color: "#ff00ff", ink: "#ffffff", tabWidth: 142, labelWidth: 90, iconGap: 12 },
] as const;
const periodRangeWidth = (period: number, ranges?: string[]) => {
  const digits = ranges?.[period]?.replace(/[^0-9]/g, "").length;
  return digits === undefined ? (period === 0 ? 55 : period === 1 ? 64 : 72)
    : digits <= 2 ? 55 : digits === 3 ? 64 : 72 + Math.max(0, digits - 4) * 8;
};

type TabSize = "large" | "medium" | "small";
const tabContentGap = 16;
const tabNavigationTransition = (distance: number): Transition => ({
  ...interfaceTransition,
  duration: Math.min(2.8, interfaceTransition.duration + Math.abs(distance) * 0.08),
});

// Use the actual space available, including the title-only widths from Figma.
function getTabSizes(width: number, selected: number, ranges?: string[]): TabSize[] {
  const available = Math.max(0, width - (categories.length - 1) * 4);
  // Mobile uses the title-only selected variant, stretched into the remaining
  // bar space, and three icon-only tabs in both Scroll and List.
  if (width <= 684) return categories.map((category, index) =>
    index === selected && available - 96 >= category.tabWidth ? "medium" : "small");
  const fullWidth = (index: number) => categories[index].tabWidth + periodRangeWidth(index, ranges) + tabContentGap;
  const othersWidth = categories.reduce((total, category, index) => total + (index === selected ? 0 : category.tabWidth), 0);
  const inactiveSize = available >= othersWidth + fullWidth(selected) ? "medium" : "small";
  const activeWidth = available - (inactiveSize === "medium" ? othersWidth : (categories.length - 1) * 32);
  return categories.map((category, index) => index !== selected ? inactiveSize
    : activeWidth >= fullWidth(index) ? "large" : activeWidth >= category.tabWidth ? "medium" : "small");
}

function getTabWidths(width: number, sizes: TabSize[]) {
  const available = Math.max(0, width - (categories.length - 1) * 4);
  if (width <= 684) return sizes.map(size => size === "small" ? 32 : Math.max(32, available - 96));
  const fixedWidth = sizes.reduce((total, size, index) => total + (size === "large" ? 0 : size === "medium" ? categories[index].tabWidth : 32), 0);
  const largeCount = sizes.filter(size => size === "large").length;
  const largeWidth = largeCount ? Math.max(32, (available - fixedWidth) / largeCount) : 0;
  return sizes.map((size, index) => size === "large" ? largeWidth : size === "medium" ? categories[index].tabWidth : 32);
}

function TabText({ children, className, direction, reducedMotion }: { children: string; className: string; direction: "left" | "right"; reducedMotion: boolean | null }) {
  const transition: Transition = { x: reducedMotion ? instantTabTransition : tabResizeTransition };
  const hidden = reducedMotion ? 0 : direction === "left" ? "-100%" : "100%";
  // Names leave through the left edge of their mask; ranges through the right.
  // Enter retraces that path over the same complete tab-resize duration.
  return <motion.span className={className} aria-hidden variants={screenStates} initial="enter" animate="visible" exit="exit">
    <motion.span variants={{
      enter: { x: hidden },
      visible: { x: 0, transition },
      exit: { x: hidden, transition },
    }}>{children}</motion.span>
  </motion.span>;
}

// Keep the painted surface mounted while the button resizes. The smoothing
// observer updates these paths in place, without loading a new image per frame.
const TabSurface = memo(function TabSurface({ fill, strokeOpacity }: { fill: string; strokeOpacity: number }) {
  const id = useId();
  const gradient = `${id}-stroke`;
  const shape = `${id}-shape`;
  return <svg className={styles.categorySurface} data-tab-surface aria-hidden focusable="false">
    <defs>
      <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
        <stop offset="0" stopColor="white" stopOpacity={strokeOpacity} />
        <stop offset="1" stopColor="white" stopOpacity={strokeOpacity / 2} />
      </linearGradient>
      <clipPath id={shape}><path data-tab-curve /></clipPath>
    </defs>
    <path data-tab-curve fill={fill} />
    <path data-tab-curve fill="none" stroke={`url(#${gradient})`} strokeWidth="2" clipPath={`url(#${shape})`} />
    <path data-tab-curve className={styles.categorySurfaceFocus} fill="none" stroke="#006bff" strokeWidth="4" clipPath={`url(#${shape})`} />
  </svg>;
});

const CategoryTabs = memo(function CategoryTabs({ selected, onSelect }: { selected: number; onSelect: (index: number) => void }) {
  const { periods } = useProcessBookContent();
  const ranges = periods.map(period => period.range);
  const navRef = useRef<HTMLElement>(null);
  const [{ width, animateWidths }, setMeasurement] = useState({ width: 1500, animateWidths: false });
  const reducedMotion = useReducedMotion();
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    // First placement is measured before paint. Only subsequent resizing uses
    // the tween, so a narrow screen never animates from a desktop assumption.
    if (nav.clientWidth > 0) setMeasurement({ width: nav.clientWidth, animateWidths: false });
    const observer = new ResizeObserver(([entry]) => setMeasurement(current => {
      const nextWidth = entry.contentRect.width;
      if (nextWidth <= 0 || (current.width === nextWidth && current.animateWidths)) return current;
      return { width: nextWidth, animateWidths: true };
    }));
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);
  const sizes = getTabSizes(width, selected, ranges);
  const tabWidths = getTabWidths(width, sizes);
  const animatedWidths = useTabWidths(tabWidths, !animateWidths || reducedMotion ? instantTabTransition : tabResizeTransition);
  return <nav ref={navRef} className={styles.categories} aria-label="School periods">
    {categories.map((category, index) => {
      const size = sizes[index];
      return <motion.button key={category.icon} type="button" initial={false} layout={false}
        className={styles.category} data-size={size} data-smooth-corners="0.6" data-smooth-surface
        // The shared tween supplies explicit pixel widths from first render.
        // No independent animate target may compete with that shared clock.
        style={{ flexGrow: 0, flexBasis: animatedWidths[index], paddingRight: size === "small" ? 4 : 12,
          "--tab-fill": category.color, color: category.ink, "--tab-label-width": `${category.labelWidth}px`, "--tab-icon-gap": `${category.iconGap}px`, "--tab-range-width": `${periodRangeWidth(index, ranges)}px`, "--corner-stroke-opacity": index === 0 ? 0.1 : 0.2 } as HTMLMotionProps<"button">["style"]}
        disabled={periods[index].firstIndex === null}
        aria-label={`${periods[index].title}, ${ranges[index]}; go to the first week of this period`}
        aria-pressed={selected === index} onClick={() => onSelect(index)} title={periods[index].title}>
        <TabSurface fill={category.color} strokeOpacity={index === 0 ? 0.1 : 0.2} />
        <span className={styles.categoryContent}>
          <Image unoptimized src={`/design/${category.icon}.webp`} width={22} height={22} alt="" />
          <AnimatePresence initial={false}>
            {size !== "small" ? <TabText key="name" className={styles.categoryName} direction="left" reducedMotion={reducedMotion}>{periods[index].title}</TabText> : null}
            {size === "large" ? <TabText key="range" className={styles.range} direction="right" reducedMotion={reducedMotion}>{ranges[index]}</TabText> : null}
          </AnimatePresence>
        </span>
      </motion.button>;
    })}
  </nav>;
});

const PreviewImage = memo(function PreviewImage({ week }: { week: number }) {
  const { weeks } = useProcessBookContent();
  const entry = weeks[week];
  return <span className={styles.cmsCrop}>{entry.image ? <Image unoptimized width={1060} height={1060}
    src={entry.image} loading="eager" decoding="async" alt={entry.imageAlt} draggable={false} /> : null}</span>;
});

const TablePeriodHeading = memo(function TablePeriodHeading({ period, reducedMotion }: { period: number; reducedMotion: boolean | null }) {
  const [change, setChange] = useState({ period, direction: 1 });
  if (change.period !== period) setChange({ period, direction: period > change.period ? 1 : -1 });
  const { periods } = useProcessBookContent();
  const start = periods[period].start ?? "–";
  const end = periods[period].end ?? "–";
  const name = periods[period].title;
  return <div className={styles.tableHero}>
    <h1 aria-label={name}><span className={styles.tableTitleMask} aria-hidden>
      <AnimatePresence initial={false} custom={change.direction}>
        <motion.span key={period} custom={change.direction} variants={maskedText}
          initial={reducedMotion ? false : "enter"} animate="visible" exit="exit"
          transition={reducedMotion ? { duration: 0 } : railTextTransition}>{name}</motion.span>
      </AnimatePresence>
    </span></h1>
    <p className={styles.tableRange} aria-label={`Week ${start} - ${end}`}>
      <span aria-hidden>Week </span><WeekNumber number={start} direction={change.direction} reducedMotion={reducedMotion} />
      <span aria-hidden> - </span><WeekNumber number={end} direction={change.direction} reducedMotion={reducedMotion} />
    </p>
  </div>;
});

// Only the previous and next hovered rows change; the other rows retain their
// buttons, image-independent markup, and handlers during preview animations.
const TableRow = memo(function TableRow({ index, entryIndex, preview, onFocus, onBlur }: {
  index: number; entryIndex: number; preview: boolean;
  onFocus: (week: number) => void; onBlur: () => void;
}) {
  const { weeks } = useProcessBookContent();
  const entry = weeks[index];
  const [prefetch, setPrefetch] = useState(false);
  return <div role="row" className={styles.tableRow} data-table-week={index} data-table-entry={entryIndex} data-preview={preview}>
    <span role="cell" className={styles.tableWeek}><span className={styles.number}>{entry.number}</span></span>
    <span role="cell"><Link href={entry.href} prefetch={prefetch} className={styles.rowButton}
      onMouseEnter={() => setPrefetch(true)} onTouchStart={() => setPrefetch(true)}
      onFocus={() => { setPrefetch(true); onFocus(entryIndex); }} onBlur={onBlur}
      aria-label={`Explore week ${entry.number}: ${entry.title}`}>
      <span>{entry.title}</span>
    </Link></span>
  </div>;
});

// Tutorial 030: one persistent image mask, fixed horizontally, following Y.
const WeekTableView = memo(function WeekTableView({ category, jumpWeek, jumpVersion, initialListLocation, onWeekChange, onPeriodChange, onNavigate, active: enabled }: {
  category: number;
  jumpWeek: number;
  jumpVersion: number;
  initialListLocation: { week: number; offset: number } | null;
  onWeekChange: (week: number) => void;
  onPeriodChange: (period: number) => void;
  onNavigate: (week: number, location: ListLocation) => void;
  active: boolean;
}) {
  const active = useIsPresent() && enabled;
  const viewport = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLDivElement>(null);
  const media = useRef<HTMLDivElement>(null);
  const navigation = useRef<{ stop: () => void } | null>(null);
  const travelling = useRef(false);
  const writtenTop = useRef<number | null>(null);
  const focused = useRef<number | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const visible = useRef(false);
  const [preview, setPreview] = useState({ week: 0, direction: 1, visible: false });
  const { weeks, periodForWeek } = useProcessBookContent();
  const reducedMotion = useReducedMotion();
  const targetY = useMotionValue(0);
  const y = useSpring(targetY, { stiffness: 500, damping: 40, mass: 0.7 });
  const previousJump = useRef<number | null>(null);
  const rowGeometry = useRef<{ rows: HTMLElement[]; ends: number[]; cycleHeight: number; ready: boolean }>({ rows: [], ends: [], cycleHeight: 0, ready: false });
  const indicated = useRef({ week: -1, period: -1 });
  const pointerFrame = useRef(0);
  const pendingPointer = useRef<{ scrolled: boolean; index?: number }>({ scrolled: false });
  const mobile = useMobileLayout();
  const [copies, setCopies] = useState(3);
  const [mobileSnapped, setMobileSnapped] = useState(() => initialListLocation ? initialListLocation.offset < 0.001 : false);
  const mobileSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listTouching = useRef(false);
  const previewEntry = useRef(weeks.length + jumpWeek);
  const recyclingFocus = useRef(false);
  const sizeMobileHighlight = useCallback((entry: number) => {
    if (!mobile) return;
    const row = rowGeometry.current.rows[entry];
    const scroll = viewport.current;
    const canvas = scroll?.parentElement;
    if (!row || !scroll || !canvas) return;
    // The fixed selection covers only the part of the top row still visible.
    // It shrinks on a downward swipe and expands on an upward swipe.
    const visibleHeight = Math.max(0, Math.min(row.offsetHeight, row.offsetTop + row.offsetHeight - scroll.scrollTop));
    const height = `${visibleHeight}px`;
    if (canvas.style.getPropertyValue("--mobile-top-row-height") !== height)
      canvas.style.setProperty("--mobile-top-row-height", height);
  }, [mobile]);
  useLayoutEffect(() => {
    const scroll = viewport.current;
    const element = table.current;
    if (!scroll || !element) return;
    const measure = () => {
      const rows = Array.from(element.querySelectorAll<HTMLElement>("[data-table-week]"));
      const cycleHeight = rows[weeks.length]?.offsetTop - (rows[0]?.offsetTop ?? 0);
      // One complete cycle before the current year, and enough after it to
      // cover even a viewport taller than the whole year. DOM size is bounded.
      const needed = cycleHeight > 0 ? Math.max(3, 2 + Math.ceil(scroll.clientHeight / cycleHeight)) : 3;
      rowGeometry.current = {
        rows, ends: rows.map(row => row.offsetTop + row.offsetHeight), cycleHeight,
        ready: cycleHeight > 0 && rows.length >= needed * weeks.length,
      };
      if (mobile && rowGeometry.current.ready) {
        const entry = rowGeometry.current.ends.findIndex(end => end > scroll.scrollTop + 0.5);
        if (entry >= 0) sizeMobileHighlight(entry);
      }
      if (needed > copies) setCopies(needed);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroll); observer.observe(element);
    return () => observer.disconnect();
  }, [copies, mobile, sizeMobileHighlight, weeks.length]);
  useEffect(() => () => {
    cancelAnimationFrame(pointerFrame.current);
    pointerFrame.current = 0;
    if (mobileSettleTimer.current) clearTimeout(mobileSettleTimer.current);
  }, [active]);

  const recycle = useCallback(() => {
    const scroll = viewport.current;
    const { cycleHeight, rows, ready } = rowGeometry.current;
    if (!scroll || !ready) return;
    const top = scroll.scrollTop;
    const cycle = Math.floor(top / cycleHeight);
    if (cycle === 1) return;
    // Identical rows replace identical rows at exactly the same pixel offset.
    // Keep the fractional position (and native mobile snap targets) unchanged.
    scroll.scrollTop = top + (1 - cycle) * cycleHeight;
    writtenTop.current = scroll.scrollTop;
    const shift = (1 - cycle) * weeks.length;
    previewEntry.current += shift;
    if (focused.current !== null) {
      const oldRow = rows[focused.current];
      focused.current = weeks.length + focused.current % weeks.length;
      const nextRow = rows[focused.current];
      if (oldRow?.contains(document.activeElement) && nextRow) {
        recyclingFocus.current = true;
        nextRow.querySelector<HTMLAnchorElement>("a[href]")?.focus({ preventScroll: true });
        recyclingFocus.current = false;
      }
    }
  }, [weeks.length]);

  const indicatePeriod = (settled = false) => {
    const scroll = viewport.current;
    const { rows, ends } = rowGeometry.current;
    if (!active || travelling.current || !scroll || !rows.length) return;
    const index = Math.max(0, ends.findIndex(end => end > scroll.scrollTop + 0.5));
    const week = Number(rows[index].dataset.tableWeek);
    const period = periodForWeek(week);
    const aligned = Math.abs(scroll.scrollTop - rows[index].offsetTop) <= 1;
    if (mobile) {
      setMobileSnapped(settled && aligned);
      sizeMobileHighlight(index);
      // The single mobile image retargets with the selected top row. Its short
      // Motion entrance never leaves a queue of old images after a fast flick.
      if (previewEntry.current !== index || !visible.current) show(index);
    }
    if (indicated.current.week !== week) { indicated.current.week = week; onWeekChange(week); }
    if (indicated.current.period !== period) { indicated.current.period = period; onPeriodChange(period); }
  };

  const interruptTravel = () => {
    if (!travelling.current) return;
    navigation.current?.stop();
    navigation.current = null;
    travelling.current = false;
    writtenTop.current = null;
    if (viewport.current) delete viewport.current.dataset.travelling;
    recycle();
    indicatePeriod();
  };

  const show = useCallback((index: number | null, clientY?: number) => {
    if (!active) index = null;
    if (index === null) {
      if (mobile && active) return;
      visible.current = false;
      setPreview(current => current.visible ? { ...current, visible: false } : current);
      return;
    }
    const week = index % weeks.length;
    const direction = index >= previewEntry.current ? 1 : -1;
    previewEntry.current = index;
    if (mobile) {
      visible.current = true;
      setPreview(current => current.visible && current.week === week ? current : {
        week, direction, visible: true,
      });
      return;
    }
    const element = table.current;
    const scroll = viewport.current;
    const mask = media.current;
    const previewHost = mask?.offsetParent as HTMLElement | null;
    const row = rowGeometry.current.rows[index];
    if (!element || !scroll || !mask || !previewHost || !row) return;
    const rowBox = clientY === undefined || reducedMotion ? row.getBoundingClientRect() : null;
    const scrollBox = scroll.getBoundingClientRect();
    const halfSize = mask.clientWidth / 2;
    // Keep the image clear of the floating header and view switcher.
    const min = scrollBox.top + halfSize;
    const max = Math.max(min, scrollBox.bottom - 64 - halfSize);
    const center = rowBox ? rowBox.top + rowBox.height / 2 : clientY!;
    // The preview lives beside the scroller, in the fixed Table coordinate
    // space. Its moving box must never contribute to scrollHeight: otherwise
    // following the pointer near the end moves the end and flips period tabs.
    const nextY = Math.max(min, Math.min(max, center)) - previewHost.getBoundingClientRect().top;
    if (!visible.current || reducedMotion) y.jump(nextY);
    targetY.set(nextY);
    visible.current = true;
    setPreview(current => current.visible && current.week === week ? current : {
      week, direction, visible: true,
    });
  }, [active, mobile, reducedMotion, targetY, y, weeks.length]);

  const settleMobileList = () => {
    if (!mobile || !active || travelling.current || listTouching.current) return;
    const scroll = viewport.current;
    if (!scroll || !rowGeometry.current.ready) return;
    if (mobileSettleTimer.current) clearTimeout(mobileSettleTimer.current);
    mobileSettleTimer.current = null;
    // Proximity snapping belongs to the browser. Do not pull a free-scrolling
    // list to the next row after momentum has ended.
    recycle();
    indicatePeriod(true);
  };

  const goToWeek = useCallback((index: number, immediate = false, entry?: number) => {
    const scroll = viewport.current;
    const { rows, cycleHeight, ready } = rowGeometry.current;
    if (!active || !scroll || !ready) return;
    const cycle = immediate ? 1 : Math.floor(scroll.scrollTop / cycleHeight);
    const destination = entry ?? cycle * weeks.length + index;
    const row = rows[destination];
    if (!row) return;
    navigation.current?.stop();
    navigation.current = null;
    travelling.current = false;
    if (mobile) {
      if (mobileSettleTimer.current) clearTimeout(mobileSettleTimer.current);
      setMobileSnapped(false);
    }
    // Native proximity snapping is suspended during Motion travel so Safari cannot snap
    // individual writes to another row. Restore it at the exact destination.
    scroll.dataset.travelling = "true";
    const target = Math.max(0, Math.min(scroll.scrollHeight - scroll.clientHeight, row.offsetTop));
    const write = (value: number) => {
      scroll.scrollTop = value;
      writtenTop.current = scroll.scrollTop;
    };
    const finish = () => {
      travelling.current = false;
      navigation.current = null;
      recycle();
      delete scroll.dataset.travelling;
      indicated.current.week = index;
      onWeekChange(index);
      if (mobile) {
        sizeMobileHighlight(weeks.length + index);
        show(weeks.length + index);
        setMobileSnapped(true);
      }
    };
    if (immediate || reducedMotion || Math.abs(target - scroll.scrollTop) < 0.001) {
      write(target); finish(); return;
    }
    travelling.current = true;
    const controls = animate(scroll.scrollTop, target, {
      ...tabNavigationTransition((target - scroll.scrollTop) / (row.offsetHeight || 54.5)),
      onUpdate: value => {
        write(value);
        const { rows, ends } = rowGeometry.current;
        const visibleIndex = ends.findIndex(end => end > scroll.scrollTop + 0.5);
        const entry = visibleIndex < 0 ? rows.length - 1 : visibleIndex;
        const next = Number(rows[entry].dataset.tableWeek);
        if (indicated.current.week !== next) {
          indicated.current.week = next;
          onWeekChange(next);
          if (mobile) sizeMobileHighlight(entry);
        }
        if (mobile && (previewEntry.current !== entry || !visible.current)) show(entry);
      },
      onComplete: finish,
    });
    navigation.current = controls;
    return () => {
      controls.stop();
      if (navigation.current === controls) {
        travelling.current = false; navigation.current = null;
        delete scroll.dataset.travelling;
      }
    };
  }, [active, mobile, reducedMotion, onWeekChange, show, recycle, sizeMobileHighlight, weeks.length]);

  useLayoutEffect(() => {
    if (!rowGeometry.current.ready) return;
    const firstPlacement = previousJump.current === null;
    // A breakpoint change preserves the current row; a tab command owns its
    // destination. Neither preview changes nor week updates restart travel.
    const index = previousJump.current === jumpVersion && indicated.current.week >= 0 ? indicated.current.week : jumpWeek;
    previousJump.current = jumpVersion;
    indicated.current.period = -1;
    if (firstPlacement && initialListLocation && viewport.current) {
      const row = rowGeometry.current.rows[weeks.length + initialListLocation.week];
      if (row) {
        viewport.current.scrollTop = row.offsetTop + row.offsetHeight * initialListLocation.offset;
        writtenTop.current = viewport.current.scrollTop;
        indicated.current.week = initialListLocation.week;
        indicated.current.period = periodForWeek(initialListLocation.week);
        if (mobile) {
          sizeMobileHighlight(weeks.length + initialListLocation.week);
          show(weeks.length + initialListLocation.week);
        }
        return;
      }
    }
    return goToWeek(index, firstPlacement);
  }, [jumpWeek, jumpVersion, initialListLocation, goToWeek, copies, mobile, periodForWeek, show, sizeMobileHighlight, weeks.length]);

  const trackPointer = useCallback(() => {
    if (mobile) return;
    const point = pointer.current;
    if (!point) { show(focused.current); return; }
    const row = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>("[data-table-week]");
    if (row && table.current?.contains(row)) show(Number(row.dataset.tableEntry), point.y);
    else { pointer.current = null; show(focused.current); }
  }, [mobile, show]);
  const focusWeek = useCallback((entry: number) => {
    focused.current = entry;
    if (recyclingFocus.current) return;
    // A row is a navigation link. Focus can update its preview, but must not
    // start scroll travel that moves the link during a tap/click.
    show(entry);
  }, [show]);
  const blurWeek = useCallback(() => { focused.current = null; trackPointer(); }, [trackPointer]);

  const schedulePointer = (scrolled = false, index?: number) => {
    // Scroll and high-frequency pointer events share at most one geometry pass
    // per display frame. Scroll needs a fresh hit-test; pointer moves already
    // know their row from the event target.
    pendingPointer.current.scrolled ||= scrolled;
    pendingPointer.current.index = index;
    if (pointerFrame.current) return;
    pointerFrame.current = requestAnimationFrame(() => {
      pointerFrame.current = 0;
      const { scrolled, index } = pendingPointer.current;
      pendingPointer.current = { scrolled: false };
      const scroll = viewport.current;
      if (scroll && scrolled && (writtenTop.current === null || Math.abs(scroll.scrollTop - writtenTop.current) > 0.5)) {
        writtenTop.current = null;
        if (!travelling.current) recycle();
        indicatePeriod();
        if (mobile && !travelling.current) {
          if (mobileSettleTimer.current) clearTimeout(mobileSettleTimer.current);
          mobileSettleTimer.current = setTimeout(settleMobileList, 120);
        }
      }
      if (!scrolled && index !== undefined && pointer.current) show(index, pointer.current.y);
      else trackPointer();
    });
  };
  const handleScroll = () => schedulePointer(true);

  const captureListPosition = () => {
    const scroll = viewport.current;
    const { rows, ends, ready } = rowGeometry.current;
    if (!scroll || !ready) return;
    const entry = ends.findIndex(end => end > scroll.scrollTop + 0.5);
    const row = rows[entry < 0 ? rows.length - 1 : entry];
    if (!row) return;
    const week = Number(row.dataset.tableWeek);
    onNavigate(week, {
      weekId: weeks[week].id,
      offset: Math.max(0, Math.min(1, (scroll.scrollTop - row.offsetTop) / row.offsetHeight)),
    });
  };

  return <div className={styles.tableView}>
    <div className={styles.tableCanvas}>
    <motion.div className={styles.tableHeader} variants={screenReveal(reducedMotion, 32, revealStep)}>
      <TablePeriodHeading period={category} reducedMotion={reducedMotion} />
      <div className={styles.tableHeading} aria-hidden><span>Week</span><span>Title</span></div>
    </motion.div>
    <motion.div className={styles.mobileTopRowHighlight} aria-hidden initial={false}
      animate={{ opacity: preview.visible ? mobileSnapped ? 1 : 0.5 : 0 }}
      transition={reducedMotion ? { duration: 0 } : mobileRowHighlightTransition} />
    <div ref={viewport} className={styles.tableScroll} onScroll={handleScroll} onScrollEnd={settleMobileList} onWheel={interruptTravel}
      onTouchStart={() => { listTouching.current = true; interruptTravel(); }}
      onTouchEnd={() => { listTouching.current = false; if (mobile) { if (mobileSettleTimer.current) clearTimeout(mobileSettleTimer.current); mobileSettleTimer.current = setTimeout(settleMobileList, 120); } }}
      onTouchCancel={() => { listTouching.current = false; if (mobile) settleMobileList(); }}
      onKeyDownCapture={event => {
        if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " ", "Tab"].includes(event.key)) interruptTravel();
      }}>
    <motion.div className={styles.tableContent} variants={screenReveal(reducedMotion, mobile ? 0 : 32, revealStep)}>
      <div ref={table} className={styles.weekTable}>
        <div role="table" aria-label="All school weeks">
          <div role="row" className={styles.srOnly}><span role="columnheader">Week</span><span role="columnheader">Title</span></div>
          <div role="rowgroup" onClickCapture={event => {
            if ((event.target as Element).closest("a[href]")) captureListPosition();
          }} onPointerLeave={() => { pointer.current = null; show(focused.current); }}
            onPointerMove={event => {
              if (mobile || event.pointerType !== "mouse") return;
              pointer.current = { x: event.clientX, y: event.clientY };
              const row = (event.target as Element).closest<HTMLElement>("[data-table-week]");
              schedulePointer(false, row ? Number(row.dataset.tableEntry) : undefined);
            }}>
            {Array.from({ length: copies * weeks.length }, (_, entry) => <TableRow key={entry}
              index={entry % weeks.length} entryIndex={entry}
              preview={!mobile && preview.visible && preview.week === entry % weeks.length}
              onFocus={focusWeek} onBlur={blurWeek} />)}
          </div>
        </div>
      </div>
    </motion.div>
    </div>
    <motion.div ref={media} aria-hidden className={styles.rowPreview} style={{ y: mobile ? 0 : reducedMotion ? targetY : y }}>
      <div className={styles.rowPreviewMask} data-smooth-corners="0.6">
        <motion.div className={styles.rowPreviewReveal} initial={false}
          style={reducedMotion ? { opacity: preview.visible && active ? 1 : 0, clipPath: "inset(0%)" } : undefined}
          animate={reducedMotion ? undefined : { opacity: preview.visible && active ? 1 : 0, clipPath: preview.visible && active ? "inset(0% 0% 0% 0%)" : "inset(50% 0% 50% 0%)" }}
          transition={interfaceTransition}>
          {mobile ? <motion.div key={preview.week} className={styles.rowPreviewImage} data-smooth-corners="0.6" custom={preview.direction}
            style={reducedMotion ? { y: 0 } : undefined}
            variants={maskedText} initial={reducedMotion || !preview.visible ? false : "enter"}
            animate={reducedMotion ? undefined : "visible"}
            transition={mobileRowPreviewTransition}>
            <PreviewImage week={preview.week} />
          </motion.div> : <AnimatePresence initial={false} custom={preview.direction}>
            <motion.div key={preview.week} className={styles.rowPreviewImage} data-smooth-corners="0.6" custom={preview.direction}
              style={reducedMotion ? { y: 0 } : undefined}
              variants={maskedText} initial={reducedMotion ? false : "enter"}
              animate={reducedMotion ? undefined : "visible"} exit={reducedMotion ? undefined : "exit"}
              transition={interfaceTransition}>
              <PreviewImage week={preview.week} />
            </motion.div>
          </AnimatePresence>}
        </motion.div>
      </div>
    </motion.div>
    </div>
  </div>;
});

const maskedText = {
  enter: (direction: number) => ({ y: `${direction * 110}%` }),
  visible: { y: "0%" },
  exit: (direction: number) => ({ y: `${direction * -110}%` }),
};
type CardPointerHandlers = Pick<HTMLMotionProps<"a">, "onPointerEnter" | "onPointerMove" | "onPointerLeave" | "onPointerDown" | "onPointerUp" | "onPointerCancel">;

const wrapWeek = (value: number, count: number) => ((value % count) + count) % count;
const railOffset = (entry: number, progress: number, count: number) => wrapWeek(entry - progress + count / 2, count) - count / 2;
const railSlots = [-3, -2, -1, 0, 1, 2, 3];
const railWindow = Array.from({ length: 11 }, (_, index) => index - 5);
const visibleRailEntries = (week: number, count: number) => [...new Set(railWindow.map(offset => wrapWeek(week + offset, count)))];
const railRevealDistance = 4;

function railScreenReveal(reducedMotion: boolean | null) {
  const hidden = { "--rail-arrival": reducedMotion ? 0 : railRevealDistance };
  // Mirror the entrance curve in time so exit retraces the same scroll, rather
  // than easing out a second time. Keep the existing screen-reveal duration.
  const [x1, y1, x2, y2] = interfaceTransition.ease;
  const exitEase = [1 - x2, 1 - y2, 1 - x1, 1 - y1] as const;
  return {
    enter: hidden,
    visible: { "--rail-arrival": 0, transition: reducedMotion ? { duration: 0 } : { ...interfaceTransition, delay: revealStep } },
    exit: { ...hidden, transition: reducedMotion ? { duration: 0 } : { ...interfaceTransition, ease: exitEase, delay: revealStep * 2 } },
  };
}

const RailCard = memo(function RailCard({ entry, position, arrival, cardSize, gap = 8, slot, mobile = false, reducedMotion, cardPointerHandlers, cursorActive, onNavigate }: {
  entry: number;
  position: MotionValue<number>;
  arrival: MotionValue<number>;
  cardSize: number;
  gap?: number;
  slot: number;
  mobile?: boolean;
  reducedMotion: boolean | null;
  cardPointerHandlers: CardPointerHandlers;
  cursorActive: boolean;
  onNavigate: (week: number) => void;
}) {
  const { weeks } = useProcessBookContent();
  const center = slot === 0;
  const farHeight = cardSize * (mobile ? 50 / 332 : 0.150944);
  const nearHeight = cardSize * (mobile ? 75 / 332 : 0.226415);
  const farWidth = cardSize * (mobile ? 256 / 332 : 0.773585);
  const nearWidth = cardSize * (mobile ? 294 / 332 : 0.886792);
  // Recycle each image only beyond the masked ends; the visible rail stays continuous.
  const restingOffset = useTransform(position, value => {
    const progress = reducedMotion ? Math.round(value) : value;
    return railOffset(entry, progress, weeks.length);
  });
  // Feed a finite train through the existing scroll geometry: far-bottom card,
  // then center + lower cards, then the complete rail. Never wrap the arrival
  // offset, which would populate the top before those cards have scrolled in.
  const offset = useTransform(() => restingOffset.get() + arrival.get());
  const top = useTransform(offset, railSlots, [
    -farHeight - gap, 0, farHeight + gap,
    farHeight + nearHeight + gap * 2, farHeight + nearHeight + cardSize + gap * 3,
    farHeight + nearHeight * 2 + cardSize + gap * 4,
    farHeight * 2 + nearHeight * 2 + cardSize + gap * 5,
  ]);
  const height = useTransform(offset, railSlots, [farHeight, farHeight, nearHeight, cardSize, nearHeight, farHeight, farHeight]);
  const width = useTransform(offset, railSlots, [farWidth, farWidth, nearWidth, cardSize, nearWidth, farWidth, farWidth]);
  const left = useTransform(width, value => (cardSize - value) / 2);
  const edgeOpacity = useTransform(offset, railSlots, [0, 1, 1, 1, 1, 1, 0]);
  const restingOpacity = useTransform(restingOffset, railSlots, [0, 1, 1, 1, 1, 1, 0]);
  // Buffer cards stay hidden during arrival; at rest this is the normal rail
  // opacity, so wheel, touch, keyboard, and endless recycling keep their feel.
  const opacity = useTransform(() => Math.min(edgeOpacity.get(), restingOpacity.get()));

  return <MotionLink href={weeks[entry].href} prefetch={center} className={`${styles.stackCard} ${center ? styles.mainCard : Math.abs(slot) === 1 ? styles.near : styles.far}`}
    data-smooth-corners={center ? "0.6" : undefined} data-center={center} data-week={entry + 1}
    data-cursor-active={center && cursorActive} aria-hidden={!center} tabIndex={center ? 0 : -1}
    aria-label={center ? `Explore week ${weeks[entry].number}: ${weeks[entry].title}` : undefined}
    onClick={center ? () => onNavigate(entry) : undefined}
    style={{ top: 0, left: 0, x: left, y: top, width, height, opacity }} whileTap={center && !reducedMotion ? { scale: 0.98 } : undefined}
    {...(center ? cardPointerHandlers : {})}>
    <span className={styles.railMedia}><PreviewImage week={entry} /></span>
    {center ? <span className={styles.touchExplore}>Explore →</span> : null}
  </MotionLink>;
});

function WeekNumber({ number, direction, reducedMotion }: { number: string; direction: number; reducedMotion: boolean | null }) {
  return <span className={`${styles.numberMask} ${styles.number}`} aria-hidden>
    {Array.from(number, (digit, index) => <span key={index} className={styles.digitMask}>
      <AnimatePresence initial={false} custom={direction}>
        <motion.span key={digit} custom={direction} variants={maskedText}
          initial={reducedMotion ? false : "enter"} animate="visible" exit="exit"
          transition={reducedMotion ? { duration: 0 } : railTextTransition}>{digit}</motion.span>
      </AnimatePresence>
    </span>)}
  </span>;
}

const WeekScrollView = memo(function WeekScrollView({ week, jumpWeek, jumpVersion, onWeekChange, onPeriodChange, onNavigate, cardPointerHandlers, cursorActive, startVisible, active: enabled }: {
  week: number;
  jumpWeek: number;
  jumpVersion: number;
  onWeekChange: (week: number) => void;
  onPeriodChange: (period: number) => void;
  onNavigate: (week: number) => void;
  cardPointerHandlers: CardPointerHandlers;
  cursorActive: boolean;
  startVisible: boolean;
  active: boolean;
}) {
  const { weeks, periodForWeek } = useProcessBookContent();
  const active = useIsPresent() && enabled;
  const viewport = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const currentWeek = useRef(week);
  const ready = useRef(false);
  const measuredHeight = useRef(0);
  const scrollStep = useRef(180);
  const cycleOrigin = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touching = useRef(false);
  const touchStart = useRef<{ x: number; y: number; time: number; base: number; anchor: number; axis?: "x" | "y"; samples: { y: number; time: number }[] } | null>(null);
  const suppressTouchClickUntil = useRef(0);
  const wasActive = useRef(false);
  const handledJump = useRef(-1);
  const travelling = useRef(false);
  // Start in the middle of three cycles, leaving native scroll space in both directions.
  const inputPosition = useMotionValue(weeks.length + week);
  const position = useMotionValue(weeks.length + week);
  const lastPosition = useRef(weeks.length + week);
  const [direction, setDirection] = useState(1);
  const [cardSize, setCardSize] = useState(0);
  const mobile = useMobileLayout();
  const reducedMotion = useReducedMotion();
  const arrival = useMotionValue(reducedMotion || startVisible ? 0 : railRevealDistance);

  useLayoutEffect(() => {
    const element = viewport.current;
    const cards = stack.current;
    if (!element || !cards) return;
    const measure = () => {
      const height = element.clientHeight;
      const width = cards.clientWidth;
      measuredHeight.current = height;
      scrollStep.current = Math.round(Math.max(160, Math.min(220, height * 0.2)));
      element.style.setProperty("--scroll-step", `${scrollStep.current}px`);
      // Resize notifications must not snap an in-flight trip to its rounded
      // week or stop Motion. Only the first measurement initializes the rail.
      if (!ready.current) {
        const next = weeks.length + currentWeek.current;
        cycleOrigin.current = 0;
        lastPosition.current = next;
        inputPosition.jump(next);
        position.jump(next);
      }
      element.scrollTop = (inputPosition.get() - cycleOrigin.current) * scrollStep.current;
      setCardSize(width);
    };
    measure();
    ready.current = true;
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    resize.observe(cards);
    return () => {
      ready.current = false;
      travelling.current = false;
      position.stop();
      resize.disconnect();
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [inputPosition, position, weeks.length]);

  useLayoutEffect(() => {
    if (!active) {
      wasActive.current = false;
      touching.current = false;
      touchStart.current = null;
      if (settleTimer.current) clearTimeout(settleTimer.current);
      travelling.current = false;
      position.stop();
      return;
    }
    const jumpRequested = handledJump.current !== jumpVersion;
    if (wasActive.current && !jumpRequested) return;
    const firstPlacement = !wasActive.current;
    wasActive.current = true;
    handledJump.current = jumpVersion;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    touchStart.current = null;
    touching.current = false;
    position.stop();
    travelling.current = false;
    if (firstPlacement) {
      currentWeek.current = week;
      cycleOrigin.current = 0;
      const next = weeks.length + week;
      lastPosition.current = next;
      inputPosition.jump(next);
      position.jump(next);
      if (viewport.current) viewport.current.scrollTop = next * scrollStep.current;
      return;
    }
    // Stay in the current school-year cycle, rather than taking a wraparound
    // shortcut. The rounded week chooses the cycle while crossing 28 ↔ 01.
    const from = position.get();
    const cycle = Math.floor((from + 0.5) / weeks.length) * weeks.length;
    const target = cycle + jumpWeek;
    cycleOrigin.current = cycle - weeks.length;
    inputPosition.set(from);
    if (viewport.current) viewport.current.scrollTop = (from - cycleOrigin.current) * scrollStep.current;
    travelling.current = true;
    if (reducedMotion || Math.abs(target - from) < 0.001) {
      position.set(target);
      inputPosition.set(target);
      if (viewport.current) viewport.current.scrollTop = (target - cycleOrigin.current) * scrollStep.current;
      travelling.current = false;
      onPeriodChange(periodForWeek(jumpWeek));
      return;
    }
    animate(position, target, {
      ...tabNavigationTransition(target - from),
      onComplete: () => {
        travelling.current = false;
        onPeriodChange(periodForWeek(jumpWeek));
      },
    });
  }, [active, week, jumpWeek, jumpVersion, reducedMotion, inputPosition, position, onPeriodChange, periodForWeek, weeks.length]);

  useMotionValueEvent(position, "change", latest => {
    if (!active) return;
    // Native input and the visual rail share the same point throughout a tab
    // trip, so a new gesture or tab can take over without a positional jump.
    if (travelling.current) {
      inputPosition.set(latest);
      if (viewport.current) viewport.current.scrollTop = (latest - cycleOrigin.current) * scrollStep.current;
    }
    const next = wrapWeek(Math.round(latest), weeks.length);
    if (next !== currentWeek.current) {
      setDirection(latest >= lastPosition.current ? 1 : -1);
      currentWeek.current = next;
      onWeekChange(next);
      // During tab navigation the clicked destination owns tab selection.
      // Passing weeks update the labels, but only manual input moves indicators.
      if (!travelling.current) onPeriodChange(periodForWeek(next));
    }
    lastPosition.current = latest;
  });

  const movePosition = (target: number, landing = false, gestureVelocity?: number) => {
    if (reducedMotion) { position.jump(target); return; }
    const distance = target - position.get();
    // Carry motion into the landing without letting momentum cross the chosen
    // card. The velocity cap stays below this spring's no-overshoot threshold.
    // A new swipe owns its release velocity; keyboard/wheel retain rail velocity.
    const velocity = Math.sign(distance) * Math.min(
      Math.max(0, (gestureVelocity ?? position.getVelocity()) * Math.sign(distance)),
      Math.abs(distance) * railSwipeVelocityLimit,
    );
    animate(position, target, landing ? { ...railSnapSpring, velocity } : railSpring);
  };

  const rebase = () => {
    const element = viewport.current;
    if (!element || !ready.current || !measuredHeight.current) return;
    if (touching.current) return;
    const next = inputPosition.get() - cycleOrigin.current;
    // Recycle native scroll space without touching the animated value or its
    // velocity. Rapid reversals and repeated loops follow one continuous spring.
    const shift = next < weeks.length / 2 ? weeks.length : next > weeks.length * 2.5 ? -weeks.length : 0;
    if (shift) {
      cycleOrigin.current -= shift;
      element.scrollTo({ top: (next + shift) * scrollStep.current, behavior: "instant" });
    }
  };

  const settle = () => {
    if (!active || travelling.current) return;
    const element = viewport.current;
    if (!element || !ready.current || !measuredHeight.current) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
    const target = Math.round(inputPosition.get());
    inputPosition.set(target);
    movePosition(target, true);
    element.scrollTo({ top: (target - cycleOrigin.current) * scrollStep.current, behavior: "instant" });
    rebase();
  };

  const scroll = () => {
    if (!active || travelling.current) return;
    const element = viewport.current;
    if (!element || !ready.current || !measuredHeight.current) return;
    const next = element.scrollTop / scrollStep.current + cycleOrigin.current;
    if (Math.abs(next - inputPosition.get()) < 0.0001) return;
    inputPosition.set(next);
    movePosition(next);
    rebase();
    if (settleTimer.current) clearTimeout(settleTimer.current);
    // Let the native wheel/swipe gesture finish, then land precisely on a card.
    if (!touching.current) settleTimer.current = setTimeout(settle, 80);
  };

  const interruptTravel = () => {
    if (!travelling.current) return;
    travelling.current = false;
    position.stop();
    const current = position.get();
    inputPosition.set(current);
    if (viewport.current) viewport.current.scrollTop = (current - cycleOrigin.current) * scrollStep.current;
    onPeriodChange(periodForWeek(wrapWeek(Math.round(current), weeks.length)));
  };

  const goTo = (value: number, absolute = false, gestureVelocity?: number, momentum = false) => {
    const element = viewport.current;
    if (!element) return;
    interruptTravel();
    if (settleTimer.current) clearTimeout(settleTimer.current);
    const current = Math.round(inputPosition.get());
    const target = absolute ? Math.floor(current / weeks.length) * weeks.length + value : current + value;
    inputPosition.set(target);
    if (momentum && !reducedMotion && gestureVelocity !== undefined) {
      const direction = Math.sign(value);
      animate(position, target, {
        ...railMomentumTransition,
        velocity: gestureVelocity,
        modifyTarget: projected => projectedRailTarget(current, projected, direction, weeks.length),
      });
    } else movePosition(target, true, gestureVelocity);
    element.scrollTo({ top: (target - cycleOrigin.current) * scrollStep.current, behavior: "instant" });
    rebase();
  };

  const beginTouch = (event: TouchEvent<HTMLDivElement>) => {
    interruptTravel();
    touching.current = true;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    if (mobile && event.touches.length !== 1) {
      const interrupted = touchStart.current;
      touchStart.current = null;
      if (interrupted && Math.abs(position.get() - interrupted.base) > 0.0001) movePosition(interrupted.base, true, 0);
      return;
    }
    if (mobile && event.touches.length === 1) {
      const touch = event.touches[0];
      const time = Date.now();
      position.stop();
      const anchor = position.get();
      const base = Math.round(anchor);
      inputPosition.set(base);
      viewport.current?.scrollTo({ top: (base - cycleOrigin.current) * scrollStep.current, behavior: "instant" });
      touchStart.current = { x: touch.clientX, y: touch.clientY, time, base, anchor, samples: [{ y: touch.clientY, time }] };
    } else touchStart.current = null;
  };

  const moveTouch = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    if (!mobile || !start || event.touches.length !== 1) return;
    const time = Date.now();
    start.samples.push({ y: event.touches[0].clientY, time });
    // Keep the sample just before the last 100ms as well as recent samples.
    while (start.samples.length > 2 && start.samples[1].time < time - 100) start.samples.shift();
    const x = event.touches[0].clientX - start.x;
    const y = event.touches[0].clientY - start.y;
    if (!start.axis && Math.max(Math.abs(x), Math.abs(y)) > 6) start.axis = Math.abs(y) > Math.abs(x) ? "y" : "x";
    if (start.axis !== "y" || reducedMotion) return;
    const next = start.anchor + resistedRailOffset(y, scrollStep.current);
    position.set(Math.max(start.base - 0.45, Math.min(start.base + 0.45, next)));
  };

  const endTouch = (event: TouchEvent<HTMLDivElement>) => {
    touching.current = (event.touches?.length ?? 0) > 0;
    if (mobile) {
      if (touching.current) { touchStart.current = null; return; }
      const start = touchStart.current;
      touchStart.current = null;
      const touch = event.changedTouches[0];
      if (!start || !touch) return;
      const x = touch.clientX - start.x;
      const y = touch.clientY - start.y;
      const time = Date.now();
      const speed = Math.abs(y) / Math.max(1, time - start.time);
      if (start.axis !== "x" && Math.abs(y) > Math.abs(x) && (Math.abs(y) >= 28 || (Math.abs(y) >= 12 && speed >= 0.35))) {
        if (start.axis === "y" && !reducedMotion) {
          const next = start.anchor + resistedRailOffset(y, scrollStep.current);
          position.set(Math.max(start.base - 0.45, Math.min(start.base + 0.45, next)));
        }
        const recent = start.samples.find(sample => sample.time >= time - 100) ?? start.samples.at(-1)!;
        const recentY = touch.clientY - recent.y;
        const direction = y < 0 ? 1 : -1;
        // Translate release speed from px/ms to weeks/s, then project Motion's
        // inertia onto one to three whole weeks in the swipe direction.
        const releaseVelocity = direction * Math.min(railSwipeVelocityLimit,
          Math.max(0, -recentY * direction) / Math.max(1, time - recent.time) * 1000 / scrollStep.current * 1.6);
        const target = projectedRailTarget(start.base, position.get() + releaseVelocity * railMomentumPower, direction, weeks.length);
        suppressTouchClickUntil.current = Date.now() + 400;
        goTo(target - start.base, false, releaseVelocity, Math.abs(target - start.base) > 1);
      } else if (Math.abs(position.get() - start.base) > 0.0001) {
        goTo(0, false, 0);
      }
      return;
    }
    settleTimer.current = setTimeout(settle, 80);
  };

  const cancelTouch = () => {
    touching.current = false;
    const start = touchStart.current;
    touchStart.current = null;
    if (mobile && start && Math.abs(position.get() - start.base) > 0.0001) goTo(0, false, 0);
    if (!mobile) settleTimer.current = setTimeout(settle, 80);
  };

  const captureTouchClick = (event: MouseEvent<HTMLDivElement>) => {
    if (mobile && Date.now() < suppressTouchClickUntil.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return <div ref={viewport} className={styles.scrollViewport} tabIndex={0}
    aria-label="Weekly card stack. Scroll, swipe, or use arrow keys to change week."
    aria-description="The last week loops to the first, and the first loops to the last."
    onScroll={scroll}
    onWheel={interruptTravel}
    onClickCapture={captureTouchClick}
    onTouchStart={beginTouch}
    onTouchMove={moveTouch}
    onTouchEnd={endTouch}
    onTouchCancel={cancelTouch}
    onKeyDown={event => {
      const step = ["ArrowDown", "ArrowRight", "PageDown"].includes(event.key) ? 1 : ["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key) ? -1 : 0;
      if (step || event.key === "Home" || event.key === "End") {
        event.preventDefault();
        if (step) goTo(step); else goTo(event.key === "Home" ? 0 : weeks.length - 1, true);
      }
    }}>
    <div className={styles.scrollTrack} style={{ "--week-count": weeks.length * 3 } as CSSProperties}>
      <div className={styles.scrollStage}>
        <p className={`${styles.selectedWeek} ${styles.screenTextMask}`} aria-label={`Week ${weeks[week].number}`}>
          <motion.span className={styles.weekReveal} variants={screenReveal(reducedMotion, "110%", revealStep * 2, revealStep)}>
          <span>Week</span><WeekNumber number={weeks[week].number} direction={direction} reducedMotion={reducedMotion} />
          </motion.span>
        </p>
        <motion.div ref={stack} className={styles.stack} style={{ "--rail-arrival": arrival } as HTMLMotionProps<"div">["style"]}
          variants={railScreenReveal(reducedMotion)}>
          {cardSize > 0 ? visibleRailEntries(week, weeks.length).map(index => <RailCard key={weeks[index].id} entry={index} position={position} arrival={arrival} cardSize={cardSize} gap={mobile ? 6 : 8}
            slot={railOffset(index, week, weeks.length)} mobile={mobile} reducedMotion={reducedMotion} cardPointerHandlers={cardPointerHandlers} cursorActive={index === week && cursorActive} onNavigate={onNavigate} />) : null}
          <span className={styles.topFade} aria-hidden /><span className={styles.bottomFade} aria-hidden />
        </motion.div>
        <p className={`${styles.selectedTitle} ${styles.screenTextMask}`} aria-label={weeks[week].title}>
          <motion.span className={styles.titleReveal} variants={screenReveal(reducedMotion, "110%", revealStep * 3)}>
          <span className={styles.textMask} aria-hidden>
          <AnimatePresence initial={false} custom={direction}><motion.span key={week} custom={direction} variants={maskedText} initial={reducedMotion ? false : "enter"} animate="visible" exit="exit" transition={reducedMotion ? { duration: 0 } : railTextTransition}>{weeks[week].title}</motion.span></AnimatePresence>
          </span></motion.span>
        </p>
        <span className={styles.srOnly} role="status">Week {weeks[week].number}: {weeks[week].title}</span>
      </div>
    </div>
  </div>;
});

const AppHeader = memo(function AppHeader({ onReset }: { onReset: () => void }) {
  return <header className={styles.header}>
    <div className={styles.identity} data-smooth-corners>
      <button className={styles.owner} onClick={onReset} aria-label="Return to Week 01 in Scroll view">
        <picture>
          <source media="(max-width: 700px)" srcSet="/design/mobile-logo.webp" />
          <Image unoptimized src="/design/bor-dolenc.webp" width={22} height={22} alt="" />
        </picture>
        <span>[ © Bor Dolenc ]</span>
      </button>
      <div className={styles.bookTitle}><span>Process Book</span><span className={styles.year}>[ MDD IxD 2026 ]</span></div>
    </div>
  </header>;
});

const ExploreCursor = memo(function ExploreCursor({ cursor, pressed, reducedMotion, cursorX, cursorY, x, y }: {
  cursor: boolean; pressed: boolean; reducedMotion: boolean | null;
  cursorX: MotionValue<number>; cursorY: MotionValue<number>; x: MotionValue<number>; y: MotionValue<number>;
}) {
  return <AnimatePresence>{cursor ? <motion.div aria-hidden className={styles.exploreCursorAnchor}
    style={{ x: reducedMotion ? cursorX : x, y: reducedMotion ? cursorY : y }}>
    <motion.div className={styles.exploreCursor} style={{ x: "-50%", y: "-50%" }}
      initial={{ opacity: 0, width: reducedMotion ? 129 : 16, height: reducedMotion ? 42 : 16 }}
      animate={{ opacity: 1, width: 129, height: 42, scale: reducedMotion ? 1 : pressed ? 0.9 : 1 }}
      exit={{ opacity: 0, width: reducedMotion ? 129 : 16, height: reducedMotion ? 42 : 16, scale: 1 }}
      transition={reducedMotion ? { duration: 0 } : {
        ...exploreCursorShapeTransition,
        opacity: { duration: 0.16 },
      }}>
      <motion.span className={styles.exploreCursorContent}
        initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.8 }}
        animate={{ opacity: 1, scale: 1, transition: reducedMotion ? { duration: 0 } : { ...exploreCursorContentTransition, delay: 0.06 } }}
        exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.8, transition: reducedMotion ? { duration: 0 } : { ...exploreCursorContentTransition, duration: 0.08 } }}>
        <span className={styles.exploreCursorText}>Explore</span><span className={styles.exploreCursorArrow}>→</span>
      </motion.span>
    </motion.div>
  </motion.div> : null}</AnimatePresence>;
});

export function ProcessBook({ content }: { content: ProcessBookContent }) {
  // Content edits update in place. Membership/order changes restart the native
  // loops with valid offsets rather than keeping a stale index into old data.
  const topology = content.weeks.map(week => `${week.id}:${week.number}:${week.period}`).join("|");
  return <ProcessBookProvider content={content}>
    {content.weeks.length ? <ProcessBookApp key={topology} /> : <EmptyProcessBook />}
  </ProcessBookProvider>;
}

function EmptyProcessBook() {
  const smoothRoot = useSmoothCorners();
  return <main ref={smoothRoot} className={styles.app} aria-label="Bor Dolenc’s Process Book">
    <AppHeader onReset={() => {}} />
    <CategoryTabs selected={0} onSelect={() => {}} />
    <div className={styles.emptyState}><p>No weeks published yet.</p></div>
  </main>;
}

function ProcessBookApp() {
  const { weeks, firstWeekInPeriod } = useProcessBookContent();
  const { position: storedPosition, setPosition } = useProcessBookHistory();
  const [initial] = useState(() => resolveBookPosition(storedPosition, weeks));
  const [returning, setReturning] = useState(initial.restored);
  if (weeks[0].image) preload(weeks[0].image, { as: "image", fetchPriority: "high" });
  const smoothRoot = useSmoothCorners();
  const [selected, setSelected] = useState(initial.selected);
  const [view, setView] = useState<"scroll" | "table">(initial.view);
  const [week, setWeek] = useState(initial.week);
  const [jumpWeek, setJumpWeek] = useState(initial.week);
  const [jumpVersion, setJumpVersion] = useState(0);
  const [cursor, setCursor] = useState(false);
  const [pressed, setPressed] = useState(false);
  const reducedMotion = useReducedMotion();
  const screen = view === "scroll" ? 0 : 1;
  const cursorX = useMotionValue(0);
  const cursorY = useMotionValue(0);
  const x = useSpring(cursorX, exploreCursorSpring);
  const y = useSpring(cursorY, exploreCursorSpring);

  const cursorVisible = useRef(false);
  const clearCursor = useCallback(() => {
    cursorVisible.current = false;
    setCursor(false);
    setPressed(false);
  }, []);
  const trackCursor = useCallback((event: PointerEvent<HTMLAnchorElement>) => {
    const inside = event.pointerType === "mouse";
    if (inside) {
      const nextX = event.clientX;
      const nextY = event.clientY;
      if (!cursorVisible.current) { x.jump(nextX); y.jump(nextY); }
      cursorX.set(nextX);
      cursorY.set(nextY);
    }
    if (cursorVisible.current !== inside) {
      cursorVisible.current = inside;
      setCursor(inside);
    }
  }, [cursorX, cursorY, x, y]);
  const cardPointerHandlers = useMemo<CardPointerHandlers>(() => ({
    onPointerEnter: trackCursor,
    onPointerMove: trackCursor,
    onPointerLeave: clearCursor,
    onPointerDown: () => setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerCancel: clearCursor,
  }), [trackCursor, clearCursor]);
  const changeWeek = useCallback((next: number) => { setWeek(next); clearCursor(); }, [clearCursor]);
  const navigationState = useRef({ view, week });
  useLayoutEffect(() => { navigationState.current = { view, week }; }, [view, week]);
  useLayoutEffect(() => {
    setPosition(current => ({ view, weekId: weeks[week].id, selected, list: current?.list ?? null }));
  }, [setPosition, selected, view, week, weeks]);
  const saveBeforeNavigate = useCallback((index: number, list?: ListLocation) => {
    const snapshot = { view, weekId: weeks[index].id, selected, list: list ?? storedPosition?.list ?? null };
    setPosition(snapshot);
    saveBookPosition(snapshot);
  }, [selected, setPosition, storedPosition?.list, view, weeks]);
  const changeView = useCallback((mode: "scroll" | "table") => {
    if (mode === navigationState.current.view) return;
    if (mode === "table") { setJumpWeek(navigationState.current.week); setJumpVersion(version => version + 1); }
    setReturning(false); setView(mode); clearCursor();
  }, [clearCursor]);

  const select = useCallback((index: number) => {
    const firstWeek = firstWeekInPeriod(index);
    if (firstWeek === null) return;
    setJumpWeek(firstWeek);
    setJumpVersion(version => version + 1);
    setSelected(index);
    clearCursor();
  }, [clearCursor, firstWeekInPeriod]);

  const reset = useCallback(() => { select(weeks[0].period); setWeek(0); setView("scroll"); }, [select, weeks]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setView("scroll"); clearCursor(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearCursor]);

  return (
    <MotionConfig reducedMotion="user" transition={interfaceTransition}>
      <main ref={smoothRoot} className={styles.app} aria-label="Bor Dolenc’s Process Book">
        <AppHeader onReset={reset} />

        <CategoryTabs selected={selected} onSelect={select} />

        <div className={styles.content}>
          <motion.div className={styles.screenField} initial={false} animate={{ x: `${screen * -100}%` }} transition={reducedMotion ? { duration: 0 } : screenTransition}>
          <AnimatePresence mode="sync" initial={!reducedMotion && !returning}>
          {view === "scroll" ? <ScreenPanel key="scroll" left="0%" label="All school weeks, scroll view" startVisible={returning}>
              <WeekScrollView active week={week} jumpWeek={jumpWeek} jumpVersion={jumpVersion} onWeekChange={changeWeek} onPeriodChange={setSelected} onNavigate={saveBeforeNavigate} cursorActive={cursor} cardPointerHandlers={cardPointerHandlers} startVisible={returning} />
          </ScreenPanel> : null}
          {view === "table" ? <ScreenPanel key="table" left="100%" label="All school weeks, list view" startVisible={returning}>
              <WeekTableView active category={selected} jumpWeek={jumpWeek} jumpVersion={jumpVersion}
                initialListLocation={initial.view === "table" && jumpVersion === 0 ? initial.list : null}
                onWeekChange={setWeek} onNavigate={saveBeforeNavigate}
                onPeriodChange={setSelected} />
          </ScreenPanel> : null}
          </AnimatePresence>
          </motion.div>
          <ViewSwitcher key="view-switcher" view={view} onViewChange={changeView} startVisible={returning} />
        </div>
        <ExploreCursor cursor={cursor} pressed={pressed} reducedMotion={reducedMotion}
          cursorX={cursorX} cursorY={cursorY} x={x} y={y} />
      </main>
    </MotionConfig>
  );
}
