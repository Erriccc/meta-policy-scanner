# Integrating LLM Providers with AI Scanner

This guide shows how to update the existing AI Scanner to use the new multi-provider LLM system.

## Current Implementation

The AI Scanner currently uses OpenAI directly:

```typescript
// src/scanner/ai-scanner.ts (current)
import OpenAI from 'openai';

export class AIScanner {
  private openai?: OpenAI;

  constructor(config: AIScannerConfig) {
    if (config.openaiApiKey) {
      this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    }
  }

  private async analyzeWithLLM(...) {
    if (!this.openai) return null;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 500,
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    return JSON.parse(content);
  }
}
```

## Updated Implementation

Update to use the new LLM provider system:

### Step 1: Update Interface

```typescript
// src/scanner/ai-scanner.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createEmbeddingProvider, type EmbeddingConfig } from '../embeddings';
import type { EmbeddingProvider } from '../embeddings/types';
import type { LLMProvider } from '../llm/types';  // NEW
import { Violation, Platform, Severity } from '../types';

export interface AIScannerConfig {
  supabaseUrl: string;
  supabaseKey: string;
  embeddingConfig: EmbeddingConfig;
  llmProvider?: LLMProvider;  // NEW: Accept any LLM provider
  onProgress?: (msg: string) => void;
}
```

### Step 2: Update Constructor

```typescript
export class AIScanner {
  private supabase: SupabaseClient;
  private embeddingProvider: EmbeddingProvider;
  private llmProvider?: LLMProvider;  // NEW
  private onProgress?: (msg: string) => void;

  constructor(config: AIScannerConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.embeddingProvider = createEmbeddingProvider(config.embeddingConfig);
    this.llmProvider = config.llmProvider;  // NEW
    this.onProgress = config.onProgress;
  }
}
```

### Step 3: Update Analysis Method

```typescript
private async analyzeWithLLM(
  section: { snippet: string; context: string; category: string; description: string },
  relevantPolicies: Array<{ chunk_text: string; similarity: number; policy_url?: string }>,
  platform?: Platform
): Promise<AIAnalysisResult | null> {
  if (!this.llmProvider) return null;  // NEW: Check for any provider

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
    // NEW: Use generic analyze method
    const content = await this.llmProvider.analyze(prompt);

    if (!content) return null;

    const result = JSON.parse(content) as AIAnalysisResult;
    result.relevantPolicy = relevantPolicies[0]?.policy_url;

    return result;
  } catch (error) {
    this.log(`  ⚠️ LLM analysis error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return null;
  }
}
```

### Step 4: Update Factory Function

```typescript
import { createAutoLLMProvider } from '../llm';

/**
 * Create AI scanner from environment variables
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

  // NEW: Auto-detect best available LLM provider
  const llmProvider = await createAutoLLMProvider();

  if (llmProvider && onProgress) {
    onProgress(`Using ${llmProvider.name} for AI analysis`);
  }

  return new AIScanner({
    supabaseUrl,
    supabaseKey,
    embeddingConfig: {
      provider: 'voyage',
      apiKey: voyageKey,
    },
    llmProvider,  // NEW: Pass detected provider
    onProgress,
  });
}
```

### Step 5: Update Status Check

```typescript
/**
 * Check if AI scanning is fully configured
 */
isFullyConfigured(): { rag: boolean; llm: boolean; llmProvider?: string } {
  return {
    rag: true, // Always available if we have embeddings
    llm: !!this.llmProvider,
    llmProvider: this.llmProvider?.name,  // NEW: Show which provider
  };
}
```

## Usage Examples

### Example 1: Auto-detect Provider

```typescript
import { createAIScanner } from './scanner/ai-scanner';

const scanner = await createAIScanner((msg) => console.log(msg));

if (scanner) {
  const config = scanner.isFullyConfigured();
  console.log(`RAG: ${config.rag}, LLM: ${config.llm} (${config.llmProvider})`);
  // Output: RAG: true, LLM: true (Groq)
}
```

### Example 2: Explicit Provider

```typescript
import { AIScanner } from './scanner/ai-scanner';
import { createLLMProvider } from './llm';

const llmProvider = createLLMProvider({
  provider: 'groq',
  apiKey: process.env.GROQ_API_KEY!,
});

const scanner = new AIScanner({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_ANON_KEY!,
  embeddingConfig: { provider: 'voyage', apiKey: process.env.VOYAGE_API_KEY! },
  llmProvider,
});
```

### Example 3: Fallback Handling

```typescript
import { createAIScanner } from './scanner/ai-scanner';
import { getSetupInstructions } from './llm';

const scanner = await createAIScanner();

if (!scanner) {
  console.error('AI scanner not available.');
  console.log(getSetupInstructions());
  process.exit(1);
}

const config = scanner.isFullyConfigured();
if (!config.llm) {
  console.warn('LLM not available. Only using semantic similarity for analysis.');
  console.log(getSetupInstructions());
}
```

## Migration Checklist

- [ ] Remove `openaiApiKey` from `AIScannerConfig`
- [ ] Remove `anthropicApiKey` from `AIScannerConfig` (was unused)
- [ ] Add `llmProvider?: LLMProvider` to `AIScannerConfig`
- [ ] Replace `private openai?: OpenAI` with `private llmProvider?: LLMProvider`
- [ ] Update constructor to accept `llmProvider`
- [ ] Replace OpenAI API calls with `this.llmProvider.analyze(prompt)`
- [ ] Update factory function to use `createAutoLLMProvider()`
- [ ] Update status check to show provider name
- [ ] Test with all three providers (Groq, OpenAI, Ollama)
- [ ] Update documentation and README

## Benefits

1. **Free Options**: Users can use Groq (free tier) or Ollama (local)
2. **No Vendor Lock-in**: Easy to switch between providers
3. **Automatic Fallback**: System picks best available provider
4. **Consistent API**: All providers return same format
5. **Better Error Messages**: Provider-specific error handling

## Testing

```bash
# Test with Groq
export GROQ_API_KEY="your-key"
npm run build && npm run cli -- scan ./test-code

# Test with OpenAI
unset GROQ_API_KEY
export OPENAI_API_KEY="your-key"
npm run build && npm run cli -- scan ./test-code

# Test with Ollama
unset GROQ_API_KEY OPENAI_API_KEY
ollama serve  # In another terminal
npm run build && npm run cli -- scan ./test-code
```

## Environment Variables

Update your `.env` file:

```bash
# Supabase (required for RAG)
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-key"

# Embeddings (required for RAG)
VOYAGE_API_KEY="your-key"

# LLM Provider (choose one or more for fallback)
GROQ_API_KEY="your-key"        # Recommended: Free tier
# OPENAI_API_KEY="your-key"    # Alternative: Paid
# Ollama: No key needed, just run "ollama serve"
```
