import { Command } from 'commander';
import { writeFileSync } from 'fs';
import { isGitHubUrl, scanGitHubRepo } from '../../scanner/github-scanner';
import { scanGitHubRepoViaApi } from '../../scanner/github-api-scanner';
import { scanDirectory } from '../../scanner/local-scanner';
import { ScanResult, Severity } from '../../types';

export function registerScanCommand(program: Command) {
  program
    .command('scan <path-or-url>')
    .description('Scan local directory or GitHub repository for Meta API policy violations')
    .option('-b, --branch <branch>', 'Git branch to scan (for GitHub repos)')
    .option('--depth <number>', 'Clone depth for GitHub repos', '1')
    .option('--auth <token>', 'GitHub PAT for private repos (or use GITHUB_PAT env var)')
    .option('-p, --platform <platform>', 'Filter by platform (facebook|instagram|messenger|whatsapp|ads|all)')
    .option('-s, --severity <severity>', 'Minimum severity to report (error|warning|info)', 'warning')
    .option('-f, --format <format>', 'Output format (console|json)', 'console')
    .option('-o, --output <file>', 'Output file path for JSON results')
    .option('--ignore <patterns>', 'Glob patterns to ignore (comma-separated)')
    .option('--no-sdk-analysis', 'Skip SDK usage analysis')
    .option('--api', 'Force GitHub API mode (default when PAT available)')
    .option('--clone', 'Force git clone mode (even if PAT available)')
    .option('--max-files <number>', 'Max files to scan (API mode)', '500')
    .option('--ai', 'Enable AI-powered detection (requires SUPABASE_URL, SUPABASE_ANON_KEY, VOYAGE_API_KEY)')
    .action(async (pathOrUrl: string, options) => {
      try {
        let result: ScanResult;

        console.log('\n🔍 Meta API Policy Scanner\n');

        if (isGitHubUrl(pathOrUrl)) {
          console.log(`Scanning GitHub repository: ${pathOrUrl}`);
          if (options.branch) {
            console.log(`Branch: ${options.branch}`);
          }

          const token = options.auth || process.env.GITHUB_PAT;

          // Auto-select mode: prefer API when PAT available, unless --clone specified
          const useApiMode = options.clone ? false : (options.api || !!token);

          if (useApiMode && token) {
            // Use GitHub API (faster, no download)
            console.log('Mode: GitHub API (no download)');
            if (options.ai) {
              console.log('AI Detection: Enabled\n');
            } else {
              console.log('');
            }
            result = await scanGitHubRepoViaApi(pathOrUrl, {
              branch: options.branch,
              token,
              maxFiles: parseInt(options.maxFiles),
              excludePatterns: options.ignore?.split(','),
              enableAI: options.ai,
              onProgress: (msg) => console.log(msg),
            });
          } else {
            // Fallback: Clone repo to temp directory
            console.log('Mode: git clone (shallow, cleaned after scan)\n');
            result = await scanGitHubRepo(pathOrUrl, {
              branch: options.branch,
              depth: parseInt(options.depth),
              auth: token,
              platform: options.platform,
              severity: options.severity as Severity,
              ignorePatterns: options.ignore?.split(','),
              includeSdkAnalysis: options.sdkAnalysis !== false,
            });
          }
        } else {
          console.log(`Scanning local directory: ${pathOrUrl}\n`);

          result = await scanDirectory(pathOrUrl, {
            platform: options.platform,
            severity: options.severity as Severity,
            ignorePatterns: options.ignore?.split(','),
            includeSdkAnalysis: options.sdkAnalysis !== false,
          });
        }

        if (options.format === 'json') {
          const output = JSON.stringify(result, null, 2);
          if (options.output) {
            writeFileSync(options.output, output);
            console.log(`✓ Results written to ${options.output}`);
          } else {
            console.log(output);
          }
        } else {
          displayResults(result);
        }

        // Exit with error code if critical violations found
        if (result.summary.errors > 0) {
          process.exit(1);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`\n✗ Error: ${message}\n`);
        process.exit(1);
      }
    });
}

