# PocketFlow Integration - Enhanced Codebase Knowledge

## Executive Summary

PocketFlow is a 100-line LLM framework that transforms GitHub repositories into beginner-friendly tutorials by identifying core abstractions and their interactions. We can integrate similar capabilities into our Meta Policy Scanner to:

1. **Explain violations** with educational context
2. **Generate fix tutorials** showing correct implementations
3. **Create codebase knowledge graphs** of Meta API usage patterns
4. **Provide learning resources** alongside scan results

---

## What is PocketFlow?

### Core Capabilities
- Analyzes GitHub repositories automatically
- Identifies core abstractions and relationships
- Generates beginner-friendly tutorials
- Supports multiple LLM providers (Gemini, Claude, O1)
- Works with any codebase (Python, JS, etc.)

### Technology
- Python-based (100 lines of core logic)
- LLM-powered analysis
- Pattern recognition for abstractions
- Tutorial generation from code

### Key Insight
PocketFlow answers: "What are the core abstractions and how do they interact?"

This is PERFECT for our Meta Policy Scanner because understanding Meta API patterns is exactly what we need!

---

## Integration Opportunities

### Option 1: Enhance Violation Reports (Quick Win)

**Current State**:
```
✗ Rate Limit Missing
  src/api/facebook.ts:127
  API calls without rate limit error handling detected
  → Implement exponential backoff
```

**With PocketFlow Integration**:
```
✗ Rate Limit Missing
  src/api/facebook.ts:127

  📚 Understanding the Issue:
  Your code makes direct API calls without handling rate limits.
  Meta's Graph API enforces rate limits to ensure fair usage.

  🔍 Your Current Pattern:
  - Direct fetch() calls to graph.facebook.com
  - No retry logic
  - No x-app-usage header monitoring

  ✅ Recommended Pattern:
  [Auto-generated tutorial showing:]
  1. How to detect rate limit errors
  2. Implementing exponential backoff
  3. Respecting usage headers
  4. Example code from similar projects

  📖 Learn More: [Link to generated tutorial]
```

**Implementation**:
```typescript
// src/reporter/educational-reporter.ts

import { generateTutorial } from './pocketflow-adapter';

export async function generateEducationalReport(
  violation: Violation,
  codeContext: CodeContext
): Promise<EducationalReport> {
  // Analyze the violation pattern
  const pattern = analyzePattern(violation, codeContext);

  // Generate tutorial using LLM
  const tutorial = await generateTutorial({
    topic: violation.ruleName,
    currentCode: codeContext.snippet,
    correctPattern: violation.fixExample,
    platform: violation.platform,
  });

  return {
    violation,
    explanation: tutorial.explanation,
    currentPattern: tutorial.currentPattern,
    recommendedPattern: tutorial.recommendedPattern,
    examples: tutorial.examples,
    learnMoreUrl: tutorial.url,
  };
}
```

---

### Option 2: Codebase Knowledge Graph (Medium Effort)

**Purpose**: Build a knowledge graph of Meta API usage in the scanned codebase

**What It Provides**:
- Visual map of all Meta API interactions
- Identify core patterns and abstractions
- Find related code sections
- Suggest refactoring opportunities

**Example Output**:
```
Meta API Knowledge Graph for: my-project

Core Abstractions Identified:
┌─────────────────────────────────────┐
│ 1. FacebookClient (src/client.ts)  │
│    ↓ uses                           │
│    • Graph API v18.0                │
│    • Rate limit handler             │
│    • Token refresh logic            │
└─────────────────────────────────────┘
         ↓ used by
┌─────────────────────────────────────┐
│ 2. UserService (src/services/)     │
│    • Fetches user data              │
│    • Manages permissions            │
│    ⚠️  Missing rate limit handling  │
└─────────────────────────────────────┘
         ↓ used by
┌─────────────────────────────────────┐
│ 3. WebhookHandler (src/webhooks/)  │
│    • Processes incoming events      │
│    ✓ Proper signature verification  │
└─────────────────────────────────────┘

Interaction Flow:
webhook → UserService → FacebookClient → Graph API

Suggested Improvements:
1. UserService should use FacebookClient's rate limiter
2. Extract common error handling to middleware
3. Consider caching user data
```

