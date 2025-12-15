/**
 * Bundled Meta API Policy Documentation
 * Pre-packaged content for semantic search without requiring Firecrawl
 * Source: Meta Developer Documentation (manually curated key sections)
 */

export interface BundledDoc {
  id: string;
  platform: string;
  title: string;
  url: string;
  content: string;
}

export const BUNDLED_DOCS: BundledDoc[] = [
  // === PLATFORM TERMS ===
  {
    id: 'terms-1',
    platform: 'all',
    title: 'Meta Platform Terms - Overview',
    url: 'https://developers.facebook.com/terms/',
    content: `# Meta Platform Terms

## Key Requirements

### Data Use
- Only request data you need for your app's functionality
- Don't sell, license, or purchase user data
- Don't use data for surveillance or to discriminate
- Delete data when users request it or uninstall your app

### User Privacy
- Provide a privacy policy explaining data collection and use
- Get consent before accessing user data beyond basic profile
- Respect user privacy settings and permissions
- Don't share data with third parties without consent

### Security Requirements
- Protect all data with industry-standard security measures
- Use HTTPS for all data transmission
- Store access tokens securely, never in client-side code
- Report security vulnerabilities within 24 hours

### Prohibited Practices
- No scraping or automated data collection
- No circumventing rate limits or access controls
- No fake accounts or misleading functionality
- No harassment, hate speech, or harmful content

### Compliance
- Comply with all applicable laws and regulations
- Maintain accurate app information
- Respond to Facebook requests within 5 business days
- Subject to audit and review at any time`,
  },

  // === RATE LIMITING ===
  {
    id: 'rate-limit-1',
    platform: 'all',
    title: 'Graph API Rate Limiting',
    url: 'https://developers.facebook.com/docs/graph-api/overview/rate-limiting/',
    content: `# Graph API Rate Limiting

## Overview
Rate limiting controls how many API calls your app can make. Limits vary by endpoint and access level.

## Rate Limit Types

### Application-Level Rate Limiting
- Based on number of calls from all users combined
- Measured per app, per hour
- Limit = 200 × (number of users) calls per hour
- Minimum: 200 calls/hour for apps with < 1 user

### User-Level Rate Limiting
- Based on calls made by individual users
- Approximately 200 calls per user per hour
- Varies by endpoint

### Page-Level Rate Limiting
- Applies to Page API calls
- Based on engaged users metric
- Higher engagement = higher limits

## Handling Rate Limits

### Check Headers
\`\`\`
x-business-use-case-usage: Rate limit status for business APIs
x-app-usage: Overall app-level usage
x-ad-account-usage: Ad account specific usage
\`\`\`

### Best Practices
1. Cache responses when possible
2. Use batch requests to reduce call count
3. Implement exponential backoff on 429 errors
4. Monitor x-app-usage header
5. Use webhooks instead of polling

### Error Response
\`\`\`json
{
  "error": {
    "message": "Rate limit exceeded",
    "type": "OAuthException",
    "code": 4,
    "error_subcode": 2207051
  }
}
\`\`\`

### Recovery
- Wait until rate limit window resets (usually 1 hour)
- Implement exponential backoff: 1s, 2s, 4s, 8s...
- Maximum recommended backoff: 30 minutes`,
  },

  // === INSTAGRAM API ===
  {
    id: 'instagram-1',
    platform: 'instagram',
    title: 'Instagram Graph API Overview',
    url: 'https://developers.facebook.com/docs/instagram-api/',
    content: `# Instagram Graph API

## Authorized Use Only
The Instagram Graph API is the ONLY authorized way to build apps that interact with Instagram on behalf of users or businesses.

## Available APIs

### Instagram Graph API (Business/Creator)
- For Instagram Business and Creator accounts
- Full access to post, comment, insights
- Requires Facebook Page connection
- OAuth authentication required

### Instagram Basic Display API (Deprecated)
- Being phased out
- Limited to basic profile and media access
- Use Instagram Graph API instead

## Prohibited: Private API Usage

### Banned Libraries
The following libraries violate Meta Platform Terms:
- instagram-private-api
- instagram-web-api
- instagrapi
- instaloader
- instagram-scraper

### Consequences of Violation
- Immediate app termination
- Account suspension
- Legal action
- Permanent platform ban

## Authentication
- Use OAuth 2.0 authorization flow
- Never hardcode access tokens
- Store tokens server-side only
- Refresh tokens before expiration

## Rate Limits
- 200 calls per user per hour
- 4800 calls per app per hour per user
- Higher limits for verified apps`,
  },

  // === MESSENGER PLATFORM ===
  {
    id: 'messenger-1',
    platform: 'messenger',
    title: 'Messenger Platform Policy',
    url: 'https://developers.facebook.com/docs/messenger-platform/policy/',
    content: `# Messenger Platform Policy

## Messaging Windows

### Standard Messaging (24-hour window)
- Can send messages freely for 24 hours after user interaction
- User interaction = message sent to your bot
- Window resets with each user message

### Message Tags (Outside 24h)
Only these tags allowed after 24 hours:

1. **CONFIRMED_EVENT_UPDATE**
   - Reminders for events user registered for
   - Not for promotional content

2. **POST_PURCHASE_UPDATE**
   - Order updates, shipping notifications
   - Must be related to existing purchase

3. **ACCOUNT_UPDATE**
   - Account status changes
   - Payment issues, security alerts

4. **HUMAN_AGENT** (Special)
   - Only for human customer service responses
   - Valid for 7 days after user message
   - Must be actual human response, not bot

## Prohibited Messaging

### Never Allowed
- Promotional content outside 24h window
- Spam or bulk unsolicited messages
- Advertising in message tags
- Misleading message tag usage

### HUMAN_AGENT Abuse
Using HUMAN_AGENT tag for automated messages is a serious violation:
- Results in immediate bot termination
- Platform ban for repeat offenders

## Best Practices
- Always get opt-in before sending updates
- Provide easy unsubscribe option
- Respect user preferences
- Respond within 24 hours when possible`,
  },

  // === WHATSAPP BUSINESS ===
  {
    id: 'whatsapp-1',
    platform: 'whatsapp',
    title: 'WhatsApp Business Platform Policy',
    url: 'https://developers.facebook.com/docs/whatsapp/',
    content: `# WhatsApp Business Platform

## Authorized APIs Only

### Official APIs
1. **WhatsApp Cloud API** (Recommended)
   - Hosted by Meta
   - Free tier available
   - Easy setup

2. **WhatsApp On-Premises API**
   - Self-hosted
   - For high-volume needs
   - Requires approval

### Prohibited: Unofficial Libraries
These libraries violate WhatsApp Terms:
- whatsapp-web.js
- venom-bot
- baileys / @whiskeysockets/baileys
- wa-automate

Using unofficial APIs can result in:
- Account ban
- Legal action
- Platform termination

## Messaging Requirements

### Message Templates
- Business-initiated conversations require pre-approved templates
- Templates must be approved before use
- Categories: Marketing, Utility, Authentication

### User-Initiated Conversations
- Free form messaging allowed for 24 hours
- Must respond within 24 hours

### Opt-In Requirements
- Must have user consent before messaging
- Clear opt-in process required
- Easy opt-out must be provided

## Quality Rating
- Based on user feedback
- Affects messaging limits
- Block/report rate impacts rating

## Rate Limits
- New accounts: 250 conversations/day
- Verified accounts: 1000+ conversations/day
- Scale with quality rating`,
  },

  // === TOKEN SECURITY ===
  {
    id: 'security-1',
    platform: 'all',
    title: 'Access Token Security',
    url: 'https://developers.facebook.com/docs/facebook-login/security/',
    content: `# Access Token Security

## Types of Access Tokens

### User Access Token
- Represents a user
- Short-lived: ~2 hours
- Long-lived: ~60 days
- Never expose client-side

### App Access Token
- Represents your app
- Never expires (until app secret rotated)
- MUST be kept server-side only
- Format: {app-id}|{app-secret}

### Page Access Token
- Represents a Facebook Page
- Can be permanent with proper permissions

## Security Requirements

### Never Do
- Hardcode tokens in source code
- Include tokens in client-side JavaScript
- Log tokens to console or files
- Share tokens in URLs or query strings
- Commit tokens to version control

### Always Do
- Store tokens in environment variables
- Use server-side token storage
- Encrypt tokens at rest
- Rotate app secret periodically
- Use HTTPS for all API calls

## Token Compromise

### If Token Exposed
1. Rotate affected credentials immediately
2. Check Graph API logs for unauthorized access
3. Report to Facebook Security
4. Notify affected users if needed

### Detecting Compromise
- Monitor for unusual API patterns
- Check token usage in App Dashboard
- Review authorized devices/sessions

## Best Practices

### Environment Variables
\`\`\`bash
# .env (never commit this file)
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
\`\`\`

### Server-Side Only
\`\`\`javascript
// ✅ Good - server-side
const token = process.env.FACEBOOK_ACCESS_TOKEN;

// ❌ Bad - client-side exposure
const token = "EAAA..."; // Never do this
\`\`\``,
  },

  // === MARKETING API ===
  {
    id: 'ads-1',
    platform: 'ads',
    title: 'Marketing API Policies',
    url: 'https://developers.facebook.com/docs/marketing-apis/',
    content: `# Marketing API Policies

## Access Requirements
- Requires Marketing API access approval
- Must pass App Review
- Business verification may be required

## Ad Content Policies

### Prohibited Content
- Discriminatory targeting
- Misleading claims
- Adult content
- Illegal products/services
- Tobacco, drugs, weapons

### Special Categories
Restricted targeting for:
- Housing
- Employment
- Credit/Financial services
- Social issues, elections, politics

## Targeting Restrictions

### Age Targeting
- Alcohol ads: 21+ (US), varies by country
- Dating: 18+
- Financial: May require 18+

### Custom Audiences
- Must have consent for email/phone uploads
- Cannot target based on sensitive info
- Must provide data source

### Lookalike Audiences
- Source audience minimum: 100 people
- Cannot use sensitive data sources

## Rate Limits
- 200 calls per hour per ad account
- Batch requests recommended
- Monitor x-ad-account-usage header

## Reporting Requirements
- Maintain accurate spend tracking
- Provide receipts upon request
- Report discrepancies within 48 hours`,
  },

  // === DATA DELETION ===
  {
    id: 'deletion-1',
    platform: 'all',
    title: 'Data Deletion Requirements',
    url: 'https://developers.facebook.com/docs/development/release/data-deletion/',
    content: `# Data Deletion Requirements

## Callback URL Requirement
All apps must implement a Data Deletion Callback URL

## Implementation

### Callback Endpoint
Your server must:
1. Accept POST requests from Facebook
2. Verify request signature
3. Delete user data
4. Return confirmation

### Request Format
\`\`\`json
{
  "signed_request": "encoded_data_here"
}
\`\`\`

### Response Format
\`\`\`json
{
  "url": "https://yoursite.com/deletion-status?id=abc123",
  "confirmation_code": "abc123"
}
\`\`\`

## Data to Delete
- User profile information
- Activity and interaction data
- Photos, posts, content
- Any derived or processed data

## Timeline Requirements
- Begin deletion within 24 hours
- Complete deletion within 90 days
- Provide status URL for user verification

## Exceptions
May retain data for:
- Legal compliance requirements
- Fraud prevention (limited)
- Legitimate business interests (documented)

## Verification
- Facebook may audit deletion compliance
- Must demonstrate deletion upon request
- Maintain deletion logs for 6 months`,
  },
];

