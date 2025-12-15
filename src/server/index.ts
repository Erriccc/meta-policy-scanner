/**
 * Meta Policy Scanner API Server
 *
 * Server-side architecture: All AI/embedding keys are stored on server.
 * Users only need to provide GitHub PAT for private repos.
 *
 * Endpoints:
 * - POST /api/scan - Scan a GitHub repository
 * - GET  /api/status - Check server capabilities (AI, docs indexed)
 * - GET  /api/docs - List indexed policy documents
 * - DELETE /api/docs/:id - Delete a policy document
 * - POST /api/docs/ingest - Ingest a URL into the knowledge base
 * - GET  /health - Health check
 */

import { createServer } from 'http';
import { parse } from 'url';
import { scanGitHubRepo } from '../scanner/github-scanner';
import { scanGitHubRepoViaApi } from '../scanner/github-api-scanner';
import { createClient } from '@supabase/supabase-js';

const PORT = process.env.PORT || 3001;

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Server-side configuration (users don't need these)
const SERVER_CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_ANON_KEY,
  voyageKey: process.env.VOYAGE_API_KEY,
  groqKey: process.env.GROQ_API_KEY,
  openaiKey: process.env.OPENAI_API_KEY,
  githubPat: process.env.GITHUB_PAT, // Server's default PAT for public repos
};

// Initialize Supabase client if configured
const supabase = SERVER_CONFIG.supabaseUrl && SERVER_CONFIG.supabaseKey
  ? createClient(SERVER_CONFIG.supabaseUrl, SERVER_CONFIG.supabaseKey)
  : null;

interface ScanRequest {
  url: string;
  branch?: string;
  githubToken?: string; // User's PAT for private repos
  enableAI?: boolean;
}

interface IngestRequest {
  url: string;
  platform?: string;
}

/**
 * Check what capabilities the server has
 */
function getServerStatus() {
  return {
    version: '1.1.0',
    capabilities: {
      basicScan: true,
      githubApi: !!SERVER_CONFIG.githubPat,
      aiDetection: !!(SERVER_CONFIG.supabaseUrl && SERVER_CONFIG.voyageKey),
      llmAnalysis: !!(SERVER_CONFIG.groqKey || SERVER_CONFIG.openaiKey),
      docsIngestion: !!(SERVER_CONFIG.supabaseUrl && SERVER_CONFIG.voyageKey),
    },
    llmProvider: SERVER_CONFIG.groqKey ? 'groq' : SERVER_CONFIG.openaiKey ? 'openai' : null,
  };
}

/**
 * Check if a repo is accessible with the given token
 */