**Implementation**:
```typescript
// src/analyzer/knowledge-graph.ts

import { buildAbstractionGraph } from './abstraction-analyzer';

export class CodebaseKnowledgeBuilder {
  async analyzeMetaApiUsage(scanResult: ScanResult): Promise<KnowledgeGraph> {
    // Identify core abstractions
    const abstractions = await this.identifyAbstractions(scanResult);

    // Map interactions
    const interactions = await this.mapInteractions(abstractions);

    // Generate insights
    const insights = await this.generateInsights(interactions);

    return {
      abstractions,
      interactions,
      insights,
      visualizations: this.generateVisualizations(interactions),
    };
  }

  private async identifyAbstractions(scanResult: ScanResult) {
    // Use LLM to identify core patterns
    const prompt = `
      Analyze this codebase and identify the core abstractions related to Meta API usage.

      Files scanned: ${scanResult.files.length}
      SDK detected: ${scanResult.sdkDetections}

      List the main classes/functions that interact with Meta APIs and explain their purpose.
    `;

    return await this.llm.generate(prompt, {
      codeContext: scanResult.codeSnippets,
    });
  }
}
```

---

### Option 3: Auto-Generate Fix Tutorials (High Value)

**Purpose**: When violations are found, automatically generate step-by-step tutorials to fix them

**Example Flow**:
1. Scanner detects: "Missing rate limit handling"
2. System analyzes surrounding code context
3. LLM generates custom tutorial for this specific violation
4. Tutorial shows:
   - Why it's a problem
   - How the current code works
   - Step-by-step refactoring
   - Final working code
   - Testing instructions