/**
 * Search bundled docs by keyword
 */
export function searchBundledDocs(query: string, limit: number = 5): Array<{
  doc: BundledDoc;
  score: number;
  matchedText: string;
}> {
  const results: Array<{ doc: BundledDoc; score: number; matchedText: string }> = [];
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

  for (const doc of BUNDLED_DOCS) {
    const contentLower = doc.content.toLowerCase();
    let score = 0;
    let matchedText = '';

    // Check title match (higher weight)
    if (doc.title.toLowerCase().includes(queryLower)) {
      score += 10;
    }

    // Check content matches
    for (const word of queryWords) {
      const occurrences = (contentLower.match(new RegExp(word, 'g')) || []).length;
      score += occurrences;

      // Find matched context
      if (occurrences > 0 && !matchedText) {
        const idx = contentLower.indexOf(word);
        const start = Math.max(0, idx - 50);
        const end = Math.min(doc.content.length, idx + 150);
        matchedText = doc.content.substring(start, end);
      }
    }

    // Exact phrase match (bonus)
    if (contentLower.includes(queryLower)) {
      score += 5;
      const idx = contentLower.indexOf(queryLower);
      const start = Math.max(0, idx - 30);
      const end = Math.min(doc.content.length, idx + 200);
      matchedText = doc.content.substring(start, end);
    }

    if (score > 0) {
      results.push({ doc, score, matchedText });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get doc by platform
 */
export function getDocsByPlatform(platform: string): BundledDoc[] {
  return BUNDLED_DOCS.filter(d => d.platform === platform || d.platform === 'all');
}

/**
 * Get all docs
 */
export function getAllBundledDocs(): BundledDoc[] {
  return BUNDLED_DOCS;
}
