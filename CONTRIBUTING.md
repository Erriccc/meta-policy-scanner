# Contributing to Meta Policy Scanner

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

Be respectful, inclusive, and constructive in all interactions.

## How to Contribute

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Use the bug report template
3. Include:
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, etc.)
   - Scan output or error messages
   - Sample code that triggers the issue

### Suggesting Features

1. Check existing feature requests
2. Use the feature request template
3. Describe:
   - The problem you're trying to solve
   - Proposed solution
   - Alternative approaches considered
   - Examples of how it would be used

### Contributing Code

#### Setup Development Environment

```bash
# Fork and clone the repo
git clone https://github.com/YOUR_USERNAME/meta-policy-scanner.git
cd meta-policy-scanner

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Build the project
npm run build

# Run in development mode
npm run dev
```

#### Development Workflow

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes:
   - Write code following our style guide
   - Add tests for new functionality
   - Update documentation as needed

3. Test your changes:
   ```bash
   npm test
   npm run lint
   npm run build
   ```

4. Commit your changes:
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

   Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New features
   - `fix:` - Bug fixes
   - `docs:` - Documentation changes
   - `test:` - Test changes
   - `refactor:` - Code refactoring
   - `chore:` - Maintenance tasks

5. Push and create a pull request:
   ```bash
   git push origin feature/your-feature-name
   ```

#### Code Style

- Use TypeScript for all new code
- Follow existing code patterns
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Write self-documenting code

#### Testing

- Write unit tests for new functions
- Write integration tests for features
- Ensure all tests pass before submitting PR
- Maintain or improve code coverage

### Adding New Rules

To add a new violation rule:

1. Create rule definition in JSON:

```json
{
  "rule_code": "YOUR_RULE_CODE",
  "name": "Rule Name",
  "description": "What this rule checks",
  "platform": "all",
  "severity": "warning",
  "category": "category-name",
  "detection": {
    "type": "regex",
    "pattern": "pattern-to-match"
  },
  "recommendation": "How to fix",
  "doc_urls": ["https://..."],
  "enabled": true
}
```

2. Add tests for the rule
3. Update documentation
4. Submit PR with example violations

### Adding SDK Patterns

To add detection for new SDKs:

1. Update `src/scanner/sdk-detector.ts`
2. Add SDK patterns to `SDK_REGISTRY`
3. Add tests
4. Update documentation

### Improving Documentation

- Fix typos and clarify existing docs
- Add examples and use cases
- Create tutorials or guides
- Improve error messages

## Pull Request Process

1. Update README.md with details of changes if needed
2. Update CHANGELOG.md following Keep a Changelog format
3. Ensure all tests pass and linting is clean
4. Request review from maintainers
5. Address review feedback
6. Squash commits if requested
7. Maintainers will merge when approved

## Project Structure

```
meta-policy-scanner/
├── src/
│   ├── cli/              # CLI commands
│   ├── scanner/          # Code scanning logic
│   ├── analyzer/         # Policy analysis
│   ├── rules/            # Rule management
│   ├── scraper/          # Documentation scraping
│   ├── db/               # Database queries
│   ├── reporter/         # Report generation
│   ├── types/            # TypeScript types
│   └── utils/            # Utilities
├── tests/                # Test files
├── docs/                 # Additional documentation
└── examples/             # Example usage
```

## Development Tips

### Local Testing

```bash
# Link package locally
npm link

# Test CLI
meta-scan scan ./test-project

# Unlink when done
npm unlink
```

### Debugging

```bash
# Run with debug output
LOG_LEVEL=debug meta-scan scan ./project

# Use Node debugger
node --inspect dist/bin/cli.js scan ./project
```

### Database Changes

If you modify the database schema:

1. Update `src/db/schema.sql`
2. Create migration file in `migrations/`
3. Update TypeScript types
4. Test migration on fresh database

### Documentation Updates

When scraping new documentation sources:

1. Add URL to `POLICY_SOURCES` in `src/scraper/firecrawl-client.ts`
2. Test scraping locally
3. Verify embeddings are created
4. Update relevant rules if needed

## Release Process

(For maintainers)

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create git tag:
   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```
4. Publish to npm:
   ```bash
   npm publish
   ```
5. Create GitHub release with changelog

## Getting Help

- **Questions**: Open a GitHub Discussion
- **Chat**: Join our Discord/Slack (link)
- **Email**: maintainers@example.com

## Recognition

Contributors will be added to:
- README.md contributors section
- CHANGELOG.md for their contributions
- GitHub contributors page

Thank you for contributing! 🎉