**Generated Tutorial Example**:
```markdown
# How to Add Rate Limit Handling to Your Facebook API Client

## Your Current Implementation

In `src/api/facebook.ts:127`, you're making direct API calls:

```typescript
async function fetchUserData(userId: string) {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${userId}?fields=id,name`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return response.json();
}
```

## Why This Needs Improvement

Meta's Graph API enforces rate limits based on:
- Calls per hour
- CPU time consumed
- App usage percentage

Without handling rate limits, your app will:
- ❌ Crash when throttled
- ❌ Risk temporary suspension
- ❌ Provide poor user experience

## Step-by-Step Fix

### Step 1: Install a retry library
```bash
npm install axios axios-retry
```

### Step 2: Create a rate-limited client
```typescript
import axios from 'axios';
import axiosRetry from 'axios-retry';

const fbClient = axios.create({
  baseURL: 'https://graph.facebook.com/v18.0',
  headers: { Authorization: `Bearer ${accessToken}` }
});

// Configure exponential backoff
axiosRetry(fbClient, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return error.response?.status === 429 || // Rate limit
           error.response?.data?.error?.code === 4; // App throttled
  },
});
```

### Step 3: Update your function
```typescript
async function fetchUserData(userId: string) {
  try {
    const response = await fbClient.get(`/${userId}`, {
      params: { fields: 'id,name' }
    });

    // Monitor usage headers
    const usage = response.headers['x-app-usage'];
    if (usage) {
      const { call_count, total_cputime, total_time } = JSON.parse(usage);
      console.log('API usage:', { call_count, total_cputime, total_time });
    }

    return response.data;
  } catch (error) {
    console.error('Failed to fetch user data:', error);
    throw error;
  }
}
```

### Step 4: Test the implementation
```typescript
// Test with rapid calls
for (let i = 0; i < 100; i++) {
  await fetchUserData('me');
}
// Should automatically retry if rate limited
```

## What Changed
- ✅ Automatic retry with exponential backoff
- ✅ Monitors usage headers
- ✅ Proper error handling
- ✅ Graceful degradation

## Learn More
- [Meta Rate Limiting Docs](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/)
- [Best Practices Guide](#)
```

**Implementation**:
```typescript
// src/tutorial-generator/fix-tutorial.ts

export class FixTutorialGenerator {
  constructor(private llm: LLMClient) {}

  async generateFixTutorial(
    violation: Violation,
    codeContext: CodeContext,
    projectContext: ProjectContext
  ): Promise<Tutorial> {
    const prompt = `
      Generate a step-by-step tutorial to fix this Meta API policy violation:

      Violation: ${violation.ruleName}
      Current Code:
      ${codeContext.snippet}

      Project Context:
      - Language: ${projectContext.language}
      - Framework: ${projectContext.framework}
      - Package Manager: ${projectContext.packageManager}

      The tutorial should:
      1. Explain why the current code is problematic
      2. Show what the code currently does
      3. Provide step-by-step refactoring instructions
      4. Include working example code
      5. Add testing instructions
      6. Reference official Meta documentation

      Format as Markdown with code blocks.
    `;

    const tutorial = await this.llm.generate(prompt);

    return {
      title: `How to Fix: ${violation.ruleName}`,
      content: tutorial,
      metadata: {
        violationId: violation.id,
        generatedAt: new Date(),
        platform: violation.platform,
      },
    };
  }
}
```

---

## Implementation Plan

### Phase 1: Basic Integration (Week 1)

**Goal**: Add educational context to violation reports

**Tasks**:
1. Create LLM client wrapper (support Claude, GPT-4, Gemini)
2. Build tutorial generation service
3. Enhance console reporter with explanations
4. Add `--explain` flag to scan command

**CLI Usage**:
```bash
# Normal scan
meta-scan scan ./project

# With explanations
meta-scan scan ./project --explain

# Generate fix tutorial for specific violation
meta-scan explain RATE_LIMIT_MISSING --file=src/api/facebook.ts:127
```

### Phase 2: Knowledge Graph (Week 2-3)

**Goal**: Build codebase knowledge graph of Meta API usage

**Tasks**:
1. Implement abstraction identification
2. Map interactions between components
3. Generate visual graph (Mermaid diagrams)
4. Add to scan reports

**CLI Usage**:
```bash
# Generate knowledge graph
meta-scan analyze ./project --graph

# Interactive exploration
meta-scan explore ./project
```

### Phase 3: Auto-Fix Suggestions (Week 4)

**Goal**: Generate code suggestions to fix violations

**Tasks**:
1. Implement code generation
2. Create diff previews
3. Add interactive apply mode
4. Test thoroughly

**CLI Usage**:
```bash
# Show fix suggestions
meta-scan fix ./project --preview

# Apply fixes interactively
meta-scan fix ./project --interactive

# Auto-apply all safe fixes
meta-scan fix ./project --auto-safe
```

---

## Technical Architecture

### New Components

```
meta-policy-scanner/
├── src/
│   ├── pocketflow/                 # PocketFlow integration
│   │   ├── llm-client.ts           # LLM wrapper (Claude, GPT, Gemini)
│   │   ├── abstraction-analyzer.ts # Identify core patterns
│   │   ├── tutorial-generator.ts   # Generate tutorials
│   │   └── knowledge-graph.ts      # Build knowledge graphs
│   │
│   ├── tutorial-generator/         # Fix tutorials
│   │   ├── fix-tutorial.ts         # Generate fix guides
│   │   ├── code-explainer.ts       # Explain violations
│   │   └── example-finder.ts       # Find similar correct code
│   │
│   └── analyzer/
│       └── codebase-knowledge.ts   # Codebase analysis
```

### LLM Integration

```typescript
// src/pocketflow/llm-client.ts

export interface LLMProvider {
  generate(prompt: string, options?: LLMOptions): Promise<string>;
}

export class LLMClient {
  constructor(
    private provider: 'claude' | 'gpt4' | 'gemini',
    private apiKey: string
  ) {}

  async generate(prompt: string, context?: any): Promise<string> {
    switch (this.provider) {
      case 'claude':
        return this.claudeGenerate(prompt, context);
      case 'gpt4':
        return this.gpt4Generate(prompt, context);
      case 'gemini':
        return this.geminiGenerate(prompt, context);
    }
  }

  private async claudeGenerate(prompt: string, context: any) {
    // Use Anthropic SDK
    const response = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: this.buildPrompt(prompt, context),
      }],
    });

    return response.content[0].text;
  }

  private buildPrompt(prompt: string, context: any): string {
    return `
      ${prompt}

      Context:
      ${JSON.stringify(context, null, 2)}

      Provide detailed, beginner-friendly explanations.
    `;
  }
}
```

---

## Alternative: Build Our Own JS Version

Instead of integrating PocketFlow directly, we could build a lightweight JS version tailored for Meta API analysis.

### Advantages
- ✅ TypeScript native (same stack)
- ✅ Optimized for Meta API patterns
- ✅ No Python dependency
- ✅ Full control over features

### Core Implementation (100 lines like PocketFlow)

```typescript
// src/pocketflow-js/index.ts

