/**
 * Simple API server for the web UI
 *
 * Endpoints:
 * - POST /api/scan - Scan a GitHub repository
 * - GET /health - Health check
 */

import { createServer } from 'http';
import { parse } from 'url';
import { scanGitHubRepo } from '../scanner/github-scanner';
import { scanGitHubRepoViaApi } from '../scanner/github-api-scanner';

const PORT = process.env.PORT || 3001;

// CORS headers for local development
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface ScanRequest {
  url: string;
  branch?: string;
  useApi?: boolean;
  enableAI?: boolean;
}

async function handleScan(body: ScanRequest): Promise<object> {
  const { url, branch, useApi, enableAI } = body;

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

  // Prefer API mode if PAT is available, otherwise use git clone
  const githubPat = process.env.GITHUB_PAT;
  const shouldUseApi = useApi ?? !!githubPat;

  let result;

  if (shouldUseApi && githubPat) {
    console.log(`Scanning ${owner}/${repo} via GitHub API${enableAI ? ' (AI enabled)' : ''}...`);
    result = await scanGitHubRepoViaApi(url, {
      branch,
      token: githubPat,
      enableAI,
      onProgress: (msg) => console.log(msg),
    });
  } else {
    console.log(`Scanning ${owner}/${repo} via git clone...`);
    result = await scanGitHubRepo(url, {
      branch,
      auth: githubPat,
      depth: 1,
    });
  }

  return result;
}

const server = createServer(async (req, res) => {
  const { pathname } = parse(req.url || '', true);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // Health check
  if (pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Scan endpoint
  if (pathname === '/api/scan' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body) as ScanRequest;
        const result = await handleScan(data);
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Scan error:', message);
        res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
      }
    });
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
  res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`\nMeta Policy Scanner API Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Web UI:    http://localhost:${PORT}/`);
  console.log(`API:       http://localhost:${PORT}/api/scan`);
  console.log(`Health:    http://localhost:${PORT}/health`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});

export { handleScan };