async function checkRepoAccess(owner: string, repo: string, token?: string): Promise<{
  accessible: boolean;
  isPrivate?: boolean;
  error?: string;
}> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'meta-policy-scanner',
    };
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });

    if (response.ok) {
      const data = await response.json() as { private: boolean };
      return { accessible: true, isPrivate: data.private };
    }

    if (response.status === 404) {
      return {
        accessible: false,
        error: 'Repository not found. It may be private or does not exist.'
      };
    }

    if (response.status === 403) {
      return {
        accessible: false,
        error: 'Access forbidden. Rate limit may have been exceeded.'
      };
    }

    return {
      accessible: false,
      error: `GitHub API error: ${response.status}`
    };
  } catch (err) {
    return {
      accessible: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

/**
 * Handle scan request
 *
 * Flow:
 * 1. Try with server's PAT first (for public repos)
 * 2. If 404/inaccessible and no user token provided, ask user to connect GitHub
 * 3. If user token provided, use that for private repos
 */
async function handleScan(body: ScanRequest): Promise<object> {
  const { url, branch, githubToken, enableAI } = body;

  if (!url) {
    throw new Error('Repository URL is required');
  }

  // Validate GitHub URL
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error('Invalid GitHub repository URL');
  }

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, '');

  // Determine which token to use
  const userProvidedToken = !!githubToken;
  let token = githubToken || SERVER_CONFIG.githubPat;

  // Check repo accessibility
  const access = await checkRepoAccess(owner, repo, token);

  // If not accessible with server token and user hasn't provided their token
  if (!access.accessible && !userProvidedToken) {
    // Return a special response asking user to connect GitHub
    return {
      status: 'auth_required',
      code: 'GITHUB_AUTH_REQUIRED',
      message: 'Repository is private or not accessible. Please connect your GitHub account.',
      details: {
        owner,
        repo,
        error: access.error,
        instructions: [
          '1. Create a GitHub Personal Access Token (PAT)',
          '2. Go to: https://github.com/settings/tokens/new',
          '3. Select scopes: repo (Full control of private repositories)',
          '4. Generate token and provide it in your request',
        ],
        requestFormat: {
          url,
          branch,
          githubToken: '<your-github-pat>',
          enableAI,
        },
      },
    };
  }

  // If still not accessible even with user's token
  if (!access.accessible && userProvidedToken) {
    return {
      status: 'error',
      code: 'REPO_NOT_ACCESSIBLE',
      message: access.error || 'Repository not accessible with provided token',
      details: {
        owner,
        repo,
        hint: 'Ensure your token has the "repo" scope for private repositories',
      },
    };
  }

  // Repo is accessible, proceed with scan
  let result;

  if (token) {
    const isPrivateLabel = access.isPrivate ? ' (private)' : ' (public)';
    console.log(`Scanning ${owner}/${repo}${isPrivateLabel} via GitHub API${enableAI ? ' + AI' : ''}...`);
    result = await scanGitHubRepoViaApi(url, {
      branch,
      token,
      enableAI: enableAI && !!(SERVER_CONFIG.supabaseUrl && SERVER_CONFIG.voyageKey),
      onProgress: (msg) => console.log(msg),
    });
  } else {
    console.log(`Scanning ${owner}/${repo} via git clone...`);
    result = await scanGitHubRepo(url, {
      branch,
      depth: 1,
    });
  }

  return {
    status: 'success',
    ...result,
  };
}

/**
 * List indexed documents
 */
