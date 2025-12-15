/**
 * LLM Provider Factory
 *
 * Auto-detects and creates the best available LLM provider based on:
 * 1. Environment variables (ANTHROPIC_API_KEY, GROQ_API_KEY, OPENAI_API_KEY)
 * 2. Local services (Ollama running on localhost)
 * 3. Explicit configuration
 *
 * Priority order (when auto-detecting):
 * 1. Claude (best quality, fewest false positives)
 * 2. Groq (free tier, fast)
 * 3. OpenAI (paid, high quality)
 * 4. Ollama (free, local, private)
 */

import type { LLMProvider, LLMConfig } from './types';
import { ClaudeProvider, createClaudeProvider } from './claude';
import { GroqProvider, createGroqProvider } from './groq';
import { OllamaProvider, createOllamaProvider } from './ollama';
import { OpenAIProvider, createOpenAIProvider } from './openai';

// Re-export types
export type { LLMProvider, LLMConfig, AIAnalysisResponse } from './types';
export { ClaudeProvider } from './claude';
export { GroqProvider } from './groq';
export { OllamaProvider } from './ollama';
export { OpenAIProvider } from './openai';

/**
 * Create an LLM provider with explicit configuration
 */
export function createLLMProvider(config: LLMConfig): LLMProvider | null {
  switch (config.provider) {
    case 'claude':
    case 'anthropic':
      if (!config.apiKey) {
        throw new Error('Claude provider requires apiKey in config');
      }
      return new ClaudeProvider({
        apiKey: config.apiKey,
        model: config.model,
      });

    case 'groq':
      if (!config.apiKey) {
        throw new Error('Groq provider requires apiKey in config');
      }
      return new GroqProvider({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
      });

    case 'openai':
      if (!config.apiKey) {
        throw new Error('OpenAI provider requires apiKey in config');
      }
      return new OpenAIProvider({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
      });

    case 'ollama':
      return new OllamaProvider({
        model: config.model,
        baseUrl: config.baseUrl,
      });

    default:
      return null;
  }
}

/**
 * Auto-detect and create the best available LLM provider
 *
 * Priority:
 * 1. ANTHROPIC_API_KEY / CLAUDE_API_KEY env var (best quality)
 * 2. GROQ_API_KEY env var (free tier, fast)
 * 3. OPENAI_API_KEY env var (paid, high quality)
 * 4. Ollama (if running locally)
 *
 * @returns LLMProvider instance or null if none available
 */
export async function createAutoLLMProvider(): Promise<LLMProvider | null> {
  // 1. Try Claude (best quality, fewer false positives)
  const claudeProvider = createClaudeProvider();
  if (claudeProvider) {
    return claudeProvider;
  }

  // 2. Try Groq (free tier, fast)
  const groqProvider = createGroqProvider();
  if (groqProvider) {
    return groqProvider;
  }

  // 3. Try OpenAI (paid, high quality)
  const openaiProvider = createOpenAIProvider();
  if (openaiProvider) {
    return openaiProvider;
  }

  // 4. Try Ollama (free, local)
  const ollamaProvider = await createOllamaProvider();
  if (ollamaProvider) {
    return ollamaProvider;
  }

  return null;
}

/**
 * Synchronous version of auto-detection (doesn't check Ollama availability)
 *
 * Use this for quick initialization. If you need to check Ollama,
 * use createAutoLLMProvider() instead.
 *
 * @returns LLMProvider instance or null if none available
 */
export function createAutoLLMProviderSync(): LLMProvider | null {
  // 1. Try Claude (best quality)
  const claudeProvider = createClaudeProvider();
  if (claudeProvider) {
    return claudeProvider;
  }

  // 2. Try Groq (free tier, fast)
  const groqProvider = createGroqProvider();
  if (groqProvider) {
    return groqProvider;
  }

  // 3. Try OpenAI (paid, high quality)
  const openaiProvider = createOpenAIProvider();
  if (openaiProvider) {
    return openaiProvider;
  }

  // 4. Create Ollama provider without availability check
  // It will fail at runtime if Ollama isn't available
  return new OllamaProvider();
}

/**
 * Get information about available providers
 */
export async function getAvailableProviders(): Promise<{
  claude: boolean;
  groq: boolean;
  openai: boolean;
  ollama: boolean;
}> {
  const claude = !!createClaudeProvider();
  const groq = !!createGroqProvider();
  const openai = !!createOpenAIProvider();

  let ollama = false;
  try {
    const provider = await createOllamaProvider();
    ollama = !!provider;
  } catch {
    ollama = false;
  }

  return { claude, groq, openai, ollama };
}

/**
 * Get setup instructions for users with no available providers
 */
export function getSetupInstructions(): string {
  return `
No LLM provider available. To enable AI-powered scanning, choose one:

1. Claude (Best Quality) - Recommended for accuracy
   - Sign up: https://console.anthropic.com
   - Get API key and set: export ANTHROPIC_API_KEY="your-key"
   - Best at reducing false positives

2. Groq (FREE, Fast) - Recommended for free tier
   - Sign up: https://console.groq.com
   - Get API key and set: export GROQ_API_KEY="your-key"
   - Free tier: 6000 TPM, rate limited

3. OpenAI (Paid, High Quality)
   - Get API key: https://platform.openai.com/api-keys
   - Set: export OPENAI_API_KEY="your-key"

4. Ollama (FREE, Local, Private)
   - Install: https://ollama.ai
   - Run: ollama pull llama3.2
   - Start: ollama serve

Then run the scanner again.
`.trim();
}
