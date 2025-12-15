/**
 * Knowledge Loader
 *
 * Dynamically loads policy knowledge, analysis rules, and platform-specific
 * configurations from the knowledge/ directory. This allows updating rules
 * without changing code.
 */

import * as fs from 'fs';
import * as path from 'path';

// Type definitions for knowledge files
export interface PolicyDoc {
  title: string;
  url: string;
  description: string;
}

export interface MetaPolicies {
  version: string;
  lastUpdated: string;
  policyDocs: Record<string, PolicyDoc>;
  requirements: Record<string, {
    docs: string[];
    [key: string]: unknown;
  }>;
}

export interface ViolationType {
  id: string;
  name: string;
  severity: 'error' | 'warning' | 'info';
  description: string;
  isViolation: string[];
  notViolation: string[];
  docs: string[];
}

export interface SuspiciousPattern {
  pattern: string;
  category: string;
  description: string;
}

export interface AnalysisRules {
  version: string;
  violationTypes: Record<string, ViolationType>;
  analysisGuidelines: {
    approach: string[];
    neverFlag: string[];
    confidenceGuidelines: Record<string, string>;
  };
  suspiciousPatterns: {
    patterns: SuspiciousPattern[];
  };
}

export interface PlatformRule {
  id: string;
  name: string;
  severity: 'error' | 'warning' | 'info';
  description: string;
  recommendation?: string;
  docUrl?: string;
  [key: string]: unknown;
}

export interface PlatformConfig {
  platform: string;
  displayName: string;
  version: string;
  policyUrl: string;
  specificRules: PlatformRule[];
  bestPractices: string[];
  [key: string]: unknown;
}

export interface CustomRules {
  tips: Array<{
    id: string;
    category: string;
    title: string;
    description: string;
    severity: string;
    recommendation: string;
  }>;
  patterns: Array<{
    id: string;
    name: string;
    description: string;
    regex: string;
    severity: string;
    category: string;
  }>;
  prompts: Record<string, string>;
  bestPractices: Array<{
    title: string;
    description: string;
  }>;
  commonRejections: Array<{
    reason: string;
    solution: string;
  }>;
}

// Cache for loaded knowledge
let metaPoliciesCache: MetaPolicies | null = null;
let analysisRulesCache: AnalysisRules | null = null;
let customRulesCache: CustomRules | null = null;
let platformConfigsCache: Map<string, PlatformConfig> = new Map();

/**
 * Find the knowledge directory
 */
