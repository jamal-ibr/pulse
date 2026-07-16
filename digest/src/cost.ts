import type { Config, TokenUsage } from "./types.js";

export class CostTracker {
  private usd = 0;
  private searches = 0;
  private tokensIn = 0;
  private tokensOut = 0;

  constructor(private readonly pricing: Config["pricing"]) {}

  add(model: string, usage: TokenUsage): void {
    const price = this.pricing.models[model];
    if (!price) throw new Error(`No pricing configured for model ${model}`);
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    this.usd +=
      (usage.input_tokens * price.input +
        usage.output_tokens * price.output +
        cacheWrite * price.cache_write +
        cacheRead * price.cache_read) /
      1_000_000;
    this.tokensIn += usage.input_tokens + cacheWrite + cacheRead;
    this.tokensOut += usage.output_tokens;
    const requests = usage.server_tool_use?.web_search_requests ?? 0;
    if (requests > 0) {
      this.searches += requests;
      this.usd += (requests * this.pricing.web_search_per_1000) / 1_000;
    }
  }

  totalGbp(): number {
    return this.usd * this.pricing.usd_to_gbp;
  }

  report(): string {
    const pence = (this.totalGbp() * 100).toFixed(2);
    return `Run cost: ${pence}p (${this.tokensIn} tokens in, ${this.tokensOut} out, ${this.searches} web searches, $${this.usd.toFixed(4)})`;
  }
}
