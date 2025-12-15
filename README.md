# Meta API Policy Scanner

> A comprehensive CLI tool and npm package that scans codebases (local or GitHub) for Facebook/Instagram/Ads API policy violations, with dynamic rule management and automated documentation updates.

[![npm version](https://badge.fury.io/js/meta-policy-scanner.svg)](https://www.npmjs.com/package/meta-policy-scanner)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🔍 **Code Scanning**: Scan local directories or GitHub repositories
- 🎯 **SDK Detection**: Identify official SDKs, wrappers, unofficial libraries, and policy violations
- 📋 **Dynamic Rules**: Add, update, and manage violation rules via CLI
- 🤖 **Semantic Analysis**: AI-powered semantic search using OpenAI embeddings
- 📚 **Auto-Updated Docs**: Automatically scrape and update Meta policy documentation
- 🚀 **CI/CD Ready**: Easy integration with GitHub Actions, GitLab CI, etc.
- 📊 **Multiple Outputs**: Console, JSON, and HTML report formats

## Quick Start

### Installation

```bash
npm install -g meta-policy-scanner
```

### Basic Usage

```bash
# Scan local directory
meta-scan scan ./my-project

# Scan GitHub repository
meta-scan scan https://github.com/username/repo

# Scan with filters
meta-scan scan ./my-project --platform=instagram --severity=error
```

### Setup (First Time)

1. **Set up Supabase** (free tier works)
2. **Get API keys**: Firecrawl, OpenAI
3. **Configure environment**:

```bash
cp .env.example .env
# Edit .env with your API keys
```

4. **Seed initial data**:

```bash
meta-scan rules seed
meta-scan docs update
```

See [QUICK_START.md](./QUICK_START.md) for detailed setup instructions.

## Architecture

```
┌─────────────────────┐
│   CLI Tool (npm)    │
│  - Commander CLI    │
│  - Scanner Engine   │
│  - Policy Analyzer  │
│  - Rule Manager     │
└──────────┬──────────┘
           │
           ├─── Scan Sources
           │    ├─ Local Directory
           │    └─ GitHub Repo (public/private)
           │
           ├─── Supabase Backend
           │    ├─ Violation Rules
           │    ├─ SDK Patterns
           │    ├─ Policy Docs
           │    └─ Vector Embeddings
           │
           └─── AI Services
                ├─ OpenAI (embeddings)
                └─ Firecrawl (doc scraping)
```

## What It Detects

### SDK Usage
- ✅ Official Meta SDKs (facebook-nodejs-business-sdk, facebook-business, etc.)
- ⚠️ Third-party wrappers (fb, fbgraph)
- ❌ Unofficial libraries (instagram-private-api, instagram-web-api)
- 🔗 Direct Graph API calls
- 📛 Deprecated APIs (REST API, old versions, FQL)

### Policy Violations
- Rate limiting issues
- Token exposure in code
- Unauthorized data retention
- Missing permission checks
- Improper HUMAN_AGENT tag usage
- Deprecated API versions
- Missing error handling
- And more...

## CLI Commands

### Scanning

```bash
# Scan local directory
meta-scan scan ./my-project

# Scan GitHub repo (public)
meta-scan scan https://github.com/user/repo

# Scan specific branch
meta-scan scan https://github.com/user/repo --branch=develop

# Scan private repo (requires GitHub PAT)
meta-scan scan https://github.com/org/private-repo --auth=$GITHUB_PAT

# Filter by platform
meta-scan scan ./project --platform=instagram

# Set severity threshold
meta-scan scan ./project --severity=error

# JSON output
meta-scan scan ./project --format=json --output=results.json
```

### Rule Management

```bash
# List all rules
meta-scan rules list
meta-scan rules list --platform=instagram --severity=error

# Show rule details
meta-scan rules show RATE_LIMIT_MISSING

# Add new rule
meta-scan rules add --from-file=my-rule.json
meta-scan rules add --interactive

# Update rule
meta-scan rules update RULE_CODE --severity=error

# Enable/disable rules
meta-scan rules enable RULE_CODE
meta-scan rules disable RULE_CODE

# Import/export rules
meta-scan rules export ./backup.json
meta-scan rules import ./team-rules.json

# Seed built-in rules
meta-scan rules seed

# Show statistics
meta-scan rules stats
```

### Documentation Management

```bash
# Update policy documentation
meta-scan docs update

# Show status
meta-scan docs status

# List indexed docs
meta-scan docs list
```

## Configuration

Create `.meta-scan.config.json` in your project root:

```json
{
  "platforms": ["facebook", "instagram"],
  "severity": "warning",
  "ignore": ["**/test/**", "**/dist/**"],
  "failOnErrors": true
}
```

See [meta-scan.config.example.json](./meta-scan.config.example.json) for all options.

## CI/CD Integration

### GitHub Actions

```yaml
name: Meta Policy Scan
on: [pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Scanner
        run: npm install -g meta-policy-scanner
      - name: Run Scan
        run: meta-scan scan . --severity=error
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
```

## Built-in Rules

| Rule Code | Description | Severity |
|-----------|-------------|----------|
| `RATE_LIMIT_MISSING` | No rate limit handling | error |
| `HUMAN_AGENT_ABUSE` | HUMAN_AGENT flag misuse | error |
| `UNOFFICIAL_IG_LIBRARY` | Unofficial IG library detected | error |
| `TOKEN_EXPOSED` | Access token in code | error |
| `DEPRECATED_API_VERSION` | Old API version | warning |
| `NO_ERROR_HANDLING` | Missing error handling | warning |
| `DATA_RETENTION_VIOLATION` | Data stored too long | warning |
| `MISSING_PERMISSION_CHECK` | No permission verification | info |

See [example-rule-templates.json](./example-rule-templates.json) for complete rule definitions.

## Use Cases

1. **Pre-commit Hooks**: Catch violations before code is committed
2. **Pull Request Checks**: Automated policy validation in PRs
3. **Scheduled Audits**: Regular scans of production code
4. **Third-party Library Vetting**: Scan dependencies for violations
5. **Compliance Reporting**: Generate policy compliance reports

## Documentation

- [Quick Start Guide](./QUICK_START.md) - Get started in 5 minutes
- [Implementation Guide](./META_POLICY_SCANNER_IMPLEMENTATION.md) - Complete technical details
- [Rule Templates](./example-rule-templates.json) - Example rule definitions
- [Config Reference](./meta-scan.config.example.json) - Configuration options

## Requirements

- Node.js 18+ or Python 3.10+
- Supabase account (free tier works)
- Firecrawl API key
- OpenAI API key
- GitHub PAT (optional, for private repos)

## Roadmap

### Phase 1 (MVP) ✅
- [x] JS/TS scanning
- [x] Local + GitHub scanning
- [x] SDK detection
- [x] Dynamic rules (CRUD)
- [x] 8 built-in rules
- [x] Console + JSON output

### Phase 2
- [ ] Python scanning
- [ ] Private repo support
- [ ] HTML reports
- [ ] Web UI for rule management
- [ ] CI/CD templates
- [ ] Scheduled doc updates

### Phase 3
- [ ] VS Code extension
- [ ] Real-time scanning
- [ ] Team collaboration features
- [ ] Custom rule marketplace
- [ ] Advanced analytics

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/meta-policy-scanner/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/meta-policy-scanner/discussions)
- **Email**: support@your-domain.com

## Acknowledgments

- Meta Platform Policy Documentation
- Firecrawl for documentation scraping
- OpenAI for embeddings
- Supabase for backend infrastructure

---

Made with ❤️ for Meta API developers
