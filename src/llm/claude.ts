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
   * Check if error is retryable (transient)
   */
  private isRetryableError(error: unknown): boolean {
    // Rate limit errors
    if (error instanceof Anthropic.RateLimitError) return true;

    // API errors with retryable status codes
    if (error instanceof Anthropic.APIError) {
      const status = error.status;
      // 429 = rate limit, 529 = overloaded, 500/502/503/504 = server errors
      return status === 429 || status === 529 || (status >= 500 && status <= 504);
    }

    // Check error message for common transient issues
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return msg.includes('overloaded') ||
             msg.includes('rate limit') ||
             msg.includes('529') ||
             msg.includes('timeout') ||
             msg.includes('econnreset');
    }

    return false;
  }

  /**
   * Make API request with retry logic
   */
  private async makeRequest(prompt: string, attempt: number = 0): Promise<string> {
    const maxAttempts = 5; // Increased for transient errors

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
      // Handle retryable errors with exponential backoff
      if (this.isRetryableError(error) && attempt < maxAttempts) {
        const baseWait = error instanceof Anthropic.APIError && error.status === 529
          ? 5000  // Longer wait for overloaded (5s base)
          : 2000; // Standard wait (2s base)

        const waitTime = Math.pow(2, attempt) * baseWait;
        const cappedWait = Math.min(waitTime, 60000); // Max 60s

        // Log retry attempt
        const errorInfo = error instanceof Error ? error.message : 'Unknown';
        console.log(`  ⏳ Claude retry ${attempt + 1}/${maxAttempts} after ${cappedWait/1000}s (${errorInfo})`);

        await this.sleep(cappedWait);
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
