import { Command } from 'commander';
import { existsSync } from 'fs';
import { createClient } from '../../db/supabase';
import { DocScraper } from '../../scraper/doc-scraper';
import { JinaReaderScraper } from '../../scraper/jina-reader';
import { searchBundledDocs, getAllBundledDocs } from '../../policies/bundled-docs';
import { getProviderInfo, type EmbeddingProviderType, type EmbeddingConfig } from '../../embeddings';

/**
 * Get embedding config from environment and options
 */
function getEmbeddingConfig(providerOption?: string): EmbeddingConfig {
  // Check for provider override or use environment
  const provider = (providerOption || process.env.EMBEDDING_PROVIDER || 'voyage') as EmbeddingProviderType;

  switch (provider) {
    case 'voyage':
      const voyageKey = process.env.VOYAGE_API_KEY;
      if (!voyageKey) {
        throw new Error(
          'VOYAGE_API_KEY not set. Get a FREE key at: https://dash.voyageai.com/\n' +
          '   Add to .env: VOYAGE_API_KEY=your-key\n' +
          '   FREE tier: 200 million tokens!'
        );
      }
      return { provider: 'voyage', apiKey: voyageKey };

    case 'huggingface':
      const hfToken = process.env.HF_TOKEN;
      if (!hfToken) {
        throw new Error(
          'HF_TOKEN not set. Get a FREE token at: https://huggingface.co/settings/tokens\n' +
          '   Add to .env: HF_TOKEN=hf_your-token'
        );
      }
      return { provider: 'huggingface', apiKey: hfToken };

    case 'openai':
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        throw new Error(
          'OPENAI_API_KEY not set. Get an API key at: https://platform.openai.com\n' +
          '   Add to .env: OPENAI_API_KEY=your-key'
        );
      }
      return { provider: 'openai', apiKey: openaiKey };

    default:
      throw new Error(`Unknown embedding provider: ${provider}`);
  }
}

