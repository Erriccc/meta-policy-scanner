# LLM Provider System

A flexible, multi-provider LLM system with automatic fallback support for AI-powered policy scanning.

## Features

- **Multiple Providers**: Support for Groq, OpenAI, and Ollama
- **Auto-Detection**: Automatically selects the best available provider
- **Free Options**: Groq (free tier) and Ollama (local) for cost-free scanning
- **Consistent API**: All providers implement the same interface
- **Fallback Support**: Gracefully falls back to available providers

## Providers

### 1. Groq (Recommended for Free Tier)

**Pros:**
- FREE tier: 14,400 requests/day
- Lightning-fast inference
- No credit card required
- OpenAI-compatible API

**Setup:**
```bash
# 1. Sign up at https://console.groq.com
# 2. Get your API key
# 3. Set environment variable
export GROQ_API_KEY="your-api-key-here"
```

**Models:**
- Default: `llama-3.1-8b-instant` (fast, accurate)
- Alternatives: `mixtral-8x7b-32768`, `llama-3.1-70b-versatile`

### 2. OpenAI (Highest Quality)

**Pros:**
- Highest quality analysis
- Most reliable JSON output
- Battle-tested at scale

**Cons:**
- Paid service (pay-per-token)

**Setup:**
```bash
# 1. Get API key from https://platform.openai.com/api-keys
# 2. Set environment variable
export OPENAI_API_KEY="your-api-key-here"
```

**Models:**
- Default: `gpt-4o-mini` (fast, affordable)
- Alternatives: `gpt-4o`, `gpt-4-turbo`

### 3. Ollama (100% Free, Local)

**Pros:**
- Completely free
- Runs locally (privacy-friendly)
- No API keys needed
- Unlimited usage

**Cons:**
- Requires local installation
- Uses system resources
- Slower than cloud options

**Setup:**
```bash
# 1. Install Ollama
# macOS/Linux: https://ollama.ai
brew install ollama  # macOS

# 2. Pull a model
ollama pull llama3.2

# 3. Start Ollama server
ollama serve
```

**Models:**
- Default: `llama3.2` (3B parameters, efficient)
- Alternatives: `llama3.1`, `mistral`, `codellama`

## Usage

### Auto-Detection (Recommended)

The system automatically detects and uses the best available provider:

```typescript
import { createAutoLLMProvider } from './llm';

// Async version (checks Ollama availability)
const llm = await createAutoLLMProvider();

if (llm) {
  console.log(`Using ${llm.name} provider`);
  const result = await llm.analyze(prompt);
  console.log(result);
} else {
  console.log('No LLM provider available');
}
```

**Priority Order:**
1. Groq (if `GROQ_API_KEY` set)
2. OpenAI (if `OPENAI_API_KEY` set)
3. Ollama (if running locally)

### Explicit Configuration

Create a provider with specific settings:

```typescript
import { createLLMProvider } from './llm';

// Use Groq
const groq = createLLMProvider({
  provider: 'groq',
  apiKey: process.env.GROQ_API_KEY!,
  model: 'llama-3.1-70b-versatile', // Optional: override default
});

// Use OpenAI
const openai = createLLMProvider({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o', // Optional: override default
});

// Use Ollama
const ollama = createLLMProvider({
  provider: 'ollama',
  model: 'mistral', // Optional: override default
  baseUrl: 'http://localhost:11434', // Optional: custom port
});
```

### Check Available Providers

```typescript
import { getAvailableProviders } from './llm';

const available = await getAvailableProviders();
console.log('Available providers:', available);
// { groq: true, openai: false, ollama: true }
```

### Integration with AI Scanner

The LLM provider system is designed to integrate with the existing AI scanner:

```typescript
import { createAutoLLMProvider } from './llm';
import { AIScanner } from './scanner/ai-scanner';

const llm = await createAutoLLMProvider();

if (llm) {
  // Pass to AI scanner instead of OpenAI client
  const scanner = new AIScanner({
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_ANON_KEY!,
    embeddingConfig: { provider: 'voyage', apiKey: process.env.VOYAGE_API_KEY! },
    llmProvider: llm, // Use the auto-detected provider
  });
}
```

## Analysis Format

All providers return JSON-parseable responses in this format:

```json
{
  "isViolation": true,
  "confidence": 0.85,
  "ruleCode": "AI_DATA_HANDLING",
  "ruleName": "Unauthorized Data Storage",
  "severity": "error",
  "message": "Code stores user tokens in localStorage without encryption",
  "recommendation": "Use secure token storage or session-based authentication"
}
```

## Environment Variables

```bash
# Groq (Free Tier)
GROQ_API_KEY="gsk_..."

# OpenAI (Paid)
OPENAI_API_KEY="sk-..."

# Ollama runs locally - no API key needed
# Just ensure it's running: ollama serve
```

## Cost Comparison

| Provider | Cost | Speed | Quality | Setup |
|----------|------|-------|---------|-------|
| **Groq** | FREE (14.4k req/day) | Fastest | Good | Easy |
| **Ollama** | FREE (unlimited) | Slower | Good | Medium |
| **OpenAI** | ~$0.15/1M tokens | Fast | Best | Easy |

## Error Handling

All providers throw descriptive errors:

```typescript
try {
  const result = await llm.analyze(prompt);
} catch (error) {
  if (error.message.includes('not running')) {
    console.log('Ollama is not running. Start with: ollama serve');
  } else if (error.message.includes('API error')) {
    console.log('API key invalid or rate limit exceeded');
  }
}
```

## Tips

1. **Start with Groq**: Free tier is generous and fast
2. **Use Ollama for privacy**: Keep sensitive code analysis local
3. **OpenAI for production**: Most reliable for critical compliance checks
4. **Set multiple keys**: System will auto-fallback if one fails

## Troubleshooting

### "No LLM provider available"

Check that at least one provider is configured:
```bash
# Check environment variables
echo $GROQ_API_KEY
echo $OPENAI_API_KEY

# Check Ollama
ollama list
```

### Ollama connection errors

```bash
# Make sure Ollama is running
ollama serve

# Verify in another terminal
curl http://localhost:11434/api/tags
```

### Rate limits

- **Groq**: 10 requests/minute, 14,400/day (free tier)
- **OpenAI**: Depends on your tier
- **Ollama**: No limits (local)

Use `maxAnalysisPerFile` option to control API usage:
```typescript
await scanner.analyzeFile(file, content, {
  maxAnalysisPerFile: 5, // Limit to 5 AI analyses per file
});
```
