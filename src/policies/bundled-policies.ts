/**
 * Bundled Meta API Policies - Pre-loaded rules that work out-of-the-box
 * These are the core policy violations that don't require scraping
 */

export interface BundledRule {
  code: string;
  name: string;
  platform: 'facebook' | 'instagram' | 'messenger' | 'whatsapp' | 'ads' | 'all';
  severity: 'error' | 'warning' | 'info';
  category: string;
  description: string;
  detection: {
    type: 'regex' | 'package' | 'sdk';
    pattern?: string;
    packages?: string[];
  };
  recommendation: string;
  docUrl?: string;
}

/**
 * Core Meta API Policy Rules
 * Source: https://developers.facebook.com/terms/
 */
export const BUNDLED_RULES: BundledRule[] = [
  // === TOKEN & CREDENTIAL SECURITY ===
  {
    code: 'TOKEN_EXPOSED',
    name: 'Access Token in Source Code',
    platform: 'all',
    severity: 'error',
    category: 'Security',
    description: 'Access tokens or app secrets exposed in source code. This violates Meta Platform Terms Section 6 (Data Security).',
    detection: {
      type: 'regex',
      pattern: '(EAAA[A-Za-z0-9]{50,}|access_token\\s*[=:]\\s*["\'][A-Za-z0-9_-]{50,}["\'])',
    },
    recommendation: 'Store tokens in environment variables or secure secret management. Never commit tokens to source control.',
    docUrl: 'https://developers.facebook.com/docs/facebook-login/security/',
  },
  {
    code: 'APP_SECRET_EXPOSED',
    name: 'App Secret in Source Code',
    platform: 'all',
    severity: 'error',
    category: 'Security',
    description: 'Facebook App Secret exposed in client-side or committed code.',
    detection: {
      type: 'regex',
      pattern: '(app_secret|client_secret)\\s*[=:]\\s*["\'][a-f0-9]{32}["\']',
    },
    recommendation: 'App secrets must only be used server-side and stored in environment variables.',
    docUrl: 'https://developers.facebook.com/docs/facebook-login/security/',
  },

  // === DEPRECATED API VERSIONS ===
  {
    code: 'DEPRECATED_API_V1_V9',
    name: 'Deprecated API Version (v1-v9)',
    platform: 'all',
    severity: 'error',
    category: 'Deprecation',
    description: 'Using deprecated Graph API version. Versions v1-v9 are no longer supported.',
    detection: {
      type: 'regex',
      pattern: 'graph\\.facebook\\.com\\/v[1-9]\\.',
    },
    recommendation: 'Upgrade to v18.0 or later. See https://developers.facebook.com/docs/graph-api/changelog/versions',
    docUrl: 'https://developers.facebook.com/docs/graph-api/changelog/',
  },
  {
    code: 'DEPRECATED_API_V10_V15',
    name: 'Deprecated API Version (v10-v15)',
    platform: 'all',
    severity: 'warning',
    category: 'Deprecation',
    description: 'Using soon-to-be-deprecated Graph API version.',
    detection: {
      type: 'regex',
      pattern: 'graph\\.facebook\\.com\\/v1[0-5]\\.',
    },
    recommendation: 'Upgrade to v18.0 or later to avoid disruption.',
    docUrl: 'https://developers.facebook.com/docs/graph-api/changelog/',
  },

  // === UNOFFICIAL INSTAGRAM LIBRARIES ===
  {
    code: 'UNOFFICIAL_IG_LIBRARY',
    name: 'Unofficial Instagram Library',
    platform: 'instagram',
    severity: 'error',
    category: 'Policy Violation',
    description: 'Using unofficial Instagram automation library that violates Meta Platform Terms.',
    detection: {
      type: 'package',
      packages: [
        'instagram-private-api',
        'instagram-web-api',
        'instagrapi',
        'instaloader',
        'instagram-scraper',
        'instagramy',
        'igramscraper',
        'instagram_private_api',
        'pylgram',
        'instalooter',
      ],
    },
    recommendation: 'Use official Instagram Graph API via facebook-nodejs-business-sdk. Unofficial libraries can result in account bans and legal action.',
    docUrl: 'https://developers.facebook.com/docs/instagram-api/',
  },

  // === MESSENGER POLICY VIOLATIONS ===
  {
    code: 'HUMAN_AGENT_ABUSE',
    name: 'HUMAN_AGENT Tag Misuse',
    platform: 'messenger',
    severity: 'error',
    category: 'Policy Violation',
    description: 'Using HUMAN_AGENT message tag potentially outside the 7-day window.',
    detection: {
      type: 'regex',
      pattern: 'messaging_type.*HUMAN_AGENT|HUMAN_AGENT.*true',
    },
    recommendation: 'HUMAN_AGENT tag is only allowed within 7 days of the last user message. Use message tags appropriately.',
    docUrl: 'https://developers.facebook.com/docs/messenger-platform/send-messages/message-tags/',
  },
  {
    code: 'PROMOTIONAL_OUTSIDE_WINDOW',
    name: 'Promotional Message Outside 24h Window',
    platform: 'messenger',
    severity: 'warning',
    category: 'Policy Violation',
    description: 'Sending promotional content may violate the 24-hour messaging window policy.',
    detection: {
      type: 'regex',
      pattern: 'messaging_type.*MESSAGE_TAG.*(?:buy|sale|discount|offer|promo)',
    },
    recommendation: 'Promotional messages are only allowed within 24 hours of user interaction or via approved message tags.',
    docUrl: 'https://developers.facebook.com/docs/messenger-platform/policy/',
  },

  // === WHATSAPP POLICY ===
  {
    code: 'WHATSAPP_UNOFFICIAL_API',
    name: 'Unofficial WhatsApp API',
    platform: 'whatsapp',
    severity: 'error',
    category: 'Policy Violation',
    description: 'Using unofficial WhatsApp automation library.',
    detection: {
      type: 'package',
      packages: [
        'whatsapp-web.js',
        'venom-bot',
        'baileys',
        '@whiskeysockets/baileys',
        'wa-automate',
        'whatsapp-web',
        'wwebjs',
      ],
    },
    recommendation: 'Use official WhatsApp Business API via Cloud API or On-Premises. Unofficial APIs violate WhatsApp Terms.',
    docUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/',
  },

  // === RATE LIMITING ===
  // Note: Rate limit handling is better checked via codebase analysis (AI scanner)
  // since it requires understanding the surrounding error handling context.
  // Removed overly broad regex pattern that caused false positives.

  // === WEBHOOK SECURITY ===
  {
    code: 'WEBHOOK_NO_VERIFICATION',
    name: 'Webhook Without Signature Verification',
    platform: 'all',
    severity: 'warning',
    category: 'Security',
    description: 'Webhook endpoint should verify x-hub-signature header to prevent spoofed events.',
    detection: {
      type: 'regex',
      // Only match webhook handlers that process POST body without signature check
      pattern: '(app\\.(post|use).*webhook|webhook.*handler|handleWebhook)(?!.*x-hub-signature)',
    },
    recommendation: 'Always verify webhook signatures using your app secret. Check x-hub-signature-256 header.',
    docUrl: 'https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests',
  },

  // === DATA HANDLING ===
  {
    code: 'STORING_ACCESS_TOKEN',
    name: 'Storing Access Token in Database',
    platform: 'all',
    severity: 'warning',
    category: 'Security',
    description: 'Potential storage of access tokens in database without encryption.',
    detection: {
      type: 'regex',
      // Match database operations that store tokens - be specific to avoid matching comments/docs
      pattern: '(INSERT\\s+INTO|UPDATE\\s+\\w+\\s+SET|\\.(save|create|update|upsert)\\s*\\().*access_token',
    },
    recommendation: 'Encrypt access tokens at rest. Consider using short-lived tokens with refresh flow.',
    docUrl: 'https://developers.facebook.com/docs/facebook-login/security/',
  },
  {
    code: 'LOGGING_SENSITIVE_DATA',
    name: 'Logging Sensitive Data',
    platform: 'all',
    severity: 'warning',
    category: 'Security',
    description: 'Potentially logging access tokens or user data.',
    detection: {
      type: 'regex',
      // More specific: only match when actually logging the value, not just referencing the field name
      pattern: '(console\\.log|logger\\.(info|warn|error|debug)|print)\\s*\\([^)]*(?:access_token|accessToken|user\\.email|password)',
    },
    recommendation: 'Never log access tokens or PII. Use redaction for sensitive fields in logs.',
    docUrl: 'https://developers.facebook.com/docs/development/release/data-deletion/',
  },

  // === SDK USAGE ===
  {
    code: 'OUTDATED_SDK',
    name: 'Outdated Facebook SDK',
    platform: 'all',
    severity: 'info',
    category: 'Maintenance',
    description: 'Using older version pattern of Facebook SDK.',
    detection: {
      type: 'regex',
      pattern: 'facebook-nodejs-business-sdk.*["\']\\^?[0-9]\\.',
    },
    recommendation: 'Keep SDK updated to latest version for security patches and new features.',
    docUrl: 'https://github.com/facebook/facebook-nodejs-business-sdk',
  },

  // === ADS API SPECIFIC ===
  {
    code: 'ADS_HARDCODED_TARGETING',
    name: 'Hardcoded Ad Targeting',
    platform: 'ads',
    severity: 'info',
    category: 'Best Practice',
    description: 'Hardcoded demographic targeting may violate anti-discrimination policies.',
    detection: {
      type: 'regex',
      pattern: 'targeting.*(?:age_min|age_max|genders|ethnic)',
    },
    recommendation: 'Review targeting for compliance with advertising policies. Avoid discriminatory targeting.',
    docUrl: 'https://www.facebook.com/policies/ads/',
  },
];

/**
 * Get rules by platform
 */
export function getRulesForPlatform(platform: string): BundledRule[] {
  return BUNDLED_RULES.filter(rule =>
    rule.platform === platform || rule.platform === 'all'
  );
}

/**
 * Get rules by severity
 */
export function getRulesBySeverity(severity: 'error' | 'warning' | 'info'): BundledRule[] {
  return BUNDLED_RULES.filter(rule => rule.severity === severity);
}

/**
 * Get rule by code
 */
export function getRuleByCode(code: string): BundledRule | undefined {
  return BUNDLED_RULES.find(rule => rule.code === code);
}

/**
 * Export rule count for status
 */
export function getBundledRulesStats(): {
  total: number;
  byPlatform: Record<string, number>;
  bySeverity: Record<string, number>;
} {
  const byPlatform: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const rule of BUNDLED_RULES) {
    byPlatform[rule.platform] = (byPlatform[rule.platform] || 0) + 1;
    bySeverity[rule.severity] = (bySeverity[rule.severity] || 0) + 1;
  }

  return {
    total: BUNDLED_RULES.length,
    byPlatform,
    bySeverity,
  };
}
