import { Command } from 'commander';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const ENV_TEMPLATE = `# Meta Policy Scanner Configuration

# Supabase (Required for rule management and docs)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# GitHub (Optional - for private repo scanning)
GITHUB_PAT=your-github-personal-access-token

# Firecrawl (Optional - for documentation scraping)
FIRECRAWL_API_KEY=your-firecrawl-key

# OpenAI (Optional - for embeddings and AI features)
OPENAI_API_KEY=your-openai-key
`;

const CONFIG_TEMPLATE = {
  ignore: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/vendor/**',
  ],
  severity: 'warning',
  platforms: ['all'],
  includeSdkAnalysis: true,
  outputFormat: 'console',
};

export function registerInitCommand(program: Command) {
  program
    .command('init')
    .description('Initialize configuration files')
    .option('--force', 'Overwrite existing files')
    .action(async (options) => {
      const cwd = process.cwd();

      console.log('\n🚀 Initializing Meta Policy Scanner\n');

      // Create .env file
      const envPath = join(cwd, '.env');
      if (!existsSync(envPath) || options.force) {
        writeFileSync(envPath, ENV_TEMPLATE);
        console.log('✅ Created .env file');
      } else {
        console.log('⏭️  .env already exists (use --force to overwrite)');
      }

      // Create config file
      const configPath = join(cwd, 'meta-scan.config.json');
      if (!existsSync(configPath) || options.force) {
        writeFileSync(configPath, JSON.stringify(CONFIG_TEMPLATE, null, 2));
        console.log('✅ Created meta-scan.config.json');
      } else {
        console.log('⏭️  meta-scan.config.json already exists (use --force to overwrite)');
      }

      // Update .gitignore
      const gitignorePath = join(cwd, '.gitignore');
      if (existsSync(gitignorePath)) {
        const content = readFileSync(gitignorePath, 'utf-8');
        if (!content.includes('.env')) {
          writeFileSync(gitignorePath, content + '\n.env\n');
          console.log('✅ Added .env to .gitignore');
        }
      }

      console.log('\n📋 Next Steps:\n');
      console.log('1. Edit .env and add your API keys:');
      console.log('   - SUPABASE_URL and SUPABASE_ANON_KEY (required for rules)');
      console.log('   - GITHUB_PAT (for private repos)');
      console.log('');
      console.log('2. Run your first scan:');
      console.log('   meta-scan scan ./your-project');
      console.log('   meta-scan scan https://github.com/user/repo');
      console.log('');
      console.log('3. Seed the built-in rules:');
      console.log('   meta-scan rules seed');
      console.log('');
      console.log('📚 Documentation: https://github.com/your-org/meta-policy-scanner\n');
    });
}
