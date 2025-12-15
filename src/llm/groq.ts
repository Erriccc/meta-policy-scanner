/**
 * Groq LLM Provider
 *
 * Uses Groq's lightning-fast inference API with generous free tier:
 * - FREE: 14,400 requests/day (10 req/min)
 * - Model: llama-3.1-8b-instant (fast and accurate)
 * - Compatible with OpenAI API format
 *
 * Sign up at: https://console.groq.com
 */

import type { LLMProvider } from './types';

export interface GroqConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

const DEFAULT_MODEL = 'llama-3.1-8b-instant';
const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

export class GroqProvider implements LLMProvider {
  readonly name = 'Groq';
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: GroqConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || DEFAULT_MODEL;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  }

  async analyze(prompt: string): Promise<string> {
    try {
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
