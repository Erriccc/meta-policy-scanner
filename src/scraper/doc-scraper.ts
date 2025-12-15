import OpenAI from 'openai';
import { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

// Dynamic import helper that bypasses TypeScript's CommonJS transform
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('specifier', 'return import(specifier)');

// Dynamic import for Firecrawl (ESM module)
let FirecrawlApp: any;

export interface PolicySource {
  platform: string;
  url: string;
  scrapeMode: 'single' | 'crawl';
  maxDepth?: number;
}

// Meta API documentation sources to scrape
const POLICY_SOURCES: PolicySource[] = [
  // Core policy pages
  {
    platform: 'all',
    url: 'https://developers.facebook.com/terms/',
    scrapeMode: 'single',
  },
  {
    platform: 'all',
    url: 'https://developers.facebook.com/docs/development/release/data-deletion/',
    scrapeMode: 'single',
  },
  // Rate limiting (critical)
  {
    platform: 'facebook',
    url: 'https://developers.facebook.com/docs/graph-api/overview/rate-limiting/',
    scrapeMode: 'single',
  },
  // Graph API
  {
    platform: 'facebook',
    url: 'https://developers.facebook.com/docs/graph-api/',
    scrapeMode: 'crawl',
    maxDepth: 2,
  },
  // Instagram API
  {
    platform: 'instagram',
    url: 'https://developers.facebook.com/docs/instagram-api/',
    scrapeMode: 'crawl',
    maxDepth: 2,
  },
  // Messenger Platform
  {
    platform: 'messenger',
    url: 'https://developers.facebook.com/docs/messenger-platform/',
    scrapeMode: 'crawl',
    maxDepth: 2,
  },
  // WhatsApp Business
  {
    platform: 'whatsapp',
    url: 'https://developers.facebook.com/docs/whatsapp/',
    scrapeMode: 'crawl',
    maxDepth: 2,
  },
  // Marketing API
  {
    platform: 'ads',
    url: 'https://developers.facebook.com/docs/marketing-apis/',
    scrapeMode: 'crawl',
    maxDepth: 2,
  },
];

export class DocScraper {
  private firecrawl: any;
  private openai: OpenAI;
  private onProgress?: (message: string) => void;
  private firecrawlApiKey: string;
  private initialized = false;
  private lastRequestTime = 0;
  private minRequestInterval = 25000; // 25 seconds between requests (safe for 3 req/min limit)

  constructor(
    private supabase: SupabaseClient,
    firecrawlApiKey: string,
    openaiApiKey: string,
    options?: { onProgress?: (message: string) => void }
  ) {
    this.firecrawlApiKey = firecrawlApiKey;
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.onProgress = options?.onProgress;
  }

  /**
   * Rate limit helper - ensures minimum interval between Firecrawl API calls
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      this.log(`  ⏳ Rate limit: waiting ${Math.ceil(waitTime / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Retry with exponential backoff for 429 errors
   */
  private async withRetry<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.waitForRateLimit();
        return await fn();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);

        // Handle rate limit errors
        if (msg.includes('429') || msg.includes('Rate limit')) {
          const waitTime = Math.pow(2, attempt + 1) * 30000; // 30s, 60s, 120s
          this.log(`  ⚠️ Rate limited, waiting ${waitTime / 1000}s (attempt ${attempt + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        throw error;
      }
    }

    throw new Error('Max retries exceeded');
  }

  private async ensureFirecrawl() {
    if (!this.initialized && this.firecrawlApiKey) {
      // Use dynamicImport to bypass TypeScript's CommonJS transform for ESM module
      const module = await dynamicImport('@mendable/firecrawl-js');
      FirecrawlApp = module.default;
      this.firecrawl = new FirecrawlApp({ apiKey: this.firecrawlApiKey });
      this.initialized = true;
    }
  }

  private log(message: string) {
    if (this.onProgress) {
      this.onProgress(message);
    }
  }

  async updateAllDocs(): Promise<{ success: number; failed: number; chunks: number }> {
    await this.ensureFirecrawl();
    const results = { success: 0, failed: 0, chunks: 0 };

    for (const source of POLICY_SOURCES) {
      try {
        this.log(`Scraping ${source.platform}: ${source.url}`);

        if (source.scrapeMode === 'crawl') {
          const crawlChunks = await this.crawlAndStore(source);
          results.chunks += crawlChunks;
        } else {
          const singleChunks = await this.scrapeAndStore(source);
          results.chunks += singleChunks;
        }

        results.success++;
        this.log(`✓ ${source.platform}: ${source.url}`);
      } catch (error: unknown) {
        results.failed++;
        const message = error instanceof Error ? error.message : String(error);
        this.log(`✗ ${source.platform}: ${message}`);
      }
    }

    return results;
  }

  async scrapeAndStore(source: PolicySource): Promise<number> {
    // Scrape single page with rate limiting and retry
    // Using Firecrawl v1 API format
    const scrapeResult = await this.withRetry(async () => {
      return await this.firecrawl.scrapeUrl(source.url, {
        formats: ['markdown'],
        waitFor: 2000, // Wait for JS-rendered content
      });
    }) as { success?: boolean; markdown?: string; metadata?: { title?: string }; data?: { markdown?: string; metadata?: { title?: string } } };

    // Handle both v0 and v1 API response formats
    const markdown = scrapeResult.markdown || scrapeResult.data?.markdown;
    const title = scrapeResult.metadata?.title || scrapeResult.data?.metadata?.title || source.url;

    if (!markdown) {
      throw new Error('No content extracted');
    }

    // Check if content changed
    const contentHash = this.hashContent(markdown);
    const { data: existing } = await this.supabase
      .from('policies')
      .select('id, content_hash')
      .eq('url', source.url)
      .single();

    if (existing?.content_hash === contentHash) {
      this.log(`  No changes detected, skipping...`);
      return 0;
    }

    // Get platform ID
    const { data: platform } = await this.supabase
      .from('platforms')
      .select('id')
      .eq('name', source.platform)
      .single();

    // Upsert policy
    const { data: policy, error } = await this.supabase
      .from('policies')
      .upsert({
        platform_id: platform?.id,
        title,
        url: source.url,
        content: markdown,
        content_hash: contentHash,
        last_scraped: new Date().toISOString(),
      }, { onConflict: 'url' })
      .select()
      .single();

    if (error) throw error;

    // Chunk and embed
    const chunkCount = await this.chunkAndEmbed(policy.id, markdown, source.platform);
    return chunkCount;
  }

  async crawlAndStore(source: PolicySource): Promise<number> {
    let totalChunks = 0;

    // Crawl multiple pages with rate limiting and retry
    // Using Firecrawl v1 API format
    const crawlResult = await this.withRetry(async () => {
      return await this.firecrawl.crawlUrl(source.url, {
        maxDepth: source.maxDepth || 2,
        limit: 15, // Reduced for rate limits
        scrapeOptions: {
          formats: ['markdown'],
          waitFor: 2000,
        },
      });
    }) as { success?: boolean; data?: Array<{ markdown?: string; url?: string; metadata?: { title?: string } }> };

    // Handle v1 API response
    if (!crawlResult.data || crawlResult.data.length === 0) {
      throw new Error('Crawl failed or no pages found');
    }

    this.log(`  Found ${crawlResult.data.length} pages`);

    // Get platform ID
    const { data: platform } = await this.supabase
      .from('platforms')
      .select('id')
      .eq('name', source.platform)
      .single();

    // Process each page
    for (const page of crawlResult.data) {
      if (!page.markdown) continue;

      const contentHash = this.hashContent(page.markdown);
      const title = page.metadata?.title || page.url || 'Untitled';

      // Check if content changed
      const { data: existing } = await this.supabase
        .from('policies')
        .select('id, content_hash')
        .eq('url', page.url)
        .maybeSingle();

      if (existing?.content_hash === contentHash) {
        continue; // Skip unchanged
      }

      // Upsert policy
      const { data: policy, error } = await this.supabase
        .from('policies')
        .upsert({
          platform_id: platform?.id,
          title,
          url: page.url,
          content: page.markdown,
          content_hash: contentHash,
          last_scraped: new Date().toISOString(),
        }, { onConflict: 'url' })
        .select()
        .single();

      if (error) {
        this.log(`  Warning: Failed to save ${page.url}`);
        continue;
      }

      // Chunk and embed
      const chunkCount = await this.chunkAndEmbed(policy.id, page.markdown, source.platform);
      totalChunks += chunkCount;
    }

    return totalChunks;
  }

  private async chunkAndEmbed(policyId: number, content: string, platform: string): Promise<number> {
    // Chunk the content
    const chunks = this.chunkText(content);

    if (chunks.length === 0) return 0;

    // Delete existing chunks for this policy
    await this.supabase
      .from('policy_chunks')
      .delete()
      .eq('policy_id', policyId);

    // Process chunks in batches (OpenAI has rate limits)
    const batchSize = 20;
    let totalInserted = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      // Generate embeddings for batch
      const embeddingResponse = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch,
      });

      // Prepare chunk records
      const chunkRecords = batch.map((chunkText, idx) => ({
        policy_id: policyId,
        chunk_text: chunkText,
        chunk_index: i + idx,
        embedding: embeddingResponse.data[idx].embedding,
        metadata: {
          platform,
          token_count: this.estimateTokens(chunkText),
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

  private chunkText(text: string, maxTokens: number = 500): string[] {
    const chunks: string[] = [];

    // Split by headers first
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

  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters for English
    return Math.ceil(text.length / 4);
  }

  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  async getStatus(): Promise<{
    totalPolicies: number;
    totalChunks: number;
    lastUpdate: string | null;
    byPlatform: Record<string, number>;
  }> {
    const { data: policies } = await this.supabase
      .from('policies')
      .select('id, platform_id, last_scraped')
      .order('last_scraped', { ascending: false });

    const { count: chunkCount } = await this.supabase
      .from('policy_chunks')
      .select('id', { count: 'exact', head: true });

    const { data: platforms } = await this.supabase
      .from('platforms')
      .select('id, name');

    const platformMap = new Map(platforms?.map(p => [p.id, p.name]) || []);
    const byPlatform: Record<string, number> = {};

    for (const policy of policies || []) {
      const platformName = platformMap.get(policy.platform_id) || 'unknown';
      byPlatform[platformName] = (byPlatform[platformName] || 0) + 1;
    }

    return {
      totalPolicies: policies?.length || 0,
      totalChunks: chunkCount || 0,
      lastUpdate: policies?.[0]?.last_scraped || null,
      byPlatform,
    };
  }

  // Search policies using semantic similarity
  async searchPolicies(query: string, limit: number = 5): Promise<Array<{
    chunk_text: string;
    similarity: number;
    policy_url?: string;
  }>> {
    // Generate embedding for query
    const embeddingResponse = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Search using the database function
    const { data, error } = await this.supabase.rpc('search_policy_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: limit,
    });

    if (error) throw error;

    // Get policy URLs for context
    const policyIds = [...new Set(data?.map((d: { policy_id: number }) => d.policy_id) || [])];
    const { data: policies } = await this.supabase
      .from('policies')
      .select('id, url')
      .in('id', policyIds);

    const policyUrlMap = new Map(policies?.map(p => [p.id, p.url]) || []);

    return (data || []).map((d: { chunk_text: string; similarity: number; policy_id: number }) => ({
      chunk_text: d.chunk_text,
      similarity: d.similarity,
      policy_url: policyUrlMap.get(d.policy_id),
    }));
  }
}