export function registerDocsCommands(program: Command) {
  const docs = program.command('docs').description('Manage policy documentation');

  // Update documentation - REAL IMPLEMENTATION
  docs
    .command('update')
    .description('Scrape Meta API docs and create embeddings')
    .option('--platform <platform>', 'Only update specific platform')
    .action(async () => {
      try {
        const firecrawlKey = process.env.FIRECRAWL_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY;

        if (!firecrawlKey) {
          console.log('\n❌ FIRECRAWL_API_KEY not set');
          console.log('   Get an API key at: https://firecrawl.dev');
          console.log('   Add to .env: FIRECRAWL_API_KEY=your-key\n');
          return;
        }

        if (!openaiKey) {
          console.log('\n❌ OPENAI_API_KEY not set');
          console.log('   Get an API key at: https://platform.openai.com');
          console.log('   Add to .env: OPENAI_API_KEY=your-key\n');
          return;
        }

        console.log('\n📚 Scraping Meta API Documentation\n');
        console.log('This will:');
        console.log('  1. Scrape Meta developer docs using Firecrawl');
        console.log('  2. Chunk content into searchable pieces');
        console.log('  3. Generate embeddings using OpenAI');
        console.log('  4. Store in Supabase for vector search\n');
        console.log('━'.repeat(50));

        const supabase = createClient();
        const scraper = new DocScraper(supabase, firecrawlKey, openaiKey, {
          onProgress: (msg) => console.log(msg),
        });

        const results = await scraper.updateAllDocs();

        console.log('\n━'.repeat(50));
        console.log('📊 Results:');
        console.log(`   ✅ Successfully scraped: ${results.success} sources`);
        console.log(`   ❌ Failed: ${results.failed} sources`);
        console.log(`   📄 Total chunks created: ${results.chunks}`);
        console.log('━'.repeat(50) + '\n');

      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('relation') && message.includes('does not exist')) {
          console.log('\n❌ Database tables not found!');
          console.log('   Run the schema first:');
          console.log('   1. Go to your Supabase project');
          console.log('   2. Open SQL Editor');
          console.log('   3. Run: src/db/schema.sql\n');
        } else {
          console.error(`\n❌ Error: ${message}\n`);
        }
      }
    });

  // Search documentation
  docs
    .command('search <query>')
    .description('Search policy documentation (bundled + scraped)')
    .option('-n, --limit <number>', 'Number of results', '5')
    .option('--bundled-only', 'Only search bundled docs (no database)')
    .option('--provider <provider>', 'Embedding provider: voyage (default), huggingface, openai')
    .action(async (query: string, options) => {
      try {
        console.log(`\n🔍 Searching for: "${query}"\n`);

        // Try semantic search with configurable provider
        if (!options.bundledOnly) {
          try {
            const embeddingConfig = getEmbeddingConfig(options.provider);
            const supabase = createClient();
            const scraper = new JinaReaderScraper(supabase, {
              embeddingConfig,
            });
            const results = await scraper.searchDocs(query, parseInt(options.limit));

            if (results.length > 0) {
              console.log('📊 Semantic Search Results (from scraped docs):\n');
              console.log('━'.repeat(60));
              for (let i = 0; i < results.length; i++) {
                const result = results[i];
                console.log(`\n📄 Result ${i + 1} (${(result.similarity * 100).toFixed(1)}% match)`);
                if (result.policy_url) {
                  console.log(`   Source: ${result.policy_url}`);
                }
                const preview = result.chunk_text.substring(0, 400);
                console.log(`   ${preview}${result.chunk_text.length > 400 ? '...' : ''}\n`);
              }
              console.log('━'.repeat(60) + '\n');
              return;
            }
          } catch (err) {
            // Log error and fall through to bundled search
            const errMsg = err instanceof Error ? err.message : String(err);
            if (!errMsg.includes('not set')) {
              console.log(`⚠️  Semantic search unavailable: ${errMsg}\n`);
            }
          }
        }

        // Fallback to bundled docs keyword search
        console.log('📦 Keyword Search Results (from bundled docs):\n');
        const bundledResults = searchBundledDocs(query, parseInt(options.limit));

        if (bundledResults.length === 0) {
          console.log('No matching documentation found.');
          console.log('Try different search terms or run "meta-scan docs update" to scrape more docs.\n');
          return;
        }

        console.log('━'.repeat(60));
        for (let i = 0; i < bundledResults.length; i++) {
          const { doc, matchedText } = bundledResults[i];
          console.log(`\n📄 Result ${i + 1}: ${doc.title}`);
          console.log(`   Platform: ${doc.platform}`);
          console.log(`   Source: ${doc.url}`);
          console.log('');
          console.log(`   ...${matchedText.trim()}...`);
          console.log('');
        }
        console.log('━'.repeat(60));
        console.log('\n💡 Tip: Add more docs with "meta-scan docs add <url>" for semantic search\n');

      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`\n❌ Error: ${message}\n`);
      }
    });

  // List bundled docs
  docs
    .command('bundled')
    .description('Show bundled documentation (works offline)')
    .option('-p, --platform <platform>', 'Filter by platform')
    .action((options) => {
      let docs = getAllBundledDocs();

      if (options.platform) {
        docs = docs.filter(d => d.platform === options.platform || d.platform === 'all');
      }

      console.log('\n📦 Bundled Policy Documentation\n');
      console.log('━'.repeat(80));
      console.log('These docs are pre-packaged and work without Firecrawl or database setup.\n');

      for (const doc of docs) {
        console.log(`📄 ${doc.title}`);
        console.log(`   Platform: ${doc.platform}`);
        console.log(`   URL: ${doc.url}`);
        console.log(`   Content: ${doc.content.length} characters`);
        console.log('');
      }

      console.log('━'.repeat(80));
      console.log(`Total: ${docs.length} bundled documents`);
      console.log('\n💡 Search with: meta-scan docs search "rate limiting"');
      console.log('━'.repeat(80) + '\n');
    });

  // Show status
  docs
    .command('status')
    .description('Show documentation index status')
    .action(async () => {
      try {
        const supabase = createClient();

        const { data: policies, error: policiesError } = await supabase
          .from('policies')
          .select('id, title, url, last_scraped, platform_id')
          .order('last_scraped', { ascending: false });

        if (policiesError) throw policiesError;

        const { count: chunkCount } = await supabase
          .from('policy_chunks')
          .select('id', { count: 'exact', head: true });

        const { data: platforms } = await supabase
          .from('platforms')
          .select('id, name');

        console.log('\n📚 Documentation Index Status\n');
        console.log('━'.repeat(50));
        console.log(`Total Policies:  ${policies?.length || 0} documents`);
        console.log(`Total Chunks:    ${chunkCount || 0} searchable chunks`);

        if (policies && policies.length > 0) {
          const lastUpdate = policies[0].last_scraped;
          console.log(`Last Updated:    ${lastUpdate ? new Date(lastUpdate).toLocaleString() : 'Never'}`);

          // Group by platform
          const platformMap = new Map(platforms?.map(p => [p.id, p.name]) || []);
          const byPlatform: Record<string, number> = {};
          for (const policy of policies) {
            const name = platformMap.get(policy.platform_id) || 'unknown';
            byPlatform[name] = (byPlatform[name] || 0) + 1;
          }

          console.log('\nBy Platform:');
          for (const [platform, count] of Object.entries(byPlatform)) {
            console.log(`  ${platform}: ${count} docs`);
          }
        } else {
          console.log(`Last Updated:    Never`);
        }

        console.log('━'.repeat(50));

        if (!policies || policies.length === 0) {
          console.log('\n⚠️  No documentation indexed yet.');
          console.log('Run: meta-scan docs update\n');
        } else {
          console.log('\n✅ Documentation is indexed and searchable.');
          console.log('Try: meta-scan docs search "rate limiting"\n');
        }

      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('relation') && message.includes('does not exist')) {
          console.log('\n❌ Database tables not found!');
          console.log('   Set up your database first:');
          console.log('   1. Create a Supabase project at https://supabase.com');
          console.log('   2. Run src/db/schema.sql in SQL Editor');
          console.log('   3. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env\n');
        } else {
          console.error(`\n❌ Error: ${message}\n`);
        }
      }
    });

  // List documentation sources with detailed info
  docs
    .command('list')
    .description('List all indexed policies with URLs, chunk counts, and last updated')
    .option('--format <format>', 'Output format: table (default) or json', 'table')
    .action(async (options) => {
      try {
        const supabase = createClient();

        // Get all policies with their chunk counts
        const { data: policies, error } = await supabase
          .from('policies')
          .select(`
            id,
            title,
            url,
            last_scraped,
            platforms (name)
          `)
          .order('last_scraped', { ascending: false });

        if (error) throw error;

        if (!policies || policies.length === 0) {
          console.log('\n⚠️  No documentation indexed yet.');
          console.log('Run: meta-scan docs add <url> or meta-scan docs ingest <file>\n');
          return;
        }

        // Get chunk counts for each policy
        const { data: chunkCounts } = await supabase
          .from('policy_chunks')
          .select('policy_id')
          .then(({ data, error }) => {
            if (error) return { data: null };
            const counts = new Map<number, number>();
            for (const chunk of data || []) {
              counts.set(chunk.policy_id, (counts.get(chunk.policy_id) || 0) + 1);
            }
            return { data: counts };
          });

        // Format output
        if (options.format === 'json') {
          const output = policies.map(policy => {
            const platformData = policy.platforms as unknown as { name: string } | null;
            return {
              id: policy.id,
              title: policy.title || 'Untitled',
              url: policy.url,
              platform: platformData?.name || 'unknown',
              chunks: chunkCounts?.get(policy.id) || 0,
              lastScraped: policy.last_scraped || null
            };
          });
          console.log(JSON.stringify(output, null, 2));
          return;
        }

        // Table format (default)
        console.log('\n📚 Indexed Documentation\n');
        console.log('━'.repeat(100));
        console.log(
          'ID'.padEnd(6) +
          'Title'.padEnd(35) +
          'Chunks'.padEnd(10) +
          'Last Updated'.padEnd(20) +
          'URL'
        );
        console.log('━'.repeat(100));

        for (const policy of policies) {
          const date = policy.last_scraped
            ? new Date(policy.last_scraped).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })
            : 'Never';

          const title = (policy.title || 'Untitled').substring(0, 33);
          const titleDisplay = title.length < (policy.title || 'Untitled').length
            ? title + '...'
            : title;

          const chunks = chunkCounts?.get(policy.id) || 0;

          console.log(
            String(policy.id).padEnd(6) +
            titleDisplay.padEnd(35) +
            String(chunks).padEnd(10) +
            date.padEnd(20) +
            policy.url
          );
        }

        console.log('━'.repeat(100));

        const totalChunks = Array.from(chunkCounts?.values() || [])
          .reduce((sum, count) => sum + count, 0);

        console.log(`\n📊 Summary:`);
        console.log(`   Total policies: ${policies.length}`);
        console.log(`   Total chunks: ${totalChunks}`);
        console.log(`   Average chunks per policy: ${Math.round(totalChunks / policies.length)}`);
        console.log('\n💡 Use "meta-scan docs delete <id-or-url>" to remove a policy');
        console.log('💡 Use "meta-scan docs verify" to check index integrity\n');

      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('relation') && message.includes('does not exist')) {
          console.log('\n❌ Database not set up. Run schema.sql first.\n');
        } else {
          console.error(`\n❌ Error: ${message}\n`);
        }
      }
    });

  // ============================================
  // NEW: Jina Reader based commands (FREE!)
  // ============================================

  // List available embedding providers
  docs
    .command('providers')
    .description('List available embedding providers')
    .action(() => {
      console.log('\n🔌 Available Embedding Providers\n');
      console.log('━'.repeat(60));

      for (const info of getProviderInfo()) {
        const freeTag = info.free ? '✅ FREE' : '💰 PAID';
        console.log(`\n  ${info.provider.toUpperCase()} (${freeTag})`);
        console.log(`    ${info.description}`);
        console.log(`    Dimensions: ${info.dimensions}`);
      }

      console.log('\n━'.repeat(60));
      console.log('\n📋 Configuration:');
      console.log('   Set via environment: EMBEDDING_PROVIDER=voyage|huggingface|openai');
      console.log('   Or use --provider flag on commands');
      console.log('\n💡 Recommended: Voyage AI (FREE 200M tokens!)');
      console.log('   Get key at: https://dash.voyageai.com/');
      console.log('━'.repeat(60) + '\n');
    });

  // Ingest URLs from file
  docs
    .command('ingest <file>')
    .description('Ingest URLs from file (one URL per line) using Jina Reader (FREE)')
    .option('-p, --platform <platform>', 'Override platform detection')
    .option('--provider <provider>', 'Embedding provider: voyage (default), huggingface, openai')
    .action(async (file: string, options) => {
      try {
        const embeddingConfig = getEmbeddingConfig(options.provider);

        if (!existsSync(file)) {
          console.log(`\n❌ File not found: ${file}\n`);
          return;
        }

        console.log('\n📚 Ingesting URLs via Jina Reader (FREE)\n');
        console.log(`Pipeline: URL → Jina Reader → Chunk → ${embeddingConfig.provider.toUpperCase()} Embed → Supabase\n`);
        console.log('━'.repeat(60));

        const supabase = createClient();
        const scraper = new JinaReaderScraper(supabase, {
          embeddingConfig,
          onProgress: (msg) => console.log(msg),
        });

        const results = await scraper.ingestFromFile(file, {
          platform: options.platform,
        });

        // Summary
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        const totalChunks = successful.reduce((sum, r) => sum + r.chunksCreated, 0);

        console.log('\n' + '━'.repeat(60));
        console.log('📊 Ingestion Results:\n');
        console.log(`   ✅ Successful: ${successful.length} URLs`);
        console.log(`   ❌ Failed: ${failed.length} URLs`);
        console.log(`   📄 Chunks created: ${totalChunks}`);

        if (failed.length > 0) {
          console.log('\n   Failed URLs:');
          for (const f of failed) {
            console.log(`     • ${f.url}: ${f.error}`);
          }
        }

        console.log('\n━'.repeat(60));
        console.log('✅ Done! Search with: meta-scan docs search "your query"');
        console.log('━'.repeat(60) + '\n');

      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('relation') && message.includes('does not exist')) {
          console.log('\n❌ Database tables not found!');
          console.log('   Run the schema first:');
          console.log('   1. Go to your Supabase project');
          console.log('   2. Open SQL Editor');
          console.log('   3. Run: src/db/schema.sql\n');
        } else {
          console.error(`\n❌ Error: ${message}\n`);
        }
      }
    });

  // Add single URL
  docs
    .command('add <url>')
    .description('Add a single URL to the index using Jina Reader (FREE)')
    .option('-p, --platform <platform>', 'Override platform detection')
    .option('--provider <provider>', 'Embedding provider: voyage (default), huggingface, openai')
    .action(async (url: string, options) => {
      try {
        const embeddingConfig = getEmbeddingConfig(options.provider);

        // Validate URL
        try {
          new URL(url);
        } catch {
          console.log(`\n❌ Invalid URL: ${url}\n`);
          return;
        }

        console.log('\n📚 Adding URL via Jina Reader (FREE)\n');
        console.log(`Using ${embeddingConfig.provider.toUpperCase()} embeddings`);
        console.log('━'.repeat(60));

        const supabase = createClient();
        const scraper = new JinaReaderScraper(supabase, {
          embeddingConfig,
          onProgress: (msg) => console.log(msg),
        });

        const result = await scraper.ingestUrl(url, {
          platform: options.platform,
        });

        console.log('\n' + '━'.repeat(60));

        if (result.success) {
          console.log(`✅ Successfully added: ${url}`);
          console.log(`   Chunks created: ${result.chunksCreated}`);
          console.log('\n💡 Search with: meta-scan docs search "your query"');
        } else {
          console.log(`❌ Failed to add: ${url}`);
          console.log(`   Error: ${result.error}`);
        }

        console.log('━'.repeat(60) + '\n');

      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('relation') && message.includes('does not exist')) {
          console.log('\n❌ Database tables not found! Run schema.sql first.\n');
        } else {
          console.error(`\n❌ Error: ${message}\n`);
        }
      }
    });

  // Create sample URLs file
  docs
    .command('init-urls')
    .description('Create a sample urls.txt file with Meta API documentation URLs')
    .action(async () => {
      const fs = await import('fs');
      const sampleUrls = `# Meta API Policy Documentation URLs
# One URL per line, lines starting with # are comments
# Run: meta-scan docs ingest urls.txt

# Core Platform Terms
https://developers.facebook.com/terms/
https://developers.facebook.com/docs/development/release/data-deletion/

# Graph API
https://developers.facebook.com/docs/graph-api/overview/rate-limiting/
https://developers.facebook.com/docs/graph-api/overview/
https://developers.facebook.com/docs/graph-api/reference/

# Instagram API
https://developers.facebook.com/docs/instagram-api/
https://developers.facebook.com/docs/instagram-api/overview/
https://developers.facebook.com/docs/instagram-api/getting-started/

# Messenger Platform
https://developers.facebook.com/docs/messenger-platform/
https://developers.facebook.com/docs/messenger-platform/policy/
https://developers.facebook.com/docs/messenger-platform/send-messages/message-tags/

# WhatsApp Business
https://developers.facebook.com/docs/whatsapp/
https://developers.facebook.com/docs/whatsapp/cloud-api/
https://developers.facebook.com/docs/whatsapp/on-premises/

# Marketing API
https://developers.facebook.com/docs/marketing-apis/
https://developers.facebook.com/docs/marketing-api/overview/

# Login & Security
https://developers.facebook.com/docs/facebook-login/security/
https://developers.facebook.com/docs/facebook-login/guides/access-tokens/
`;

      const filename = 'urls.txt';

      if (existsSync(filename)) {
        console.log(`\n⚠️  ${filename} already exists. Not overwriting.\n`);
        return;
      }

      fs.writeFileSync(filename, sampleUrls);
      console.log(`\n✅ Created ${filename} with sample Meta API documentation URLs`);
      console.log('\nNext steps:');
      console.log('  1. Edit urls.txt to add/remove URLs');
      console.log('  2. Run: node dist/bin/cli.js docs ingest urls.txt');
      console.log('  3. Search: node dist/bin/cli.js docs search "rate limiting"\n');
    });

  // ============================================
  // DOCS MANAGEMENT COMMANDS
  // ============================================

  // Delete a specific policy
  docs
    .command('delete <url-or-id>')
    .description('Delete a specific policy and its chunks')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (urlOrId: string, options) => {
      try {
        const supabase = createClient();

        // Try to find the policy by URL or ID
        let policyQuery = supabase
          .from('policies')
          .select('id, title, url');

        // Check if it's a numeric ID or URL
        const isNumeric = /^\d+$/.test(urlOrId);
        if (isNumeric) {
          policyQuery = policyQuery.eq('id', parseInt(urlOrId));
        } else {
          policyQuery = policyQuery.eq('url', urlOrId);
        }

        const { data: policies, error: findError } = await policyQuery;

        if (findError) throw findError;

        if (!policies || policies.length === 0) {
          console.log(`\n❌ No policy found with ${isNumeric ? 'ID' : 'URL'}: ${urlOrId}\n`);
          console.log('💡 Use "meta-scan docs list" to see all indexed policies\n');
          return;
        }

        const policy = policies[0];

        // Get chunk count
        const { count: chunkCount } = await supabase
          .from('policy_chunks')
          .select('id', { count: 'exact', head: true })
          .eq('policy_id', policy.id);

        console.log('\n📄 Policy to delete:\n');
        console.log('━'.repeat(60));
        console.log(`   Title: ${policy.title}`);
        console.log(`   URL: ${policy.url}`);
        console.log(`   Chunks: ${chunkCount || 0}`);
        console.log('━'.repeat(60));

        // Confirmation prompt (unless --yes flag)
        if (!options.yes) {
          const readline = await import('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question('\n⚠️  Are you sure you want to delete this policy? (yes/no): ', resolve);
          });
          rl.close();

          if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
            console.log('\n❌ Deletion cancelled\n');
            return;
          }
        }

        // Delete the policy (cascade will delete chunks)
        const { error: deleteError } = await supabase
          .from('policies')
          .delete()
          .eq('id', policy.id);

        if (deleteError) throw deleteError;

        console.log('\n✅ Policy deleted successfully');
        console.log(`   Removed ${chunkCount || 0} associated chunks\n`);

      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('relation') && message.includes('does not exist')) {
          console.log('\n❌ Database not set up. Run schema.sql first.\n');
        } else {
          console.error(`\n❌ Error: ${message}\n`);
        }
      }
    });

  // Verify documentation integrity
  docs
    .command('verify')
    .description('Check integrity of indexed docs (count chunks, check for orphans)')
    .action(async () => {
      try {
        const supabase = createClient();

        console.log('\n🔍 Verifying documentation index integrity...\n');
        console.log('━'.repeat(60));

        // Get all policies
        const { data: policies, error: policiesError } = await supabase
          .from('policies')
          .select('id, title, url');

        if (policiesError) throw policiesError;

        const policyCount = policies?.length || 0;
        console.log(`📄 Total policies: ${policyCount}`);

        // Get all chunks
        const { data: chunks, error: chunksError } = await supabase
          .from('policy_chunks')
          .select('id, policy_id, embedding');

        if (chunksError) throw chunksError;

        const chunkCount = chunks?.length || 0;
        console.log(`📦 Total chunks: ${chunkCount}`);

        // Check for orphaned chunks (chunks without a policy)
        const policyIds = new Set(policies?.map(p => p.id) || []);
        const orphanedChunks = chunks?.filter(c => !policyIds.has(c.policy_id)) || [];

        console.log('\n━'.repeat(60));
        console.log('🔎 Integrity Checks:\n');

        if (orphanedChunks.length > 0) {
          console.log(`   ❌ Found ${orphanedChunks.length} orphaned chunks (no parent policy)`);
          console.log('      These should be cleaned up.');
        } else {
          console.log('   ✅ No orphaned chunks found');
        }

        // Check for policies without chunks
        const chunksByPolicy = new Map<number, number>();
        for (const chunk of chunks || []) {
          chunksByPolicy.set(chunk.policy_id, (chunksByPolicy.get(chunk.policy_id) || 0) + 1);
        }

        const policiesWithoutChunks = policies?.filter(p => !chunksByPolicy.has(p.id)) || [];
        if (policiesWithoutChunks.length > 0) {
          console.log(`   ⚠️  Found ${policiesWithoutChunks.length} policies without chunks:`);
          for (const policy of policiesWithoutChunks.slice(0, 5)) {
            console.log(`      - ${policy.title} (${policy.url})`);
          }
          if (policiesWithoutChunks.length > 5) {
            console.log(`      ... and ${policiesWithoutChunks.length - 5} more`);
          }
        } else {
          console.log('   ✅ All policies have chunks');
        }

        // Check for chunks without embeddings
        const chunksWithoutEmbedding = chunks?.filter(c => !c.embedding) || [];
        if (chunksWithoutEmbedding.length > 0) {
          console.log(`   ⚠️  Found ${chunksWithoutEmbedding.length} chunks without embeddings`);
          console.log('      These won\'t appear in semantic search results.');
        } else {
          console.log('   ✅ All chunks have embeddings');
        }

        // Show chunk distribution
        if (policies && policies.length > 0) {
          console.log('\n━'.repeat(60));
          console.log('📊 Chunk Distribution:\n');

          const sorted = Array.from(chunksByPolicy.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

          for (const [policyId, count] of sorted) {
            const policy = policies.find(p => p.id === policyId);
            if (policy) {
              console.log(`   ${count} chunks: ${policy.title}`);
            }
          }

          if (chunksByPolicy.size > 10) {
            console.log(`   ... and ${chunksByPolicy.size - 10} more policies`);
          }
        }

        console.log('\n━'.repeat(60));
        console.log('✅ Verification complete\n');

      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('relation') && message.includes('does not exist')) {
          console.log('\n❌ Database not set up. Run schema.sql first.\n');
        } else {
          console.error(`\n❌ Error: ${message}\n`);
        }
      }
    });

  // Clear all documentation
  docs
    .command('clear')
    .description('Clear ALL indexed docs (with confirmation)')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (options) => {
      try {
        const supabase = createClient();

        // Get counts
        const { count: policyCount } = await supabase
          .from('policies')
          .select('id', { count: 'exact', head: true });

        const { count: chunkCount } = await supabase
          .from('policy_chunks')
          .select('id', { count: 'exact', head: true });

        if (!policyCount || policyCount === 0) {
          console.log('\n⚠️  No documentation to clear.\n');
          return;
        }

        console.log('\n⚠️  WARNING: This will delete ALL indexed documentation!\n');
        console.log('━'.repeat(60));
        console.log(`   Policies to delete: ${policyCount}`);
        console.log(`   Chunks to delete: ${chunkCount || 0}`);
        console.log('━'.repeat(60));

        // Confirmation prompt (unless --yes flag)
        if (!options.yes) {
          const readline = await import('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question('\n⚠️  Type "DELETE ALL" to confirm: ', resolve);
          });
          rl.close();

          if (answer !== 'DELETE ALL') {
            console.log('\n❌ Clear operation cancelled\n');
            return;
          }
        }

        console.log('\n🗑️  Deleting all documentation...');

        // Delete all policies (cascade will delete chunks)
        const { error: deleteError } = await supabase
          .from('policies')
          .delete()
          .neq('id', 0); // Delete all rows

        if (deleteError) throw deleteError;

        console.log('\n✅ All documentation cleared successfully');
        console.log(`   Deleted ${policyCount} policies and ${chunkCount || 0} chunks\n`);

      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('relation') && message.includes('does not exist')) {
          console.log('\n❌ Database not set up. Run schema.sql first.\n');
        } else {
          console.error(`\n❌ Error: ${message}\n`);
        }
      }
    });
}
