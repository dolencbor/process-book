"use client";

import { getSvgPath } from "figma-squircle";
import { useLayoutEffect, useRef } from "react";

// Figma's 60% curve needs the actual box size, including during Motion's resize.
export function useSmoothCorners() {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const container = root.current;
    if (!container) return;
    type Curve = {
      width: number; height: number; signature: string; measuredWidth: number; measuredHeight: number;
      radius: number; smoothing: number; inset: number;
      color: string; opacity: number; start: number; end: number; focused: boolean;
      surface: SVGSVGElement | null; paths: SVGPathElement[];
    };
    const tracked = new Map<HTMLElement, Curve>();
    // Read computed styles only on mount, responsive resize, or a class/profile
    // change. A Motion size frame uses cached paint data and observer geometry.
    const read = (element: HTMLElement): Curve => {
      const style = getComputedStyle(element);
      const smoothing = Number(element.dataset.smoothCorners);
      const surface = element.hasAttribute("data-smooth-surface")
        ? element.querySelector<SVGSVGElement>("[data-tab-surface]") : null;
      return {
        width: -1, height: -1, signature: "", measuredWidth: parseFloat(style.width), measuredHeight: parseFloat(style.height),
        radius: parseFloat(style.getPropertyValue("--corner-radius")),
        smoothing: Number.isFinite(smoothing) ? smoothing : 0.6,
        inset: -parseFloat(style.borderTopWidth),
        color: style.getPropertyValue("--corner-stroke").trim() || "transparent",
        opacity: parseFloat(style.getPropertyValue("--corner-stroke-opacity")),
        start: parseFloat(style.getPropertyValue("--corner-stroke-start")),
        end: parseFloat(style.getPropertyValue("--corner-stroke-end")),
        focused: element.matches(":focus-visible"),
        surface, paths: surface ? Array.from(surface.querySelectorAll<SVGPathElement>("[data-tab-curve]")) : [],
      };
    };
    const render = (element: HTMLElement, curve: Curve, width: number, height: number) => {
      if (!width || !height) return;
      const signature = `${curve.radius}/${curve.smoothing}/${curve.color}/${curve.opacity}/${curve.start}/${curve.end}/${curve.inset}/${curve.focused}`;
      if (width === curve.width && height === curve.height && signature === curve.signature) return;
      curve.width = width; curve.height = height; curve.signature = signature;
      const path = getSvgPath({ width, height, cornerRadius: curve.radius, cornerSmoothing: curve.smoothing });
      if (curve.surface) {
        curve.surface.setAttribute("viewBox", `0 0 ${width} ${height}`);
        for (const node of curve.paths) node.setAttribute("d", path);
        if (!element.hasAttribute("data-surface-ready")) element.setAttribute("data-surface-ready", "true");
        return;
      }
      const border = (color: string, strokeWidth: number, gradientOpacity?: number, gradientStart = 1, gradientEnd = 0.5) => {
        const gradient = gradientOpacity === undefined ? "" : `<defs><linearGradient id="border" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${height}"><stop offset="0" stop-color="white" stop-opacity="${gradientOpacity * gradientStart}"/><stop offset="1" stop-color="white" stop-opacity="${gradientOpacity * gradientEnd}"/></linearGradient></defs>`;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${gradient}<path d="${path}" fill="none" stroke="${gradient ? "url(#border)" : color}" stroke-width="${strokeWidth}"/></svg>`;
        return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
      };
      element.style.setProperty("--smooth-path", `path('${path}')`);
      element.style.setProperty("--smooth-border-inset", `${curve.inset}px`);
      // Half the stroke clips outside the path, leaving the Figma inside border.
      // Cards with no border need no encoded SVG image on every morph frame.
      const hasStroke = Number.isFinite(curve.opacity) ? curve.opacity > 0 : curve.color !== "transparent";
      element.style.setProperty("--smooth-border", hasStroke ? border(curve.color, 2,
        Number.isFinite(curve.opacity) ? curve.opacity : undefined,
        Number.isFinite(curve.start) ? curve.start : 1,
        Number.isFinite(curve.end) ? curve.end : 0.5,
      ) : "none");
      element.style.setProperty("--smooth-focus", curve.focused ? border("#006bff", 4) : "none");
    };
    const resize = new ResizeObserver(entries => {
      // ResizeObserver supplies layout sizes: no synchronous reads between writes.
      for (const entry of entries) {
        const curve = tracked.get(entry.target as HTMLElement);
        const box = entry.borderBoxSize[0];
        if (curve && box) render(entry.target as HTMLElement, curve, box.inlineSize, box.blockSize);
      }
    });
    const collect = (node: Node, elements: Set<HTMLElement>) => {
      if (!(node instanceof Element)) return;
      if (node.matches("[data-smooth-corners]")) elements.add(node as HTMLElement);
      for (const element of node.querySelectorAll<HTMLElement>("[data-smooth-corners]")) elements.add(element);
    };
    const refresh = (elements: Set<HTMLElement>) => {
      // Read all paint profiles and box sizes before writing any CSS/SVG paths.
      const updates = Array.from(elements).filter(element => container.contains(element)).map(element => {
        const old = tracked.get(element);
        const curve = read(element);
        return { element, old, curve, width: curve.measuredWidth, height: curve.measuredHeight };
      });
      for (const { element, old, curve, width, height } of updates) {
        if (old) { curve.width = old.width; curve.height = old.height; curve.signature = old.signature; }
        tracked.set(element, curve);
        render(element, curve, width, height);
        if (!old) resize.observe(element, { box: "border-box" });
      }
    };
    refresh(new Set(container.querySelectorAll<HTMLElement>("[data-smooth-corners]")));
    const children = new MutationObserver(records => {
      const changed = new Set<HTMLElement>();
      for (const record of records) {
        if (record.type === "attributes") {
          const element = record.target as HTMLElement;
          if (tracked.has(element)) changed.add(element);
        } else {
          for (const node of record.addedNodes) collect(node, changed);
        }
      }
      for (const element of tracked.keys()) {
        if (!container.contains(element)) { resize.unobserve(element); tracked.delete(element); }
      }
      refresh(changed);
    });
    children.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-smooth-corners"] });
    // Media queries can change radii without changing an element's box size.
    let responsiveFrame = 0;
    const responsive = () => {
      if (!responsiveFrame) responsiveFrame = requestAnimationFrame(() => {
        responsiveFrame = 0;
        refresh(new Set(tracked.keys()));
      });
    };
    const focus = (event: FocusEvent) => {
      const element = event.target as HTMLElement;
      const curve = tracked.get(element);
      if (!curve || curve.surface) return;
      curve.focused = event.type === "focus" && element.matches(":focus-visible");
      render(element, curve, curve.width, curve.height);
    };
    container.addEventListener("focus", focus, true);
    container.addEventListener("blur", focus, true);
    window.addEventListener("resize", responsive, { passive: true });
    return () => {
      resize.disconnect(); children.disconnect();
      window.removeEventListener("resize", responsive);
      container.removeEventListener("focus", focus, true);
      container.removeEventListener("blur", focus, true);
      cancelAnimationFrame(responsiveFrame);
    };
  }, []);

  return root;
}
