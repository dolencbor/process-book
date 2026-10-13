"use client";

import { animate, motionValue, type Transition } from "motion/react";
import { useLayoutEffect, useState } from "react";

// One clock owns the complete bar. Independent property animations can retain
// different start times when an unchanged target survives a rapid selection.
// Their widths then stop adding up to the bar, making its right edge contract.
export function useTabWidths(target: number[], transition: Transition) {
  const [widths] = useState(() => target.map(width => motionValue(`${width}px`)));
  const [first, second, third, fourth] = target;

  useLayoutEffect(() => {
    const to = [first, second, third, fourth];
    const from = widths.map(width => parseFloat(width.get()));
    if (transition.duration === 0) {
      widths.forEach((width, index) => width.jump(`${to[index]}px`));
      return;
    }
    if (to.every((width, index) => width === from[index])) return;

    const animation = animate(0, 1, {
      ...transition,
      type: "tween",
      onUpdate: progress => {
        // Update all four values together, including tabs whose destination
        // hasn't changed. A new selection starts at these exact current widths.
        widths.forEach((width, index) => width.set(`${from[index] + (to[index] - from[index]) * progress}px`));
      },
    });
    return () => animation.stop();
  }, [first, second, third, fourth, transition, widths]);

  return widths;
}
