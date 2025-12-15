import { Command } from 'commander';
import { RuleManager } from '../../rules/rule-manager';
import { createClient } from '../../db/supabase';
import { BUNDLED_RULES, getBundledRulesStats } from '../../policies/bundled-policies';
import { Severity, Platform } from '../../types';

export function registerRulesCommands(program: Command) {
  const rules = program.command('rules').description('Manage violation rules');

  const getRuleManager = () => new RuleManager(createClient());

  // List rules
  rules
    .command('list')
    .description('List all rules')
    .option('-p, --platform <platform>', 'Filter by platform')
    .option('-s, --severity <severity>', 'Filter by severity')
    .option('-c, --category <category>', 'Filter by category')
    .option('--enabled', 'Show only enabled rules')
    .option('--disabled', 'Show only disabled rules')
    .action(async (options) => {
      try {
        const manager = getRuleManager();
        const { data } = await manager.listRules({
          platform: options.platform as Platform,
          severity: options.severity as Severity,
          category: options.category,
          enabled: options.enabled ? true : options.disabled ? false : undefined,
        });

        if (!data || data.length === 0) {
          console.log('\n⚠️  No rules found\n');
          return;
        }

        console.log('\n📋 Violation Rules\n');
        console.log('━'.repeat(100));
        console.log(
          padRight('Code', 25) +
          padRight('Name', 30) +
          padRight('Platform', 12) +
          padRight('Severity', 10) +
          padRight('Enabled', 8)
        );
        console.log('━'.repeat(100));

        for (const rule of data) {
          const severityIcon = rule.severity === 'error' ? '❌' : rule.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
          const enabledIcon = rule.enabled ? '✅' : '❌';

          console.log(
            padRight(rule.rule_code, 25) +
            padRight(truncate(rule.name, 28), 30) +
            padRight(rule.platform, 12) +
            padRight(severityIcon + ' ' + rule.severity, 10) +
            enabledIcon
          );
        }

        console.log('━'.repeat(100));
        console.log(`Total: ${data.length} rules\n`);
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // Show rule details
  rules
    .command('show <rule-code>')
    .description('Show rule details')
    .action(async (ruleCode: string) => {
      try {
        const manager = getRuleManager();
        const rule = await manager.getRule(ruleCode.toUpperCase());

        console.log('\n' + '━'.repeat(60));
        console.log(`📜 ${rule.name}`);
        console.log('━'.repeat(60));
        console.log(`Code:        ${rule.rule_code}`);
        console.log(`Platform:    ${rule.platform}`);
        console.log(`Severity:    ${rule.severity}`);
        console.log(`Category:    ${rule.category}`);
        console.log(`Enabled:     ${rule.enabled ? 'Yes ✅' : 'No ❌'}`);
        console.log(`Built-in:    ${rule.is_builtin ? 'Yes' : 'No'}`);

        if (rule.description) {
          console.log(`\nDescription:\n  ${rule.description}`);
        }

        if (rule.recommendation) {
          console.log(`\n💡 Recommendation:\n  ${rule.recommendation}`);
        }

        if (rule.fix_example) {
          console.log(`\n📝 Example Fix:\n${rule.fix_example}`);
        }

        if (rule.doc_urls?.length) {
          console.log(`\n📚 Documentation:`);
          rule.doc_urls.forEach((url: string) => console.log(`  • ${url}`));
        }

        console.log(`\n🔍 Detection:`);
        console.log(`  Type: ${rule.detection.type}`);
        if (rule.detection.pattern) {
          console.log(`  Pattern: ${rule.detection.pattern}`);
        }

        console.log('━'.repeat(60) + '\n');
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // Enable rule
  rules
    .command('enable <rule-code>')
    .description('Enable a rule')
    .action(async (ruleCode: string) => {
      try {
        const manager = getRuleManager();
        await manager.toggleRule(ruleCode.toUpperCase(), true);
        console.log(`\n✅ Enabled: ${ruleCode.toUpperCase()}\n`);
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // Disable rule
  rules
    .command('disable <rule-code>')
    .description('Disable a rule')
    .action(async (ruleCode: string) => {
      try {
        const manager = getRuleManager();
        await manager.toggleRule(ruleCode.toUpperCase(), false);
        console.log(`\n⚠️  Disabled: ${ruleCode.toUpperCase()}\n`);
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // Import rules
  rules
    .command('import <file>')
    .description('Import rules from JSON file')
    .option('--overwrite', 'Overwrite existing rules')
    .action(async (file: string, options) => {
      try {
        const manager = getRuleManager();
        const results = await manager.importRules(file, { overwrite: options.overwrite });

        console.log('\n📥 Import Results:');
        console.log(`  ✅ Created: ${results.created}`);
        console.log(`  🔄 Updated: ${results.updated}`);
        console.log(`  ⏭️  Skipped: ${results.skipped}`);

        if (results.errors.length > 0) {
          console.log(`  ❌ Errors:`);
          results.errors.forEach(e => console.log(`     • ${e}`));
        }
        console.log('');
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // Export rules
  rules
    .command('export <file>')
    .description('Export rules to JSON file')
    .option('-p, --platform <platform>', 'Filter by platform')
    .option('-c, --category <category>', 'Filter by category')
    .action(async (file: string, options) => {
      try {
        const manager = getRuleManager();
        const count = await manager.exportRules(file, {
          platform: options.platform,
          category: options.category,
        });
        console.log(`\n✅ Exported ${count} rules to ${file}\n`);
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // Seed built-in rules
  rules
    .command('seed')
    .description('Seed built-in rules to database')
    .action(async () => {
      try {
        const manager = getRuleManager();
        const data = await manager.seedBuiltinRules();
        console.log(`\n✅ Seeded ${data.length} built-in rules\n`);
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // Statistics
  rules
    .command('stats')
    .description('Show rule statistics')
    .action(async () => {
      try {
        const manager = getRuleManager();
        const stats = await manager.getStatistics();

        if (!stats) {
          console.log('\n⚠️  No rules found\n');
          return;
        }

        console.log('\n📊 Rule Statistics\n');
        console.log('━'.repeat(40));
        console.log(`Total:    ${stats.total}`);
        console.log(`Enabled:  ${stats.enabled} ✅`);
        console.log(`Disabled: ${stats.disabled} ❌`);

        console.log('\nBy Platform:');
        Object.entries(stats.byPlatform).forEach(([platform, count]) => {
          console.log(`  ${platform}: ${count}`);
        });

        console.log('\nBy Severity:');
        Object.entries(stats.bySeverity).forEach(([severity, count]) => {
          const icon = severity === 'error' ? '❌' : severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
          console.log(`  ${icon} ${severity}: ${count}`);
        });

        console.log('\nBy Category:');
        Object.entries(stats.byCategory).forEach(([category, count]) => {
          console.log(`  ${category}: ${count}`);
        });

        console.log('━'.repeat(40) + '\n');
      } catch (error: unknown) {
        handleError(error);
      }
    });

  // Show bundled rules (works without database)
  rules
    .command('bundled')
    .description('Show bundled rules (no database required)')
    .option('-p, --platform <platform>', 'Filter by platform')
    .option('-s, --severity <severity>', 'Filter by severity')
    .action((options) => {
      let filteredRules = BUNDLED_RULES;

      if (options.platform) {
        filteredRules = filteredRules.filter(r =>
          r.platform === options.platform || r.platform === 'all'
        );
      }

      if (options.severity) {
        filteredRules = filteredRules.filter(r => r.severity === options.severity);
      }

      const stats = getBundledRulesStats();

      console.log('\n📦 Bundled Policy Rules (No Database Required)\n');
      console.log('━'.repeat(100));
      console.log(`These ${stats.total} rules are pre-packaged and work immediately without scraping or database setup.\n`);

      console.log(
        padRight('Code', 28) +
        padRight('Name', 35) +
        padRight('Platform', 12) +
        padRight('Severity', 10)
      );
      console.log('─'.repeat(100));

      for (const rule of filteredRules) {
        const severityIcon = rule.severity === 'error' ? '❌' : rule.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';

        console.log(
          padRight(rule.code, 28) +
          padRight(truncate(rule.name, 33), 35) +
          padRight(rule.platform, 12) +
          severityIcon + ' ' + rule.severity
        );
      }

      console.log('━'.repeat(100));
      console.log(`\n📊 Summary:`);
      console.log(`   Total: ${stats.total} rules`);

      console.log(`\n   By Platform:`);
      Object.entries(stats.byPlatform).forEach(([platform, count]) => {
        console.log(`     ${platform}: ${count}`);
      });

      console.log(`\n   By Severity:`);
      console.log(`     ❌ error: ${stats.bySeverity['error'] || 0}`);
      console.log(`     ⚠️  warning: ${stats.bySeverity['warning'] || 0}`);
      console.log(`     ℹ️  info: ${stats.bySeverity['info'] || 0}`);

      console.log('\n━'.repeat(100));
      console.log('💡 These rules are used automatically when scanning. No setup required!');
      console.log('━'.repeat(100) + '\n');
    });
}

function padRight(str: string, len: number): string {
  return str.padEnd(len);
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.substring(0, len - 2) + '..' : str;
}

function handleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n❌ Error: ${message}\n`);
  process.exit(1);
}
