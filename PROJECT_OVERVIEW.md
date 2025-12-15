# Meta Policy Scanner - Project Overview

Complete overview of the Meta API Policy Scanner project architecture, components, and implementation details.

## Table of Contents

1. [Project Summary](#project-summary)
2. [Architecture](#architecture)
3. [Components](#components)
4. [Data Flow](#data-flow)
5. [Technology Stack](#technology-stack)
6. [File Structure](#file-structure)
7. [Implementation Phases](#implementation-phases)

---

## Project Summary

**Goal**: Create a comprehensive CLI tool that scans codebases for Meta API policy violations

**Key Features**:
- Scan local directories and GitHub repositories
- Detect SDK usage (official, unofficial, deprecated)
- Dynamic rule management system
- AI-powered semantic analysis
- Automated documentation updates
- CI/CD integration

**Target Users**:
- Developers building on Meta platforms
- DevOps teams ensuring compliance
- Security teams auditing codebases
- Companies using Meta APIs

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLI Interface                         │
│  (Commander.js - User commands and options)              │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
   ┌────▼─────┐            ┌─────▼────┐
   │ Scanner  │            │  Rules   │
   │ Engine   │            │ Manager  │
   └────┬─────┘            └─────┬────┘
        │                         │
        │    ┌──────────┐         │
        └────► Analyzer ◄─────────┘
             └────┬─────┘
                  │
        ┌─────────┴─────────┐
        │                   │
   ┌────▼────┐         ┌────▼────┐
   │ Supabase│         │  AI     │
   │ Backend │         │Services │
   └─────────┘         └─────────┘
```

### Component Diagram

```
┌─────────────────────────────────────────────────────┐
│                  CLI Layer                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │   scan   │  │  rules   │  │   docs   │          │
│  └──────────┘  └──────────┘  └──────────┘          │
└──────────┬──────────┬──────────┬───────────────────┘
           │          │          │
┌──────────▼──────────▼──────────▼───────────────────┐
│              Business Logic Layer                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ Scanner  │  │  Rule    │  │   Doc    │         │
│  │ Engine   │  │ Manager  │  │ Scraper  │         │
│  └─────┬────┘  └─────┬────┘  └────┬─────┘         │
│        │             │             │                │
│  ┌─────▼─────────────▼─────────────▼─────┐         │
│  │         Policy Analyzer                │         │
│  │  - AST Parsing                         │         │
│  │  - Pattern Matching                    │         │
│  │  - Semantic Search                     │         │
│  └────────────────────────────────────────┘         │
└──────────┬──────────────────────┬───────────────────┘
           │                      │
┌──────────▼──────────┐  ┌────────▼─────────────────┐
│  Supabase Backend   │  │    External Services     │
│  - Policies         │  │  - OpenAI (embeddings)   │
│  - Rules            │  │  - Firecrawl (scraping)  │
│  - Embeddings       │  │  - GitHub API            │
│  - SDK Patterns     │  └──────────────────────────┘
└─────────────────────┘
```

---

## Components

### 1. CLI Interface (`src/cli/`)

**Purpose**: User interaction layer

**Files**:
- `commands/scan.ts` - Scanning commands
- `commands/rules.ts` - Rule management
- `commands/docs.ts` - Documentation management
- `index.ts` - CLI entry point

**Responsibilities**:
- Parse command-line arguments
- Validate user input
- Orchestrate operations
- Format and display results

### 2. Scanner Engine (`src/scanner/`)

**Purpose**: Code analysis and SDK detection

**Files**:
- `local-scanner.ts` - Scan local directories
- `github-scanner.ts` - Scan GitHub repositories
- `file-discovery.ts` - Find relevant files
- `ast-parser.ts` - Parse code into AST
- `sdk-detector.ts` - Detect SDK usage

**Responsibilities**:
- Discover files to scan
- Parse code (JS/TS/Python)
- Detect SDK patterns
- Extract code context
- Build code graph

**Key Algorithms**:
1. File Discovery: Glob pattern matching
2. AST Parsing: Tree-sitter for JS/TS
3. SDK Detection: Pattern matching + AST queries

### 3. Policy Analyzer (`src/analyzer/`)

**Purpose**: Match code against policy rules

**Files**:
- `policy-matcher.ts` - Match patterns
- `rule-engine.ts` - Execute rules
- `semantic-search.ts` - AI-powered search

**Responsibilities**:
- Load active rules from database
- Execute rule patterns against code
- Perform semantic similarity search
- Rank violations by severity
- Generate recommendations

**Rule Types**:
1. **Regex Rules**: Pattern matching in code
2. **AST Rules**: Structural code queries
3. **Semantic Rules**: AI-powered context matching
4. **SDK Rules**: SDK usage validation

### 4. Rule Manager (`src/rules/`)

**Purpose**: CRUD operations for violation rules

**Files**:
- `rule-manager.ts` - Rule CRUD operations
- `builtin/` - Built-in rule definitions

**Responsibilities**:
- List, create, update, delete rules
- Import/export rule sets
- Enable/disable rules
- Seed built-in rules
- Validate rule syntax

### 5. Documentation Scraper (`src/scraper/`)

**Purpose**: Keep policy docs up-to-date

**Files**:
- `firecrawl-client.ts` - Firecrawl integration
- `doc-chunker.ts` - Split docs into chunks
- `embedder.ts` - Generate embeddings

**Responsibilities**:
- Scrape Meta documentation
- Chunk content intelligently
- Generate vector embeddings
- Store in Supabase
- Update on schedule

**Process**:
1. Firecrawl scrapes Meta docs
2. Content split into chunks (~1000 tokens)
3. OpenAI generates embeddings
4. Store in pgvector (Supabase)

### 6. Database Layer (`src/db/`)

**Purpose**: Data persistence and queries

**Files**:
- `supabase.ts` - Supabase client
- `schema.sql` - Database schema
- `queries.ts` - Query helpers

**Tables**:
- `platforms` - Meta platforms (FB, IG, etc.)
- `policies` - Policy documentation
- `policy_chunks` - Chunked docs with embeddings
- `violation_rules` - Rule definitions
- `sdk_patterns` - SDK detection patterns

### 7. Reporter (`src/reporter/`)

**Purpose**: Generate scan reports

**Files**:
- `json-reporter.ts` - JSON output
- `console-reporter.ts` - Terminal output
- `html-reporter.ts` - HTML reports (Phase 2)

**Responsibilities**:
- Format violations
- Group by file/severity/rule
- Generate summaries
- Export results

---

## Data Flow

### Scan Flow

```
1. User runs: meta-scan scan ./project
   ↓
2. CLI parses command and options
   ↓
3. Scanner discovers files matching patterns
   ↓
4. For each file:
   a. Parse code to AST
   b. Detect SDK usage
   c. Extract code snippets
   ↓
5. Analyzer loads active rules from DB
   ↓
6. For each rule:
   a. Match pattern against code
   b. Check SDK violations
   c. Perform semantic search if needed
   ↓
7. Collect violations with context
   ↓
8. Reporter formats and displays results
   ↓
9. Exit with appropriate code (0 or 1)
```

### Rule Execution Flow

```
Rule Definition (JSON)
   ↓
Stored in Supabase
   ↓
Loaded by Analyzer
   ↓
Applied to Code
   ↓
Match Found?
   ├─ Yes → Create Violation
   └─ No  → Continue
```

### GitHub Scanning Flow

```
GitHub URL
   ↓
Parse owner/repo
   ↓
Clone to temp dir (shallow)
   ↓
Run local scanner
   ↓
Cleanup temp dir
   ↓
Return results
```

---

## Technology Stack

### Core Technologies

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Language | TypeScript | Type safety, better DX |
| Runtime | Node.js 18+ | CLI execution |
| CLI Framework | Commander.js | Argument parsing |
| Code Parsing | Tree-sitter | AST generation |
| Database | Supabase (Postgres) | Data storage |
| Vector Search | pgvector | Semantic search |
| Embeddings | OpenAI | Text embeddings |
| Doc Scraping | Firecrawl | Web scraping |

### Development Tools

| Tool | Purpose |
|------|---------|
| TypeScript | Type checking |
| ESLint | Code linting |
| Prettier | Code formatting |
| Jest | Unit testing |
| ts-node | Dev execution |

### External APIs

| Service | Usage | Pricing |
|---------|-------|---------|
| Supabase | Database + Auth | Free tier available |
| OpenAI | Embeddings (text-embedding-3-small) | ~$0.02/1M tokens |
| Firecrawl | Documentation scraping | Free tier: 500 pages/mo |
| GitHub API | Repository access | Free for public repos |

---

## File Structure

```
meta-policy-scanner/
├── docs/                           # Additional documentation
│   ├── api.md                      # API reference
│   ├── rules.md                    # Rule writing guide
│   └── deployment.md               # Deployment guide
│
├── src/
│   ├── bin/
│   │   └── cli.ts                  # CLI entry point
│   │
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── scan.ts             # Scan command
│   │   │   ├── rules.ts            # Rule management
│   │   │   ├── docs.ts             # Doc management
│   │   │   └── init.ts             # Initialize config
│   │   └── index.ts                # Command registration
│   │
│   ├── scanner/
│   │   ├── index.ts                # Scanner exports
│   │   ├── local-scanner.ts        # Local scanning
│   │   ├── github-scanner.ts       # GitHub scanning
│   │   ├── file-discovery.ts       # File discovery
│   │   ├── ast-parser.ts           # AST parsing
│   │   ├── code-graph.ts           # Code graph building
│   │   └── sdk-detector.ts         # SDK detection
│   │
│   ├── analyzer/
│   │   ├── index.ts
│   │   ├── policy-matcher.ts       # Pattern matching
│   │   ├── rule-engine.ts          # Rule execution
│   │   └── semantic-search.ts      # Semantic matching
│   │
│   ├── rules/
│   │   ├── index.ts
│   │   ├── rule-manager.ts         # CRUD operations
│   │   ├── builtin/                # Built-in rules
│   │   │   ├── rate-limiting.ts
│   │   │   ├── human-agent-flag.ts
│   │   │   ├── data-storage.ts
│   │   │   ├── token-handling.ts
│   │   │   └── api-versioning.ts
│   │   └── templates/              # Rule templates
│   │
│   ├── scraper/
│   │   ├── index.ts
│   │   ├── firecrawl-client.ts     # Firecrawl wrapper
│   │   ├── doc-chunker.ts          # Content chunking
│   │   └── embedder.ts             # Embedding generation
│   │
│   ├── db/
│   │   ├── supabase.ts             # Client setup
│   │   ├── schema.sql              # Database schema
│   │   ├── queries.ts              # Query helpers
│   │   └── migrations/             # Schema migrations
│   │
│   ├── reporter/
│   │   ├── index.ts
│   │   ├── json-reporter.ts        # JSON output
│   │   ├── console-reporter.ts     # Terminal output
│   │   └── html-reporter.ts        # HTML reports
│   │
│   ├── types/
│   │   └── index.ts                # TypeScript types
│   │
│   └── utils/
│       ├── logger.ts               # Logging utility
│       ├── config.ts               # Config loading
│       └── helpers.ts              # Helper functions
│
├── tests/
│   ├── scanner/                    # Scanner tests
│   ├── analyzer/                   # Analyzer tests
│   ├── rules/                      # Rule tests
│   └── fixtures/                   # Test fixtures
│
├── .github/
│   └── workflows/
│       ├── ci.yml                  # CI pipeline
│       └── publish.yml             # NPM publish
│
├── README.md                       # Main README
├── QUICK_START.md                  # Quick start guide
├── CONTRIBUTING.md                 # Contribution guide
├── META_POLICY_SCANNER_IMPLEMENTATION.md  # Technical details
├── PROJECT_OVERVIEW.md             # This file
├── CHANGELOG.md                    # Version history
├── LICENSE                         # MIT License
│
├── package.json                    # NPM config
├── tsconfig.json                   # TypeScript config
├── .env.example                    # Env template
├── .gitignore                      # Git ignore
│
├── example-rule-templates.json     # Example rules
└── meta-scan.config.example.json   # Config template
```

---

## Implementation Phases

### Phase 1: MVP (Current)

**Goal**: Core functionality for JS/TS scanning

**Features**:
- ✅ CLI interface with Commander.js
- ✅ Local directory scanning
- ✅ GitHub repository scanning (public)
- ✅ SDK detection (official, wrappers, unofficial)
- ✅ 8 built-in rules
- ✅ Rule CRUD via CLI
- ✅ Console + JSON output
- ✅ Supabase backend
- ✅ Documentation scraping

**Timeline**: 4-6 weeks

### Phase 2: Enhanced Features

**Goal**: Production-ready tool

**Features**:
- [ ] Python code scanning
- [ ] Private repository support (GitHub PAT)
- [ ] HTML report generation
- [ ] Web UI for rule management
- [ ] VS Code extension
- [ ] Pre-commit hook templates
- [ ] GitHub Action template
- [ ] Scheduled documentation updates
- [ ] Performance optimizations
- [ ] Caching layer

**Timeline**: 6-8 weeks

### Phase 3: Advanced Features

**Goal**: Enterprise-grade solution

**Features**:
- [ ] Multi-language support (PHP, Java, Ruby)
- [ ] Real-time scanning (watch mode)
- [ ] Team collaboration features
- [ ] Custom rule marketplace
- [ ] Advanced analytics dashboard
- [ ] Webhook integrations
- [ ] Slack/Discord notifications
- [ ] SARIF output for security tools
- [ ] IDE integrations (JetBrains, etc.)
- [ ] Self-hosted option

**Timeline**: 8-12 weeks

---

## Key Decisions & Trade-offs

### Why Supabase?

**Pros**:
- Built on Postgres (reliable, SQL)
- pgvector for semantic search
- Free tier suitable for MVP
- Easy to scale
- Auth built-in (future)

**Cons**:
- Vendor lock-in (mitigated by standard SQL)
- Network dependency

### Why Tree-sitter?

**Pros**:
- Fast, incremental parsing
- Language-agnostic
- Accurate AST
- Used by GitHub

**Cons**:
- Learning curve
- Need language-specific grammars

### Why OpenAI Embeddings?

**Pros**:
- High quality
- Well-documented
- Fast API

**Cons**:
- Cost (minimal for small usage)
- API dependency
- Alternative: Open-source models (future)

### Why CLI-first?

**Pros**:
- Easy to integrate in CI/CD
- Low barrier to entry
- Works everywhere
- Easy to automate

**Cons**:
- Less accessible for non-developers
- Solution: Add web UI in Phase 2

---

## Next Steps

1. **Implement Core Scanner** (Week 1-2)
   - File discovery
   - AST parsing
   - SDK detection

2. **Build Rule Engine** (Week 2-3)
   - Pattern matching
   - Rule execution
   - Violation reporting

3. **Integrate Supabase** (Week 3-4)
   - Schema setup
   - CRUD operations
   - Query optimization

4. **Add GitHub Scanning** (Week 4)
   - Clone logic
   - Auth handling
   - Error handling

5. **Documentation & Testing** (Week 5-6)
   - Unit tests
   - Integration tests
   - Documentation
   - Examples

6. **Beta Release** (Week 6)
   - npm publish
   - Get feedback
   - Iterate

---

## Success Metrics

**MVP Success Criteria**:
- ✅ Scan 1000+ files in < 30 seconds
- ✅ Detect 8+ rule types
- ✅ < 5% false positive rate
- ✅ Works with public GitHub repos
- ✅ Clear error messages
- ✅ Comprehensive documentation

**Phase 2 Goals**:
- 500+ npm downloads/month
- 10+ community-contributed rules
- 3+ integration tutorials
- < 1% crash rate

**Phase 3 Goals**:
- 5000+ active users
- Enterprise customers
- Rule marketplace
- Self-service platform

---

## Resources

- [Meta Platform Terms](https://developers.facebook.com/terms/)
- [Graph API Documentation](https://developers.facebook.com/docs/graph-api/)
- [Instagram API](https://developers.facebook.com/docs/instagram-api/)
- [Messenger Platform](https://developers.facebook.com/docs/messenger-platform/)
- [Tree-sitter](https://tree-sitter.github.io/tree-sitter/)
- [Supabase Docs](https://supabase.com/docs)
- [pgvector](https://github.com/pgvector/pgvector)

---

This overview will be updated as the project evolves. Last updated: 2024-12-14
