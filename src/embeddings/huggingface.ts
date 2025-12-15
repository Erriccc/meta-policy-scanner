/**
 * HuggingFace Inference API Embedding Provider
 *
 * REQUIRES HF_TOKEN (free account)
 * https://huggingface.co/docs/api-inference/
 *
 * Uses sentence-transformers models:
 * - all-MiniLM-L6-v2: 384 dims, fast
 * - all-mpnet-base-v2: 768 dims, better quality
 * - BAAI/bge-small-en-v1.5: 384 dims, MTEB top performer
 *
 * Get a FREE token at: https://huggingface.co/settings/tokens
 */

import type { EmbeddingProvider, EmbeddingResult } from './types';

const HF_API_BASE = 'https://router.huggingface.co/hf-inference/pipeline/feature-extraction';

// Model to dimensions mapping
const MODEL_DIMS: Record<string, number> = {
  'sentence-transformers/all-MiniLM-L6-v2': 384,
  'sentence-transformers/all-mpnet-base-v2': 768,
  'BAAI/bge-small-en-v1.5': 384,
  'BAAI/bge-base-en-v1.5': 768,
};

export interface HuggingFaceConfig {
  apiKey?: string; // Optional - works without token (lower rate limits)
  model?: string;
}

export class HuggingFaceEmbeddings implements EmbeddingProvider {
  readonly name = 'HuggingFace';
  readonly dimensions: number;

  private apiKey?: string;
  private model: string;

  constructor(config: HuggingFaceConfig = {}) {
    this.model = config.model || 'sentence-transformers/all-MiniLM-L6-v2';
    this.dimensions = MODEL_DIMS[this.model] || 384;
    this.apiKey = config.apiKey;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    // HuggingFace Inference API handles batches
    const response = await fetch(`${HF_API_BASE}/${this.model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
      },
      body: JSON.stringify({
        inputs: texts,
        options: {
          wait_for_model: true, // Wait if model is loading
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Handle model loading (503)
      if (response.status === 503) {
        // Wait and retry
        await this.sleep(5000);
        return this.embedBatch(texts);
      }

      throw new Error(`HuggingFace API error (${response.status}): ${errorText}`);
    }

    const embeddings = await response.json() as number[][];

    return embeddings.map(embedding => ({
      embedding,
      tokenCount: undefined, // HF doesn't return token counts
    }));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
