export class PollingError extends Error {
  constructor(message: string, public retryAfterMs = 0) {
    super(message);
    this.name = 'PollingError';
  }
}

export function getRetryAfterMs(response: Response): number {
  const value = response.headers.get('Retry-After');
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

interface PollingOptions {
  intervalMs: number;
  initialDelayMs?: number;
  requestTimeoutMs?: number;
  maxDurationMs?: number;
  isVisible: () => boolean;
  onExpire?: () => void;
}

// One request at a time, including manual refreshes. Slow/error responses must
// reduce traffic rather than create overlapping requests during an outage.
export function startPolling(
  task: (signal: AbortSignal) => Promise<void | false>,
  options: PollingOptions,
) {
  let stopped = false;
  let inFlight = false;
  let failures = 0;
  let nextAllowedAt = 0;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;

  function stop() {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(expiryTimer);
    controller?.abort();
  }

  function schedule(delay: number) {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(() => void refresh(), delay);
  }

  async function refresh() {
    if (stopped || inFlight) return;
    const remaining = nextAllowedAt - Date.now();
    if (remaining > 0 || !options.isVisible()) {
      schedule(Math.max(remaining, options.intervalMs));
      return;
    }

    clearTimeout(timer);
    inFlight = true;
    controller = new AbortController();
    const currentController = controller;
    const timeout = setTimeout(
      () => currentController.abort(),
      options.requestTimeoutMs ?? 15_000,
    );
    let delay = options.intervalMs;
    try {
      const result = await task(currentController.signal);
      if (currentController.signal.aborted) throw new PollingError('Request timed out');
      failures = 0;
      if (result === false) stop();
    } catch (error) {
      failures++;
      delay = Math.max(
        Math.min(options.intervalMs * 2 ** Math.min(failures, 4), 120_000),
        error instanceof PollingError ? error.retryAfterMs : 0,
      );
    } finally {
      clearTimeout(timeout);
      inFlight = false;
      nextAllowedAt = Date.now() + delay;
      schedule(delay);
    }
  }

  if (options.maxDurationMs !== undefined) {
    expiryTimer = setTimeout(() => {
      stop();
      options.onExpire?.();
    }, options.maxDurationMs);
  }
  schedule(options.initialDelayMs ?? 0);
  return { refresh, stop };
}
