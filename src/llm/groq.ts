/**
 * Groq LLM Provider
 *
 * Uses Groq's lightning-fast inference API with generous free tier:
 * - FREE: 6000 TPM (tokens per minute), ~10 req/min
 * - Model: llama-3.1-8b-instant (fast and accurate)
 * - Compatible with OpenAI API format
 *
 * Rate limiting:
 * - Enforces minimum delay between requests (6 seconds)
 * - Exponential backoff on 429 errors
 * - Tracks request timestamps to stay within limits
 *
 * Sign up at: https://console.groq.com
 */

import type { LLMProvider } from './types';

export interface GroqConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  requestsPerMinute?: number; // Default: 10
}

const DEFAULT_MODEL = 'llama-3.1-8b-instant';
const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_REQUESTS_PER_MINUTE = 10;

export class GroqProvider implements LLMProvider {
  readonly name = 'Groq';
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private requestsPerMinute: number;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private windowStart: number = Date.now();

  constructor(config: GroqConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || DEFAULT_MODEL;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.requestsPerMinute = config.requestsPerMinute || DEFAULT_REQUESTS_PER_MINUTE;
  }

  /**
   * Wait to respect rate limits
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const minDelay = 60000 / this.requestsPerMinute; // Minimum ms between requests

    // Reset window if a minute has passed
    if (now - this.windowStart >= 60000) {
      this.windowStart = now;
      this.requestCount = 0;
    }

    // If we've hit the limit, wait until the window resets
    if (this.requestCount >= this.requestsPerMinute) {
      const waitTime = 60000 - (now - this.windowStart) + 1000; // Wait for window + 1s buffer
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
   * Make API request with retry logic for rate limits
   */
  private async makeRequest(prompt: string, attempt: number = 0): Promise<string> {
    const maxAttempts = 3;

    // Wait for rate limit before making request
    await this.waitForRateLimit();

    this.lastRequestTime = Date.now();
    this.requestCount++;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 500,
        temperature: 0.2,
      }),
    });

    // Handle rate limit responses with exponential backoff
    if (response.status === 429) {
      if (attempt >= maxAttempts) {
        throw new Error('Groq rate limit exceeded after max retries');
      }

      // Parse retry-after or use exponential backoff
      const retryAfter = response.headers.get('retry-after');
      let waitTime: number;

      if (retryAfter) {
        // Groq returns seconds in retry-after
        waitTime = parseInt(retryAfter, 10) * 1000 + 500; // Add 500ms buffer
      } else {
        // Exponential backoff: 3s, 6s, 12s
        waitTime = Math.pow(2, attempt) * 3000;
      }

      // Cap at 30 seconds
      waitTime = Math.min(waitTime, 30000);

      await this.sleep(waitTime);
      return this.makeRequest(prompt, attempt + 1);
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from Groq API');
    }

    return content;
  }

  async analyze(prompt: string): Promise<string> {
    try {
      return await this.makeRequest(prompt);
    } catch (error) {
      throw new Error(
        `Groq analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Create Groq provider from environment variables
 */
export function createGroqProvider(): GroqProvider | null {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new GroqProvider({ apiKey });
}
