/**
 * LLM Provider Usage Examples
 *
 * This file demonstrates how to use the LLM provider system.
 * Run with: npm run build && node dist/llm/example.js
 */

import {
  createAutoLLMProvider,
  createLLMProvider,
  getAvailableProviders,
  getSetupInstructions,
} from './index';

/**
 * Example 1: Auto-detect and use best available provider
 */
async function exampleAutoDetect() {
  console.log('\n=== Example 1: Auto-Detection ===\n');

  const llm = await createAutoLLMProvider();

  if (!llm) {
    console.log('No LLM provider available.');
    console.log(getSetupInstructions());
    return;
  }

  console.log(`✓ Using ${llm.name} provider`);

  const prompt = `You are a Meta API policy compliance expert. Analyze this code for potential policy violations.

## Code Context
\`\`\`
const userData = {
  name: user.name,
  email: user.email,
  fbToken: user.accessToken
};
localStorage.setItem('userData', JSON.stringify(userData));
\`\`\`

## Relevant Meta Policies
You must not store Facebook access tokens in localStorage or other insecure storage.
Access tokens should be kept secure and never exposed to client-side code.

## Analysis Request
Determine if this code violates any Meta Platform policies.

Respond in JSON format:
{
  "isViolation": boolean,
  "confidence": number (0-1),
  "ruleCode": "string (e.g., AI_DATA_HANDLING)",
  "ruleName": "string (human readable name)",
  "severity": "error" | "warning" | "info",
  "message": "string (explanation)",
  "recommendation": "string (how to fix)"
}`;

  try {
    const result = await llm.analyze(prompt);
    console.log('\nAnalysis Result:');
    console.log(JSON.parse(result));
  } catch (error) {
    console.error('Analysis failed:', error);
  }
}

/**
 * Example 2: Check available providers
 */
async function exampleCheckAvailable() {
  console.log('\n=== Example 2: Check Available Providers ===\n');

  const available = await getAvailableProviders();

  console.log('Provider Status:');
  console.log(`  Groq:   ${available.groq ? '✓ Available' : '✗ Not configured'}`);
  console.log(`  OpenAI: ${available.openai ? '✓ Available' : '✗ Not configured'}`);
  console.log(`  Ollama: ${available.ollama ? '✓ Running' : '✗ Not running'}`);

  if (!available.groq && !available.openai && !available.ollama) {
    console.log('\n' + getSetupInstructions());
  }
}

/**
 * Example 3: Use specific provider
 */
async function exampleSpecificProvider() {
  console.log('\n=== Example 3: Use Specific Provider ===\n');

  // Try to use Groq specifically
  if (process.env.GROQ_API_KEY) {
    const groq = createLLMProvider({
      provider: 'groq',
      apiKey: process.env.GROQ_API_KEY,
      model: 'llama-3.1-8b-instant',
    });

    console.log(`Using ${groq?.name} with model: llama-3.1-8b-instant`);
  } else {
    console.log('Groq API key not found. Set GROQ_API_KEY environment variable.');
  }

  // Try to use Ollama specifically
  const ollama = createLLMProvider({
    provider: 'ollama',
    model: 'llama3.2',
  });

  console.log(`Created ${ollama?.name} provider with model: llama3.2`);
}

/**
 * Example 4: Handle errors gracefully
 */
async function exampleErrorHandling() {
  console.log('\n=== Example 4: Error Handling ===\n');

  // Try using Ollama even if not running
  const ollama = createLLMProvider({
    provider: 'ollama',
  });

  if (ollama) {
    try {
      await ollama.analyze('Test prompt');
      console.log('Ollama analysis successful');
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not running')) {
          console.log('✗ Ollama is not running');
          console.log('  Start with: ollama serve');
        } else if (error.message.includes('not found')) {
          console.log('✗ Model not found');
          console.log('  Pull with: ollama pull llama3.2');
        } else {
          console.log('✗ Ollama error:', error.message);
        }
      }
    }
  }
}

/**
 * Run all examples
 */
async function main() {
  console.log('LLM Provider System Examples');
  console.log('============================');

  await exampleCheckAvailable();
  await exampleSpecificProvider();
  await exampleErrorHandling();
  await exampleAutoDetect();

  console.log('\n=== Examples Complete ===\n');
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
