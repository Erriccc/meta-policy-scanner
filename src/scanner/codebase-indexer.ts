/**
 * Codebase Indexer
 *
 * Creates an in-memory index of the user's codebase to provide
 * context-aware AI analysis. Instead of analyzing code snippets
 * in isolation, the AI can now search for related code (auth,
 * middleware, utilities) to understand the full picture.
 *
 * Features:
 * - In-memory vector search (no persistence)
 * - Import/export relationship graph
 * - Codebase structure detection (fullstack, script, library)
 * - Smart search for related code patterns
 */

export interface CodebaseFile {
  path: string;
  content: string;
  imports: string[];
  exports: string[];
  functions: string[];
  classes: string[];
}

export interface CodebaseStructure {
  type: 'fullstack' | 'backend' | 'frontend' | 'script' | 'library' | 'unknown';
  hasAuth: boolean;
  hasDatabase: boolean;
  hasApi: boolean;
  hasMiddleware: boolean;
  hasTests: boolean;
  framework?: string;
  entryPoints: string[];
  summary: string;
}

export interface RelatedCode {
  file: string;
  snippet: string;
  relevance: string;
  line: number;
}

// Common patterns to detect codebase structure
const STRUCTURE_PATTERNS = {
  auth: [
    /(?:authenticate|authorize|verifyToken|checkPermission|isAuthenticated|requireAuth|passport|jwt\.verify)/gi,
    /(?:session|cookie|bearer|oauth|oidc)/gi,
  ],
  database: [
    /(?:mongoose|sequelize|prisma|typeorm|knex|pg|mysql|mongodb|supabase|firebase)/gi,
    /(?:\.query|\.find|\.create|\.update|\.delete|SELECT|INSERT|UPDATE)/gi,
  ],
  api: [
    /(?:app\.get|app\.post|router\.|express|fastify|koa|hapi|fetch|axios)/gi,
    /(?:endpoint|route|controller|handler)/gi,
  ],
  middleware: [
    /(?:app\.use|middleware|interceptor|guard|pipe|filter)/gi,
    /(?:rateLimit|cors|helmet|bodyParser|multer)/gi,
  ],
  frontend: [
    /(?:react|vue|angular|svelte|next|nuxt|gatsby)/gi,
    /(?:component|useState|useEffect|render|template)/gi,
  ],
  tests: [
    /(?:describe|it|test|expect|jest|mocha|chai|vitest)/gi,
  ],
};

// Patterns to extract imports/exports
const IMPORT_PATTERNS = [
  /import\s+(?:(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /from\s+['"]([^'"]+)['"]/g,
];

const EXPORT_PATTERNS = [
  /export\s+(?:default\s+)?(?:class|function|const|let|var|async\s+function)\s+(\w+)/g,
  /export\s+\{\s*([^}]+)\s*\}/g,
  /module\.exports\s*=\s*(?:\{([^}]+)\}|(\w+))/g,
  /exports\.(\w+)\s*=/g,
];

// Patterns to extract function/class names
const FUNCTION_PATTERNS = [
  /(?:function|async\s+function)\s+(\w+)/g,
  /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
  /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?function/g,
  /(\w+)\s*:\s*(?:async\s*)?\([^)]*\)\s*=>/g,
  /(\w+)\s*\([^)]*\)\s*\{/g,
];

const CLASS_PATTERNS = [
  /class\s+(\w+)/g,
];

export class CodebaseIndexer {
  private files: Map<string, CodebaseFile> = new Map();
  private structure: CodebaseStructure | null = null;
  private importGraph: Map<string, Set<string>> = new Map();
  private exportMap: Map<string, string[]> = new Map(); // export name -> files that export it

  /**
   * Index a codebase from file contents
   */
  async index(files: Array<{ path: string; content: string }>): Promise<void> {
    // Parse each file
    for (const { path, content } of files) {
      const parsed = this.parseFile(path, content);
      this.files.set(path, parsed);
    }

    // Build import graph
    this.buildImportGraph();

    // Detect structure
    this.structure = this.detectStructure();
  }

