/**
 * OpenAI Embedding Provider
 *
 * PAID - requires API credits
 * Original implementation, kept for compatibility
 *
 * Models:
 * - text-embedding-3-small: 1536 dims (default)
 * - text-embedding-3-large: 3072 dims
 * - text-embedding-ada-002: 1536 dims (legacy)
 */

import OpenAI from 'openai';
import type { EmbeddingProvider, EmbeddingResult } from './types';

const MODEL_DIMS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

export interface OpenAIEmbeddingConfig {
  apiKey: string;
  model?: string;
}

export class OpenAIEmbeddings implements EmbeddingProvider {
  readonly name = 'OpenAI';
  readonly dimensions: number;

  private client: OpenAI;
  private model: string;

  constructor(config: OpenAIEmbeddingConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || 'text-embedding-3-small';
    this.dimensions = MODEL_DIMS[this.model] || 1536;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });

    return response.data.map(item => ({
      embedding: item.embedding,
      tokenCount: Math.ceil(response.usage.total_tokens / texts.length),
    }));
  }
}
