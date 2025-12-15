import { Command } from 'commander';
import { createClient } from '../../db/supabase';
import { DocScraper } from '../../scraper/doc-scraper';
import { searchBundledDocs, getAllBundledDocs } from '../../policies/bundled-docs';

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
    .action(async (query: string, options) => {
      try {
        console.log(`\n🔍 Searching for: "${query}"\n`);

        // Try semantic search if OpenAI key available and not bundled-only
        if (!options.bundledOnly && process.env.OPENAI_API_KEY) {
          try {
            const supabase = createClient();
            const scraper = new DocScraper(supabase, '', process.env.OPENAI_API_KEY);
            const results = await scraper.searchPolicies(query, parseInt(options.limit));

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
          } catch {
            // Fall through to bundled search
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
        console.log('\n💡 Tip: Scrape more docs with "meta-scan docs update" for semantic search\n');

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

  // List documentation sources
  docs
    .command('list')
    .description('List all indexed documentation')
    .action(async () => {
      try {
        const supabase = createClient();

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
          console.log('Run: meta-scan docs update\n');
          return;
        }

        console.log('\n📚 Indexed Documentation\n');
        console.log('━'.repeat(80));

        for (const policy of policies) {
          const date = policy.last_scraped
            ? new Date(policy.last_scraped).toLocaleDateString()
            : 'Never';
          const platformData = policy.platforms as unknown as { name: string } | null;
          const platform = platformData?.name || 'unknown';

          console.log(`📄 ${policy.title || 'Untitled'}`);
          console.log(`   Platform: ${platform}`);
          console.log(`   URL: ${policy.url}`);
          console.log(`   Last scraped: ${date}`);
          console.log('');
        }

        console.log('━'.repeat(80));
        console.log(`Total: ${policies.length} documents indexed\n`);

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
