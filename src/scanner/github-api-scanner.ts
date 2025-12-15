/**
 * GitHub API Scanner - Fetches files via GitHub REST API (NO CLONING!)
 * Inspired by PocketFlow's approach: https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge
 */

import { ScanResult, Violation, SDKAnalysis } from '../types';
import { SDKDetector, detectMetaPackages } from './sdk-detector';
import { BUNDLED_RULES } from '../policies/bundled-policies';
import { createAIScanner, AIScanner } from './ai-scanner';
import { createCodebaseIndex, CodebaseIndexer } from './codebase-indexer';

interface GitHubFile {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  download_url: string | null;
  sha: string;
}

interface GitHubApiOptions {
  token?: string;
  branch?: string;
  maxFileSize?: number;  // Skip files larger than this (bytes)
  maxFiles?: number;     // Max files to fetch
  includePatterns?: string[];
  excludePatterns?: string[];
  enableAI?: boolean;    // Enable AI-powered detection (requires env vars)
}

const SCANNABLE_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.php', '.java', '.rb', '.go',
  '.json',  // For package.json detection
];

const DEFAULT_EXCLUDE = [
  'node_modules', 'dist', 'build', '.git', 'vendor',
  '__pycache__', 'venv', '.next', 'coverage',
  '.min.js', '.bundle.js', '.map',
];

const MAX_FILE_SIZE = 100 * 1024;  // 100KB default
const MAX_FILES = 500;  // Don't scan more than 500 files
const API_BASE = 'https://api.github.com';

export class GitHubApiScanner {
  private token?: string;
  private rateLimitRemaining = 60;
  private rateLimitReset = 0;
  private filesScanned = 0;
  private onProgress?: (msg: string) => void;
  private retryCount = 0;
  private maxRetries = 3;
  private aiScanner?: AIScanner;

  constructor(options?: { token?: string; onProgress?: (msg: string) => void; enableAI?: boolean }) {
    this.token = options?.token || process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
    this.onProgress = options?.onProgress;

    // AI scanner initialization is deferred to scanRepo() since createAIScanner is now async
    this.enableAI = options?.enableAI;
  }

  private enableAI?: boolean;

  /**
   * Initialize AI scanner (async)
   */
  private async initAIScanner(): Promise<void> {
    if (!this.enableAI || this.aiScanner) return;

    this.aiScanner = (await createAIScanner(this.onProgress)) || undefined;
    if (this.aiScanner) {
      const config = this.aiScanner.isFullyConfigured();
      this.log(`🤖 AI detection enabled (RAG: ${config.rag ? '✓' : '✗'}, LLM: ${config.llm ? '✓' : '✗'}${config.llmProvider ? ` - ${config.llmProvider}` : ''})`);
    } else {
      this.log(`⚠️ AI detection requested but not configured (need SUPABASE_URL, SUPABASE_ANON_KEY, VOYAGE_API_KEY)`);
    }
  }

  private log(msg: string) {
    if (this.onProgress) this.onProgress(msg);
  }

  /**
   * Sleep with exponential backoff (PocketFlow pattern)
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Exponential backoff calculation
   */
  private getBackoffTime(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30 seconds
  }

  private async getDefaultBranch(owner: string, repo: string): Promise<string> {
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'meta-policy-scanner',
      };
      if (this.token) {
        headers['Authorization'] = `token ${this.token}`;
      }

      const response = await fetch(`${API_BASE}/repos/${owner}/${repo}`, { headers });

