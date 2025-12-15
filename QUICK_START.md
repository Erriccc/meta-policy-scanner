# Meta Policy Scanner - Quick Start Guide

Get up and running with the Meta API Policy Scanner in 5 minutes.

## Prerequisites

- Node.js 18+ or Python 3.10+
- Supabase account (free tier works)
- API keys:
  - Firecrawl API key (for doc scraping)
  - OpenAI API key (for embeddings)
  - GitHub PAT (optional, for private repos)

---

## Step 1: Install

### Option A: NPM Package (Recommended)

```bash
npm install -g meta-policy-scanner
```

### Option B: From Source

```bash
git clone https://github.com/your-org/meta-policy-scanner.git
cd meta-policy-scanner
npm install
npm run build
npm link
```

---

## Step 2: Set Up Supabase

### Create Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Name it "meta-policy-scanner"
4. Choose a region and password
5. Wait for provisioning (~2 minutes)

### Run Database Schema

1. Go to SQL Editor in Supabase dashboard
2. Copy contents of `src/db/schema.sql`
3. Run the SQL script
4. Verify tables created: `platforms`, `policies`, `policy_chunks`, `violation_rules`, `sdk_patterns`

### Enable pgvector Extension

In SQL Editor, run:

```sql
create extension if not exists vector;
```

### Get API Keys

1. Go to Project Settings > API
2. Copy:
   - Project URL (e.g., `https://abc123.supabase.co`)
   - Anon/Public key
   - Service Role key (keep secret!)

---

## Step 3: Configure Environment

Create `.env` file in your project root:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Firecrawl (sign up at firecrawl.dev)
FIRECRAWL_API_KEY=your-firecrawl-key

# OpenAI (get from platform.openai.com)
OPENAI_API_KEY=sk-your-openai-key

# GitHub (optional, for private repos)
GITHUB_PAT=ghp_your-github-token
```

---

## Step 4: Seed Initial Data

### Seed Built-in Rules

```bash
meta-scan rules seed
```

This creates 8 essential rules:
- ✅ RATE_LIMIT_MISSING
- ✅ HUMAN_AGENT_ABUSE
- ✅ UNOFFICIAL_IG_LIBRARY
- ✅ TOKEN_EXPOSED
- ✅ DEPRECATED_API_VERSION
- ✅ NO_ERROR_HANDLING
- ✅ DATA_RETENTION_VIOLATION
- ✅ MISSING_PERMISSION_CHECK

### Update Documentation (Optional but Recommended)

```bash
meta-scan docs update
```

This scrapes Meta's official documentation and creates vector embeddings for semantic search.

**Note:** This takes ~5-10 minutes and uses OpenAI API credits.

---

## Step 5: Run Your First Scan

### Scan Local Directory

```bash
# Basic scan
meta-scan scan ./my-project

# With options
meta-scan scan ./my-project --platform=instagram --severity=error
```

### Scan GitHub Repository

```bash
# Public repo
meta-scan scan https://github.com/username/repo

# Specific branch
meta-scan scan https://github.com/username/repo --branch=develop

# Private repo
meta-scan scan https://github.com/username/private-repo --auth=$GITHUB_PAT
```

### Example Output

```
🔍 Scanning local directory...

✓ Cloned username/repo

📊 Scan Summary
────────────────────────────────────────────────────────────
Files scanned:  42
Violations:     7
  Errors:       2
  Warnings:     4
  Info:         1

🔧 SDK Analysis
────────────────────────────────────────────────────────────
Official SDKs:  1
Wrappers:       0
Direct API:     3
Violations:     1

⚠️  Violations
────────────────────────────────────────────────────────────

✗ Unofficial Instagram Library Detected
  src/services/instagram.ts:5
  Using unofficial Instagram libraries that violate Meta Platform Terms
  → Replace with official Instagram Graph API

⚠ Missing Rate Limit Handling
  src/api/facebook.ts:127
  API calls without rate limit error handling detected
  → Implement exponential backoff and respect x-app-usage headers
```

---

## Step 6: Manage Rules

### List All Rules

```bash
meta-scan rules list
```

### Show Rule Details

```bash
meta-scan rules show RATE_LIMIT_MISSING
```

### Add Custom Rule

Create `my-rule.json`:

```json
{
  "rule_code": "MY_CUSTOM_RULE",
  "name": "My Custom Policy Check",
  "description": "Checks for specific pattern in code",
  "platform": "all",
  "severity": "warning",
  "category": "custom",
  "detection": {
    "type": "regex",
    "pattern": "some-pattern-to-match",
    "fileTypes": [".js", ".ts"]
  },
  "recommendation": "Do this instead...",
  "enabled": true
}
```

Import it:

```bash
meta-scan rules add --from-file=my-rule.json
```

### Disable Noisy Rules

```bash
meta-scan rules disable BATCH_REQUEST_MISUSE
```

### Export Rules for Team

```bash
meta-scan rules export ./team-rules.json

# Share with team
# They import with:
meta-scan rules import ./team-rules.json
```

---

## Step 7: Integrate with CI/CD

### GitHub Actions

Create `.github/workflows/meta-policy-scan.yml`:

```yaml
name: Meta Policy Scan

