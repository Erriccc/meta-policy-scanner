/**
 * LLM Provider Types
 *
 * Supports multiple LLM backends for AI-powered policy scanning:
 * - Claude (best quality, Anthropic)
 * - Groq (FREE tier with fast inference)
 * - Ollama (FREE local models)
 * - OpenAI (paid, original implementation)
 */

export interface LLMProvider {
  /**
   * Provider name for logging
   */
  name: string;

  /**
   * Analyze code for policy violations
   * @param prompt The analysis prompt
   * @returns JSON-parseable string with analysis result
   */
  analyze(prompt: string): Promise<string>;
}

export type LLMProviderType = 'claude' | 'anthropic' | 'groq' | 'ollama' | 'openai';

export interface LLMConfig {
  /**
   * LLM provider to use
   */
  provider: LLMProviderType;

  /**
   * API key (required for Groq and OpenAI, not needed for Ollama)
   */
  apiKey?: string;

  /**
   * Model name override
   */
  model?: string;

  /**
   * Base URL override (useful for Ollama custom ports)
   */
  baseUrl?: string;
}

/**
 * Standard response format for AI analysis
 */
export interface AIAnalysisResponse {
  isViolation: boolean;
  confidence: number;
  ruleCode: string;
  ruleName: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  recommendation: string;
}
