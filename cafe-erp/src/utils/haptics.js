export function triggerHaptic(type = 'light') {
  try {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return;

    const patterns = {
      light: 12,
      medium: 24,
      success: [18, 45, 28],
      error: [35, 35, 35]
    };

    navigator.vibrate(patterns[type] || 12);
  } catch {
    // Safely ignored on browsers without Vibration API (e.g., desktop or iOS Safari)
  }
}