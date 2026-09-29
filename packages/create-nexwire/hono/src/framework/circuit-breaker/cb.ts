export class CircuitBreaker {
  private state: "closed" | "open" | "half-open" = "closed";
  private failureCount = 0;
  private readonly failureThreshold = 3;
  private readonly resetTimeout = 30000;
  private lastFailureTime = 0;
  private successCount = 0;
  private readonly successThreshold = 1;

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = "half-open";
        this.successCount = 0;
      } else {
        throw new Error("Circuit breaker is open");
      }
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  getState(): "closed" | "open" | "half-open" {
    return this.state;
  }

  onSuccess(): void {
    if (this.state === "half-open") {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.reset();
      }
    }
    this.failureCount = 0;
  }

  onFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold || this.state === "half-open") {
      this.trip();
    }
  }

  trip(): void {
    this.state = "open";
    this.lastFailureTime = Date.now();
  }

  reset(): void {
    this.state = "closed";
    this.failureCount = 0;
    this.successCount = 0;
  }
}
