// Core types for Meta Policy Scanner

export type Platform = 'facebook' | 'instagram' | 'messenger' | 'whatsapp' | 'ads' | 'all';
export type Severity = 'error' | 'warning' | 'info';
export type SDKType = 'official-sdk' | 'wrapper' | 'direct-api' | 'unofficial' | 'deprecated';
export type RiskLevel = 'safe' | 'caution' | 'violation';
export type DetectionType = 'ast-pattern' | 'regex' | 'semantic' | 'sdk-check';

export interface SDKDetection {
  type: SDKType;
  sdk: string;
  platform: Platform;
  file: string;
  line: number;
  column: number;
  codeSnippet: string;
  confidence: 'high' | 'medium' | 'low';
  riskLevel: RiskLevel;
  recommendation?: string;
}

export interface Detection {
  type: DetectionType;
  pattern?: string;
  astQuery?: string;
  semanticHint?: string;
  fileTypes?: string[];
}

export interface ViolationRule {
  id?: number;
  rule_code: string;
  name: string;
  description?: string;
  platform: Platform;
  severity: Severity;
  category: string;
  detection: Detection;
  recommendation?: string;
  fix_example?: string;
  doc_urls?: string[];
  tags?: string[];
  enabled: boolean;
  is_builtin?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Violation {
  ruleCode: string;
  ruleName: string;
  severity: Severity;
  platform: Platform;
  file: string;
  line: number;
  column: number;
  message: string;
  codeSnippet: string;
  recommendation?: string;
  fixExample?: string;
  docUrls?: string[];
}

export interface ScanSource {
  type: 'local' | 'github';
  path?: string;
  url?: string;
  owner?: string;
  repo?: string;
  branch?: string;
  commit?: string;
  commitDate?: string;
}

export interface ScanOptions {
  platform?: Platform;
  severity?: Severity;
  ignorePatterns?: string[];
  includeSdkAnalysis?: boolean;
  source?: ScanSource;
}

export interface SDKAnalysis {
  official: SDKDetection[];
  wrappers: SDKDetection[];
  directApi: SDKDetection[];
  violations: SDKDetection[];
}

export interface ScanResult {
  source: ScanSource;
  filesScanned: number;
  scanDuration: number;
  violations: Violation[];
  sdkAnalysis?: SDKAnalysis;
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
}

export interface RuleFilter {
  platform?: Platform;
  severity?: Severity;
  category?: string;
  enabled?: boolean;
}
