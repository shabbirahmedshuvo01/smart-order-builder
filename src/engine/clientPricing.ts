/**
 * Client-side pricing manager with Request ID sequence and AbortController guards.
 * Guarantees out-of-order asynchronous responses never overwrite newer price states.
 */
export class GuardedPricingClient {
  private currentRequestId = 0;
  private currentAbortController: AbortController | null = null;
  private displayedPricing: any = null;

  /**
   * Dispatches a pricing request. If an earlier request resolves after a newer one,
   * its result is safely discarded.
   */
  async requestPrice<T>(
    fetcher: (signal: AbortSignal) => Promise<T>
  ): Promise<{ pricing: T | null; isStale: boolean }> {
    const requestId = ++this.currentRequestId;

    // Abort previous in-flight request if possible
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    try {
      const response = await fetcher(signal);

      // Guard check: if a newer request has already been issued, discard this response
      if (requestId < this.currentRequestId) {
        return { pricing: this.displayedPricing, isStale: true };
      }

      this.displayedPricing = response;
      return { pricing: response, isStale: false };
    } catch (err: any) {
      // Aborted or superseded requests are marked stale
      if (signal.aborted || requestId < this.currentRequestId) {
        return { pricing: this.displayedPricing, isStale: true };
      }
      throw err;
    }
  }

  getDisplayedPricing(): any {
    return this.displayedPricing;
  }

  reset(): void {
    this.currentRequestId = 0;
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    this.displayedPricing = null;
  }
}
