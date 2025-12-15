import { execSync } from 'child_process';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { scanDirectory } from './local-scanner';
import { ScanOptions, ScanResult } from '../types';

export interface GitHubScanOptions extends ScanOptions {
  branch?: string;
  depth?: number;
  auth?: string;
  includeSubmodules?: boolean;
}

export async function scanGitHubRepo(
  repoUrl: string,
  options: GitHubScanOptions = {}
): Promise<ScanResult> {
  const parsed = parseGitHubUrl(repoUrl);

  if (!parsed) {
    throw new Error(
      `Invalid GitHub URL: ${repoUrl}\nExpected format: https://github.com/owner/repo`
    );
  }

  const { owner, repo } = parsed;
  const tempDir = mkdtempSync(join(tmpdir(), `meta-scan-${repo}-`));

  try {
    // Build git clone command
    const cloneOptions = [
      `--depth ${options.depth || 1}`,
      options.branch ? `-b ${options.branch}` : '',
      options.includeSubmodules ? '--recurse-submodules' : '',
    ].filter(Boolean).join(' ');

    // Build URL with auth if provided
    const cloneUrl = options.auth
      ? `https://${options.auth}@github.com/${owner}/${repo}.git`
      : `https://github.com/${owner}/${repo}.git`;

    const cloneCommand = `git clone ${cloneOptions} "${cloneUrl}" "${tempDir}"`;

    // Execute clone
    execSync(cloneCommand, {
      stdio: 'pipe',
      maxBuffer: 1024 * 1024 * 100,
    });

    // Get commit info
    let commitHash = '';
    let commitDate = '';

    try {
      commitHash = execSync('git rev-parse HEAD', {
        cwd: tempDir,
        encoding: 'utf-8',
      }).trim();

      commitDate = execSync('git log -1 --format=%ci', {
        cwd: tempDir,
        encoding: 'utf-8',
      }).trim();
    } catch {
      // Ignore git info errors
    }

    // Scan the cloned repo
    const result = await scanDirectory(tempDir, {
      ...options,
      source: {
        type: 'github',
        url: repoUrl,
        owner,
        repo,
        branch: options.branch || 'main',
        commit: commitHash,
        commitDate,
      },
    });

    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('could not read Username') || message.includes('Authentication failed')) {
      throw new Error(
        `Repository is private or authentication failed.\n` +
        `Provide a GitHub Personal Access Token with --auth flag for private repos.`
      );
    }

    if (message.includes('not found') || message.includes('does not exist')) {
      throw new Error(`Repository not found: ${owner}/${repo}`);
    }

    if (message.includes('Could not find remote branch')) {
      throw new Error(`Branch not found: ${options.branch}`);
    }

    throw new Error(`Failed to clone repository: ${message}`);
  } finally {
    // Cleanup temp directory
    if (existsSync(tempDir)) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

export function isGitHubUrl(path: string): boolean {
  return /^https?:\/\/(www\.)?github\.com\//.test(path);
}

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/\s?#]+)/);
  if (!match) return null;

  const [, owner, repo] = match;
  return { owner, repo: repo.replace(/\.git$/, '') };
}