export class MetaApiKnowledgeBuilder {
  constructor(private llm: LLMClient) {}

  async analyzeCoreAbstractions(codebase: Codebase): Promise<Abstractions> {
    // 1. Find all Meta API interactions
    const apiInteractions = this.findApiInteractions(codebase);

    // 2. Cluster similar patterns
    const patterns = this.clusterPatterns(apiInteractions);

    // 3. Identify core abstractions using LLM
    const abstractions = await this.identifyAbstractions(patterns);

    // 4. Map interactions
    const graph = this.buildInteractionGraph(abstractions);

    return {
      abstractions,
      graph,
      insights: this.generateInsights(graph),
    };
  }

  private findApiInteractions(codebase: Codebase) {
    // Find all Graph API calls, SDK usage, etc.
    return codebase.files
      .flatMap(file => this.extractApiCalls(file))
      .filter(call => this.isMetaApi(call));
  }

  private async identifyAbstractions(patterns: Pattern[]) {
    const prompt = `
      Given these Meta API usage patterns, identify the core abstractions
      and their responsibilities:

      ${patterns.map(p => p.summary).join('\n')}

      Format: { name, purpose, interactions, files }
    `;

    return this.llm.generate(prompt);
  }
}
```

---

## Recommended Approach

### Hybrid Strategy (Best of Both Worlds)

1. **Use PocketFlow concepts** for codebase analysis
2. **Build JS implementation** optimized for Meta APIs
3. **Integrate both**:
   - PocketFlow for general codebase tutorials
   - Our JS version for Meta-specific analysis

### Why This Works

- Leverage PocketFlow's proven approach
- Customize for Meta API domain knowledge
- Keep everything in TypeScript ecosystem
- Maintain full control

---

## Configuration

```json
// .meta-scan.config.json

{
  "pocketflow": {
    "enabled": true,
    "provider": "claude",  // or "gpt4", "gemini"
    "features": {
      "explanations": true,
      "tutorials": true,
      "knowledgeGraph": true,
      "autoFix": false
    },
    "tutorialLanguage": "en",
    "maxTutorialsPerScan": 5
  }
}
```

---

## Cost Analysis

### LLM API Costs

| Provider | Input (per 1M tokens) | Output (per 1M tokens) | Est. per scan |
|----------|----------------------|------------------------|---------------|
| Claude 3.5 Sonnet | $3 | $15 | $0.05-0.15 |
| GPT-4 Turbo | $10 | $30 | $0.10-0.30 |
| Gemini 1.5 Pro | $1.25 | $5 | $0.02-0.08 |

**Recommendation**: Start with Gemini (cheapest) or Claude (best quality)

### Budget Example

- 100 scans/month with explanations: ~$5-10/month
- Enterprise (1000 scans/month): ~$50-100/month

---

## Next Steps

1. **Week 1**: Implement basic LLM client and educational reporter
2. **Week 2**: Add knowledge graph generation
3. **Week 3**: Build tutorial generator
4. **Week 4**: Add auto-fix suggestions
5. **Week 5**: Testing and documentation

---

## Success Metrics

- ✅ Violations include helpful explanations
- ✅ Tutorials are beginner-friendly
- ✅ Knowledge graph helps understand codebase
- ✅ Users can fix issues faster with generated guides
- ✅ <$0.20 average cost per scan

---

This integration will make Meta Policy Scanner not just a linter, but an **educational tool** that helps developers learn Meta API best practices while scanning their code.
