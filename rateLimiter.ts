class ClientRateLimiter {
  private maxTokens: number;
  private tokens: number;
  private refillRate: number;
  private lastRefill: number;
  private backoffDelay: number;

  constructor(maxRequestsPerSecond = 12) {
    this.maxTokens = maxRequestsPerSecond;
    this.tokens = maxRequestsPerSecond;
    this.refillRate = maxRequestsPerSecond / 1000;
    this.lastRefill = Date.now();
    this.backoffDelay = 0;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.backoffDelay > 0) {
      const waitTime = this.backoffDelay;
      this.backoffDelay = 0;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.refill();
    }

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    const timeToWait = Math.ceil((1 - this.tokens) / this.refillRate);
    await new Promise((resolve) => setTimeout(resolve, timeToWait));
    this.tokens = Math.max(0, this.tokens - 1);
  }

  async execute<T>(action: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await action();
    } catch (error) {
      const err = error as { status?: number; message?: string };
      if (err && (err.status === 429 || err.message?.includes("429"))) {
        this.backoffDelay = 1500;
        await new Promise((resolve) => setTimeout(resolve, this.backoffDelay));
        return action();
      }
      throw error;
    }
  }
}

export const rateLimiter = new ClientRateLimiter(12);

export function debounce<T extends (...args: never[]) => void>(
  func: T,
  waitMs = 300,
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), waitMs);
  };
  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout);
  };
  return debounced;
}
