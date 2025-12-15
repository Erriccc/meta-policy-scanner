#!/usr/bin/env node

import { Command } from 'commander';
import { config } from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load environment variables
config();

// Load local config if exists
const configPath = join(process.cwd(), 'meta-scan.config.json');
if (existsSync(configPath)) {
  try {
    JSON.parse(readFileSync(configPath, 'utf-8'));
    // Config loaded - could apply defaults here in future
  } catch {
    // Ignore config parse errors
  }
}

import {
  registerScanCommand,
  registerRulesCommands,
  registerDocsCommands,
  registerInitCommand,
} from '../cli/commands';

const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8')
);

const program = new Command();

program
  .name('meta-scan')
  .description('Scan codebases for Meta API policy violations')
  .version(packageJson.version);

// Register commands
registerScanCommand(program);
registerRulesCommands(program);
registerDocsCommands(program);
registerInitCommand(program);

// Add examples to help
program.addHelpText('after', `

Examples:
  $ meta-scan scan ./my-project                    Scan local directory
  $ meta-scan scan https://github.com/user/repo   Scan GitHub repository
  $ meta-scan scan . --platform=instagram         Scan for Instagram-specific issues
  $ meta-scan scan . --severity=error             Only show errors
  $ meta-scan scan . --format=json -o results.json Export results to JSON

  $ meta-scan rules list                          List all rules
  $ meta-scan rules show RATE_LIMIT_MISSING       Show rule details
  $ meta-scan rules seed                          Seed built-in rules

  $ meta-scan init                                Initialize configuration

Documentation: https://github.com/your-org/meta-policy-scanner
`);

program.parse();
