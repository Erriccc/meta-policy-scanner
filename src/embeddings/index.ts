/**
 * Embedding Providers
 *
 * Multiple free and paid options for generating text embeddings.
 *
 * Recommended: Voyage AI (FREE 200M tokens)
 */

export type { EmbeddingProvider, EmbeddingResult, EmbeddingConfig, EmbeddingProviderType } from './types';

export { VoyageEmbeddings, type VoyageConfig } from './voyage';
export { HuggingFaceEmbeddings, type HuggingFaceConfig } from './huggingface';
export { OpenAIEmbeddings, type OpenAIEmbeddingConfig } from './openai';

import type { EmbeddingProvider, EmbeddingConfig } from './types';
import { VoyageEmbeddings } from './voyage';
import { HuggingFaceEmbeddings } from './huggingface';
import { OpenAIEmbeddings } from './openai';

/**
 * Create an embedding provider based on config
 *
 * @example
 * // Voyage AI (recommended - FREE 200M tokens)
 * const provider = createEmbeddingProvider({
 *   provider: 'voyage',
 *   apiKey: process.env.VOYAGE_API_KEY,
 * });
 *
 * // HuggingFace (FREE with rate limits)
 * const provider = createEmbeddingProvider({
 *   provider: 'huggingface',
 *   apiKey: process.env.HF_TOKEN, // optional
 * });
 */
export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  switch (config.provider) {
    case 'voyage':
      if (!config.apiKey) {
        throw new Error('Voyage AI requires an API key. Get one free at https://dash.voyageai.com/');
      }
      return new VoyageEmbeddings({
        apiKey: config.apiKey,
        model: (config.model as 'voyage-3-lite' | 'voyage-3' | 'voyage-3-large') || 'voyage-3-lite',
      });

    case 'huggingface':
      return new HuggingFaceEmbeddings({
        apiKey: config.apiKey, // Optional
        model: config.model,
      });

    case 'openai':
      if (!config.apiKey) {
        throw new Error('OpenAI requires an API key');
      }
      return new OpenAIEmbeddings({
        apiKey: config.apiKey,
        model: config.model,
      });

    default:
      throw new Error(`Unknown embedding provider: ${config.provider}`);
  }
}

/**
 * Get provider info for display
 */
export function getProviderInfo(): Array<{
  provider: string;
  description: string;
  free: boolean;
  dimensions: number;
  requiresKey: boolean;
}> {
  return [
    {
      provider: 'voyage',
      description: 'Voyage AI - State-of-the-art embeddings (FREE: 200M tokens)',
      free: true,
      dimensions: 512, // voyage-3-lite default
      requiresKey: true, // But key is free to get
    },
    {
      provider: 'huggingface',
      description: 'HuggingFace - Open source models (FREE with HF token)',
      free: true,
      dimensions: 384,
      requiresKey: true, // Free token required
    },
    {
      provider: 'openai',
      description: 'OpenAI - text-embedding-3-small (PAID)',
      free: false,
      dimensions: 1536,
      requiresKey: true,
    },
  ];
}
