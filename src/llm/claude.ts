/**
 * Claude LLM Provider
 *
 * Uses Anthropic's Claude API for high-quality policy analysis.
 * Claude excels at nuanced understanding and reduces false positives.
 *
 * Rate limits:
 * - Tier 1: 50 RPM, 40,000 TPM
 * - Includes automatic retry with exponential backoff
 *
 * Sign up at: https://console.anthropic.com
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider } from './types';

export interface ClaudeConfig {
  apiKey: string;
  model?: string;
  requestsPerMinute?: number;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_REQUESTS_PER_MINUTE = 50;

export class ClaudeProvider implements LLMProvider {
  readonly name = 'Claude';
  private client: Anthropic;
  private model: string;
  private requestsPerMinute: number;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private windowStart: number = Date.now();

  constructor(config: ClaudeConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model || DEFAULT_MODEL;
    this.requestsPerMinute = config.requestsPerMinute || DEFAULT_REQUESTS_PER_MINUTE;
  }

  /**
   * Wait to respect rate limits
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const minDelay = 60000 / this.requestsPerMinute;

    // Reset window if a minute has passed
    if (now - this.windowStart >= 60000) {
      this.windowStart = now;
      this.requestCount = 0;
    }

    // If we've hit the limit, wait until the window resets
    if (this.requestCount >= this.requestsPerMinute) {
      const waitTime = 60000 - (now - this.windowStart) + 1000;
      if (waitTime > 0) {
        await this.sleep(waitTime);
        this.windowStart = Date.now();
        this.requestCount = 0;
      }
    }

    // Ensure minimum delay between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < minDelay) {
      await this.sleep(minDelay - timeSinceLastRequest);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Make API request with retry logic
   */
  private async makeRequest(prompt: string, attempt: number = 0): Promise<string> {
    const maxAttempts = 3;

    await this.waitForRateLimit();
    this.lastRequestTime = Date.now();
    this.requestCount++;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Extract text content from response
      const textContent = response.content.find(block => block.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text response from Claude API');
      }

      return textContent.text;
    } catch (error) {
      // Handle rate limit errors with backoff
      if (error instanceof Anthropic.RateLimitError) {
        if (attempt >= maxAttempts) {
          throw new Error('Claude rate limit exceeded after max retries');
        }

        const waitTime = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
        await this.sleep(Math.min(waitTime, 30000));
        return this.makeRequest(prompt, attempt + 1);
      }

      throw error;
    }
  }

  async analyze(prompt: string): Promise<string> {
    try {
      return await this.makeRequest(prompt);
    } catch (error) {
      throw new Error(
        `Claude analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Create Claude provider from environment variables
 */
export function createClaudeProvider(): ClaudeProvider | null {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new ClaudeProvider({ apiKey });
}
