/**
 * AI-Powered Policy Scanner
 *
 * Uses RAG (Retrieval Augmented Generation) to detect policy violations
 * that go beyond simple regex patterns. This scanner:
 *
 * 1. Analyzes code semantically against indexed policy documentation
 * 2. Uses LLM (OpenAI/Claude) to evaluate potential violations
 * 3. Catches edge cases that regex patterns miss
 *
 * Configuration is loaded from knowledge/ directory:
 * - meta-policies.json: Official Meta policy doc references
 * - analysis-rules.json: What IS and IS NOT a violation
 * - custom-rules.json: Project-specific tips and prompts
 * - platforms/*.json: Platform-specific rules
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createEmbeddingProvider, type EmbeddingConfig } from '../embeddings';
import type { EmbeddingProvider } from '../embeddings/types';
import { createAutoLLMProvider, type LLMProvider } from '../llm';
import { Violation, Platform, Severity } from '../types';
import { CodebaseIndexer } from './codebase-indexer';
import {
  loadAnalysisRules,
  getSuspiciousPatterns,
  buildAnalysisPrompt,
  getViolationDocUrls,
} from '../knowledge';

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
  llmProvider?: LLMProvider;
  codebaseIndex?: CodebaseIndexer;
  onProgress?: (msg: string) => void;
}

export interface AIScanOptions {
  platform?: Platform;
  minConfidence?: number;
  maxAnalysisPerFile?: number;
}

// Suspicious patterns are now loaded from knowledge/analysis-rules.json
// Use getSuspiciousPatterns() to get the configured patterns

export class AIScanner {
  private supabase: SupabaseClient;
  private embeddingProvider: EmbeddingProvider;
  private llmProvider?: LLMProvider;
  private codebaseIndex?: CodebaseIndexer;
  private onProgress?: (msg: string) => void;

  constructor(config: AIScannerConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.embeddingProvider = createEmbeddingProvider(config.embeddingConfig);
    this.onProgress = config.onProgress;
    this.llmProvider = config.llmProvider;
    this.codebaseIndex = config.codebaseIndex;
  }

  private log(msg: string) {
    this.onProgress?.(msg);
  }

  /**
   * Set codebase index for enhanced context during analysis
   */
  setCodebaseIndex(index: CodebaseIndexer) {
    this.codebaseIndex = index;
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
    const minConfidence = options.minConfidence ?? 0.85; // High threshold for clear violations
    const maxAnalysis = options.maxAnalysisPerFile ?? 10;

    // Find suspicious code sections
    const suspiciousSections = this.findSuspiciousSections(content, lines);

    if (suspiciousSections.length === 0) {
      // No suspicious patterns found - this is normal for most files
      return violations;
    }

    this.log(`  🤖 AI: ${suspiciousSections.length} suspicious sections in ${filePath.split('/').pop()}`);

    // Limit analysis to prevent excessive API calls
    const sectionsToAnalyze = suspiciousSections.slice(0, maxAnalysis);

    let sectionsWithPolicies = 0;
    let llmAnalyzed = 0;

    for (const section of sectionsToAnalyze) {
      try {
        // Search for relevant policy documentation
        const relevantPolicies = await this.searchRelevantPolicies(section.context);

        if (relevantPolicies.length === 0) {
          this.log(`    → No relevant policies found for ${section.category}`);
          continue;
        }
        sectionsWithPolicies++;

        // Analyze with LLM if available
        if (this.llmProvider) {
          llmAnalyzed++;
          const analysis = await this.analyzeWithLLM(section, relevantPolicies, options.platform);

          if (analysis) {
            if (analysis.isViolation && analysis.confidence >= minConfidence) {
              this.log(`    ⚠️ AI violation: ${analysis.ruleName} (${Math.round(analysis.confidence * 100)}%)`);
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
            } else if (analysis.isViolation) {
              this.log(`    ℹ️ Low confidence: ${analysis.ruleName} (${Math.round(analysis.confidence * 100)}%)`);
            } else {
              this.log(`    ✓ Compliant: ${section.category}`);
            }
          } else {
            this.log(`    ✗ LLM returned no analysis for ${section.category}`);
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

    // Load patterns from knowledge config (once, outside loop)
    const suspiciousPatterns = getSuspiciousPatterns();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const { pattern, category, description } of suspiciousPatterns) {
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
        match_threshold: 0.2, // Lower threshold to find more potential matches
        match_count: 5,
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
   * Prompt is built dynamically from knowledge/ config files
   */
  private async analyzeWithLLM(
    section: { snippet: string; context: string; category: string; description: string; line: number },
    relevantPolicies: Array<{ chunk_text: string; similarity: number; policy_url?: string }>,
    platform?: Platform
  ): Promise<AIAnalysisResult | null> {
    if (!this.llmProvider) return null;

    // Build policy context from RAG results
    const policyContext = relevantPolicies
      .map(p => p.chunk_text.substring(0, 500))
      .join('\n\n---\n\n');

    // Build analysis guidelines from knowledge files
    // This pulls from: analysis-rules.json, custom-rules.json, platforms/*.json
    const knowledgeContext = buildAnalysisPrompt(section.category, platform);

    // Build codebase context from indexer
    let codebaseContext = '';
    if (this.codebaseIndex) {
      codebaseContext = this.buildCodebaseContext(section.category);
    }

    // Load analysis rules for valid rule codes
    const analysisRules = loadAnalysisRules();
    const validRuleCodes = analysisRules
      ? Object.values(analysisRules.violationTypes).map(v => v.id).join(', ')
      : 'AI_HARDCODED_SECRET, AI_DATA_SHARING, AI_DATA_RETENTION, AI_AUTOMATION_ABUSE, AI_POLICY_CIRCUMVENTION, AI_SECURITY_ISSUE';

    // Build the prompt - code context is always included, guidelines come from config
    const prompt = `You are a Meta Platform API policy compliance analyst. Analyze this code for REAL policy violations only.

## Code to Analyze (Line ${section.line})
\`\`\`
${section.snippet}
\`\`\`

## Surrounding Context
\`\`\`
${section.context}
\`\`\`

## Retrieved Policy Documentation
${policyContext || 'No specific policy docs retrieved for this code.'}

${knowledgeContext}

${codebaseContext}

## CRITICAL: What IS and IS NOT a Violation

### AI_HARDCODED_SECRET - ONLY flag if you see:
- Literal API tokens: \`const token = "EAABx7abc123..."\` (50+ char string starting with EAA)
- Literal app secrets: \`appSecret = "abc123def456..."\` (32 char hex string)
- Passwords in code: \`password = "myP@ssword123"\`

### NOT a hardcoded secret (DO NOT FLAG):
- require() or import statements: \`require('./processWebhooks')\`
- Variable names containing "secret", "token", "key", "password"
- Environment variables: \`process.env.TOKEN\`, \`process.env.SECRET\`
- Config references: \`config.apiKey\`, \`settings.token\`
- Function/file names: \`processWebhooks\`, \`handleAuth\`, \`tokenService\`
- Type definitions or interfaces
- Comments mentioning secrets

### General Rules:
- A variable NAME containing "secret" is NOT a hardcoded secret
- A require/import path is NEVER a secret
- Only flag LITERAL credential VALUES, not references to credentials

## Response Format (JSON only)
Return a JSON object with these fields:
- isViolation: boolean - true ONLY if there's an ACTUAL secret value in the code
- confidence: number (0.0-1.0) - use 0.85+ only for definite violations with literal values
- ruleCode: string - one of: ${validRuleCodes}
- ruleName: string - human readable violation name
- severity: "error" | "warning" | "info"
- message: string - describe the specific violation with the ACTUAL secret value quoted
- recommendation: string - how to fix the issue

If no violation found (this is the expected case for most code):
{"isViolation": false, "confidence": 0, "ruleCode": "", "ruleName": "", "severity": "info", "message": "", "recommendation": ""}`;

    try {
      let content = await this.llmProvider.analyze(prompt);
      if (!content) return null;

      // Strip markdown code fences if present (Claude often wraps JSON in ```json ... ```)
      content = content.trim();
      if (content.startsWith('```')) {
        // Remove opening fence (```json or ```)
        content = content.replace(/^```(?:json)?\s*\n?/, '');
        // Remove closing fence
        content = content.replace(/\n?```\s*$/, '');
      }

      const result = JSON.parse(content) as AIAnalysisResult;

      // Add doc URLs from knowledge config based on rule code
      if (result.isViolation && result.ruleCode) {
        const docUrls = getViolationDocUrls(result.ruleCode);
        if (docUrls.length > 0) {
          result.relevantPolicy = docUrls[0];
        } else {
          result.relevantPolicy = relevantPolicies[0]?.policy_url;
        }
      }

      return result;
    } catch (error) {
      this.log(`  ⚠️ LLM analysis error: ${error instanceof Error ? error.message : 'Unknown'}`);
      return null;
    }
  }

  /**
   * Build codebase context for a given category
   */
  private buildCodebaseContext(category: string): string {
    if (!this.codebaseIndex) return '';

    let context = '';

    // Get codebase structure summary
    const summary = this.codebaseIndex.getSummaryForAI();
    context += `\n## Codebase Structure\n${summary}\n`;

    // Map categories to relevant code patterns
    const categoryPatterns: Record<string, Array<'auth' | 'rateLimit' | 'permissions' | 'middleware' | 'errorHandler' | 'database' | 'cache' | 'storage'>> = {
      'credentials': ['auth'],
      'data-handling': ['auth', 'database'],
      'api-usage': ['auth', 'rateLimit'],
      'rate-limiting': ['rateLimit'],
      'bulk-actions': ['rateLimit'],
      'database': ['database'],
      'data-retention': ['database', 'cache'],
      'caching': ['cache'],
      'cloud-storage': ['storage'],
      'webhooks': ['middleware', 'auth'],
    };

    const patterns = categoryPatterns[category] || [];

    for (const pattern of patterns) {
      const relatedCode = this.codebaseIndex.findPatternUsage(pattern);
      if (relatedCode.length > 0) {
        const patternName = pattern.charAt(0).toUpperCase() + pattern.slice(1);
        context += `\n## Related ${patternName} Code\n`;
        relatedCode.slice(0, 2).forEach(code => {
          context += `**${code.file}:${code.line}**\n\`\`\`\n${code.snippet}\n\`\`\`\n\n`;
        });
      }
    }

    return context;
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
  isFullyConfigured(): { rag: boolean; llm: boolean; llmProvider?: string } {
    return {
      rag: true, // Always available if we have embeddings
      llm: !!this.llmProvider,
      llmProvider: this.llmProvider?.name,
    };
  }
}

/**
 * Create AI scanner from environment variables
 * Uses auto-detection for LLM provider (Groq > OpenAI > Ollama)
 */
export async function createAIScanner(
  onProgress?: (msg: string) => void
): Promise<AIScanner | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const voyageKey = process.env.VOYAGE_API_KEY;

  if (!supabaseUrl || !supabaseKey || !voyageKey) {
    return null;
  }

  // Auto-detect LLM provider (Groq free tier > OpenAI > Ollama)
  const llmProvider = await createAutoLLMProvider();

  return new AIScanner({
    supabaseUrl,
    supabaseKey,
    embeddingConfig: {
      provider: 'voyage',
      apiKey: voyageKey,
    },
    llmProvider: llmProvider || undefined,
    onProgress,
  });
}
