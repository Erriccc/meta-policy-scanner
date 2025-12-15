/**
 * Jina Reader Scraper - FREE URL to Markdown conversion
 * https://jina.ai/reader/
 *
 * Simply prepend https://r.jina.ai/ to any URL to get clean markdown
 *
 * Supports multiple embedding providers:
 * - Voyage AI (FREE: 200M tokens) - RECOMMENDED
 * - HuggingFace (FREE with rate limits)
 * - OpenAI (paid)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import type { EmbeddingProvider } from '../embeddings/types';
import { createEmbeddingProvider, type EmbeddingConfig } from '../embeddings';

const JINA_READER_BASE = 'https://r.jina.ai/';

export interface IngestOptions {
  platform?: string;
  onProgress?: (message: string) => void;
}

export interface IngestResult {
  url: string;
  success: boolean;
  chunksCreated: number;
  error?: string;
}

export interface JinaReaderConfig {
  embeddingProvider?: EmbeddingProvider;
  embeddingConfig?: EmbeddingConfig;
  onProgress?: (message: string) => void;
}

export class JinaReaderScraper {
  private embeddingProvider: EmbeddingProvider;
  private onProgress?: (message: string) => void;

  constructor(
    private supabase: SupabaseClient,
    config: JinaReaderConfig
  ) {
    // Use provided provider or create from config
    if (config.embeddingProvider) {
      this.embeddingProvider = config.embeddingProvider;
    } else if (config.embeddingConfig) {
      this.embeddingProvider = createEmbeddingProvider(config.embeddingConfig);
    } else {
      throw new Error('Either embeddingProvider or embeddingConfig is required');
    }
    this.onProgress = config.onProgress;
  }

  private log(message: string) {
    if (this.onProgress) {
      this.onProgress(message);
    }
  }

  /**
   * Fetch URL content via Jina Reader API (FREE)
   */
  async fetchWithJina(url: string): Promise<{ markdown: string; title: string }> {
    const jinaUrl = `${JINA_READER_BASE}${url}`;

    this.log(`  Fetching via Jina Reader...`);

    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/markdown',
      },
    });

    if (!response.ok) {
      throw new Error(`Jina Reader failed: ${response.status} ${response.statusText}`);
    }

    const markdown = await response.text();

    // Extract title from first heading or URL
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : new URL(url).pathname.split('/').pop() || url;

    return { markdown, title };
  }

  /**
   * Ingest a single URL: Fetch → Chunk → Embed → Store
   */
  async ingestUrl(url: string, options: IngestOptions = {}): Promise<IngestResult> {
    try {
      this.log(`\n📄 Processing: ${url}`);

      // 1. Fetch via Jina Reader
      const { markdown, title } = await this.fetchWithJina(url);

      if (!markdown || markdown.length < 100) {
        return { url, success: false, chunksCreated: 0, error: 'No content extracted' };
      }

      this.log(`  ✓ Fetched ${markdown.length} characters`);

      // 2. Check if content changed (skip if unchanged)
      const contentHash = this.hashContent(markdown);
      const { data: existing } = await this.supabase
        .from('policies')
        .select('id, content_hash')
        .eq('url', url)
        .maybeSingle();

      if (existing?.content_hash === contentHash) {
        this.log(`  ⏭️  No changes, skipping`);
        return { url, success: true, chunksCreated: 0 };
      }

      // 3. Detect platform from URL
      const platform = options.platform || this.detectPlatform(url);

      // Get platform ID
      const { data: platformData } = await this.supabase
        .from('platforms')
        .select('id')
        .eq('name', platform)
        .maybeSingle();

      // 4. Upsert policy document
      const { data: policy, error: policyError } = await this.supabase
        .from('policies')
        .upsert({
          platform_id: platformData?.id,
          title,
          url,
          content: markdown,
          content_hash: contentHash,
          last_scraped: new Date().toISOString(),
        }, { onConflict: 'url' })
        .select()
        .single();

      if (policyError) {
        throw new Error(`Failed to save policy: ${policyError.message}`);
      }

      this.log(`  ✓ Saved policy: "${title}"`);

      // 5. Chunk and embed
      const chunksCreated = await this.chunkAndEmbed(policy.id, markdown, platform);

      this.log(`  ✓ Created ${chunksCreated} chunks with embeddings`);

      return { url, success: true, chunksCreated };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`  ❌ Error: ${message}`);
      return { url, success: false, chunksCreated: 0, error: message };
    }
  }

  /**
   * Ingest multiple URLs from array
   */
  async ingestUrls(urls: string[], options: IngestOptions = {}): Promise<IngestResult[]> {
    const results: IngestResult[] = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i].trim();
      if (!url || url.startsWith('#')) continue; // Skip empty lines and comments

      this.log(`\n[${i + 1}/${urls.length}] Processing URL...`);

      const result = await this.ingestUrl(url, options);
      results.push(result);

      // Small delay between requests to be nice to Jina
      if (i < urls.length - 1) {
        await this.sleep(1000);
      }
    }

    return results;
  }

  /**
   * Ingest URLs from a file (one URL per line)
   */
  async ingestFromFile(filePath: string, options: IngestOptions = {}): Promise<IngestResult[]> {
    const fs = await import('fs');
    const content = fs.readFileSync(filePath, 'utf-8');
    const urls = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));

    this.log(`📁 Found ${urls.length} URLs in ${filePath}\n`);

    return this.ingestUrls(urls, options);
  }

  /**
   * Chunk text and create embeddings
   */
  private async chunkAndEmbed(policyId: number, content: string, platform: string): Promise<number> {
    // Chunk the content
    const chunks = this.chunkText(content);

    if (chunks.length === 0) return 0;

    // Delete existing chunks for this policy
    await this.supabase
      .from('policy_chunks')
      .delete()
      .eq('policy_id', policyId);

    // Process chunks in batches
    const batchSize = 20;
    let totalInserted = 0;

    this.log(`  Embedding with ${this.embeddingProvider.name} (${this.embeddingProvider.dimensions} dims)...`);

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      // Generate embeddings using configurable provider
      const embeddingResults = await this.embeddingProvider.embedBatch(batch);

      // Prepare chunk records
      const chunkRecords = batch.map((chunkText, idx) => ({
        policy_id: policyId,
        chunk_text: chunkText,
        chunk_index: i + idx,
        embedding: embeddingResults[idx].embedding,
        metadata: {
          platform,
          token_count: this.estimateTokens(chunkText),
          embedding_provider: this.embeddingProvider.name,
          embedding_dimensions: this.embeddingProvider.dimensions,
        },
      }));

      // Insert chunks
      const { error } = await this.supabase
        .from('policy_chunks')
        .insert(chunkRecords);

      if (!error) {
        totalInserted += chunkRecords.length;
      }
    }

    return totalInserted;
  }

  /**
   * Smart chunking: split by headers, then paragraphs
   */
  private chunkText(text: string, maxTokens: number = 500): string[] {
    const chunks: string[] = [];

    // Split by headers first (##, ###)
    const sections = text.split(/(?=^#{1,3}\s)/m);

    for (const section of sections) {
      if (!section.trim()) continue;

      const sectionTokens = this.estimateTokens(section);

      if (sectionTokens <= maxTokens) {
        chunks.push(section.trim());
      } else {
        // Split large sections by paragraphs
        const paragraphs = section.split(/\n\n+/);
        let currentChunk = '';
        let currentTokens = 0;

        for (const para of paragraphs) {
          const paraTokens = this.estimateTokens(para);

          if (currentTokens + paraTokens > maxTokens && currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = para;
            currentTokens = paraTokens;
          } else {
            currentChunk += '\n\n' + para;
            currentTokens += paraTokens;
          }
        }

        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
      }
    }

    // Filter out very short chunks
    return chunks.filter(c => c.length > 50);
  }

  /**
   * Detect platform from URL
   */
  private detectPlatform(url: string): string {
    const urlLower = url.toLowerCase();

    if (urlLower.includes('/instagram')) return 'instagram';
    if (urlLower.includes('/messenger')) return 'messenger';
    if (urlLower.includes('/whatsapp')) return 'whatsapp';
    if (urlLower.includes('/marketing-api') || urlLower.includes('/ads')) return 'ads';
    if (urlLower.includes('/graph-api') || urlLower.includes('facebook.com')) return 'facebook';

    return 'all';
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Search indexed docs using semantic similarity
   */
  async searchDocs(query: string, limit: number = 5): Promise<Array<{
    chunk_text: string;
    similarity: number;
    policy_url?: string;
    metadata?: Record<string, unknown>;
  }>> {
    // Generate embedding for query using configurable provider
    const result = await this.embeddingProvider.embed(query);
    const queryEmbedding = result.embedding;

    // Search using pgvector (lower threshold for better recall)
    const { data, error } = await this.supabase.rpc('search_policy_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: limit,
    });

    if (error) {
      throw new Error(`Search failed: ${error.message}`);
    }

    // Get policy URLs for results
    const results = [];
    for (const row of data || []) {
      const { data: policy } = await this.supabase
        .from('policies')
        .select('url')
        .eq('id', row.policy_id)
        .single();

      results.push({
        chunk_text: row.chunk_text,
        similarity: row.similarity,
        policy_url: policy?.url,
        metadata: row.metadata,
      });
    }

    return results;
  }

  /**
   * Get the embedding provider being used
   */
  getEmbeddingProvider(): { name: string; dimensions: number } {
    return {
      name: this.embeddingProvider.name,
      dimensions: this.embeddingProvider.dimensions,
    };
  }
}
