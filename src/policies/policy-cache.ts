/**
 * Local Policy Cache - Stores scraped docs locally for offline/fast access
 * No Supabase required for basic scanning
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

export interface PolicyDoc {
  id: string;
  platform: string;
  title: string;
  url: string;
  content: string;
  contentHash: string;
  scrapedAt: string;
  chunks: PolicyChunk[];
}

export interface PolicyChunk {
  id: string;
  text: string;
  index: number;
  embedding?: number[];
}

export interface PolicyCacheData {
  version: string;
  lastUpdated: string;
  policies: PolicyDoc[];
}

const CACHE_VERSION = '1.0';
const DEFAULT_CACHE_DIR = join(process.cwd(), '.meta-scan-cache');
const CACHE_FILE = 'policies.json';

export class PolicyCache {
  private cacheDir: string;
  private cachePath: string;
  private data: PolicyCacheData | null = null;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || DEFAULT_CACHE_DIR;
    this.cachePath = join(this.cacheDir, CACHE_FILE);
  }

  /**
   * Ensure cache directory exists
   */
  private ensureDir(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Load cache from disk
   */
  load(): PolicyCacheData {
    if (this.data) return this.data;

    if (existsSync(this.cachePath)) {
      try {
        const content = readFileSync(this.cachePath, 'utf-8');
        this.data = JSON.parse(content) as PolicyCacheData;
        return this.data;
      } catch {
        // Corrupted cache, start fresh
      }
    }

    // Initialize empty cache
    this.data = {
      version: CACHE_VERSION,
      lastUpdated: new Date().toISOString(),
      policies: [],
    };

    return this.data;
  }

  /**
   * Save cache to disk
   */
  save(): void {
    this.ensureDir();
    if (this.data) {
      this.data.lastUpdated = new Date().toISOString();
      writeFileSync(this.cachePath, JSON.stringify(this.data, null, 2));
    }
  }

  /**
   * Check if cache exists and has policies
   */
  exists(): boolean {
    const data = this.load();
    return data.policies.length > 0;
  }

  /**
   * Get cache status
   */
  getStatus(): { count: number; lastUpdated: string | null; platforms: string[] } {
    const data = this.load();
    const platforms = [...new Set(data.policies.map(p => p.platform))];
    return {
      count: data.policies.length,
      lastUpdated: data.policies.length > 0 ? data.lastUpdated : null,
      platforms,
    };
  }

  /**
   * Add or update a policy document
   */
  upsertPolicy(policy: Omit<PolicyDoc, 'id' | 'contentHash' | 'scrapedAt'>): PolicyDoc {
    const data = this.load();
    const contentHash = this.hashContent(policy.content);
    const id = this.hashContent(policy.url).substring(0, 12);

    // Check if exists and unchanged
    const existing = data.policies.find(p => p.url === policy.url);
    if (existing && existing.contentHash === contentHash) {
      return existing; // No changes
    }

    const newPolicy: PolicyDoc = {
      id,
      ...policy,
      contentHash,
      scrapedAt: new Date().toISOString(),
      chunks: this.chunkContent(policy.content, id),
    };

    // Replace or add
    const index = data.policies.findIndex(p => p.url === policy.url);
    if (index >= 0) {
      data.policies[index] = newPolicy;
    } else {
      data.policies.push(newPolicy);
    }

    this.save();
    return newPolicy;
  }

  /**
   * Get all policies
   */
  getAllPolicies(): PolicyDoc[] {
    return this.load().policies;
  }

  /**
   * Get policies by platform
   */
  getPoliciesByPlatform(platform: string): PolicyDoc[] {
    return this.load().policies.filter(p =>
      p.platform === platform || p.platform === 'all'
    );
  }

  /**
   * Search policies by keyword (simple text search)
   */
  searchByKeyword(query: string, limit: number = 10): PolicyChunk[] {
    const data = this.load();
    const results: Array<PolicyChunk & { score: number; policyUrl: string }> = [];
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    for (const policy of data.policies) {
      for (const chunk of policy.chunks) {
        const textLower = chunk.text.toLowerCase();

        // Score based on word matches
        let score = 0;
        for (const word of queryWords) {
          if (textLower.includes(word)) {
            score += 1;
            // Bonus for exact phrase
            if (textLower.includes(queryLower)) {
              score += 2;
            }
          }
        }

        if (score > 0) {
          results.push({ ...chunk, score, policyUrl: policy.url });
        }
      }
    }

    // Sort by score and return top results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Get all chunks (for embedding generation)
   */
  getAllChunks(): Array<PolicyChunk & { platform: string; policyUrl: string }> {
    const data = this.load();
    const chunks: Array<PolicyChunk & { platform: string; policyUrl: string }> = [];

    for (const policy of data.policies) {
      for (const chunk of policy.chunks) {
        chunks.push({
          ...chunk,
          platform: policy.platform,
          policyUrl: policy.url,
        });
      }
    }

    return chunks;
  }

  /**
   * Update chunk embeddings
   */
  updateChunkEmbeddings(chunkId: string, embedding: number[]): void {
    const data = this.load();

    for (const policy of data.policies) {
      const chunk = policy.chunks.find(c => c.id === chunkId);
      if (chunk) {
        chunk.embedding = embedding;
        this.save();
        return;
      }
    }
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.data = {
      version: CACHE_VERSION,
      lastUpdated: new Date().toISOString(),
      policies: [],
    };
    this.save();
  }

  /**
   * Chunk content into searchable pieces
   */
  private chunkContent(content: string, policyId: string, maxTokens: number = 500): PolicyChunk[] {
    const chunks: PolicyChunk[] = [];

    // Split by headers first
    const sections = content.split(/(?=^#{1,3}\s)/m);
    let chunkIndex = 0;

    for (const section of sections) {
      if (!section.trim()) continue;

      const sectionTokens = this.estimateTokens(section);

      if (sectionTokens <= maxTokens) {
        chunks.push({
          id: `${policyId}-${chunkIndex}`,
          text: section.trim(),
          index: chunkIndex++,
        });
      } else {
        // Split large sections by paragraphs
        const paragraphs = section.split(/\n\n+/);
        let currentChunk = '';
        let currentTokens = 0;

        for (const para of paragraphs) {
          const paraTokens = this.estimateTokens(para);

          if (currentTokens + paraTokens > maxTokens && currentChunk) {
            chunks.push({
              id: `${policyId}-${chunkIndex}`,
              text: currentChunk.trim(),
              index: chunkIndex++,
            });
            currentChunk = para;
            currentTokens = paraTokens;
          } else {
            currentChunk += '\n\n' + para;
            currentTokens += paraTokens;
          }
        }

        if (currentChunk.trim()) {
          chunks.push({
            id: `${policyId}-${chunkIndex}`,
            text: currentChunk.trim(),
            index: chunkIndex++,
          });
        }
      }
    }

    // Filter out very short chunks
    return chunks.filter(c => c.text.length > 50);
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }
}

// Singleton instance
let cacheInstance: PolicyCache | null = null;

export function getPolicyCache(cacheDir?: string): PolicyCache {
  if (!cacheInstance) {
    cacheInstance = new PolicyCache(cacheDir);
  }
  return cacheInstance;
}