function findKnowledgeDir(): string | null {
  const possiblePaths = [
    path.join(__dirname, '../../knowledge'),
    path.join(__dirname, '../../../knowledge'),
    path.join(process.cwd(), 'knowledge'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Load JSON file safely
 */
function loadJsonFile<T>(filePath: string): T | null {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    }
  } catch (error) {
    console.warn(`Failed to load ${filePath}:`, error instanceof Error ? error.message : 'Unknown error');
  }
  return null;
}

/**
 * Load Meta policies (official doc references)
 */
export function loadMetaPolicies(): MetaPolicies | null {
  if (metaPoliciesCache) return metaPoliciesCache;

  const knowledgeDir = findKnowledgeDir();
  if (!knowledgeDir) return null;

  metaPoliciesCache = loadJsonFile<MetaPolicies>(path.join(knowledgeDir, 'meta-policies.json'));
  return metaPoliciesCache;
}

/**
 * Load analysis rules (what IS and IS NOT a violation)
 */
export function loadAnalysisRules(): AnalysisRules | null {
  if (analysisRulesCache) return analysisRulesCache;

  const knowledgeDir = findKnowledgeDir();
  if (!knowledgeDir) return null;

  analysisRulesCache = loadJsonFile<AnalysisRules>(path.join(knowledgeDir, 'analysis-rules.json'));
  return analysisRulesCache;
}

/**
 * Load custom rules (project-specific tips and prompts)
 */
export function loadCustomRules(): CustomRules | null {
  if (customRulesCache) return customRulesCache;

  const knowledgeDir = findKnowledgeDir();
  if (!knowledgeDir) return null;

  customRulesCache = loadJsonFile<CustomRules>(path.join(knowledgeDir, 'custom-rules.json'));
  return customRulesCache;
}

/**
 * Load platform-specific configuration
 */
export function loadPlatformConfig(platform: string): PlatformConfig | null {
  if (platformConfigsCache.has(platform)) {
    return platformConfigsCache.get(platform) || null;
  }

  const knowledgeDir = findKnowledgeDir();
  if (!knowledgeDir) return null;

  const platformFile = path.join(knowledgeDir, 'platforms', `${platform}.json`);
  const config = loadJsonFile<PlatformConfig>(platformFile);

  if (config) {
    platformConfigsCache.set(platform, config);
  }
  return config;
}

/**
 * Load all available platform configs
 */
export function loadAllPlatformConfigs(): Map<string, PlatformConfig> {
  const knowledgeDir = findKnowledgeDir();
  if (!knowledgeDir) return new Map();

  const platformsDir = path.join(knowledgeDir, 'platforms');
  if (!fs.existsSync(platformsDir)) return new Map();

  const files = fs.readdirSync(platformsDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const platform = file.replace('.json', '');
    if (!platformConfigsCache.has(platform)) {
      const config = loadJsonFile<PlatformConfig>(path.join(platformsDir, file));
      if (config) {
        platformConfigsCache.set(platform, config);
      }
    }
  }

  return platformConfigsCache;
}

/**
 * Get policy doc URL by key
 */
export function getPolicyDocUrl(docKey: string): string | null {
  const policies = loadMetaPolicies();
  if (!policies?.policyDocs[docKey]) return null;
  return policies.policyDocs[docKey].url;
}

/**
 * Get all doc URLs for a violation type
 */
export function getViolationDocUrls(violationTypeId: string): string[] {
  const policies = loadMetaPolicies();
  const rules = loadAnalysisRules();

  if (!policies || !rules) return [];

  // Find violation type
  const violationType = Object.values(rules.violationTypes).find(v => v.id === violationTypeId);
  if (!violationType) return [];

  // Map doc keys to URLs
  return violationType.docs
    .map(docKey => policies.policyDocs[docKey]?.url)
    .filter((url): url is string => !!url);
}

/**
 * Build the AI analysis prompt from knowledge files
 */
export function buildAnalysisPrompt(category: string, platform?: string): string {
  const rules = loadAnalysisRules();
  const customRules = loadCustomRules();
  const platformConfig = platform ? loadPlatformConfig(platform) : null;

  let prompt = '';

  // Add violation type definitions
  if (rules?.violationTypes) {
    prompt += '## Violation Types\n\n';
    for (const [_key, violation] of Object.entries(rules.violationTypes)) {
      prompt += `### ${violation.name} (${violation.id})\n`;
      prompt += `${violation.description}\n\n`;
      prompt += '**IS a violation:**\n';
      violation.isViolation.forEach(v => prompt += `- ${v}\n`);
      prompt += '\n**NOT a violation:**\n';
      violation.notViolation.forEach(v => prompt += `- ${v}\n`);
      prompt += '\n';
    }
  }

  // Add analysis guidelines
  if (rules?.analysisGuidelines) {
    prompt += '## Analysis Guidelines\n\n';
    prompt += '**Approach:**\n';
    rules.analysisGuidelines.approach.forEach(a => prompt += `- ${a}\n`);
    prompt += '\n**Never flag:**\n';
    rules.analysisGuidelines.neverFlag.forEach(n => prompt += `- ${n}\n`);
    prompt += '\n**Confidence levels:**\n';
    for (const [level, desc] of Object.entries(rules.analysisGuidelines.confidenceGuidelines)) {
      prompt += `- ${level}: ${desc}\n`;
    }
    prompt += '\n';
  }

  // Add category-specific prompt from custom rules
  if (customRules?.prompts[category]) {
    prompt += `## Category-Specific Guidance (${category})\n`;
    prompt += customRules.prompts[category] + '\n\n';
  }

  // Add platform-specific rules
  if (platformConfig) {
    prompt += `## Platform-Specific Rules (${platformConfig.displayName})\n\n`;
    for (const rule of platformConfig.specificRules) {
      prompt += `- **${rule.name}**: ${rule.description}\n`;
      if (rule.recommendation) {
        prompt += `  Recommendation: ${rule.recommendation}\n`;
      }
    }
    prompt += '\n';
  }

  // Add relevant tips
  if (customRules?.tips) {
    const relevantTips = customRules.tips.filter(
      t => t.category === category || t.category === 'all'
    );
    if (relevantTips.length > 0) {
      prompt += '## Known Issues (from experience)\n';
      relevantTips.forEach(t => prompt += `- **${t.title}**: ${t.description}\n`);
      prompt += '\n';
    }
  }

  return prompt;
}

/**
 * Get suspicious patterns (from config or defaults)
 */
export function getSuspiciousPatterns(): Array<{ pattern: RegExp; category: string; description: string }> {
  const rules = loadAnalysisRules();

  if (rules?.suspiciousPatterns?.patterns) {
    return rules.suspiciousPatterns.patterns.map(p => ({
      pattern: new RegExp(p.pattern, 'gi'),
      category: p.category,
      description: p.description,
    }));
  }

  // Fallback to hardcoded defaults if no config
  return [
    { pattern: /user(?:_)?(?:data|info|profile)/gi, category: 'data-handling', description: 'User data handling' },
    { pattern: /(?:store|save|persist|cache).*(?:token|secret|credential)/gi, category: 'credentials', description: 'Credential storage' },
  ];
}

/**
 * Clear all caches (useful for testing or config reload)
 */
export function clearKnowledgeCache(): void {
  metaPoliciesCache = null;
  analysisRulesCache = null;
  customRulesCache = null;
  platformConfigsCache.clear();
}

/**
 * Get summary of loaded knowledge for logging
 */
export function getKnowledgeSummary(): {
  policies: number;
  violationTypes: number;
  patterns: number;
  platforms: string[];
  customTips: number;
} {
  const policies = loadMetaPolicies();
  const rules = loadAnalysisRules();
  const customRules = loadCustomRules();
  const platforms = loadAllPlatformConfigs();

  return {
    policies: policies ? Object.keys(policies.policyDocs).length : 0,
    violationTypes: rules ? Object.keys(rules.violationTypes).length : 0,
    patterns: rules?.suspiciousPatterns?.patterns?.length || 0,
    platforms: Array.from(platforms.keys()),
    customTips: customRules?.tips?.length || 0,
  };
}