  /**
   * Parse a file to extract metadata
   */
  private parseFile(path: string, content: string): CodebaseFile {
    const imports: string[] = [];
    const exports: string[] = [];
    const functions: string[] = [];
    const classes: string[] = [];

    // Extract imports
    for (const pattern of IMPORT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        if (match[1]) imports.push(match[1]);
      }
    }

    // Extract exports
    for (const pattern of EXPORT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        const exportName = match[1] || match[2];
        if (exportName) {
          // Handle multiple exports in braces
          exportName.split(',').forEach(e => {
            const name = e.trim().split(/\s+as\s+/)[0].trim();
            if (name && /^\w+$/.test(name)) exports.push(name);
          });
        }
      }
    }

    // Extract functions
    for (const pattern of FUNCTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        if (match[1] && /^[a-zA-Z_]\w*$/.test(match[1])) {
          functions.push(match[1]);
        }
      }
    }

    // Extract classes
    for (const pattern of CLASS_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        if (match[1]) classes.push(match[1]);
      }
    }

    return {
      path,
      content,
      imports: [...new Set(imports)],
      exports: [...new Set(exports)],
      functions: [...new Set(functions)],
      classes: [...new Set(classes)],
    };
  }

  /**
   * Build import relationship graph
   */
  private buildImportGraph(): void {
    this.importGraph.clear();
    this.exportMap.clear();

    // Build export map
    for (const [path, file] of this.files) {
      for (const exp of file.exports) {
        if (!this.exportMap.has(exp)) {
          this.exportMap.set(exp, []);
        }
        this.exportMap.get(exp)!.push(path);
      }
    }

    // Build import graph
    for (const [path, file] of this.files) {
      const imports = new Set<string>();

      for (const imp of file.imports) {
        // Resolve relative imports
        if (imp.startsWith('.')) {
          const resolved = this.resolveImport(path, imp);
          if (resolved) imports.add(resolved);
        }
      }

      this.importGraph.set(path, imports);
    }
  }

  /**
   * Resolve a relative import path
   */
  private resolveImport(fromPath: string, importPath: string): string | null {
    // Simple resolution - in real impl would need proper path resolution
    const dir = fromPath.split('/').slice(0, -1).join('/');
    let resolved = importPath;

    if (importPath.startsWith('./')) {
      resolved = dir + importPath.substring(1);
    } else if (importPath.startsWith('../')) {
      const parts = dir.split('/');
      parts.pop();
      resolved = parts.join('/') + importPath.substring(2);
    }

    // Try to find matching file
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
    for (const ext of extensions) {
      const fullPath = resolved + ext;
      if (this.files.has(fullPath)) return fullPath;
    }

    return null;
  }

  /**
   * Detect codebase structure
   */
  private detectStructure(): CodebaseStructure {
    const allContent = Array.from(this.files.values())
      .map(f => f.content)
      .join('\n');

    const hasAuth = STRUCTURE_PATTERNS.auth.some(p => p.test(allContent));
    const hasDatabase = STRUCTURE_PATTERNS.database.some(p => p.test(allContent));
    const hasApi = STRUCTURE_PATTERNS.api.some(p => p.test(allContent));
    const hasMiddleware = STRUCTURE_PATTERNS.middleware.some(p => p.test(allContent));
    const hasFrontend = STRUCTURE_PATTERNS.frontend.some(p => p.test(allContent));
    const hasTests = STRUCTURE_PATTERNS.tests.some(p => p.test(allContent));

    // Detect framework
    let framework: string | undefined;
    if (/next/i.test(allContent)) framework = 'Next.js';
    else if (/express/i.test(allContent)) framework = 'Express';
    else if (/fastify/i.test(allContent)) framework = 'Fastify';
    else if (/react/i.test(allContent)) framework = 'React';
    else if (/vue/i.test(allContent)) framework = 'Vue';

    // Determine type
    let type: CodebaseStructure['type'] = 'unknown';
    if (hasFrontend && hasApi) type = 'fullstack';
    else if (hasApi && !hasFrontend) type = 'backend';
    else if (hasFrontend && !hasApi) type = 'frontend';
    else if (this.files.size <= 3) type = 'script';
    else type = 'library';

    // Find entry points
    const entryPoints: string[] = [];
    for (const [path] of this.files) {
      if (/(?:index|main|app|server)\.[jt]sx?$/.test(path)) {
        entryPoints.push(path);
      }
    }

    // Generate summary
    const parts: string[] = [];
    parts.push(`${type} application`);
    if (framework) parts.push(`using ${framework}`);
    if (hasAuth) parts.push('with authentication');
    if (hasDatabase) parts.push('with database');
    if (hasMiddleware) parts.push('with middleware');

    return {
      type,
      hasAuth,
      hasDatabase,
      hasApi,
      hasMiddleware,
      hasTests,
      framework,
      entryPoints,
      summary: parts.join(' '),
    };
  }

  /**
   * Get codebase structure
   */
  getStructure(): CodebaseStructure | null {
    return this.structure;
  }

  /**
   * Search for code related to a query
   */
  searchRelatedCode(query: string, options: {
    maxResults?: number;
    excludeFile?: string;
  } = {}): RelatedCode[] {
    const { maxResults = 5, excludeFile } = options;
    const results: RelatedCode[] = [];
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);

    for (const [path, file] of this.files) {
      if (path === excludeFile) continue;

      const lines = file.content.split('\n');
      let bestMatch: { line: number; score: number; snippet: string } | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineLower = line.toLowerCase();

        // Score based on term matches
        let score = 0;
        for (const term of queryTerms) {
          if (lineLower.includes(term)) score += 1;
        }

        // Boost for function/class definitions
        if (/(?:function|class|const|export)\s+\w+/.test(line)) score += 0.5;

        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          // Get context (3 lines before and after)
          const start = Math.max(0, i - 2);
          const end = Math.min(lines.length, i + 3);
          const snippet = lines.slice(start, end).join('\n');

          bestMatch = { line: i + 1, score, snippet };
        }
      }

      if (bestMatch) {
        results.push({
          file: path,
          snippet: bestMatch.snippet,
          line: bestMatch.line,
          relevance: this.getRelevanceDescription(path),
        });
      }
    }

    // Sort by relevance and limit
    return results
      .sort((a, b) => {
        // Prioritize auth/middleware files for permission queries
        if (queryLower.includes('permission') || queryLower.includes('auth')) {
          const aIsAuth = /auth|permission|middleware/i.test(a.file);
          const bIsAuth = /auth|permission|middleware/i.test(b.file);
          if (aIsAuth && !bIsAuth) return -1;
          if (bIsAuth && !aIsAuth) return 1;
        }
        return 0;
      })
      .slice(0, maxResults);
  }

  /**
   * Find where a function/export is defined
   */
  findDefinition(name: string): RelatedCode | null {
    for (const [path, file] of this.files) {
      if (file.exports.includes(name) || file.functions.includes(name) || file.classes.includes(name)) {
        const lines = file.content.split('\n');
        const regex = new RegExp(`(?:function|class|const|let|var|export)\\s+${name}\\b`);

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            const start = Math.max(0, i - 1);
            const end = Math.min(lines.length, i + 10);

            return {
              file: path,
              snippet: lines.slice(start, end).join('\n'),
              line: i + 1,
              relevance: `Definition of ${name}`,
            };
          }
        }
      }
    }
    return null;
  }

  /**
   * Find files that import a given file
   */
  findDependents(filePath: string): string[] {
    const dependents: string[] = [];

    for (const [path, imports] of this.importGraph) {
      if (imports.has(filePath)) {
        dependents.push(path);
      }
    }

    return dependents;
  }

  /**
   * Find files that a given file imports
   */
  findDependencies(filePath: string): string[] {
    const imports = this.importGraph.get(filePath);
    return imports ? Array.from(imports) : [];
  }

  /**
   * Search for specific patterns (auth, rate limiting, etc.)
   */
  findPatternUsage(pattern: 'auth' | 'rateLimit' | 'permissions' | 'middleware' | 'errorHandler' | 'database' | 'cache' | 'storage'): RelatedCode[] {
    const patterns: Record<string, RegExp[]> = {
      auth: [
        /(?:authenticate|authorize|verifyToken|isAuthenticated|requireAuth|checkAuth)/gi,
        /(?:jwt\.verify|passport\.authenticate|session\.user)/gi,
      ],
      rateLimit: [
        /(?:rateLimit|rateLimiter|throttle|slowDown)/gi,
        /(?:X-RateLimit|retry-after|429)/gi,
      ],
      permissions: [
        /(?:checkPermission|hasPermission|canAccess|isAllowed|authorize)/gi,
        /(?:scope|permission|role|access)/gi,
      ],
      middleware: [
        /(?:app\.use|router\.use|\.middleware)/gi,
        /(?:next\(\)|req,\s*res,\s*next)/gi,
      ],
      errorHandler: [
        /(?:catch|\.catch|try\s*\{|error\s*=>)/gi,
        /(?:errorHandler|handleError|onError)/gi,
      ],
      database: [
        /(?:createTable|CREATE TABLE|schema|model\s*\(|defineModel)/gi,
        /(?:mongoose\.Schema|sequelize\.define|prisma\.\w+\.create)/gi,
        /(?:ttl|expires_at|retention|delete_after)/gi,
      ],
      cache: [
        /(?:redis|memcache|cache)\.(?:set|get|expire|setex)/gi,
        /(?:ttl|EXPIRE|EX\s+\d+)/gi,
      ],
      storage: [
        /(?:s3|gcs|blob|storage)\.(?:upload|put|delete)/gi,
        /(?:deleteObject|removeFile|purge)/gi,
      ],
    };

    const searchPatterns = patterns[pattern] || [];
    const results: RelatedCode[] = [];

    for (const [path, file] of this.files) {
      const lines = file.content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const regex of searchPatterns) {
          if (regex.test(line)) {
            const start = Math.max(0, i - 2);
            const end = Math.min(lines.length, i + 5);

            results.push({
              file: path,
              snippet: lines.slice(start, end).join('\n'),
              line: i + 1,
              relevance: `${pattern} implementation`,
            });

            // Reset regex
            regex.lastIndex = 0;
            break;
          }
          regex.lastIndex = 0;
        }
      }
    }

    return results.slice(0, 10);
  }

  /**
   * Get a description of why a file is relevant
   */
  private getRelevanceDescription(filePath: string): string {
    const file = this.files.get(filePath);
    if (!file) return 'Unknown';

    const parts: string[] = [];

    if (/auth/i.test(filePath)) parts.push('authentication file');
    if (/middleware/i.test(filePath)) parts.push('middleware');
    if (/util/i.test(filePath)) parts.push('utility');
    if (/service/i.test(filePath)) parts.push('service layer');
    if (/controller/i.test(filePath)) parts.push('controller');
    if (/route/i.test(filePath)) parts.push('route handler');

    if (parts.length === 0) parts.push('related code');

    return parts.join(', ');
  }

  /**
   * Get summary for AI context
   */
  getSummaryForAI(): string {
    if (!this.structure) return 'Codebase structure unknown.';

    const lines: string[] = [
      `## Codebase Analysis`,
      `Type: ${this.structure.summary}`,
      `Files: ${this.files.size}`,
      '',
    ];

    if (this.structure.hasAuth) {
      lines.push('✓ Has authentication/authorization code');
    }
    if (this.structure.hasMiddleware) {
      lines.push('✓ Has middleware (may handle rate limiting, auth checks)');
    }
    if (this.structure.hasDatabase) {
      lines.push('✓ Has database integration');
    }
    if (this.structure.hasApi) {
      lines.push('✓ Has API endpoints');
    }

    lines.push('');
    lines.push('Note: This is a multi-file codebase. Authentication, permissions,');
    lines.push('rate limiting, and error handling may be in separate files.');

    return lines.join('\n');
  }
}

/**
 * Create a codebase indexer from scanned files
 */
export async function createCodebaseIndex(
  files: Array<{ path: string; content: string }>
): Promise<CodebaseIndexer> {
  const indexer = new CodebaseIndexer();
  await indexer.index(files);
  return indexer;
}
