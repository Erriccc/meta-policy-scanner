/**
 * Embedding Provider Types
 *
 * Supports multiple embedding backends:
 * - Voyage AI (FREE: 200M tokens)
 * - HuggingFace Inference API (FREE with rate limits)
 * - OpenAI (paid, original implementation)
 */

export interface EmbeddingResult {
  embedding: number[];
  tokenCount?: number;
}

export interface EmbeddingProvider {
  /**
   * Provider name for logging
   */
  readonly name: string;

  /**
   * Embedding dimensions (needed for pgvector)
   */
  readonly dimensions: number;

  /**
   * Generate embedding for a single text
   */
  embed(text: string): Promise<EmbeddingResult>;

  /**
   * Generate embeddings for multiple texts (batch)
   */
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
}

export type EmbeddingProviderType = 'voyage' | 'huggingface' | 'openai';

export interface EmbeddingConfig {
  provider: EmbeddingProviderType;
  apiKey?: string;
  model?: string;
}