async function handleListDocs(): Promise<object> {
  if (!supabase) {
    throw new Error('Database not configured on server');
  }

  const { data: policies, error } = await supabase
    .from('policies')
    .select('id, url, title, last_scraped, content_hash')
    .order('last_scraped', { ascending: false });

  if (error) {
    throw new Error(`Failed to list docs: ${error.message}`);
  }

  // Get chunk counts
  const results = [];
  for (const policy of policies || []) {
    const { count } = await supabase
      .from('policy_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('policy_id', policy.id);

    results.push({
      ...policy,
      chunkCount: count || 0,
    });
  }

  return {
    total: results.length,
    documents: results,
  };
}

/**
 * Delete a document
 */
async function handleDeleteDoc(id: string): Promise<object> {
  if (!supabase) {
    throw new Error('Database not configured on server');
  }

  const policyId = parseInt(id);
  if (isNaN(policyId)) {
    throw new Error('Invalid document ID');
  }

  // Delete chunks first (foreign key)
  const { error: chunksError } = await supabase
    .from('policy_chunks')
    .delete()
    .eq('policy_id', policyId);

  if (chunksError) {
    throw new Error(`Failed to delete chunks: ${chunksError.message}`);
  }

  // Delete policy
  const { error: policyError } = await supabase
    .from('policies')
    .delete()
    .eq('id', policyId);

  if (policyError) {
    throw new Error(`Failed to delete policy: ${policyError.message}`);
  }

  return { success: true, deleted: policyId };
}

/**
 * Ingest a URL
 */
async function handleIngestDoc(body: IngestRequest): Promise<object> {
  if (!supabase || !SERVER_CONFIG.voyageKey) {
    throw new Error('AI features not configured on server');
  }

  const { url, platform } = body;

  if (!url) {
    throw new Error('URL is required');
  }

  // Dynamic import to avoid loading if not needed
  const { JinaReaderScraper } = await import('../scraper/jina-reader');

  const scraper = new JinaReaderScraper(supabase, {
    embeddingConfig: {
      provider: 'voyage',
      apiKey: SERVER_CONFIG.voyageKey,
    },
  });

  const result = await scraper.ingestUrl(url, { platform });

  return result;
}

/**
 * Request handler for the server
 */
const requestHandler = async (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
  const { pathname } = parse(req.url || '', true);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // Helper to send JSON response
  const sendJson = (status: number, data: object) => {
    res.writeHead(status, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  // Helper to read body
  const readBody = (): Promise<string> => {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
    });
  };

  try {
    // Health check
    if (pathname === '/health' && req.method === 'GET') {
      sendJson(200, { status: 'ok' });
      return;
    }

    // Server status/capabilities
    if (pathname === '/api/status' && req.method === 'GET') {
      sendJson(200, getServerStatus());
      return;
    }

    // Scan endpoint
    if (pathname === '/api/scan' && req.method === 'POST') {
      const body = await readBody();
      const data = JSON.parse(body) as ScanRequest;
      const result = await handleScan(data) as { status?: string; code?: string };

      // Return 401 for auth_required so clients know to prompt for token
      if (result.status === 'auth_required') {
        sendJson(401, result);
        return;
      }

      // Return 403 for access errors with user token
      if (result.status === 'error' && result.code === 'REPO_NOT_ACCESSIBLE') {
        sendJson(403, result);
        return;
      }

      sendJson(200, result);
      return;
    }

    // List docs
    if (pathname === '/api/docs' && req.method === 'GET') {
      const result = await handleListDocs();
      sendJson(200, result);
      return;
    }

    // Delete doc
    if (pathname?.startsWith('/api/docs/') && req.method === 'DELETE') {
      const id = pathname.split('/').pop();
      if (!id) {
        sendJson(400, { error: 'Document ID required' });
        return;
      }
      const result = await handleDeleteDoc(id);
      sendJson(200, result);
      return;
    }

    // Ingest doc
    if (pathname === '/api/docs/ingest' && req.method === 'POST') {
      const body = await readBody();
      const data = JSON.parse(body) as IngestRequest;
      const result = await handleIngestDoc(data);
      sendJson(200, result);
      return;
    }

    // Serve static files for web UI
    if (pathname === '/' || pathname === '/index.html') {
      const fs = await import('fs');
      const path = await import('path');
      const htmlPath = path.join(__dirname, '../../web/index.html');

      if (fs.existsSync(htmlPath)) {
        const html = fs.readFileSync(htmlPath, 'utf-8');
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }
    }

    // 404
    sendJson(404, { error: 'Not found' });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('API error:', message);
    sendJson(400, { error: message });
  }
};

/**
 * Start server with automatic port finding
 */
function startServer(port: number, maxAttempts: number = 10): void {
  const server = createServer(requestHandler);

  server.listen(port, () => {
    const status = getServerStatus();
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Meta Policy Scanner API Server v${status.version}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n  Server: http://localhost:${port}`);
    console.log(`\n  Endpoints:`);
    console.log(`    GET  /api/status     - Server capabilities`);
    console.log(`    POST /api/scan       - Scan repository`);
    console.log(`    GET  /api/docs       - List indexed docs`);
    console.log(`    DELETE /api/docs/:id - Delete document`);
    console.log(`    POST /api/docs/ingest - Ingest URL`);
    console.log(`\n  Capabilities:`);
    console.log(`    Basic Scan:    ✓`);
    console.log(`    GitHub API:    ${status.capabilities.githubApi ? '✓' : '✗ (set GITHUB_PAT)'}`);
    console.log(`    AI Detection:  ${status.capabilities.aiDetection ? '✓' : '✗ (set SUPABASE_URL, VOYAGE_API_KEY)'}`);
    console.log(`    LLM Analysis:  ${status.capabilities.llmAnalysis ? `✓ (${status.llmProvider})` : '✗ (set GROQ_API_KEY or OPENAI_API_KEY)'}`);
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && maxAttempts > 0) {
      const nextPort = port + 1;
      console.log(`Port ${port} in use, trying ${nextPort}...`);
      startServer(nextPort, maxAttempts - 1);
    } else {
      console.error(`Failed to start server: ${err.message}`);
      process.exit(1);
    }
  });
}

// Start the server
startServer(Number(PORT));

export { handleScan, getServerStatus };
