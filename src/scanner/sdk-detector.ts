import { SDKDetection, Platform, RiskLevel } from '../types';

interface SDKConfig {
  package: string;
  imports?: RegExp[];
  patterns?: RegExp[];
  classes?: string[];
  riskLevel: RiskLevel;
  recommendation?: string;
  policyUrl?: string;
  language?: string;
}

interface SDKRegistry {
  official: Record<string, SDKConfig>;
  wrappers: Record<string, SDKConfig>;
  unofficial: Record<string, SDKConfig>;
  directAPI: Record<string, { patterns: RegExp[]; extract?: RegExp; riskLevel: RiskLevel; recommendation?: string }>;
  deprecated: Record<string, { patterns: RegExp[]; riskLevel: RiskLevel; recommendation: string }>;
}

export const SDK_REGISTRY: SDKRegistry = {
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

  wrappers: {
    fb: {
      package: 'fb',
      imports: [/require\s*\(\s*['"]fb['"]\s*\)/, /from\s+['"]fb['"]/],
      riskLevel: 'caution',
      recommendation: 'Consider using official facebook-nodejs-business-sdk for better rate limiting support',
    },
    fbgraph: {
      package: 'fbgraph',
      imports: [/require\s*\(\s*['"]fbgraph['"]\s*\)/, /from\s+['"]fbgraph['"]/],
      riskLevel: 'caution',
      recommendation: 'This library may not implement proper rate limiting',
    },
    'node-facebook-sdk': {
      package: 'node-facebook-sdk',
      imports: [/require\s*\(\s*['"]node-facebook-sdk['"]\s*\)/],
      riskLevel: 'caution',
    },
  },

  unofficial: {
    'instagram-private-api': {
      package: 'instagram-private-api',
      imports: [
        /require\s*\(\s*['"]instagram-private-api['"]\s*\)/,
        /from\s+['"]instagram-private-api['"]/,
      ],
      riskLevel: 'violation',
      recommendation: 'POLICY VIOLATION: Use official Instagram Graph API instead',
      policyUrl: 'https://developers.facebook.com/docs/instagram-api/',
    },
    'instagram-web-api': {
      package: 'instagram-web-api',
      imports: [
        /require\s*\(\s*['"]instagram-web-api['"]\s*\)/,
        /from\s+['"]instagram-web-api['"]/,
      ],
      riskLevel: 'violation',
      recommendation: 'POLICY VIOLATION: This library uses web scraping which violates Meta Platform Terms',
    },
    instagrapi: {
      package: 'instagrapi',
      language: 'python',
      imports: [/from\s+instagrapi/, /import\s+instagrapi/],
      riskLevel: 'violation',
      recommendation: 'POLICY VIOLATION: Use official Instagram Graph API instead',
    },
    'instagram-scraper': {
      package: 'instagram-scraper',
      imports: [/instagram.scraper/, /instagram_scraper/],
      riskLevel: 'violation',
      recommendation: 'POLICY VIOLATION: Scraping violates Meta Platform Terms',
    },
  },

  directAPI: {
    graphAPI: {
      patterns: [
        /https?:\/\/graph\.facebook\.com\/v[\d.]+\//i,
        /['"]graph\.facebook\.com['"]/i,
      ],
      extract: /v(\d+\.\d+)/,
      riskLevel: 'safe',
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
        /\/act_\d+\//,
        /\/v[\d.]+\/\d+\/insights/,
      ],
      riskLevel: 'safe',
    },
  },

  deprecated: {
    restAPI: {
      patterns: [/api\.facebook\.com/i],
      riskLevel: 'violation',
      recommendation: 'REST API is deprecated. Use Graph API instead',
    },
    oldVersions: {
      patterns: [/graph\.facebook\.com\/v[1-9]\./i],
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

export class SDKDetector {
  private detections: SDKDetection[] = [];

  async detectInFile(filePath: string, content: string): Promise<SDKDetection[]> {
    this.detections = [];
    const lines = content.split('\n');

    // Check imports and patterns line by line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Check official SDKs
      for (const [, config] of Object.entries(SDK_REGISTRY.official)) {
        if (this.matchesPatterns(line, config.imports || config.patterns || [])) {
          this.detections.push({
            type: 'official-sdk',
            sdk: config.package,
            platform: this.inferPlatform(config.package),
            file: filePath,
            line: lineNumber,
            column: 0,
            codeSnippet: line.trim(),
            confidence: 'high',
            riskLevel: config.riskLevel,
          });
        }
      }

      // Check wrapper libraries
      for (const [, config] of Object.entries(SDK_REGISTRY.wrappers)) {
        if (this.matchesPatterns(line, config.imports || [])) {
          this.detections.push({
            type: 'wrapper',
            sdk: config.package,
            platform: 'facebook',
            file: filePath,
            line: lineNumber,
            column: 0,
            codeSnippet: line.trim(),
            confidence: 'high',
            riskLevel: config.riskLevel,
            recommendation: config.recommendation,
          });
        }
      }

      // Check unofficial/violating libraries
      for (const [, config] of Object.entries(SDK_REGISTRY.unofficial)) {
        if (this.matchesPatterns(line, config.imports || [])) {
          this.detections.push({
            type: 'unofficial',
            sdk: config.package,
            platform: 'instagram',
            file: filePath,
            line: lineNumber,
            column: 0,
            codeSnippet: line.trim(),
            confidence: 'high',
            riskLevel: 'violation',
            recommendation: config.recommendation,
          });
        }
      }

      // Check direct API calls
      for (const [, config] of Object.entries(SDK_REGISTRY.directAPI)) {
        for (const pattern of config.patterns) {
          if (pattern.test(line)) {
            const versionMatch = line.match(/v(\d+\.\d+)/);
            const version = versionMatch ? parseFloat(versionMatch[1]) : 0;

            this.detections.push({
              type: 'direct-api',
              sdk: 'Graph API',
              platform: this.inferPlatformFromURL(line),
              file: filePath,
              line: lineNumber,
              column: line.search(pattern),
              codeSnippet: line.trim(),
              confidence: 'high',
              riskLevel: version > 0 && version < 10 ? 'violation' : config.riskLevel,
              recommendation: version > 0 && version < 10
                ? `API version v${version} is deprecated. Use v18.0+`
                : config.recommendation,
            });
            break;
          }
        }
      }

      // Check deprecated patterns
      for (const [name, config] of Object.entries(SDK_REGISTRY.deprecated)) {
        for (const pattern of config.patterns) {
          if (pattern.test(line)) {
            this.detections.push({
              type: 'deprecated',
              sdk: name,
              platform: 'facebook',
              file: filePath,
              line: lineNumber,
              column: line.search(pattern),
              codeSnippet: line.trim(),
              confidence: 'high',
              riskLevel: config.riskLevel,
              recommendation: config.recommendation,
            });
            break;
          }
        }
      }
    }

    return this.detections;
  }

  private matchesPatterns(line: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(line));
  }

  private inferPlatform(moduleName: string): Platform {
    if (moduleName.includes('instagram')) return 'instagram';
    if (moduleName.includes('messenger')) return 'messenger';
    if (moduleName.includes('whatsapp')) return 'whatsapp';
    if (moduleName.includes('ads') || moduleName.includes('business')) return 'ads';
    return 'facebook';
  }

  private inferPlatformFromURL(url: string): Platform {
    if (url.includes('instagram')) return 'instagram';
    if (url.includes('/me/messages')) return 'messenger';
    if (url.includes('act_') || url.includes('insights')) return 'ads';
    return 'facebook';
  }
}

export async function detectMetaPackages(packageJsonContent: string): Promise<{
  direct: string[];
  dev: string[];
  violations: string[];
}> {
  const result = {
    direct: [] as string[],
    dev: [] as string[],
    violations: [] as string[],
  };

  try {
    const pkg = JSON.parse(packageJsonContent);
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    const officialPackages = ['facebook-nodejs-business-sdk', 'facebook-business'];
    const wrapperPackages = ['fb', 'fbgraph', 'node-facebook-sdk'];
    const violationPackages = [
      'instagram-private-api',
      'instagram-web-api',
      'instagram-scraper',
      'instagrapi',
    ];

    for (const pkgName of Object.keys(allDeps)) {
      if (officialPackages.includes(pkgName)) {
        result.direct.push(pkgName);
      }
      if (wrapperPackages.includes(pkgName)) {
        result.direct.push(pkgName);
      }
      if (violationPackages.includes(pkgName)) {
        result.violations.push(pkgName);
      }
    }
  } catch {
    // Invalid JSON, ignore
  }

  return result;
}
