export class TokenBucket {
  #tokens: number;
  #lastRefillAt: number;
  readonly #capacity: number;
  readonly #refillPerSecond: number;

  constructor(capacity = 40, refillPerSecond = 20, now = Date.now()) {
    this.#tokens = capacity;
    this.#lastRefillAt = now;
    this.#capacity = capacity;
    this.#refillPerSecond = refillPerSecond;
  }

  take(now = Date.now(), amount = 1): boolean {
    const elapsedSeconds = Math.max(0, now - this.#lastRefillAt) / 1_000;
    this.#tokens = Math.min(this.#capacity, this.#tokens + elapsedSeconds * this.#refillPerSecond);
    this.#lastRefillAt = now;
    if (this.#tokens < amount) return false;
    this.#tokens -= amount;
    return true;
  }
}
