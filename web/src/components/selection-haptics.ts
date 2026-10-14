// A single quiet detent when a user-selected week comes to rest. Browsers
// without the Vibration API (including iOS Safari) keep the visual selection.
let lastPulseAt = 0;

export function pulseSelectionHaptic() {
  if (typeof navigator === "undefined" || typeof document === "undefined") return;
  if (document.visibilityState !== "visible" || typeof navigator.vibrate !== "function") return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;

  const now = Date.now();
  if (now - lastPulseAt < 90) return;
  try {
    if (navigator.vibrate(8)) lastPulseAt = now;
  } catch {
    // Haptics are enhancement only; device settings or browser policy may block them.
  }
}
