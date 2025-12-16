import { glob } from 'glob';
import { readFileSync, existsSync } from 'fs';
import { join, relative, extname } from 'path';
import { SDKDetector, detectMetaPackages } from './sdk-detector';
import { createClient } from '../db/supabase';
import { BUNDLED_RULES } from '../policies/bundled-policies';
import {
  ScanOptions,
  ScanResult,
  Violation,
  SDKAnalysis,
  ViolationRule,
  Severity,
} from '../types';

const SCANNABLE_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.php', '.java', '.rb', '.go',
  '.json',  // For package.json detection
  '.sql',   // Database schemas
  '.prisma', // Prisma ORM schemas
  '.graphql', '.gql', // GraphQL schemas
];

const DEFAULT_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/vendor/**',
  '**/__pycache__/**',
  '**/venv/**',
  '**/.env',
  '**/*.min.js',
  '**/*.bundle.js',
];

export async function scanDirectory(
  dirPath: string,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const startTime = Date.now();
  const violations: Violation[] = [];
  const sdkDetector = new SDKDetector();

  const sdkAnalysis: SDKAnalysis = {
    official: [],
    wrappers: [],
    directApi: [],
    violations: [],
  };

  // Get rules from database or use local fallback
  let rules: ViolationRule[] = [];
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from('violation_rules')
      .select('*')
      .eq('enabled', true);
    rules = data || [];
  } catch {
    // Use built-in rules if database is not available
    rules = getBuiltinRules();
  }

  // Filter rules by platform if specified
  if (options.platform && options.platform !== 'all') {
    rules = rules.filter(r => r.platform === options.platform || r.platform === 'all');
  }

  // Build ignore patterns
  const ignorePatterns = [
    ...DEFAULT_IGNORE_PATTERNS,
    ...(options.ignorePatterns || []),
  ];

  // Find all scannable files
  const pattern = `**/*{${SCANNABLE_EXTENSIONS.join(',')}}`;
  const files = await glob(pattern, {
    cwd: dirPath,
    ignore: ignorePatterns,
    absolute: true,
    nodir: true,
  });

  // Check package.json for SDK violations
  const packageJsonPath = join(dirPath, 'package.json');
  if (existsSync(packageJsonPath)) {
    const packageContent = readFileSync(packageJsonPath, 'utf-8');
    const packageAnalysis = await detectMetaPackages(packageContent);

    // Add violations for unofficial packages
    for (const pkg of packageAnalysis.violations) {
      violations.push({
        ruleCode: 'UNOFFICIAL_IG_LIBRARY',
        ruleName: 'Unofficial Instagram Library',
        severity: 'error',
        platform: 'instagram',
        file: relative(dirPath, packageJsonPath),
        line: 1,
        column: 0,
        message: `Unofficial library "${pkg}" detected in package.json. This violates Meta Platform Terms.`,
        codeSnippet: `"${pkg}": "..."`,
        recommendation: 'Use official Instagram Graph API via facebook-nodejs-business-sdk',
        docUrls: ['https://developers.facebook.com/docs/instagram-api/'],
      });
    }
  }

  // Scan each file
  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const relativePath = relative(dirPath, filePath);
      const ext = extname(filePath);

      // SDK Detection
      if (options.includeSdkAnalysis !== false) {
        const sdkDetections = await sdkDetector.detectInFile(relativePath, content);
        for (const detection of sdkDetections) {
          switch (detection.type) {
            case 'official-sdk':
              sdkAnalysis.official.push(detection);
              break;
            case 'wrapper':
              sdkAnalysis.wrappers.push(detection);
              break;
            case 'direct-api':
              sdkAnalysis.directApi.push(detection);
              break;
            case 'unofficial':
            case 'deprecated':
              sdkAnalysis.violations.push(detection);
              break;
          }

          // Convert SDK violations to rule violations
          if (detection.riskLevel === 'violation') {
            violations.push({
              ruleCode: detection.type === 'unofficial' ? 'UNOFFICIAL_IG_LIBRARY' : 'DEPRECATED_API_VERSION',
              ruleName: detection.type === 'unofficial' ? 'Unofficial Library' : 'Deprecated API',
              severity: 'error',
              platform: detection.platform,
              file: relativePath,
              line: detection.line,
              column: detection.column,
              message: `${detection.sdk} detected: ${detection.recommendation || 'Policy violation'}`,
              codeSnippet: detection.codeSnippet,
              recommendation: detection.recommendation,
            });
          }
        }
      }

      // Rule-based scanning
      for (const rule of rules) {
        const fileTypes = rule.detection.fileTypes || SCANNABLE_EXTENSIONS;
        if (!fileTypes.some(t => ext === t || ext === t.replace('.', ''))) {
          continue;
        }

        const ruleViolations = await checkRule(rule, content, relativePath);
        violations.push(...ruleViolations);
      }
    } catch (err) {
      // Skip files that can't be read
      console.error(`Warning: Could not read file ${filePath}`);
    }
  }

  // Filter by severity if specified
  let filteredViolations = violations;
  if (options.severity) {
    const severityOrder: Record<Severity, number> = { error: 3, warning: 2, info: 1 };
    const minSeverity = severityOrder[options.severity];
    filteredViolations = violations.filter(v => severityOrder[v.severity] >= minSeverity);
  }

  // Remove duplicates
  const uniqueViolations = deduplicateViolations(filteredViolations);

  const scanDuration = Date.now() - startTime;

  return {
    source: options.source || { type: 'local', path: dirPath },
    filesScanned: files.length,
    scanDuration,
    violations: uniqueViolations,
    sdkAnalysis: options.includeSdkAnalysis !== false ? sdkAnalysis : undefined,
    summary: {
      errors: uniqueViolations.filter(v => v.severity === 'error').length,
      warnings: uniqueViolations.filter(v => v.severity === 'warning').length,
      info: uniqueViolations.filter(v => v.severity === 'info').length,
    },
  };
}

