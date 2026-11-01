/**
 * Circuit breaker simples: após `threshold` falhas seguidas o circuito abre e as chamadas
 * falham imediatamente por `cooldownMs` (sem martelar uma API instável nem deixar o usuário
 * esperando timeouts). Depois disso, uma chamada de teste é liberada (half-open).
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;

  constructor(
    private threshold = 3,
    private cooldownMs = 30_000,
  ) {}

  get state(): 'closed' | 'open' | 'half-open' {
    if (this.failures < this.threshold) return 'closed';
    return Date.now() - this.openedAt >= this.cooldownMs ? 'half-open' : 'open';
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') throw new CircuitOpenError();
    try {
      const result = await fn();
      this.failures = 0;
      return result;
    } catch (err) {
      this.failures++;
      if (this.failures >= this.threshold) this.openedAt = Date.now();
      throw err;
    }
  }
}

export class CircuitOpenError extends Error {
  constructor() {
    super('Circuito aberto: API externa temporariamente indisponível.');
  }
}
