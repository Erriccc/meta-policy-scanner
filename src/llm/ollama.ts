/**
 * Ollama LLM Provider
 *
 * Uses locally-running Ollama for 100% free, private LLM inference:
 * - FREE: Unlimited usage (runs on your machine)
 * - Model: llama3.2 (default, 3B parameters)
 * - Privacy: All data stays on your machine
 * - No API key needed
 *
 * Install: https://ollama.ai
 * Quick start: `ollama pull llama3.2`
 */

import type { LLMProvider } from './types';

export interface OllamaConfig {
  model?: string;
  baseUrl?: string;
}

const DEFAULT_MODEL = 'llama3.2';
const DEFAULT_BASE_URL = 'http://localhost:11434';

export class OllamaProvider implements LLMProvider {
  readonly name = 'Ollama';
  private model: string;
  private baseUrl: string;

  constructor(config: OllamaConfig = {}) {
    this.model = config.model || DEFAULT_MODEL;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  }

  /**
   * Check if Ollama is running and available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000), // 2 second timeout
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check if a specific model is available locally
   */
  async hasModel(modelName?: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return false;

      const data = (await response.json()) as {
        models?: Array<{ name: string }>;
      };
      const models = data.models || [];
      const targetModel = modelName || this.model;

      return models.some((m: { name: string }) => m.name.includes(targetModel));
    } catch {
      return false;
    }
  }

  async analyze(prompt: string): Promise<string> {
    try {
      // First check if Ollama is available
      if (!(await this.isAvailable())) {
        throw new Error('Ollama is not running. Start it with: ollama serve');
      }

      // Check if model is available
      if (!(await this.hasModel())) {
        throw new Error(
          `Model '${this.model}' not found. Pull it with: ollama pull ${this.model}`
        );
      }

      // Format prompt to request JSON output
      const jsonPrompt = `${prompt}

IMPORTANT: Respond with ONLY valid JSON. No explanatory text before or after. The response must be parseable JSON.`;

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: jsonPrompt,
          stream: false,
          format: 'json',
          options: {
            temperature: 0.2,
            num_predict: 500,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as {
        response?: string;
      };
      const content = data.response;

      if (!content) {
        throw new Error('No response from Ollama');
      }

      // Ollama sometimes wraps JSON in markdown code blocks, clean it up
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.replace(/^```json\n/, '').replace(/\n```$/, '');
      } else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      // Validate it's parseable JSON
      try {
        JSON.parse(cleanedContent);
      } catch {
        throw new Error('Ollama returned invalid JSON');
      }

      return cleanedContent;
    } catch (error) {
      throw new Error(
        `Ollama analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Create Ollama provider and check if it's available
 */
export async function createOllamaProvider(): Promise<OllamaProvider | null> {
  const provider = new OllamaProvider();

  if (!(await provider.isAvailable())) {
    return null;
  }

  return provider;
}
