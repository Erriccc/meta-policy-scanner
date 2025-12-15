/**
 * OpenAI LLM Provider
 *
 * Wraps the existing OpenAI SDK for consistency with other providers:
 * - PAID: Pay-per-token pricing
 * - Model: gpt-4o-mini (default, fast and affordable)
 * - High quality: Best for critical analysis
 *
 * API Key: https://platform.openai.com/api-keys
 */

import OpenAI from 'openai';
import type { LLMProvider } from './types';

export interface OpenAIConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

const DEFAULT_MODEL = 'gpt-4o-mini';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'OpenAI';
  private client: OpenAI;
  private model: string;

  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    this.model = config.model || DEFAULT_MODEL;
  }

  async analyze(prompt: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 500,
        temperature: 0.2,
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No response from OpenAI API');
      }

      return content;
    } catch (error) {
      throw new Error(
        `OpenAI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Create OpenAI provider from environment variables
 */
export function createOpenAIProvider(): OpenAIProvider | null {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new OpenAIProvider({ apiKey });
}
