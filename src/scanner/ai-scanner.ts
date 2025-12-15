/**
 * AI-Powered Policy Scanner
 *
 * Uses RAG (Retrieval Augmented Generation) to detect policy violations
 * that go beyond simple regex patterns. This scanner:
 *
 * 1. Analyzes code semantically against indexed policy documentation
 * 2. Uses LLM (OpenAI/Claude) to evaluate potential violations
 * 3. Catches edge cases that regex patterns miss
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { createEmbeddingProvider, type EmbeddingConfig } from '../embeddings';
import type { EmbeddingProvider } from '../embeddings/types';
import { Violation, Platform, Severity } from '../types';

export interface AIAnalysisResult {
  isViolation: boolean;
  confidence: number;
  ruleCode: string;
  ruleName: string;
  severity: Severity;
  message: string;
  recommendation: string;
  relevantPolicy?: string;
}

export interface AIScannerConfig {
  supabaseUrl: string;
  supabaseKey: string;
  embeddingConfig: EmbeddingConfig;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  onProgress?: (msg: string) => void;
}

export interface AIScanOptions {
  platform?: Platform;
  minConfidence?: number;
  maxAnalysisPerFile?: number;
}

// Code patterns that warrant AI analysis (suspicious but not definitive)
const SUSPICIOUS_PATTERNS = [
  // Data handling that might violate policies
  { pattern: /user(?:_)?(?:data|info|profile)/gi, category: 'data-handling', description: 'User data handling' },
  { pattern: /(?:store|save|persist|cache).*(?:token|secret|credential)/gi, category: 'credentials', description: 'Credential storage' },
  { pattern: /(?:share|send|transmit|export).*(?:user|data|personal)/gi, category: 'data-sharing', description: 'Data sharing' },
  { pattern: /(?:scrape|crawl|extract|harvest)/gi, category: 'scraping', description: 'Data scraping' },
  { pattern: /(?:automate|bot|automated)/gi, category: 'automation', description: 'Automation' },
  { pattern: /(?:bulk|mass|batch).*(?:message|post|send)/gi, category: 'bulk-actions', description: 'Bulk messaging' },
  { pattern: /(?:bypass|circumvent|workaround)/gi, category: 'circumvention', description: 'Policy circumvention' },
  { pattern: /rate.?limit/gi, category: 'rate-limiting', description: 'Rate limiting handling' },
  { pattern: /webhook.*(?:receive|handle|process)/gi, category: 'webhooks', description: 'Webhook handling' },
  { pattern: /(?:graph|api)\.facebook\.com/gi, category: 'api-usage', description: 'Facebook API usage' },
  { pattern: /(?:instagram|messenger|whatsapp).*(?:api|send|post)/gi, category: 'platform-api', description: 'Platform API usage' },
];

export class AIScanner {
  private supabase: SupabaseClient;
  private embeddingProvider: EmbeddingProvider;
  private openai?: OpenAI;
  private onProgress?: (msg: string) => void;

  constructor(config: AIScannerConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.embeddingProvider = createEmbeddingProvider(config.embeddingConfig);
    this.onProgress = config.onProgress;

    if (config.openaiApiKey) {
      this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    }
  }

  private log(msg: string) {
    this.onProgress?.(msg);
  }

  /**
   * Analyze a code file for policy violations using AI
   */
  async analyzeFile(
    filePath: string,
    content: string,
    options: AIScanOptions = {}
  ): Promise<Violation[]> {
    const violations: Violation[] = [];
    const lines = content.split('\n');
    const minConfidence = options.minConfidence ?? 0.7;
    const maxAnalysis = options.maxAnalysisPerFile ?? 10;

    // Find suspicious code sections
    const suspiciousSections = this.findSuspiciousSections(content, lines);

    if (suspiciousSections.length === 0) {
      return violations;
    }

    this.log(`  🤖 Found ${suspiciousSections.length} sections for AI analysis`);

    // Limit analysis to prevent excessive API calls
    const sectionsToAnalyze = suspiciousSections.slice(0, maxAnalysis);

    for (const section of sectionsToAnalyze) {
      try {
        // Search for relevant policy documentation
        const relevantPolicies = await this.searchRelevantPolicies(section.context);

        if (relevantPolicies.length === 0) continue;

        // Analyze with LLM if available
        if (this.openai) {
          const analysis = await this.analyzeWithLLM(section, relevantPolicies, options.platform);

          if (analysis && analysis.isViolation && analysis.confidence >= minConfidence) {
            violations.push({
              ruleCode: analysis.ruleCode,
              ruleName: analysis.ruleName,
              severity: analysis.severity,
              platform: options.platform || 'all',
              file: filePath,
              line: section.line,
              column: section.column,
              message: analysis.message,
              codeSnippet: section.snippet,
              recommendation: analysis.recommendation,
              docUrls: analysis.relevantPolicy ? [analysis.relevantPolicy] : undefined,
            });
          }
        } else {
          // Fallback: Use semantic similarity only (no LLM)
          const highSimilarityMatch = relevantPolicies.find(p => p.similarity > 0.8);
          if (highSimilarityMatch && this.looksLikeViolation(section, highSimilarityMatch)) {
            violations.push({
              ruleCode: 'AI_POLICY_MATCH',
              ruleName: `Potential Policy Violation (${section.category})`,
              severity: 'warning',
              platform: options.platform || 'all',
              file: filePath,
              line: section.line,
              column: section.column,
              message: `Code may violate Meta policy. Review against: ${highSimilarityMatch.chunk_text.substring(0, 200)}...`,
              codeSnippet: section.snippet,
              recommendation: 'Review this code against Meta Platform Terms and ensure compliance.',
              docUrls: highSimilarityMatch.policy_url ? [highSimilarityMatch.policy_url] : undefined,
            });
          }
        }
      } catch (error) {
        // Log but don't fail on individual analysis errors
        this.log(`  ⚠️ AI analysis error: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }

    return violations;
  }

  /**
   * Find code sections that warrant deeper analysis
   */
  private findSuspiciousSections(_content: string, lines: string[]): Array<{
    line: number;
    column: number;
    snippet: string;
    context: string;
    category: string;
    description: string;
  }> {
    const sections: Array<{
      line: number;
      column: number;
      snippet: string;
      context: string;
      category: string;
      description: string;
    }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const { pattern, category, description } of SUSPICIOUS_PATTERNS) {
        const match = pattern.exec(line);
        if (match) {
          // Get surrounding context (5 lines before and after)
          const contextStart = Math.max(0, i - 5);
          const contextEnd = Math.min(lines.length, i + 6);
          const context = lines.slice(contextStart, contextEnd).join('\n');

          sections.push({
            line: i + 1,
            column: match.index + 1,
            snippet: line.trim().substring(0, 100),
            context,
            category,
            description,
          });

          // Reset regex lastIndex for global patterns
          pattern.lastIndex = 0;
          break; // Only one match per line
        }
        pattern.lastIndex = 0;
      }
    }

    return sections;
  }

  /**
   * Search for relevant policy documentation using RAG
   */
  private async searchRelevantPolicies(codeContext: string): Promise<Array<{
    chunk_text: string;
    similarity: number;
    policy_url?: string;
  }>> {
    try {
      // Create a search query from the code context
      const searchQuery = `Meta API policy violation: ${codeContext.substring(0, 500)}`;

      // Generate embedding
      const { embedding } = await this.embeddingProvider.embed(searchQuery);

      // Search Supabase for similar policy chunks
      const { data, error } = await this.supabase.rpc('search_policy_chunks', {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: 3,
      });

      if (error) {
        this.log(`  ⚠️ Policy search error: ${error.message}`);
        return [];
      }

      // Get policy URLs
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
        });
      }

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Analyze code with LLM for policy violations
   */
  private async analyzeWithLLM(
    section: { snippet: string; context: string; category: string; description: string },
    relevantPolicies: Array<{ chunk_text: string; similarity: number; policy_url?: string }>,
    platform?: Platform
  ): Promise<AIAnalysisResult | null> {
    if (!this.openai) return null;

    const policyContext = relevantPolicies
      .map(p => p.chunk_text.substring(0, 500))
      .join('\n\n---\n\n');

    const prompt = `You are a Meta API policy compliance expert. Analyze this code for potential policy violations.

## Code Context
\`\`\`
${section.context}
\`\`\`

## Relevant Meta Policies
${policyContext}

## Analysis Request
Determine if this code violates any Meta Platform policies. Consider:
1. Data handling and privacy requirements
2. API usage restrictions
3. Automation and rate limiting rules
4. Platform-specific requirements (${platform || 'all platforms'})

Respond in JSON format:
{
  "isViolation": boolean,
  "confidence": number (0-1),
  "ruleCode": "string (e.g., AI_DATA_HANDLING)",
  "ruleName": "string (human readable name)",
  "severity": "error" | "warning" | "info",
  "message": "string (explanation)",
  "recommendation": "string (how to fix)"
}

If no violation is found, set isViolation to false with confidence of why it's compliant.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 500,
        temperature: 0.2,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return null;

      const result = JSON.parse(content) as AIAnalysisResult;
      result.relevantPolicy = relevantPolicies[0]?.policy_url;

      return result;
    } catch (error) {
      this.log(`  ⚠️ LLM analysis error: ${error instanceof Error ? error.message : 'Unknown'}`);
      return null;
    }
  }

  /**
   * Heuristic check for violations when LLM is not available
   */
  private looksLikeViolation(
    section: { category: string; snippet: string },
    policy: { chunk_text: string }
  ): boolean {
    const policyLower = policy.chunk_text.toLowerCase();
    const snippetLower = section.snippet.toLowerCase();

    // Check for violation indicators in policy text
    const violationIndicators = [
      'prohibited',
      'must not',
      'not allowed',
      'violation',
      'restricted',
      'forbidden',
      'banned',
    ];

    const hasViolationIndicator = violationIndicators.some(ind => policyLower.includes(ind));

    // Check for risky patterns in code
    const riskyPatterns = [
      /scrape|crawl|harvest/i,
      /bypass|circumvent/i,
      /unofficial|private.api/i,
      /bulk.*(message|send|post)/i,
    ];

    const hasRiskyPattern = riskyPatterns.some(p => p.test(snippetLower));

    return hasViolationIndicator && hasRiskyPattern;
  }

  /**
   * Check if AI scanning is fully configured
   */
  isFullyConfigured(): { rag: boolean; llm: boolean } {
    return {
      rag: true, // Always available if we have embeddings
      llm: !!this.openai,
    };
  }
}

/**
 * Create AI scanner from environment variables
 */
export function createAIScanner(
  onProgress?: (msg: string) => void
): AIScanner | null {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const voyageKey = process.env.VOYAGE_API_KEY;

  if (!supabaseUrl || !supabaseKey || !voyageKey) {
    return null;
  }

  return new AIScanner({
    supabaseUrl,
    supabaseKey,
    embeddingConfig: {
      provider: 'voyage',
      apiKey: voyageKey,
    },
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    onProgress,
  });
}