function displayResults(result: ScanResult) {
  const { summary, violations, sdkAnalysis, filesScanned, scanDuration } = result;

  // Summary
  console.log('━'.repeat(60));
  console.log('📊 SCAN SUMMARY');
  console.log('━'.repeat(60));
  console.log(`Files scanned:    ${filesScanned}`);
  console.log(`Scan duration:    ${(scanDuration / 1000).toFixed(2)}s`);
  console.log(`Total violations: ${violations.length}`);
  console.log('');
  console.log(`  ❌ Errors:   ${summary.errors}`);
  console.log(`  ⚠️  Warnings: ${summary.warnings}`);
  console.log(`  ℹ️  Info:     ${summary.info}`);

  // SDK Analysis
  if (sdkAnalysis) {
    console.log('\n━'.repeat(60));
    console.log('🔧 SDK ANALYSIS');
    console.log('━'.repeat(60));

    if (sdkAnalysis.official.length > 0) {
      console.log(`\n✅ Official SDKs (${sdkAnalysis.official.length}):`);
      const unique = [...new Set(sdkAnalysis.official.map(s => s.sdk))];
      unique.forEach(sdk => console.log(`   • ${sdk}`));
    }

    if (sdkAnalysis.wrappers.length > 0) {
      console.log(`\n⚡ Wrapper Libraries (${sdkAnalysis.wrappers.length}):`);
      const unique = [...new Set(sdkAnalysis.wrappers.map(s => s.sdk))];
      unique.forEach(sdk => console.log(`   • ${sdk}`));
    }

    if (sdkAnalysis.directApi.length > 0) {
      console.log(`\n🔗 Direct API Calls: ${sdkAnalysis.directApi.length}`);
    }

    if (sdkAnalysis.violations.length > 0) {
      console.log(`\n❌ SDK Violations (${sdkAnalysis.violations.length}):`);
      const unique = [...new Set(sdkAnalysis.violations.map(s => s.sdk))];
      unique.forEach(sdk => console.log(`   • ${sdk}`));
    }
  }

  // Violations
  if (violations.length > 0) {
    console.log('\n━'.repeat(60));
    console.log('⚠️  VIOLATIONS');
    console.log('━'.repeat(60));

    // Group by severity
    const errors = violations.filter(v => v.severity === 'error');
    const warnings = violations.filter(v => v.severity === 'warning');
    const infos = violations.filter(v => v.severity === 'info');

    if (errors.length > 0) {
      console.log('\n❌ ERRORS:\n');
      errors.forEach(v => displayViolation(v));
    }

    if (warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:\n');
      warnings.forEach(v => displayViolation(v));
    }

    if (infos.length > 0) {
      console.log('\nℹ️  INFO:\n');
      infos.forEach(v => displayViolation(v));
    }
  } else {
    console.log('\n✅ No violations found!');
  }

  console.log('\n' + '━'.repeat(60));

  // Final verdict
  if (summary.errors > 0) {
    console.log('❌ FAILED: Critical policy violations detected');
  } else if (summary.warnings > 0) {
    console.log('⚠️  PASSED with warnings');
  } else {
    console.log('✅ PASSED: No policy violations');
  }

  console.log('━'.repeat(60) + '\n');
}

function displayViolation(v: {
  ruleName: string;
  ruleCode: string;
  file: string;
  line: number;
  message: string;
  codeSnippet: string;
  recommendation?: string;
}) {
  console.log(`  ${v.ruleName} [${v.ruleCode}]`);
  console.log(`  📁 ${v.file}:${v.line}`);
  console.log(`  📝 ${v.message}`);

  if (v.codeSnippet) {
    console.log(`  📄 ${v.codeSnippet.substring(0, 80)}${v.codeSnippet.length > 80 ? '...' : ''}`);
  }

  if (v.recommendation) {
    console.log(`  💡 ${v.recommendation}`);
  }

  console.log('');
}