      if (response.ok) {
        const data = await response.json() as { default_branch: string };
        return data.default_branch || 'main';
      }
    } catch (e) {
      // Fall back to main
    }
    return 'main';
  }

  async scanRepo(repoUrl: string, options: GitHubApiOptions = {}): Promise<ScanResult> {
    const startTime = Date.now();
    const parsed = this.parseGitHubUrl(repoUrl);

    if (!parsed) {
      throw new Error(`Invalid GitHub URL: ${repoUrl}`);
    }

    const { owner, repo, branch: urlBranch, path: subPath } = parsed;

    // Auto-detect default branch if not specified
    let branch = options.branch || urlBranch;
    if (!branch) {
      branch = await this.getDefaultBranch(owner, repo);
      this.log(`Detected default branch: ${branch}`);
    }

    this.log(`Scanning ${owner}/${repo} (branch: ${branch}) via GitHub API...`);
    this.log(`No download required - fetching files directly from API\n`);

    // Initialize AI scanner if enabled (async operation)
    await this.initAIScanner();

    const violations: Violation[] = [];
    const sdkDetector = new SDKDetector();
    const sdkAnalysis: SDKAnalysis = {
      official: [],
      wrappers: [],
      directApi: [],
      violations: [],
    };

    // Get file tree from GitHub API
    const files = await this.getRepoFiles(owner, repo, branch, subPath, {
      maxFileSize: options.maxFileSize || MAX_FILE_SIZE,
      maxFiles: options.maxFiles || MAX_FILES,
      excludePatterns: options.excludePatterns || DEFAULT_EXCLUDE,
    });

    this.log(`Found ${files.length} scannable files\n`);

    // Collect file contents for codebase indexing
    const fileContents: Array<{path: string, content: string}> = [];

    // Check package.json first
    const packageJson = files.find(f => f.name === 'package.json');
    if (packageJson) {
      try {
        const content = await this.fetchFileContent(packageJson.download_url!);
        fileContents.push({ path: 'package.json', content });

        const pkgAnalysis = await detectMetaPackages(content);

        for (const pkg of pkgAnalysis.violations) {
          violations.push({
            ruleCode: 'UNOFFICIAL_IG_LIBRARY',
            ruleName: 'Unofficial Instagram Library',
            severity: 'error',
            platform: 'instagram',
            file: 'package.json',
            line: 1,
            column: 0,
            message: `Unofficial library "${pkg}" in package.json violates Meta Platform Terms.`,
            codeSnippet: `"${pkg}": "..."`,
            recommendation: 'Use official Instagram Graph API via facebook-nodejs-business-sdk',
          });
        }
      } catch (e) {
        // Skip if can't read package.json
      }
    }

    // Scan each file (rate-limit aware)
    for (const file of files) {
      if (this.filesScanned >= (options.maxFiles || MAX_FILES)) {
        this.log(`Reached max files limit (${options.maxFiles || MAX_FILES})`);
        break;
      }

      if (!this.isScannable(file)) continue;

      try {
        await this.checkRateLimit();

        const content = await this.fetchFileContent(file.download_url!);
        fileContents.push({ path: file.path, content });
        this.filesScanned++;

        // SDK Detection
        const sdkDetections = await sdkDetector.detectInFile(file.path, content);
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
              violations.push({
                ruleCode: detection.type === 'unofficial' ? 'UNOFFICIAL_IG_LIBRARY' : 'DEPRECATED_API_VERSION',
                ruleName: detection.type === 'unofficial' ? 'Unofficial Library' : 'Deprecated API',
                severity: 'error',
                platform: detection.platform,
                file: file.path,
                line: detection.line,
                column: detection.column,
                message: `${detection.sdk}: ${detection.recommendation || 'Policy violation'}`,
                codeSnippet: detection.codeSnippet,
                recommendation: detection.recommendation,
              });
              break;
          }
        }

        // Regex-based rule checks
        const regexViolations = this.checkRegexRules(content, file.path);
        violations.push(...regexViolations);

        // AI-powered detection (if enabled)
        if (this.aiScanner) {
          try {
            const aiViolations = await this.aiScanner.analyzeFile(file.path, content, {
              maxAnalysisPerFile: 5,
              minConfidence: 0.7,
            });
            violations.push(...aiViolations);
          } catch (aiError) {
            // AI analysis is optional, don't fail the scan
            this.log(`  ⚠️ AI analysis skipped: ${aiError instanceof Error ? aiError.message : 'Unknown error'}`);
          }
        }

      } catch (e) {
        // Skip files that fail to fetch
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('rate limit')) {
          this.log(`⚠️ Rate limit hit, stopping scan`);
          break;
        }
      }
    }

    // Create codebase index from collected file contents
    let codebaseIndex: CodebaseIndexer | undefined;
    if (fileContents.length > 0) {
      try {
        codebaseIndex = await createCodebaseIndex(fileContents);
        const structure = codebaseIndex.getStructure();
        if (structure) {
          this.log(`📊 Codebase: ${structure.summary}`);
        }
      } catch (e) {
        this.log(`⚠️ Codebase indexing failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    // Set codebase index on AI scanner if available
    if (this.aiScanner && codebaseIndex) {
      this.aiScanner.setCodebaseIndex(codebaseIndex);
    }

    // Deduplicate violations
    const uniqueViolations = this.deduplicateViolations(violations);

    return {
      source: {
        type: 'github',
        url: repoUrl,
        owner,
        repo,
        branch,
      },
      filesScanned: this.filesScanned,
      scanDuration: Date.now() - startTime,
      violations: uniqueViolations,
      sdkAnalysis,
      summary: {
        errors: uniqueViolations.filter(v => v.severity === 'error').length,
        warnings: uniqueViolations.filter(v => v.severity === 'warning').length,
        info: uniqueViolations.filter(v => v.severity === 'info').length,
      },
    };
  }

  private async getRepoFiles(
    owner: string,
    repo: string,
    branch: string,
    subPath: string = '',
    options: { maxFileSize: number; maxFiles: number; excludePatterns: string[] }
  ): Promise<GitHubFile[]> {
    const files: GitHubFile[] = [];
    const queue: string[] = [subPath];
    let dirsProcessed = 0;
    const maxDirs = 100; // Limit directory traversal

    while (queue.length > 0 && files.length < options.maxFiles && dirsProcessed < maxDirs) {
      const path = queue.shift()!;
      dirsProcessed++;

      try {
        const url = `${API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
        const response = await this.apiRequestWithRetry(url);

        if (!response.ok) {
          if (response.status === 404) {
            // Try 'master' if 'main' not found
            if (branch === 'main' && path === '') {
              this.log(`Branch 'main' not found, trying 'master'...`);
              return this.getRepoFiles(owner, repo, 'master', subPath, options);
            }
          }
          continue; // Skip this path and continue
        }

        const data = await response.json();

        // Handle single file response vs directory listing
        const items: GitHubFile[] = Array.isArray(data) ? data : [data];

        for (const item of items) {
          // Skip excluded paths
          if (this.shouldExclude(item.path, options.excludePatterns)) {
            continue;
          }

          if (item.type === 'dir') {
            queue.push(item.path);
          } else if (item.type === 'file') {
            // Skip large files
            if (item.size > options.maxFileSize) continue;
            // Skip non-scannable files
            if (!this.isScannable(item)) continue;

            files.push(item);

            // Log progress every 10 files
            if (files.length % 10 === 0) {
              this.log(`  Found ${files.length} files...`);
            }
          }
        }
      } catch (e) {
        // Skip directories that fail
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('rate limit')) {
          this.log(`Rate limit hit after ${files.length} files`);
          break;
        }
      }
    }

    return files;
  }

  /**
   * Fetch file content with encoding detection and binary file handling (PocketFlow pattern)
   */
  private async fetchFileContent(downloadUrl: string): Promise<string> {
    const response = await fetch(downloadUrl, {
      headers: this.token ? { 'Authorization': `token ${this.token}` } : {},
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status}`);
    }

    // Get raw bytes for encoding detection
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Check for binary content (PocketFlow pattern)
    if (this.isBinaryContent(bytes)) {
      throw new Error('Binary file detected, skipping');
    }

    // Try UTF-8 first, then fallback encodings
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      return decoder.decode(bytes);
    } catch {
      // Fallback to latin1 for files with non-UTF8 encoding
      try {
        const decoder = new TextDecoder('iso-8859-1');
        return decoder.decode(bytes);
      } catch {
        throw new Error('Unable to decode file content');
      }
    }
  }

  /**
   * Detect binary content by checking for null bytes or high ratio of non-printable chars
   */
  private isBinaryContent(bytes: Uint8Array): boolean {
    // Check first 8KB for binary indicators
    const checkLength = Math.min(bytes.length, 8192);
    let nullCount = 0;
    let nonPrintableCount = 0;

    for (let i = 0; i < checkLength; i++) {
      const byte = bytes[i];

      // Null byte is a strong indicator of binary
      if (byte === 0) {
        nullCount++;
        if (nullCount > 1) return true;
      }

      // Count non-printable, non-whitespace characters
      if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
        nonPrintableCount++;
      }
    }

    // If more than 10% non-printable, likely binary
    return nonPrintableCount / checkLength > 0.1;
  }

  private async apiRequest(url: string): Promise<Response> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'meta-policy-scanner',
    };

    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }

    const response = await fetch(url, { headers });

    // Track rate limits
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');

    if (remaining) this.rateLimitRemaining = parseInt(remaining);
    if (reset) this.rateLimitReset = parseInt(reset);

    return response;
  }

  /**
   * Enhanced rate limit handling with exponential backoff (PocketFlow pattern)
   */
  private async checkRateLimit(): Promise<void> {
    if (this.rateLimitRemaining <= 1) {
      const waitTime = (this.rateLimitReset * 1000) - Date.now();

      if (waitTime > 0) {
        if (waitTime < 120000) { // Wait up to 2 minutes
          this.log(`Rate limit reached, waiting ${Math.ceil(waitTime / 1000)}s until reset...`);
          await this.sleep(waitTime + 1000);
          this.retryCount = 0; // Reset retry count after successful wait
        } else {
          // Apply exponential backoff for longer waits
          const backoffTime = this.getBackoffTime(this.retryCount);
          this.retryCount++;

          if (this.retryCount > this.maxRetries) {
            throw new Error(
              `Rate limit exceeded. Wait ${Math.ceil(waitTime / 60000)} minutes or ` +
              `provide a GITHUB_TOKEN for 5,000 requests/hour (vs 60/hour unauthenticated).`
            );
          }

          this.log(`Rate limit exceeded, backing off ${backoffTime / 1000}s (attempt ${this.retryCount}/${this.maxRetries})...`);
          await this.sleep(backoffTime);
        }
      }
    }
  }

  /**
   * API request with retry logic (PocketFlow pattern)
   */
  private async apiRequestWithRetry(url: string, maxAttempts: number = 3): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await this.checkRateLimit();
        const response = await this.apiRequest(url);

        // Handle rate limit response
        if (response.status === 403 || response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : this.getBackoffTime(attempt);
          this.log(`Rate limited, waiting ${waitTime / 1000}s...`);
          await this.sleep(waitTime);
          continue;
        }

        return response;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));

        if (attempt < maxAttempts - 1) {
          const backoffTime = this.getBackoffTime(attempt);
          this.log(`Request failed, retrying in ${backoffTime / 1000}s...`);
          await this.sleep(backoffTime);
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  private parseGitHubUrl(url: string): { owner: string; repo: string; branch?: string; path?: string } | null {
    // Handle various GitHub URL formats
    const patterns = [
      // https://github.com/owner/repo
      /github\.com\/([^\/]+)\/([^\/\s?#]+)/,
      // https://github.com/owner/repo/tree/branch
      /github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)(?:\/(.*))?/,
      // https://github.com/owner/repo/blob/branch/path
      /github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2].replace(/\.git$/, ''),
          branch: match[3],
          path: match[4] || '',
        };
      }
    }

    return null;
  }

  private isScannable(file: GitHubFile): boolean {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return SCANNABLE_EXTENSIONS.includes(ext) && file.download_url !== null;
  }

  private shouldExclude(path: string, patterns: string[]): boolean {
    const lowerPath = path.toLowerCase();
    return patterns.some(p => lowerPath.includes(p.toLowerCase()));
  }

  private checkRegexRules(content: string, filePath: string): Violation[] {
    const violations: Violation[] = [];
    const lines = content.split('\n');

    // Use BUNDLED_RULES for consistent detection across all scan modes
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const rule of BUNDLED_RULES) {
        // Skip rules without regex patterns
        if (!rule.detection.pattern) continue;

        try {
          const pattern = new RegExp(rule.detection.pattern, 'gi');
          if (pattern.test(line)) {
            violations.push({
              ruleCode: rule.code,
              ruleName: rule.name,
              severity: rule.severity,
              platform: rule.platform,
              file: filePath,
              line: i + 1,
              column: line.search(new RegExp(rule.detection.pattern, 'i')) + 1,
              message: rule.description,
              codeSnippet: line.trim().substring(0, 100),
              recommendation: rule.recommendation,
              docUrls: rule.docUrl ? [rule.docUrl] : undefined,
            });
          }
        } catch {
          // Invalid regex pattern, skip
        }
      }
    }

    return violations;
  }

  private deduplicateViolations(violations: Violation[]): Violation[] {
    const seen = new Set<string>();
    return violations.filter(v => {
      const key = `${v.ruleCode}:${v.file}:${v.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

// Convenience function
export async function scanGitHubRepoViaApi(
  repoUrl: string,
  options?: GitHubApiOptions & { onProgress?: (msg: string) => void }
): Promise<ScanResult> {
  const scanner = new GitHubApiScanner({
    token: options?.token,
    onProgress: options?.onProgress,
    enableAI: options?.enableAI,
  });
  return scanner.scanRepo(repoUrl, options);
}

export function isGitHubUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?github\.com\//.test(url);
}
