"use client";

import { getSvgPath } from "figma-squircle";
import { Fragment, memo, useId } from "react";

// Fixed Figma geometry, painted before hydration as well as during travel.
const outerShape = getSvgPath({ width: 196, height: 32, cornerRadius: 10, cornerSmoothing: 0.6 });
const handleShape = getSvgPath({ width: 96, height: 28, cornerRadius: 8, cornerSmoothing: 0.6 });
export const switcherClip = `path('${outerShape}')`;
// Figma paint order; these are its five inset effects. The fifth
// has zero alpha, so it contributes no paint and needs no filter primitive.
const insetEffects = [
  { y: 1, blur: 2, alpha: 0.1 },
  { y: 4, blur: 4, alpha: 0.09 },
  { y: 8, blur: 5, alpha: 0.05 },
  { y: 14, blur: 6, alpha: 0.01 },
];

export const SwitcherSurface = memo(function SwitcherSurface({ active = false, className }: { active?: boolean; className: string }) {
  const id = useId();
  const gradient = `${id}-stroke`, clip = `${id}-clip`, shadow = `${id}-inset`;
  const width = active ? 96 : 196, height = active ? 28 : 32;
  const shape = active ? handleShape : outerShape;
  return <svg className={className} data-tab-surface aria-hidden focusable="false" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
    <defs>
      <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
        <stop offset="0" stopColor="white" stopOpacity={active ? 0.1 : 0.5} />
        <stop offset="1" stopColor="white" stopOpacity={active ? 0.2 : 0.25} />
      </linearGradient>
      <clipPath id={clip}><path data-tab-curve d={shape} /></clipPath>
      {active && <filter id={shadow} x="0" y="0" width={width} height={height + 6} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hard-alpha" />
        {insetEffects.map((effect, index) => <Fragment key={effect.y}>
          <feOffset in="hard-alpha" dy={effect.y} result={`offset-${index}`} />
          <feGaussianBlur in={`offset-${index}`} stdDeviation={effect.blur / 2} result={`blur-${index}`} />
          <feComposite in={`blur-${index}`} in2="hard-alpha" operator="arithmetic" k2="-1" k3="1" result={`inside-${index}`} />
          <feColorMatrix in={`inside-${index}`} type="matrix" values={`0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 ${effect.alpha} 0`} result={`highlight-${index}`} />
          <feBlend in={`highlight-${index}`} in2={index ? `paint-${index - 1}` : "SourceGraphic"} mode="normal" result={`paint-${index}`} />
        </Fragment>)}
      </filter>}
    </defs>
    <g filter={active ? `url(#${shadow})` : undefined}>
      <path data-tab-curve d={shape} fill={active ? "black" : "rgb(92% 92% 92%)"} fillOpacity={active ? 1 : 0.9} />
      <path data-tab-curve d={shape} fill="none" stroke={`url(#${gradient})`} strokeWidth="2" clipPath={`url(#${clip})`} />
    </g>
  </svg>;
});