async function checkRule(
  rule: ViolationRule,
  content: string,
  filePath: string
): Promise<Violation[]> {
  const violations: Violation[] = [];
  const lines = content.split('\n');

  if (rule.detection.type === 'regex' && rule.detection.pattern) {
    const regex = new RegExp(rule.detection.pattern, 'gi');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = line.match(regex);

      if (matches) {
        violations.push({
          ruleCode: rule.rule_code,
          ruleName: rule.name,
          severity: rule.severity,
          platform: rule.platform,
          file: filePath,
          line: i + 1,
          column: line.search(regex),
          message: rule.description || `Violation of ${rule.name}`,
          codeSnippet: line.trim(),
          recommendation: rule.recommendation,
          fixExample: rule.fix_example,
          docUrls: rule.doc_urls,
        });
      }
    }
  }

  if (rule.detection.type === 'sdk-check' && rule.detection.pattern) {
    const patterns = rule.detection.pattern.split('|');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();

      for (const pattern of patterns) {
        if (line.includes(pattern.toLowerCase())) {
          violations.push({
            ruleCode: rule.rule_code,
            ruleName: rule.name,
            severity: rule.severity,
            platform: rule.platform,
            file: filePath,
            line: i + 1,
            column: line.indexOf(pattern.toLowerCase()),
            message: rule.description || `${pattern} detected`,
            codeSnippet: lines[i].trim(),
            recommendation: rule.recommendation,
            fixExample: rule.fix_example,
            docUrls: rule.doc_urls,
          });
          break;
        }
      }
    }
  }

  return violations;
}

function deduplicateViolations(violations: Violation[]): Violation[] {
  const seen = new Set<string>();
  return violations.filter(v => {
    const key = `${v.ruleCode}:${v.file}:${v.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Convert bundled rules to ViolationRule format
 * Uses pre-packaged rules that work without database/scraping
 */
function getBuiltinRules(): ViolationRule[] {
  return BUNDLED_RULES.map(rule => {
    // Map detection type to ViolationRule DetectionType format
    // DetectionType = 'ast-pattern' | 'regex' | 'semantic' | 'sdk-check'
    let detectionType: 'regex' | 'sdk-check' | 'ast-pattern' | 'semantic';
    if (rule.detection.type === 'package' || rule.detection.type === 'sdk') {
      detectionType = 'sdk-check';
    } else {
      detectionType = 'regex'; // Default to regex for pattern matching
    }

    return {
      rule_code: rule.code,
      name: rule.name,
      description: rule.description,
      platform: rule.platform,
      severity: rule.severity,
      category: rule.category,
      detection: {
        type: detectionType,
        pattern: rule.detection.pattern || rule.detection.packages?.join('|'),
        fileTypes: ['.js', '.jsx', '.ts', '.tsx', '.py', '.php', '.java', '.go', '.rb'],
      },
      recommendation: rule.recommendation,
      doc_urls: rule.docUrl ? [rule.docUrl] : undefined,
      enabled: true,
    };
  });
}
