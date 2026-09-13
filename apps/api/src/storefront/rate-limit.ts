import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * A small in-memory limit for the public storefront routes: enough to stop a script flooding a
 * store with orders. Keyed by store and by phone number rather than by address, because the
 * storefront's own server makes the calls. Each API instance counts on its own.
 */
export class RateLimit {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Refuses when `key` has had its share of the window. */
  ensureRoom(key: string): void {
    if (this.recent(key, Date.now()).length >= this.max) {
      throw new HttpException(
        'Too many orders in a short time. Wait a few minutes and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Counts one for `key`. */
  count(key: string): void {
    const now = Date.now();
    this.hits.set(key, [...this.recent(key, now), now]);
    if (this.hits.size > 5_000) this.forgetOld(now);
  }

  /** Both at once: for attempts that count whether or not they succeed. */
  take(key: string): void {
    this.ensureRoom(key);
    this.count(key);
  }

  private recent(key: string, now: number) {
    return (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
  }

  private forgetOld(now: number) {
    for (const [key, times] of this.hits) {
      if (times.every((at) => now - at >= this.windowMs)) this.hits.delete(key);
    }
  }
}