on:
  pull_request:
  push:
    branches: [main]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install Scanner
        run: npm install -g meta-policy-scanner

      - name: Run Scan
        run: meta-scan scan . --format=json --output=results.json
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}

      - name: Upload Results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: scan-results
          path: results.json

      - name: Check for Violations
        run: |
          ERRORS=$(jq '.violations | map(select(.severity == "error")) | length' results.json)
          if [ "$ERRORS" -gt 0 ]; then
            echo "❌ Found $ERRORS policy violations"
            exit 1
          fi
          echo "✅ No policy violations found"
```

Add secrets to your GitHub repo:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

---

## Common Use Cases

### 1. Pre-Commit Hook

Create `.husky/pre-commit`:

```bash
#!/bin/sh
meta-scan scan . --severity=error --format=json

if [ $? -ne 0 ]; then
  echo "❌ Policy violations found. Commit rejected."
  exit 1
fi
```

### 2. Scan Pull Request

```bash
# Get changed files in PR
git diff --name-only origin/main...HEAD > changed-files.txt

# Scan only changed files
meta-scan scan . --files-from=changed-files.txt
```

### 3. Scheduled Repository Audits

Use GitHub Actions with cron:

```yaml
on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday
```

### 4. Monitor Third-Party Libraries

```bash
# Scan node_modules for policy violations
meta-scan scan ./node_modules --platform=instagram --severity=error
```

---

## Advanced Configuration

### Create Project Config

```bash
meta-scan init
```

This creates `.meta-scan.config.json`:

```json
{
  "platforms": ["facebook", "instagram"],
  "severity": "warning",
  "ignore": ["**/test/**", "**/dist/**"],
  "failOnErrors": true
}
```

### Custom Output Formats

```bash
# JSON output
meta-scan scan . --format=json --output=results.json

# Pipe to jq for filtering
meta-scan scan . --format=json | jq '.violations[] | select(.severity == "error")'
```

---

## Troubleshooting

### "SUPABASE_URL is not defined"

Make sure `.env` file exists and is loaded:

```bash
# Check env vars
echo $SUPABASE_URL

# Load manually
export $(cat .env | xargs)
```

### "Repository not found" (GitHub scanning)

For private repos, provide GitHub PAT:

```bash
meta-scan scan https://github.com/org/private-repo --auth=$GITHUB_PAT
```

Generate PAT at: https://github.com/settings/tokens

### "No violations found" but expecting some

Check:
1. Are rules enabled? `meta-scan rules list --enabled`
2. Is severity threshold correct? Try `--severity=info`
3. Are files being scanned? Check `filesScanned` count

### "Rate limit exceeded" (OpenAI/Firecrawl)

When running `docs update`, you might hit API rate limits.

Solution:
- Run during off-peak hours
- Use lower tier OpenAI model
- Run incrementally (update one platform at a time)

---

## Example Workflows

### Daily Monitoring

```bash
#!/bin/bash
# daily-scan.sh

# Scan main branch
meta-scan scan https://github.com/org/repo --format=json --output=scan-$(date +%Y%m%d).json

# Check for new violations
ERRORS=$(jq '.violations | map(select(.severity == "error")) | length' scan-*.json)

if [ "$ERRORS" -gt 0 ]; then
  # Send alert (Slack, email, etc.)
  curl -X POST $SLACK_WEBHOOK -d "{\"text\": \"❌ $ERRORS policy violations found\"}"
fi
```

### Multi-Repo Scanning

```bash
#!/bin/bash
# scan-all-repos.sh

REPOS=(
  "https://github.com/org/repo1"
  "https://github.com/org/repo2"
  "https://github.com/org/repo3"
)

for repo in "${REPOS[@]}"; do
  echo "Scanning $repo..."
  meta-scan scan "$repo" --format=json --output="results-$(basename $repo).json"
done

# Aggregate results
jq -s 'map(.violations) | flatten' results-*.json > combined-results.json
```

---

## Next Steps

1. **Customize Rules**: Add project-specific rules for your policies
2. **Set Up Automation**: Integrate with CI/CD pipeline
3. **Monitor Trends**: Track violations over time
4. **Team Onboarding**: Share rule exports with your team
5. **Documentation**: Keep policy docs updated monthly

---

## Getting Help

- **Documentation**: See `META_POLICY_SCANNER_IMPLEMENTATION.md`
- **Rule Examples**: See `example-rule-templates.json`
- **Config Examples**: See `meta-scan.config.example.json`
- **Issues**: Report at GitHub Issues
- **Questions**: Stack Overflow tag `meta-policy-scanner`

---

## Quick Reference

```bash
# Installation
npm install -g meta-policy-scanner

# Scanning
meta-scan scan ./project
meta-scan scan https://github.com/user/repo
meta-scan scan . --platform=instagram --severity=error

# Rules
meta-scan rules list
meta-scan rules show RULE_CODE
meta-scan rules add --from-file=rule.json
meta-scan rules enable/disable RULE_CODE
meta-scan rules seed

# Documentation
meta-scan docs update
meta-scan docs status
meta-scan docs list

# Configuration
meta-scan init
```

---

You're all set! Start scanning your codebases for Meta API policy violations. 🚀
