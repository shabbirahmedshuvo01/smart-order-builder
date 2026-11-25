/**
 * Mock server clock running 90 seconds (+90_000ms) ahead of the browser clock,
 * as required in Part D. Provides controllable advance/override helpers for testing.
 */

const DEFAULT_SERVER_CLOCK_OFFSET_MS = 90_000;

let currentOffsetMs = DEFAULT_SERVER_CLOCK_OFFSET_MS;
let fixedTimeMs: number | null = null;

/**
 * Returns current mock server time in milliseconds.
 */
export function getServerTimeMs(): number {
  if (fixedTimeMs !== null) {
    return fixedTimeMs;
  }
  return Date.now() + currentOffsetMs;
}

/**
 * Returns current mock server time as an ISO string.
 */
export function getServerTimeIso(): string {
  return new Date(getServerTimeMs()).toISOString();
}

/**
 * Advances the mock server clock by the specified milliseconds.
 */
export function advanceServerTimeMs(ms: number): void {
  if (fixedTimeMs !== null) {
    fixedTimeMs += ms;
  } else {
    currentOffsetMs += ms;
  }
}

/**
 * Locks the mock server clock to a specific ISO timestamp.
 */
export function setServerTimeIso(iso: string): void {
  fixedTimeMs = new Date(iso).getTime();
}

/**
 * Resets the server clock back to dynamic mode with the default +90s offset.
 */
export function resetServerClock(): void {
  fixedTimeMs = null;
  currentOffsetMs = DEFAULT_SERVER_CLOCK_OFFSET_MS;
}

/**
 * Client-side helper: Computes the offset (in ms) between server time and browser Date.now().
 * Used so all UI countdown timers and expiries track server time rather than local browser time.
 */
export function computeServerClockOffset(serverTimeIso: string): number {
  const serverMs = new Date(serverTimeIso).getTime();
  return serverMs - Date.now();
}
