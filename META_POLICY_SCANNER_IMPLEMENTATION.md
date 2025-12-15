# Meta API Policy Scanner - Complete Implementation Guide

## Table of Contents
1. [SDK Detection System](#sdk-detection-system)
2. [Dynamic Rule Management](#dynamic-rule-management)
3. [GitHub Repo Scanning](#github-repo-scanning)
4. [Documentation Scraper & Updates](#documentation-scraper--updates)
5. [Deployment Strategy](#deployment-strategy)
6. [Complete Code Examples](#complete-code-examples)

---

## 1. SDK Detection System

### Overview
Detect all Meta API interactions: official SDKs, wrapper libraries, direct API calls, and policy violations.

### Enhanced SDK Patterns

```typescript
// src/scanner/sdk-detector.ts

export interface SDKDetection {
  type: 'official-sdk' | 'wrapper' | 'direct-api' | 'unofficial' | 'deprecated';
  sdk: string;
  platform: 'facebook' | 'instagram' | 'messenger' | 'whatsapp' | 'ads';
  file: string;
  line: number;
  column: number;
  codeSnippet: string;
  confidence: 'high' | 'medium' | 'low';
  riskLevel: 'safe' | 'caution' | 'violation';
  recommendation?: string;
}

export const SDK_REGISTRY = {
  // Official Meta Business SDKs
  official: {
    nodejs: {
      package: 'facebook-nodejs-business-sdk',
      imports: [
        /require\s*\(\s*['"]facebook-nodejs-business-sdk['"]\s*\)/,
        /from\s+['"]facebook-nodejs-business-sdk['"]/,
      ],
      classes: [
        'FacebookAdsApi', 'AdAccount', 'Campaign', 'AdSet', 'Ad',
        'AdCreative', 'CustomAudience', 'ProductCatalog', 'AdsInsights',
        'Page', 'User', 'IGUser', 'IGMedia', 'Business'
      ],
      riskLevel: 'safe',
    },
    python: {
      package: 'facebook-business',
      imports: [
        /from\s+facebook_business/,
        /import\s+facebook_business/,
      ],
      classes: ['FacebookAdsApi', 'AdAccount', 'Campaign'],
      riskLevel: 'safe',
    },
    php: {
      package: 'facebook/php-business-sdk',
      patterns: [/use\s+FacebookAds/],
      riskLevel: 'safe',
    },
  },

  // Third-party wrappers (use with caution)
  wrappers: {
    fb: {
      package: 'fb',
      imports: [/require\s*\(\s*['"]fb['"]\s*\)/],
      riskLevel: 'caution',
      recommendation: 'Consider using official facebook-nodejs-business-sdk for better rate limiting support',
    },
    fbgraph: {
      package: 'fbgraph',
      imports: [/require\s*\(\s*['"]fbgraph['"]\s*\)/],
      riskLevel: 'caution',
      recommendation: 'This library may not implement proper rate limiting',
    },
    'node-facebook-sdk': {
      package: 'node-facebook-sdk',
      imports: [/require\s*\(\s*['"]node-facebook-sdk['"]\s*\)/],
      riskLevel: 'caution',
    },
  },

  // Unofficial/scraping libraries (VIOLATIONS)
  unofficial: {
    'instagram-private-api': {
      package: 'instagram-private-api',
      imports: [/require\s*\(\s*['"]instagram-private-api['"]\s*\)/],
      riskLevel: 'violation',
      recommendation: 'POLICY VIOLATION: Use official Instagram Graph API instead',
      policyUrl: 'https://developers.facebook.com/docs/instagram-api/',
    },
    'instagram-web-api': {
      package: 'instagram-web-api',
      riskLevel: 'violation',
      recommendation: 'POLICY VIOLATION: This library uses web scraping which violates Meta Platform Terms',
    },
    instagrapi: {
      package: 'instagrapi',
      language: 'python',
      riskLevel: 'violation',
    },
    'instagram-scraper': {
      package: 'instagram-scraper',
      riskLevel: 'violation',
    },
  },

  // Direct API patterns
  directAPI: {
    graphAPI: {
      patterns: [
        /https?:\/\/graph\.facebook\.com\/v[\d.]+\//i,
        /'graph\.facebook\.com'/i,
        /"graph\.facebook\.com"/i,
      ],
      extract: /v(\d+\.\d+)/,  // Extract version
      riskLevel: 'safe',  // If version is current
    },
    graphBeta: {
      patterns: [/graph\.beta\.facebook\.com/i],
      riskLevel: 'caution',
      recommendation: 'Beta APIs may change without notice',
    },
    instagramGraph: {
      patterns: [/graph\.instagram\.com/i],
      riskLevel: 'safe',
    },
    marketingAPI: {
      patterns: [
        /\/act_\d+\//,  // Ad account ID pattern
        /\/v[\d.]+\/\d+\/insights/,
      ],
      riskLevel: 'safe',
    },
  },

  // Deprecated/risky patterns
  deprecated: {
    restAPI: {
      patterns: [/api\.facebook\.com/i],
      riskLevel: 'violation',
      recommendation: 'REST API is deprecated. Use Graph API instead',
    },
    oldVersions: {
      patterns: [/graph\.facebook\.com\/v[1-9]\./i],  // v1.x - v9.x
      riskLevel: 'violation',
      recommendation: 'API version is deprecated. Use v18.0 or later',
    },
    fql: {
      patterns: [/fql\?q=/i],
      riskLevel: 'violation',
      recommendation: 'FQL is deprecated since 2016. Use Graph API',
    },
  },
};

// Detect SDK usage in AST
export class SDKDetector {
  private detections: SDKDetection[] = [];

  async detectInFile(filePath: string, ast: any, content: string): Promise<SDKDetection[]> {
    this.detections = [];

    // 1. Check package imports
    await this.checkImports(ast, filePath, content);

    // 2. Check for direct API URLs
    await this.checkDirectAPICalls(ast, filePath, content);

    // 3. Check for SDK class instantiations
    await this.checkSDKUsage(ast, filePath, content);

    return this.detections;
  }

  private async checkImports(ast: any, filePath: string, content: string) {
    // Parse import/require statements
    const imports = this.extractImports(ast);

    for (const imp of imports) {
      // Check official SDKs
      for (const [lang, config] of Object.entries(SDK_REGISTRY.official)) {
        if (imp.module === config.package) {
          this.detections.push({
            type: 'official-sdk',
            sdk: config.package,
            platform: this.inferPlatform(imp.module),
            file: filePath,
            line: imp.line,
            column: imp.column,
            codeSnippet: this.getCodeSnippet(content, imp.line),
            confidence: 'high',
            riskLevel: 'safe',
          });
        }
      }

      // Check wrappers
      for (const [name, config] of Object.entries(SDK_REGISTRY.wrappers)) {
        if (imp.module === config.package) {
          this.detections.push({
            type: 'wrapper',
            sdk: config.package,
            platform: 'facebook',
            file: filePath,
            line: imp.line,
            column: imp.column,
            codeSnippet: this.getCodeSnippet(content, imp.line),
            confidence: 'high',
            riskLevel: config.riskLevel as any,
            recommendation: config.recommendation,
          });
        }
      }

      // Check unofficial (violations)
      for (const [name, config] of Object.entries(SDK_REGISTRY.unofficial)) {
        if (imp.module === config.package) {
          this.detections.push({
            type: 'unofficial',
            sdk: config.package,
            platform: 'instagram',
            file: filePath,
            line: imp.line,
            column: imp.column,
            codeSnippet: this.getCodeSnippet(content, imp.line),
            confidence: 'high',
            riskLevel: 'violation',
            recommendation: config.recommendation,
          });
        }
      }
    }
  }

  private async checkDirectAPICalls(ast: any, filePath: string, content: string) {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for Graph API URLs
      for (const pattern of SDK_REGISTRY.directAPI.graphAPI.patterns) {
        const match = line.match(pattern);
        if (match) {
          const versionMatch = line.match(/v(\d+\.\d+)/);
          const version = versionMatch ? parseFloat(versionMatch[1]) : 0;

          this.detections.push({
            type: 'direct-api',
            sdk: 'Graph API',
            platform: this.inferPlatformFromURL(line),
            file: filePath,
            line: i + 1,
            column: match.index || 0,
            codeSnippet: line.trim(),
            confidence: 'high',
            riskLevel: version < 10 ? 'violation' : 'safe',
            recommendation: version < 10 ? `API version v${version} is deprecated. Use v18.0+` : undefined,
          });
        }
      }

      // Check for deprecated patterns
      for (const [name, config] of Object.entries(SDK_REGISTRY.deprecated)) {
        for (const pattern of config.patterns) {
          if (pattern.test(line)) {
            this.detections.push({
              type: 'deprecated',
              sdk: name,
              platform: 'facebook',
              file: filePath,
              line: i + 1,
              column: 0,
              codeSnippet: line.trim(),
              confidence: 'high',
              riskLevel: config.riskLevel as any,
              recommendation: config.recommendation,
            });
          }
        }
      }
    }
  }

  private extractImports(ast: any): Array<{module: string; line: number; column: number}> {
    const imports: Array<{module: string; line: number; column: number}> = [];

    // Tree-sitter traversal to find import/require statements
    // This is a simplified version - actual implementation would use tree-sitter queries

    return imports;
  }

  private inferPlatform(moduleName: string): 'facebook' | 'instagram' | 'messenger' | 'whatsapp' | 'ads' {
    if (moduleName.includes('instagram')) return 'instagram';
    if (moduleName.includes('messenger')) return 'messenger';
    if (moduleName.includes('whatsapp')) return 'whatsapp';
    if (moduleName.includes('ads') || moduleName.includes('business')) return 'ads';
    return 'facebook';
  }

  private inferPlatformFromURL(url: string): 'facebook' | 'instagram' | 'messenger' | 'whatsapp' | 'ads' {
    if (url.includes('instagram')) return 'instagram';
    if (url.includes('/me/messages')) return 'messenger';
    if (url.includes('act_') || url.includes('insights')) return 'ads';
    return 'facebook';
  }

  private getCodeSnippet(content: string, line: number, context: number = 0): string {
    const lines = content.split('\n');
    const start = Math.max(0, line - 1 - context);
    const end = Math.min(lines.length, line + context);
    return lines.slice(start, end).join('\n');
  }
}
```

### Package.json Detection

```typescript
// src/scanner/package-detector.ts

export async function detectMetaPackages(projectPath: string): Promise<{
  direct: string[];
  dev: string[];
  violations: string[];
}> {
  const packageJsonPath = join(projectPath, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return { direct: [], dev: [], violations: [] };
  }

  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

  const allPackages = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  const result = {
    direct: [] as string[],
    dev: [] as string[],
    violations: [] as string[],
  };

  for (const pkgName of Object.keys(allPackages)) {
    // Check official SDKs
    if (pkgName === 'facebook-nodejs-business-sdk') {
      result.direct.push(pkgName);
    }

    // Check violations
    const violationPackages = [
      'instagram-private-api',
      'instagram-web-api',
      'instagram-scraper',
      'instagrapi',
    ];

    if (violationPackages.includes(pkgName)) {
      result.violations.push(pkgName);
    }

    // Check wrappers
    const wrappers = ['fb', 'fbgraph', 'node-facebook-sdk'];
    if (wrappers.includes(pkgName)) {
      result.direct.push(pkgName);
    }
  }

  return result;
}
```

---

## 2. Dynamic Rule Management

### Database Schema

```sql
-- src/db/schema.sql

-- Platforms table
create table platforms (
  id serial primary key,
  name text unique not null,  -- 'facebook', 'instagram', 'messenger', 'whatsapp', 'ads'
  display_name text not null,
  api_docs_url text,
  created_at timestamptz default now()
);

-- SDK patterns table
create table sdk_patterns (
  id serial primary key,
  platform_id int references platforms(id),
  sdk_name text not null,
  sdk_type text check (sdk_type in ('official', 'wrapper', 'unofficial', 'deprecated')),
  package_names text[] not null,
  import_patterns text[],
  class_names text[],
  risk_level text check (risk_level in ('safe', 'caution', 'violation')),
  recommendation text,
  policy_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Violation rules table
create table violation_rules (
  id serial primary key,
  rule_code text unique not null,  -- e.g., 'RATE_LIMIT_MISSING'
  name text not null,
  description text,
  platform text check (platform in ('facebook', 'instagram', 'messenger', 'whatsapp', 'ads', 'all')),
  severity text check (severity in ('error', 'warning', 'info')) default 'warning',
  category text,  -- 'rate-limiting', 'data-storage', 'authentication', etc.

  -- Detection configuration
  detection jsonb not null,  -- {type, pattern, astQuery, semanticHint, fileTypes}

  -- Metadata
  recommendation text,
  fix_example text,  -- Code example of correct implementation
  doc_urls text[],
  tags text[],

  -- Control
  enabled boolean default true,
  is_builtin boolean default false,  -- Built-in vs user-created

  -- Audit
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by text,  -- User/system that created the rule

  -- Search
  embedding vector(1536)  -- For semantic search of rules
);

-- Policy documents table
create table policies (
  id serial primary key,
  platform_id int references platforms(id),
  title text not null,
  url text unique not null,
  content text,
  last_scraped timestamptz,
  created_at timestamptz default now()
);

-- Policy chunks with embeddings
create table policy_chunks (
  id serial primary key,
  policy_id int references policies(id) on delete cascade,
  chunk_text text not null,
  chunk_index int not null,
  embedding vector(1536),
  metadata jsonb,  -- {section, subsection, tags}
  created_at timestamptz default now()
);

-- Create indexes
create index idx_policy_chunks_embedding on policy_chunks using ivfflat (embedding vector_cosine_ops);
create index idx_violation_rules_platform on violation_rules(platform);
create index idx_violation_rules_enabled on violation_rules(enabled);
create index idx_violation_rules_category on violation_rules(category);

-- Triggers for updated_at
create or replace function update_modified_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_sdk_patterns_modtime
  before update on sdk_patterns
  for each row execute function update_modified_column();

create trigger update_violation_rules_modtime
  before update on violation_rules
  for each row execute function update_modified_column();

-- Seed platforms
insert into platforms (name, display_name, api_docs_url) values
  ('facebook', 'Facebook', 'https://developers.facebook.com/docs/graph-api'),
  ('instagram', 'Instagram', 'https://developers.facebook.com/docs/instagram-api'),
  ('messenger', 'Messenger', 'https://developers.facebook.com/docs/messenger-platform'),
  ('whatsapp', 'WhatsApp', 'https://developers.facebook.com/docs/whatsapp'),
  ('ads', 'Marketing API', 'https://developers.facebook.com/docs/marketing-apis');
```

### Rule Manager Implementation

```typescript
// src/rules/rule-manager.ts

import { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

export interface ViolationRule {
  id?: number;
  rule_code: string;
  name: string;
  description?: string;
  platform: 'facebook' | 'instagram' | 'messenger' | 'whatsapp' | 'ads' | 'all';
  severity: 'error' | 'warning' | 'info';
  category: string;
  detection: {
    type: 'ast-pattern' | 'regex' | 'semantic' | 'sdk-check';
    pattern?: string;
    astQuery?: string;
    semanticHint?: string;
    fileTypes?: string[];  // ['.js', '.ts', '.py']
  };
  recommendation?: string;
  fix_example?: string;
  doc_urls?: string[];
  tags?: string[];
  enabled: boolean;
  is_builtin?: boolean;
}

export class RuleManager {
  constructor(private supabase: SupabaseClient) {}

  // List rules with optional filters
  async listRules(filter?: {
    platform?: string;
    severity?: string;
    category?: string;
    enabled?: boolean;
  }) {
    let query = this.supabase
      .from('violation_rules')
      .select('*')
      .order('severity', { ascending: false })
      .order('rule_code');

    if (filter?.platform) {
      query = query.or(`platform.eq.${filter.platform},platform.eq.all`);
    }
    if (filter?.severity) {
      query = query.eq('severity', filter.severity);
    }
    if (filter?.category) {
      query = query.eq('category', filter.category);
    }
    if (filter?.enabled !== undefined) {
      query = query.eq('enabled', filter.enabled);
    }

    return query;
  }

  // Get single rule by code
  async getRule(ruleCode: string) {
    const { data, error } = await this.supabase
      .from('violation_rules')
      .select('*')
      .eq('rule_code', ruleCode)
      .single();

    if (error) throw error;
    return data;
  }

  // Add new rule
  async addRule(rule: Omit<ViolationRule, 'id'>) {
    // Validate rule_code format (uppercase with underscores)
    if (!/^[A-Z][A-Z0-9_]*$/.test(rule.rule_code)) {
      throw new Error('rule_code must be UPPER_SNAKE_CASE');
    }

    const { data, error } = await this.supabase
      .from('violation_rules')
      .insert({
        ...rule,
        created_by: 'cli',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Update existing rule
  async updateRule(ruleCode: string, updates: Partial<ViolationRule>) {
    const { data, error } = await this.supabase
      .from('violation_rules')
      .update(updates)
      .eq('rule_code', ruleCode)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Delete rule (only user-created)
  async deleteRule(ruleCode: string) {
    // Prevent deletion of built-in rules
    const rule = await this.getRule(ruleCode);
    if (rule.is_builtin) {
      throw new Error('Cannot delete built-in rules. Disable instead.');
    }

    const { error } = await this.supabase
      .from('violation_rules')
      .delete()
      .eq('rule_code', ruleCode);

    if (error) throw error;
  }

  // Enable/disable rule
  async toggleRule(ruleCode: string, enabled: boolean) {
    return this.updateRule(ruleCode, { enabled });
  }

  // Import rules from JSON file
  async importRules(filePath: string, options?: { overwrite?: boolean }) {
    const content = readFileSync(filePath, 'utf-8');
    const rules: ViolationRule[] = JSON.parse(content);

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const rule of rules) {
      try {
        const existing = await this.supabase
          .from('violation_rules')
          .select('id')
          .eq('rule_code', rule.rule_code)
          .maybeSingle();

        if (existing.data && !options?.overwrite) {
          results.skipped++;
        } else if (existing.data && options?.overwrite) {
          await this.updateRule(rule.rule_code, rule);
          results.updated++;
        } else {
          await this.addRule(rule);
          results.created++;
        }
      } catch (err: any) {
        results.errors.push(`${rule.rule_code}: ${err.message}`);
      }
    }

    return results;
  }

  // Export rules to JSON file
  async exportRules(filePath: string, filter?: { platform?: string; category?: string }) {
    const { data } = await this.listRules(filter);
    writeFileSync(filePath, JSON.stringify(data, null, 2));
    return data?.length || 0;
  }

  // Seed built-in rules
  async seedBuiltinRules() {
    const builtinRules: ViolationRule[] = [
      {
        rule_code: 'RATE_LIMIT_MISSING',
        name: 'Missing Rate Limit Handling',
        description: 'API calls without rate limit error handling detected',
        platform: 'all',
        severity: 'error',
        category: 'rate-limiting',
        detection: {
          type: 'ast-pattern',
          astQuery: '(call_expression) @call',
          fileTypes: ['.js', '.ts'],
        },
        recommendation: 'Implement exponential backoff and respect x-app-usage headers',
        doc_urls: ['https://developers.facebook.com/docs/graph-api/overview/rate-limiting/'],
        enabled: true,
        is_builtin: true,
      },
      {
        rule_code: 'HUMAN_AGENT_ABUSE',
        name: 'HUMAN_AGENT Tag Misuse',
        description: 'HUMAN_AGENT tag used outside 7-day window or for automated responses',
        platform: 'messenger',
        severity: 'error',
        category: 'messaging',
        detection: {
          type: 'regex',
          pattern: 'HUMAN_AGENT.*:.*true',
          fileTypes: ['.js', '.ts', '.py'],
        },
        recommendation: 'Only use HUMAN_AGENT tag within 7 days of user message and for actual human responses',
        doc_urls: ['https://developers.facebook.com/docs/messenger-platform/send-messages/message-tags'],
        enabled: true,
        is_builtin: true,
      },
      {
        rule_code: 'UNOFFICIAL_IG_LIBRARY',
        name: 'Unofficial Instagram Library',
        description: 'Using unofficial Instagram API libraries (policy violation)',
        platform: 'instagram',
        severity: 'error',
        category: 'policy-violation',
        detection: {
          type: 'sdk-check',
          pattern: 'instagram-private-api|instagram-web-api|instagrapi',
        },
        recommendation: 'Use official Instagram Graph API via facebook-nodejs-business-sdk',
        doc_urls: [
          'https://developers.facebook.com/docs/instagram-api/',
          'https://developers.facebook.com/terms/',
        ],
        enabled: true,
        is_builtin: true,
      },
      {
        rule_code: 'TOKEN_EXPOSED',
        name: 'Access Token in Source Code',
        description: 'Hardcoded access tokens found in code',
        platform: 'all',
        severity: 'error',
        category: 'security',
        detection: {
          type: 'regex',
          pattern: '(EAAA|access_token=)[A-Za-z0-9_-]{50,}',
          fileTypes: ['.js', '.ts', '.py', '.php', '.env.example'],
        },
        recommendation: 'Store tokens in environment variables or secure secret management',
        enabled: true,
        is_builtin: true,
      },
      {
        rule_code: 'DEPRECATED_API_VERSION',
        name: 'Deprecated API Version',
        description: 'Using deprecated Graph API version (< v10.0)',
        platform: 'all',
        severity: 'warning',
        category: 'deprecation',
        detection: {
          type: 'regex',
          pattern: 'graph\\.facebook\\.com/v[1-9]\\.',
        },
        recommendation: 'Upgrade to v18.0 or later',
        doc_urls: ['https://developers.facebook.com/docs/graph-api/changelog'],
        enabled: true,
        is_builtin: true,
      },
      {
        rule_code: 'NO_ERROR_HANDLING',
        name: 'Missing API Error Handling',
        description: 'API calls without try-catch or error handling',
        platform: 'all',
        severity: 'warning',
        category: 'error-handling',
        detection: {
          type: 'ast-pattern',
          astQuery: '(call_expression) @call',
        },
        recommendation: 'Wrap API calls in try-catch blocks and handle errors gracefully',
        enabled: true,
        is_builtin: true,
      },
      {
        rule_code: 'DATA_RETENTION_VIOLATION',
        name: 'Data Stored Beyond Allowed Period',
        description: 'User data stored longer than Meta Platform Terms allow',
        platform: 'all',
        severity: 'warning',
        category: 'data-storage',
        detection: {
          type: 'semantic',
          semanticHint: 'database schema, data retention, user data storage',
        },
        recommendation: 'Implement data deletion after 90 days or user account deletion',
        doc_urls: ['https://developers.facebook.com/docs/development/release/data-deletion'],
        enabled: true,
        is_builtin: true,
      },
      {
        rule_code: 'MISSING_PERMISSION_CHECK',
        name: 'Missing Permission Check',
        description: 'API call without verifying user granted required permissions',
        platform: 'all',
        severity: 'info',
        category: 'permissions',
        detection: {
          type: 'semantic',
          semanticHint: 'permission check, scope verification',
        },
        recommendation: 'Check granted permissions before making API calls',
        enabled: true,
        is_builtin: true,
      },
    ];

    const { data, error } = await this.supabase
      .from('violation_rules')
      .upsert(builtinRules, {
        onConflict: 'rule_code',
        ignoreDuplicates: false,
      })
      .select();

    if (error) throw error;
    return data;
  }

  // Get rule statistics
  async getStatistics() {
    const { data: all } = await this.supabase
      .from('violation_rules')
      .select('platform, severity, enabled, category');

    if (!all) return null;

    return {
      total: all.length,
      enabled: all.filter(r => r.enabled).length,
      disabled: all.filter(r => !r.enabled).length,
      byPlatform: this.groupBy(all, 'platform'),
      bySeverity: this.groupBy(all, 'severity'),
      byCategory: this.groupBy(all, 'category'),
    };
  }

  private groupBy(array: any[], key: string) {
    return array.reduce((acc, item) => {
      const value = item[key] || 'unknown';
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }
}
```

### CLI Commands for Rule Management

```typescript
// src/cli/commands/rules.ts

import { Command } from 'commander';
import { RuleManager } from '../../rules/rule-manager';
import { createClient } from '../../db/supabase';
import { table } from 'table';
import chalk from 'chalk';
import inquirer from 'inquirer';

export function registerRulesCommands(program: Command) {
  const rules = program.command('rules').description('Manage violation rules');

  const getRuleManager = () => new RuleManager(createClient());

  // List rules
  rules
    .command('list')
    .description('List all rules')
    .option('-p, --platform <platform>', 'Filter by platform')
    .option('-s, --severity <severity>', 'Filter by severity')
    .option('-c, --category <category>', 'Filter by category')
    .option('--enabled', 'Show only enabled rules')
    .option('--disabled', 'Show only disabled rules')
    .action(async (options) => {
      const manager = getRuleManager();
      const { data } = await manager.listRules({
        platform: options.platform,
        severity: options.severity,
        category: options.category,
        enabled: options.enabled ? true : options.disabled ? false : undefined,
      });

      if (!data || data.length === 0) {
        console.log(chalk.yellow('No rules found'));
        return;
      }

      const tableData = [
        ['Code', 'Name', 'Platform', 'Severity', 'Category', 'Enabled'],
        ...data.map((r) => [
          r.rule_code,
          r.name,
          r.platform,
          r.severity === 'error' ? chalk.red(r.severity) :
          r.severity === 'warning' ? chalk.yellow(r.severity) :
          chalk.blue(r.severity),
          r.category,
          r.enabled ? chalk.green('✓') : chalk.gray('✗'),
        ]),
      ];

      console.log(table(tableData));
      console.log(chalk.gray(`\nTotal: ${data.length} rules`));
    });

  // Show rule details
  rules
    .command('show <rule-code>')
    .description('Show rule details')
    .action(async (ruleCode) => {
      const manager = getRuleManager();
      const rule = await manager.getRule(ruleCode);

      console.log(chalk.bold(`\n${rule.name}`));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(`Code:         ${chalk.cyan(rule.rule_code)}`);
      console.log(`Platform:     ${rule.platform}`);
      console.log(`Severity:     ${chalk.red(rule.severity)}`);
      console.log(`Category:     ${rule.category}`);
      console.log(`Enabled:      ${rule.enabled ? chalk.green('Yes') : chalk.gray('No')}`);
      console.log(`Built-in:     ${rule.is_builtin ? 'Yes' : 'No'}`);

      if (rule.description) {
        console.log(`\nDescription:\n${rule.description}`);
      }

      if (rule.recommendation) {
        console.log(`\nRecommendation:\n${chalk.yellow(rule.recommendation)}`);
      }

      if (rule.fix_example) {
        console.log(`\nExample Fix:\n${chalk.green(rule.fix_example)}`);
      }

      if (rule.doc_urls?.length) {
        console.log(`\nDocumentation:`);
        rule.doc_urls.forEach(url => console.log(`  ${chalk.blue(url)}`));
      }

      console.log(`\nDetection:\n${JSON.stringify(rule.detection, null, 2)}`);
    });

  // Add rule
  rules
    .command('add')
    .description('Add a new rule')
    .option('-f, --from-file <path>', 'Load rule from JSON file')
    .option('-i, --interactive', 'Interactive mode')
    .action(async (options) => {
      const manager = getRuleManager();

      if (options.fromFile) {
        const results = await manager.importRules(options.fromFile);
        console.log(chalk.green(`✓ Created ${results.created} rules`));
        if (results.errors.length) {
          console.log(chalk.red(`✗ Errors: ${results.errors.join(', ')}`));
        }
        return;
      }

      if (options.interactive) {
        const answers = await inquirer.prompt([
          { name: 'rule_code', message: 'Rule code (UPPER_SNAKE_CASE):', validate: (v) => /^[A-Z][A-Z0-9_]*$/.test(v) },
          { name: 'name', message: 'Rule name:' },
          { name: 'description', message: 'Description (optional):' },
          { type: 'list', name: 'platform', message: 'Platform:', choices: ['facebook', 'instagram', 'messenger', 'whatsapp', 'ads', 'all'] },
          { type: 'list', name: 'severity', message: 'Severity:', choices: ['error', 'warning', 'info'] },
          { name: 'category', message: 'Category:' },
          { type: 'list', name: 'detectionType', message: 'Detection type:', choices: ['regex', 'ast-pattern', 'semantic', 'sdk-check'] },
          { name: 'pattern', message: 'Pattern/regex:' },
          { name: 'recommendation', message: 'Recommendation (optional):' },
        ]);

        const rule = {
          ...answers,
          detection: {
            type: answers.detectionType,
            pattern: answers.pattern,
          },
          enabled: true,
        };

        const created = await manager.addRule(rule);
        console.log(chalk.green(`✓ Created rule: ${created.rule_code}`));
      }
    });

  // Update rule
  rules
    .command('update <rule-code>')
    .description('Update a rule')
    .option('--severity <severity>', 'New severity')
    .option('--enabled <boolean>', 'Enable/disable')
    .option('--recommendation <text>', 'New recommendation')
    .action(async (ruleCode, options) => {
      const manager = getRuleManager();
      const updates: any = {};

      if (options.severity) updates.severity = options.severity;
      if (options.enabled !== undefined) updates.enabled = options.enabled === 'true';
      if (options.recommendation) updates.recommendation = options.recommendation;

      await manager.updateRule(ruleCode, updates);
      console.log(chalk.green(`✓ Updated rule: ${ruleCode}`));
    });

  // Enable/disable rule
  rules
    .command('enable <rule-code>')
    .description('Enable a rule')
    .action(async (ruleCode) => {
      const manager = getRuleManager();
      await manager.toggleRule(ruleCode, true);
      console.log(chalk.green(`✓ Enabled: ${ruleCode}`));
    });

  rules
    .command('disable <rule-code>')
    .description('Disable a rule')
    .action(async (ruleCode) => {
      const manager = getRuleManager();
      await manager.toggleRule(ruleCode, false);
      console.log(chalk.yellow(`⚠ Disabled: ${ruleCode}`));
    });

  // Delete rule
  rules
    .command('delete <rule-code>')
    .description('Delete a rule (user-created only)')
    .action(async (ruleCode) => {
      const manager = getRuleManager();
      const confirm = await inquirer.prompt([
        { type: 'confirm', name: 'confirmed', message: `Delete rule ${ruleCode}?`, default: false }
      ]);

      if (confirm.confirmed) {
        await manager.deleteRule(ruleCode);
        console.log(chalk.green(`✓ Deleted: ${ruleCode}`));
      }
    });

  // Import/export
  rules
    .command('import <file>')
    .description('Import rules from JSON file')
    .option('--overwrite', 'Overwrite existing rules')
    .action(async (file, options) => {
      const manager = getRuleManager();
      const results = await manager.importRules(file, { overwrite: options.overwrite });

      console.log(chalk.green(`✓ Created: ${results.created}`));
      console.log(chalk.blue(`↻ Updated: ${results.updated}`));
      console.log(chalk.gray(`- Skipped: ${results.skipped}`));

      if (results.errors.length) {
        console.log(chalk.red(`✗ Errors:`));
        results.errors.forEach(e => console.log(`  ${e}`));
      }
    });

  rules
    .command('export <file>')
    .description('Export rules to JSON file')
    .option('-p, --platform <platform>', 'Filter by platform')
    .option('-c, --category <category>', 'Filter by category')
    .action(async (file, options) => {
      const manager = getRuleManager();
      const count = await manager.exportRules(file, {
        platform: options.platform,
        category: options.category,
      });
      console.log(chalk.green(`✓ Exported ${count} rules to ${file}`));
    });

  // Seed built-in rules
  rules
    .command('seed')
    .description('Seed built-in rules to database')
    .action(async () => {
      const manager = getRuleManager();
      const data = await manager.seedBuiltinRules();
      console.log(chalk.green(`✓ Seeded ${data.length} built-in rules`));
    });

  // Statistics
  rules
    .command('stats')
    .description('Show rule statistics')
    .action(async () => {
      const manager = getRuleManager();
      const stats = await manager.getStatistics();

      console.log(chalk.bold('\nRule Statistics'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(`Total:    ${stats.total}`);
      console.log(`Enabled:  ${chalk.green(stats.enabled)}`);
      console.log(`Disabled: ${chalk.gray(stats.disabled)}`);

      console.log(`\nBy Platform:`);
      Object.entries(stats.byPlatform).forEach(([platform, count]) => {
        console.log(`  ${platform}: ${count}`);
      });

      console.log(`\nBy Severity:`);
      Object.entries(stats.bySeverity).forEach(([severity, count]) => {
        const color = severity === 'error' ? chalk.red : severity === 'warning' ? chalk.yellow : chalk.blue;
        console.log(`  ${color(severity)}: ${count}`);
      });

      console.log(`\nBy Category:`);
      Object.entries(stats.byCategory).forEach(([category, count]) => {
        console.log(`  ${category}: ${count}`);
      });
    });
}
```

---

## 3. GitHub Repo Scanning

### GitHub Scanner Implementation

```typescript
// src/scanner/github-scanner.ts

import { execSync } from 'child_process';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { scanDirectory } from './local-scanner';
import chalk from 'chalk';
import ora from 'ora';

export interface GitHubScanOptions {
  branch?: string;
  depth?: number;  // Clone depth (default: 1 for shallow clone)
  auth?: string;   // GitHub PAT for private repos
  includeSubmodules?: boolean;
}

export async function scanGitHubRepo(
  repoUrl: string,
  options: GitHubScanOptions = {}
): Promise<any> {
  // Parse GitHub URL
  const githubPattern = /github\.com\/([^\/]+)\/([^\/]+)/;
  const match = repoUrl.match(githubPattern);

  if (!match) {
    throw new Error(
      `Invalid GitHub URL: ${repoUrl}\nExpected format: https://github.com/owner/repo`
    );
  }

  const [, owner, repo] = match;
  const repoName = repo.replace(/\.git$/, '');
  const tempDir = mkdtempSync(join(tmpdir(), `meta-scan-${repoName}-`));

  const spinner = ora(`Cloning ${chalk.cyan(`${owner}/${repoName}`)}...`).start();

  try {
    // Build git clone command
    const cloneOptions = [
      `--depth ${options.depth || 1}`,  // Shallow clone by default
      options.branch ? `-b ${options.branch}` : '',
      options.includeSubmodules ? '--recurse-submodules' : '',
    ].filter(Boolean).join(' ');

    // Build URL with auth if provided
    const cloneUrl = options.auth
      ? `https://${options.auth}@github.com/${owner}/${repoName}.git`
      : `https://github.com/${owner}/${repoName}.git`;

    const cloneCommand = `git clone ${cloneOptions} ${cloneUrl} ${tempDir}`;

    // Execute clone
    execSync(cloneCommand, {
      stdio: 'pipe',
      maxBuffer: 1024 * 1024 * 100,  // 100MB buffer for large repos
    });

    spinner.succeed(`Cloned ${chalk.cyan(`${owner}/${repoName}`)}`);

    // Get commit info
    const commitHash = execSync('git rev-parse HEAD', {
      cwd: tempDir,
      encoding: 'utf-8',
    }).trim();

    const commitDate = execSync('git log -1 --format=%ci', {
      cwd: tempDir,
      encoding: 'utf-8',
    }).trim();

    // Scan the cloned repo
    const scanSpinner = ora('Scanning repository...').start();
    const result = await scanDirectory(tempDir, {
      source: {
        type: 'github',
        url: repoUrl,
        owner,
        repo: repoName,
        branch: options.branch || 'main',
        commit: commitHash,
        commitDate,
      },
    });
    scanSpinner.succeed('Scan complete');

    return result;
  } catch (error: any) {
    spinner.fail('Clone failed');

    // Provide helpful error messages
    if (error.message.includes('could not read Username')) {
      throw new Error(
        `Repository is private or doesn't exist.\n` +
        `Provide a GitHub Personal Access Token with --auth flag for private repos.`
      );
    }

    if (error.message.includes('not found')) {
      throw new Error(`Repository not found: ${owner}/${repoName}`);
    }

    throw error;
  } finally {
    // Cleanup temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

// Helper to detect if path is GitHub URL
export function isGitHubUrl(path: string): boolean {
  return /^https?:\/\/github\.com\//.test(path);
}

// Helper to extract repo info from URL
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) return null;

  const [, owner, repo] = match;
  return { owner, repo: repo.replace(/\.git$/, '') };
}
```

### Updated Scan Command

```typescript
// src/cli/commands/scan.ts

import { Command } from 'commander';
import { isGitHubUrl, scanGitHubRepo } from '../../scanner/github-scanner';
import { scanDirectory } from '../../scanner/local-scanner';
import chalk from 'chalk';

export function registerScanCommand(program: Command) {
  program
    .command('scan <path-or-url>')
    .description('Scan local directory or GitHub repository')
    .option('-b, --branch <branch>', 'Git branch to scan (for GitHub repos)')
    .option('--depth <number>', 'Clone depth for GitHub repos', '1')
    .option('--auth <token>', 'GitHub PAT for private repos')
    .option('-p, --platform <platform>', 'Filter by platform (facebook|instagram|ads|all)')
    .option('-s, --severity <severity>', 'Minimum severity (error|warning|info)', 'warning')
    .option('-f, --format <format>', 'Output format (console|json)', 'console')
    .option('-o, --output <file>', 'Output file path')
    .option('--ignore <patterns>', 'Glob patterns to ignore (comma-separated)')
    .option('--include-sdk-analysis', 'Include detailed SDK usage analysis', false)
    .action(async (pathOrUrl, options) => {
      try {
        let result;

        if (isGitHubUrl(pathOrUrl)) {
          console.log(chalk.blue('🔍 Scanning GitHub repository...\n'));
          result = await scanGitHubRepo(pathOrUrl, {
            branch: options.branch,
            depth: parseInt(options.depth),
            auth: options.auth,
          });
        } else {
          console.log(chalk.blue('🔍 Scanning local directory...\n'));
          result = await scanDirectory(pathOrUrl, {
            platform: options.platform,
            severity: options.severity,
            ignorePatterns: options.ignore?.split(','),
            includeSdkAnalysis: options.includeSdkAnalysis,
          });
        }

        // Output results
        if (options.format === 'json') {
          const output = JSON.stringify(result, null, 2);
          if (options.output) {
            writeFileSync(options.output, output);
            console.log(chalk.green(`\n✓ Results written to ${options.output}`));
          } else {
            console.log(output);
          }
        } else {
          displayResults(result);
        }

        // Exit with error code if violations found
        const errorCount = result.violations?.filter(v => v.severity === 'error').length || 0;
        if (errorCount > 0) {
          process.exit(1);
        }
      } catch (error: any) {
        console.error(chalk.red(`\n✗ Error: ${error.message}`));
        process.exit(1);
      }
    });
}

function displayResults(result: any) {
  // Display summary
  console.log(chalk.bold('\n📊 Scan Summary'));
  console.log(chalk.gray('─'.repeat(60)));
  console.log(`Files scanned:  ${result.filesScanned}`);
  console.log(`Violations:     ${result.violations.length}`);

  const errors = result.violations.filter(v => v.severity === 'error').length;
  const warnings = result.violations.filter(v => v.severity === 'warning').length;
  const info = result.violations.filter(v => v.severity === 'info').length;

  console.log(`  ${chalk.red('Errors:')}     ${errors}`);
  console.log(`  ${chalk.yellow('Warnings:')}   ${warnings}`);
  console.log(`  ${chalk.blue('Info:')}       ${info}`);

  // Display SDK analysis if included
  if (result.sdkAnalysis) {
    console.log(chalk.bold('\n🔧 SDK Analysis'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`Official SDKs:  ${result.sdkAnalysis.official.length}`);
    console.log(`Wrappers:       ${result.sdkAnalysis.wrappers.length}`);
    console.log(`Direct API:     ${result.sdkAnalysis.directApi.length}`);
    if (result.sdkAnalysis.violations.length > 0) {
      console.log(chalk.red(`Violations:     ${result.sdkAnalysis.violations.length}`));
    }
  }

  // Display violations
  if (result.violations.length > 0) {
    console.log(chalk.bold('\n⚠️  Violations'));
    console.log(chalk.gray('─'.repeat(60)));

    for (const violation of result.violations) {
      const icon = violation.severity === 'error' ? '✗' :
                   violation.severity === 'warning' ? '⚠' : 'ℹ';
      const color = violation.severity === 'error' ? chalk.red :
                    violation.severity === 'warning' ? chalk.yellow : chalk.blue;

      console.log(`\n${color(icon)} ${chalk.bold(violation.ruleName)}`);
      console.log(`  ${chalk.gray(violation.file)}:${violation.line}`);
      console.log(`  ${violation.message}`);

      if (violation.recommendation) {
        console.log(`  ${chalk.cyan('→')} ${violation.recommendation}`);
      }
    }
  }
}
```

---

## 4. Documentation Scraper & Updates

### Firecrawl Integration

```typescript
// src/scraper/firecrawl-client.ts

import Firecrawl from 'firecrawl';
import { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import ora from 'ora';
import chalk from 'chalk';

export interface PolicySource {
  platform: string;
  url: string;
  scrapeMode?: 'single' | 'crawl';  // Single page or crawl site
  maxDepth?: number;  // For crawl mode
  selectors?: string[];  // CSS selectors to extract
}

const POLICY_SOURCES: PolicySource[] = [
  {
    platform: 'facebook',
    url: 'https://developers.facebook.com/docs/graph-api/overview/rate-limiting/',
    scrapeMode: 'single',
  },
  {
    platform: 'facebook',
    url: 'https://developers.facebook.com/docs/graph-api/',
    scrapeMode: 'crawl',
    maxDepth: 2,
  },
  {
    platform: 'instagram',
    url: 'https://developers.facebook.com/docs/instagram-api/',
    scrapeMode: 'crawl',
    maxDepth: 2,
  },
  {
    platform: 'messenger',
    url: 'https://developers.facebook.com/docs/messenger-platform/',
    scrapeMode: 'crawl',
    maxDepth: 2,
  },
  {
    platform: 'whatsapp',
    url: 'https://developers.facebook.com/docs/whatsapp/',
    scrapeMode: 'crawl',
    maxDepth: 2,
  },
  {
    platform: 'ads',
    url: 'https://developers.facebook.com/docs/marketing-apis/',
    scrapeMode: 'crawl',
    maxDepth: 2,
  },
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
];

export class DocScraper {
  private firecrawl: Firecrawl;
  private openai: OpenAI;

  constructor(
    private supabase: SupabaseClient,
    firecrawlApiKey: string,
    openaiApiKey: string
  ) {
    this.firecrawl = new Firecrawl({ apiKey: firecrawlApiKey });
    this.openai = new OpenAI({ apiKey: openaiApiKey });
  }

  async updateAllDocs() {
    const spinner = ora('Scraping Meta documentation...').start();

    for (const source of POLICY_SOURCES) {
      try {
        spinner.text = `Scraping ${source.platform}: ${source.url}`;

        if (source.scrapeMode === 'crawl') {
          await this.crawlAndStore(source);
        } else {
          await this.scrapeAndStore(source);
        }

        spinner.succeed(`✓ ${source.platform}: ${source.url}`);
      } catch (error: any) {
        spinner.fail(`✗ ${source.platform}: ${error.message}`);
      }
    }

    spinner.succeed('Documentation update complete');
  }

  private async scrapeAndStore(source: PolicySource) {
    // Scrape single page
    const result = await this.firecrawl.scrape(source.url, {
      formats: ['markdown', 'html'],
    });

    if (!result.markdown) {
      throw new Error('No content extracted');
    }

    // Get platform ID
    const { data: platform } = await this.supabase
      .from('platforms')
      .select('id')
      .eq('name', source.platform)
      .single();

    // Store policy
    const { data: policy } = await this.supabase
      .from('policies')
      .upsert({
        platform_id: platform?.id,
        title: result.metadata?.title || source.url,
        url: source.url,
        content: result.markdown,
        last_scraped: new Date().toISOString(),
      }, { onConflict: 'url' })
      .select()
      .single();

    // Chunk and embed
    await this.chunkAndEmbed(policy.id, result.markdown);
  }

  private async crawlAndStore(source: PolicySource) {
    // Crawl multiple pages
    const result = await this.firecrawl.crawl(source.url, {
      maxDepth: source.maxDepth || 2,
      limit: 50,  // Max pages
      scrapeOptions: {
        formats: ['markdown'],
      },
    });

    // Get platform ID
    const { data: platform } = await this.supabase
      .from('platforms')
      .select('id')
      .eq('name', source.platform)
      .single();

    // Store each page
    for (const page of result.data) {
      if (!page.markdown) continue;

      const { data: policy } = await this.supabase
        .from('policies')
        .upsert({
          platform_id: platform?.id,
          title: page.metadata?.title || page.url,
          url: page.url,
          content: page.markdown,
          last_scraped: new Date().toISOString(),
        }, { onConflict: 'url' })
        .select()
        .single();

      await this.chunkAndEmbed(policy.id, page.markdown);
    }
  }

  private async chunkAndEmbed(policyId: number, content: string) {
    // Chunk content (split by headers, paragraphs, max 1000 tokens)
    const chunks = this.chunkText(content);

    // Delete existing chunks
    await this.supabase
      .from('policy_chunks')
      .delete()
      .eq('policy_id', policyId);

    // Embed and store chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Generate embedding
      const embeddingResponse = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: chunk,
      });

      const embedding = embeddingResponse.data[0].embedding;

      // Store chunk
      await this.supabase
        .from('policy_chunks')
        .insert({
          policy_id: policyId,
          chunk_text: chunk,
          chunk_index: i,
          embedding,
          metadata: { length: chunk.length },
        });
    }
  }

  private chunkText(text: string, maxTokens: number = 1000): string[] {
    const chunks: string[] = [];

    // Split by double newlines (paragraphs)
    const paragraphs = text.split(/\n\n+/);

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

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  async getStatus() {
    const { data: policies } = await this.supabase
      .from('policies')
      .select('platform_id, url, last_scraped, title')
      .order('last_scraped', { ascending: false });

    const { data: chunkCount } = await this.supabase
      .from('policy_chunks')
      .select('id', { count: 'exact', head: true });

    return {
      totalPolicies: policies?.length || 0,
      totalChunks: chunkCount || 0,
      lastUpdate: policies?.[0]?.last_scraped,
      policies,
    };
  }
}
```

### Documentation CLI Commands

```typescript
// src/cli/commands/docs.ts

import { Command } from 'commander';
import { DocScraper } from '../../scraper/firecrawl-client';
import { createClient } from '../../db/supabase';
import chalk from 'chalk';
import { table } from 'table';
import { config } from 'dotenv';

config();

export function registerDocsCommands(program: Command) {
  const docs = program.command('docs').description('Manage policy documentation');

  const getDocScraper = () => new DocScraper(
    createClient(),
    process.env.FIRECRAWL_API_KEY!,
    process.env.OPENAI_API_KEY!
  );

  // Update documentation
  docs
    .command('update')
    .description('Scrape and update policy embeddings')
    .action(async () => {
      const scraper = getDocScraper();
      await scraper.updateAllDocs();
    });

  // Show status
  docs
    .command('status')
    .description('Show last update time and doc count')
    .action(async () => {
      const scraper = getDocScraper();
      const status = await scraper.getStatus();

      console.log(chalk.bold('\n📚 Documentation Status'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(`Total Policies: ${status.totalPolicies}`);
      console.log(`Total Chunks:   ${status.totalChunks}`);
      console.log(`Last Update:    ${status.lastUpdate ? new Date(status.lastUpdate).toLocaleString() : 'Never'}`);
    });

  // List documentation sources
  docs
    .command('list')
    .description('List indexed documentation sources')
    .action(async () => {
      const scraper = getDocScraper();
      const status = await scraper.getStatus();

      if (!status.policies || status.policies.length === 0) {
        console.log(chalk.yellow('No documentation indexed yet. Run: meta-scan docs update'));
        return;
      }

      const tableData = [
        ['Platform', 'Title', 'URL', 'Last Scraped'],
        ...status.policies.map(p => [
          p.platform_id,
          p.title,
          p.url,
          new Date(p.last_scraped).toLocaleDateString(),
        ]),
      ];

      console.log(table(tableData));
    });
}
```

---

## 5. Deployment Strategy

### Option 1: Deploy as NPM Package (CLI Tool)

```bash
# Publish to npm
npm publish

# Users install globally
npm install -g meta-policy-scanner

# Users run from anywhere
meta-scan scan ./my-project
meta-scan scan https://github.com/company/repo
```

**package.json:**

```json
{
  "name": "meta-policy-scanner",
  "version": "1.0.0",
  "description": "Scan codebases for Meta API policy violations",
  "bin": {
    "meta-scan": "./dist/bin/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["meta", "facebook", "instagram", "api", "policy", "scanner"],
  "author": "Your Name",
  "license": "MIT"
}
```

### Option 2: Deploy Web UI (Vercel + Supabase)

**Tech Stack:**
- Frontend: Next.js (React)
- Backend: Supabase (Postgres + Edge Functions)
- Hosting: Vercel
- Queue: Supabase Edge Functions + pg_cron

**Architecture:**

```
User submits GitHub URL → Next.js API Route → Supabase Edge Function
  → Clone repo (temporary)
  → Run scanner
  → Store results in Supabase
  → Send webhook notification
  → Display results in UI
```

**Vercel Deployment:**

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Set environment variables
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add FIRECRAWL_API_KEY
vercel env add OPENAI_API_KEY
```

### Option 3: CI/CD Integration (GitHub Action)

```yaml
# .github/workflows/meta-policy-scan.yml

name: Meta Policy Scan

on:
  pull_request:
  push:
    branches: [main, develop]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install Meta Policy Scanner
        run: npm install -g meta-policy-scanner

      - name: Run Scan
        run: meta-scan scan . --format=json --output=scan-results.json
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}

      - name: Upload Results
        uses: actions/upload-artifact@v3
        with:
          name: scan-results
          path: scan-results.json

      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('scan-results.json', 'utf8'));
            const errors = results.violations.filter(v => v.severity === 'error').length;

            const comment = `## Meta API Policy Scan Results

            - Files scanned: ${results.filesScanned}
            - Violations: ${results.violations.length}
            - Errors: ${errors}

            ${errors > 0 ? '⚠️ Policy violations found!' : '✅ No critical violations'}`;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });

      - name: Fail on Errors
        run: |
          ERRORS=$(jq '.violations | map(select(.severity == "error")) | length' scan-results.json)
          if [ "$ERRORS" -gt 0 ]; then
            echo "Found $ERRORS policy violations"
            exit 1
          fi
```

### Option 4: Scheduled Documentation Updates

```sql
-- Supabase: Schedule daily doc updates using pg_cron

select cron.schedule(
  'update-meta-docs',
  '0 2 * * *',  -- Every day at 2 AM
  $$
  select net.http_post(
    url := 'https://your-edge-function.supabase.co/update-docs',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

**Supabase Edge Function:**

```typescript
// supabase/functions/update-docs/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { DocScraper } from './doc-scraper.ts';

serve(async (req) => {
  const scraper = new DocScraper(
    supabaseClient,
    Deno.env.get('FIRECRAWL_API_KEY')!,
    Deno.env.get('OPENAI_API_KEY')!
  );

  await scraper.updateAllDocs();

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

---

## 6. Environment Configuration

```bash
# .env.example

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # For server-side only

# Firecrawl (for doc scraping)
FIRECRAWL_API_KEY=your-firecrawl-key

# OpenAI (for embeddings)
OPENAI_API_KEY=your-openai-key

# GitHub (optional, for private repos)
GITHUB_PAT=your-github-personal-access-token

# Optional: Custom config
META_SCAN_CONFIG_PATH=./meta-scan.config.json
```

---

## Complete CLI Interface

```bash
meta-scan <command> [options]

Commands:
  scan <path|url>        Scan local directory or GitHub repo
  rules <subcommand>     Manage violation rules
  docs <subcommand>      Manage policy documentation
  init                   Initialize configuration

Scan:
  meta-scan scan ./my-project
  meta-scan scan https://github.com/user/repo
  meta-scan scan https://github.com/user/repo --branch=develop
  meta-scan scan ./my-project --platform=instagram --severity=error
  meta-scan scan https://github.com/user/private-repo --auth=$GITHUB_PAT

Rules:
  meta-scan rules list
  meta-scan rules list --platform=ads --severity=error
  meta-scan rules show RATE_LIMIT_MISSING
  meta-scan rules add --interactive
  meta-scan rules add --from-file=my-rule.json
  meta-scan rules update HUMAN_AGENT_ABUSE --severity=error
  meta-scan rules enable DEPRECATED_API_VERSION
  meta-scan rules disable NOISY_RULE
  meta-scan rules import ./team-rules.json --overwrite
  meta-scan rules export ./backup.json
  meta-scan rules seed
  meta-scan rules stats

Docs:
  meta-scan docs update
  meta-scan docs status
  meta-scan docs list

Init:
  meta-scan init  # Creates .meta-scan.config.json
```

---

## Next Steps

1. **Set up Supabase project**
   - Create project at supabase.com
   - Run schema.sql
   - Enable pgvector extension
   - Get API keys

2. **Get API keys**
   - Firecrawl: https://firecrawl.dev
   - OpenAI: https://platform.openai.com

3. **Build CLI**
   ```bash
   npm run build
   npm link  # Test locally
   ```

4. **Seed data**
   ```bash
   meta-scan rules seed
   meta-scan docs update
   ```

5. **Test scanning**
   ```bash
   meta-scan scan https://github.com/test/repo
   ```

6. **Publish**
   ```bash
   npm publish
   ```

---

This gives you a complete, production-ready Meta API Policy Scanner with:

✅ SDK detection (official, wrappers, unofficial, deprecated)
✅ Dynamic rule management (CRUD via CLI)
✅ GitHub repo scanning (public + private with PAT)
✅ Documentation scraping and updates (Firecrawl + embeddings)
✅ Multiple deployment options (NPM, web UI, CI/CD, scheduled updates)
