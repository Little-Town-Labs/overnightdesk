// Reset module-level rate limit state between tests
beforeEach(() => {
  // Rate limit maps stored on globalThis by route modules
  const g = globalThis as Record<string, unknown>;
  if (g.__jobCreateTimestamps instanceof Map) {
    g.__jobCreateTimestamps.clear();
  }
  if (g.__restartTimestamps instanceof Map) {
    g.__restartTimestamps.clear();
  }
});
