import { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { ViolationRule, RuleFilter } from '../types';

export class RuleManager {
  constructor(private supabase: SupabaseClient) {}

  async listRules(filter?: RuleFilter) {
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

  async getRule(ruleCode: string): Promise<ViolationRule> {
    const { data, error } = await this.supabase
      .from('violation_rules')
      .select('*')
      .eq('rule_code', ruleCode)
      .single();

    if (error) throw error;
    return data;
  }

  async addRule(rule: Omit<ViolationRule, 'id'>): Promise<ViolationRule> {
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

  async updateRule(ruleCode: string, updates: Partial<ViolationRule>): Promise<ViolationRule> {
    const { data, error } = await this.supabase
      .from('violation_rules')
      .update(updates)
      .eq('rule_code', ruleCode)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteRule(ruleCode: string): Promise<void> {
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

  async toggleRule(ruleCode: string, enabled: boolean): Promise<ViolationRule> {
    return this.updateRule(ruleCode, { enabled });
  }

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
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.errors.push(`${rule.rule_code}: ${message}`);
      }
    }

    return results;
  }

  async exportRules(filePath: string, filter?: { platform?: string; category?: string }): Promise<number> {
    const { data } = await this.listRules(filter as RuleFilter);
    writeFileSync(filePath, JSON.stringify(data, null, 2));
    return data?.length || 0;
  }

  async seedBuiltinRules(): Promise<ViolationRule[]> {
    const builtinRules: Omit<ViolationRule, 'id'>[] = [
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
          pattern: 'HUMAN_AGENT.*:.*true|messaging_type.*HUMAN_AGENT',
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
          pattern: 'instagram-private-api|instagram-web-api|instagrapi|instagram-scraper',
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
          pattern: '(EAAA|access_token\\s*=\\s*["\'])[A-Za-z0-9_-]{50,}',
          fileTypes: ['.js', '.ts', '.py', '.php', '.java'],
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
        rule_code: 'WEBHOOK_NO_VERIFICATION',
        name: 'Webhook Without Signature Verification',
        description: 'Webhook endpoint does not verify x-hub-signature header',
        platform: 'all',
        severity: 'error',
        category: 'security',
        detection: {
          type: 'regex',
          pattern: 'webhook|/webhook',
          fileTypes: ['.js', '.ts', '.py'],
        },
        recommendation: 'Always verify webhook signatures using your app secret',
        doc_urls: ['https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests'],
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
    ];

    const { data, error } = await this.supabase
      .from('violation_rules')
      .upsert(builtinRules as ViolationRule[], {
        onConflict: 'rule_code',
        ignoreDuplicates: false,
      })
      .select();

    if (error) throw error;
    return data;
  }

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

  private groupBy(array: Record<string, unknown>[], key: string): Record<string, number> {
    return array.reduce((acc: Record<string, number>, item) => {
      const value = (item[key] as string) || 'unknown';
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }
}
