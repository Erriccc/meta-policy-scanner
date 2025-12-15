/**
 * Voyage AI Embedding Provider
 *
 * FREE TIER: 200 million tokens per account!
 * https://docs.voyageai.com/docs/pricing
 *
 * Models and their supported dimensions:
 * - voyage-3-lite: 512 dims only (fast, cost-effective)
 * - voyage-3: 1024 dims (default), 256, 512
 * - voyage-3-large: 1024 dims (default), 256, 512, 2048
 */

import type { EmbeddingProvider, EmbeddingResult } from './types';

const VOYAGE_API_BASE = 'https://api.voyageai.com/v1';

// Model to default dimensions mapping
const MODEL_DEFAULT_DIMS: Record<string, number> = {
  'voyage-3-lite': 512,
  'voyage-3': 1024,
  'voyage-3-large': 1024,
};

export interface VoyageConfig {
  apiKey: string;
  model?: 'voyage-3-lite' | 'voyage-3' | 'voyage-3-large';
  dimensions?: number;
}

interface VoyageEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    total_tokens: number;
  };
}

export class VoyageEmbeddings implements EmbeddingProvider {
  readonly name = 'Voyage AI';
  readonly dimensions: number;

  private apiKey: string;
  private model: string;

  constructor(config: VoyageConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'voyage-3-lite'; // Default to lite (free tier friendly)
    // Use model-specific default dimensions
    this.dimensions = config.dimensions || MODEL_DEFAULT_DIMS[this.model] || 512;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    // Voyage AI supports up to 128 texts per batch
    const batchSize = 128;
    const allResults: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const results = await this.callVoyageAPI(batch);
      allResults.push(...results);
    }

    return allResults;
  }

  private async callVoyageAPI(texts: string[]): Promise<EmbeddingResult[]> {
    const response = await fetch(`${VOYAGE_API_BASE}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        input_type: 'document', // Better for RAG storage
        output_dimension: this.dimensions,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Voyage API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as VoyageEmbeddingResponse;

    // Sort by index to maintain order
    const sortedData = data.data.sort((a, b) => a.index - b.index);

    return sortedData.map((item) => ({
      embedding: item.embedding,
      tokenCount: Math.ceil(data.usage.total_tokens / texts.length), // Approximate per-text
    }));
  }
}
