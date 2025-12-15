# Web UI vs CLI Strategy - Final Decision

## TL;DR: Build BOTH (Hybrid Approach) ✅

**Phase 1**: CLI (npm package) - 4-6 weeks
**Phase 2**: Web UI (Next.js + Supabase) - 4-6 weeks

This gives you the best of both worlds with minimal extra effort.

---

## Option Analysis

### Option 1: CLI Only ⚡

```bash
npm install -g meta-policy-scanner
meta-scan scan https://github.com/user/repo
```

**Pros**:
- ✅ Fast to build (4-6 weeks)
- ✅ Perfect for developers
- ✅ Easy CI/CD integration
- ✅ Works offline
- ✅ Scriptable/automatable
- ✅ Low hosting costs ($0)

**Cons**:
- ❌ Barriers for non-technical users
- ❌ No visual interface
- ❌ Hard to share results
- ❌ Limited collaboration features

**Best For**: Developers, CI/CD pipelines, automated scanning

---

### Option 2: Web UI Only 🌐

```
https://meta-policy-scanner.com
[Paste GitHub URL] → [Scan] → [View Results]
```

**Pros**:
- ✅ Accessible to everyone
- ✅ Beautiful visualizations
- ✅ Easy to share results
- ✅ Team collaboration
- ✅ No installation needed

**Cons**:
- ❌ Requires hosting (~$20-50/month)
- ❌ Harder for CI/CD integration
- ❌ Always online dependency
- ❌ Slower to build (8-10 weeks)
- ❌ Can't scan local files easily

**Best For**: Non-developers, marketing teams, quick checks

---

### Option 3: Hybrid (CLI + Web UI) 🚀 **RECOMMENDED**

```bash
# For developers
npm install -g meta-policy-scanner
meta-scan scan ./my-project

# For everyone else
Visit: https://meta-policy-scanner.com
Paste GitHub URL → Get instant results
```

**Pros**:
- ✅ Best of both worlds
- ✅ Wider market reach
- ✅ Multiple revenue streams
- ✅ Flexible deployment options
- ✅ Shared backend (Supabase)

**Cons**:
- ⚠️ More work (but not 2x - shared backend!)
- ⚠️ Need hosting for web version

**Best For**: Everyone! Maximum market penetration

---

## Recommended Architecture (Hybrid)

### Shared Backend (Supabase)

```
┌─────────────────────────────────────────────┐
│           Supabase Backend                   │
│  - Policies (shared)                         │
│  - Rules (shared)                            │
│  - Embeddings (shared)                       │
│  - Scan Results (new!)                       │
│  - User Accounts (web only)                  │
└──────────┬───────────────────┬───────────────┘
           │                   │
    ┌──────▼──────┐     ┌─────▼──────────┐
    │  CLI Tool   │     │   Web UI       │
    │  (Phase 1)  │     │   (Phase 2)    │
    └─────────────┘     └────────────────┘
```

### Phase 1: CLI (MVP) - 4-6 weeks

**Core Features**:
- Scan local directories
- Scan GitHub repos (public/private)
- SDK detection
- Rule engine
- Console + JSON output
- Supabase integration

**Deliverable**: npm package
```bash
npm install -g meta-policy-scanner
meta-scan scan ./project
```

### Phase 2: Web UI - 4-6 weeks

**Core Features**:
- GitHub repo input form
- Real-time scanning progress
- Beautiful result visualization
- Share scan results
- PocketFlow integration (project understanding)
- User accounts (optional)

**Deliverable**: Web app at meta-policy-scanner.com

---

## Web UI Design (Phase 2)

### Homepage

```
┌─────────────────────────────────────────────────────┐
│  Meta API Policy Scanner                             │
│  Scan your codebase for policy violations            │
│                                                       │
│  ┌──────────────────────────────────────────────┐   │
│  │ https://github.com/user/repo              🔍 │   │
│  └──────────────────────────────────────────────┘   │
│                                                       │
│  ✅ Facebook  ✅ Instagram  ✅ Messenger  ✅ Ads     │
│                                                       │
│  [Scan Repository]                                    │
│                                                       │
│  Or try with example:                                 │
│  • facebook-nodejs-business-sdk                       │
│  • Example with violations                            │
└─────────────────────────────────────────────────────┘
```

### Scanning Page

```
┌─────────────────────────────────────────────────────┐
│  Scanning: github.com/user/repo                      │
│                                                       │
│  ⏳ Cloning repository...           [████████] 100%  │
│  ⏳ Analyzing files...              [███░░░░░]  40%  │
│  ⏳ Checking SDK usage...           [░░░░░░░░]   0%  │
│  ⏳ Running policy checks...        [░░░░░░░░]   0%  │
│                                                       │
│  Files analyzed: 127 / 315                            │
│  Violations found: 3                                  │
└─────────────────────────────────────────────────────┘
```

### Results Page

```
┌─────────────────────────────────────────────────────┐
│  Scan Results: user/repo                             │
│  Scanned: Dec 14, 2024 • 315 files                   │
│  Share: [Copy Link] [Export JSON] [Export PDF]       │
│                                                       │
│  Summary                                              │
│  ┌───────────────────────────────────────────────┐   │
│  │ ✗ 2 Errors  ⚠ 4 Warnings  ℹ 1 Info           │   │
│  │                                                │   │
│  │ SDK Usage:                                     │   │
│  │ • 1 official SDK                               │   │
│  │ • 3 direct API calls                           │   │
│  │ • ⚠ 1 unofficial library                       │   │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  Violations                                           │
│  ┌───────────────────────────────────────────────┐   │
│  │ ✗ Unofficial Instagram Library                │   │
│  │   src/services/instagram.ts:5                 │   │
│  │                                                │   │
│  │   Using instagram-private-api violates Meta   │   │
│  │   Platform Terms.                              │   │
│  │                                                │   │
│  │   📚 [Explain this violation]                 │   │
│  │   ✨ [Show how to fix]                        │   │
│  │   🔧 [Auto-fix (coming soon)]                 │   │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  Project Understanding (PocketFlow)                   │
│  ┌───────────────────────────────────────────────┐   │
│  │ 🧠 [Understand this codebase]                 │   │
│  │                                                │   │
│  │ Get AI-generated analysis of:                  │   │
│  │ • Core abstractions                            │   │
│  │ • Meta API usage patterns                      │   │
│  │ • Architecture overview                        │   │
│  │ • Recommended improvements                     │   │
│  └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### PocketFlow Integration (Understanding Mode)

```
┌─────────────────────────────────────────────────────┐
│  Project Understanding: user/repo                    │
│                                                       │
│  🧠 AI Analysis (powered by Claude)                  │
│                                                       │
│  Core Abstractions:                                   │
│  ┌───────────────────────────────────────────────┐   │
│  │ 1. FacebookClient (src/client.ts)             │   │
│  │    Purpose: Main API client                    │   │
│  │    Uses: Graph API v18.0                       │   │
│  │    ⚠ Issue: No rate limit handling            │   │
│  │                                                │   │
│  │ 2. UserService (src/services/user.ts)         │   │
│  │    Purpose: User data management               │   │
│  │    Dependencies: FacebookClient                │   │
│  │    ✓ Good: Permission checks                   │   │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  Interaction Flow:                                    │
│  [Mermaid Diagram]                                    │
│                                                       │
│  Recommendations:                                     │
│  1. Add rate limit handling to FacebookClient        │
│  2. Extract common error handling                    │
│  3. Consider caching user data                       │
│                                                       │
│  [Generate Tutorial] [Export Analysis]                │
└─────────────────────────────────────────────────────┘
```

---

## Technical Implementation (Web UI)

### Tech Stack

```typescript
// Frontend
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui (components)
- Zustand (state)

// Backend
- Supabase (database + auth)
- Supabase Edge Functions (scanning jobs)
- Supabase Realtime (progress updates)

// Queue
- Supabase pg_cron + Queue
- Or: Upstash QStash (serverless queue)
```

### Project Structure

```
meta-policy-scanner/
├── apps/
│   ├── cli/                    # CLI tool (Phase 1)
│   │   └── src/
│   │       ├── commands/
│   │       ├── scanner/
│   │       └── ...
│   │
│   └── web/                    # Web UI (Phase 2)
│       ├── app/                # Next.js app
│       │   ├── page.tsx        # Homepage
│       │   ├── scan/
│       │   │   └── [id]/       # Results page
│       │   └── api/
│       │       └── scan/       # API routes
│       ├── components/
│       │   ├── ScanForm.tsx
│       │   ├── Results.tsx
│       │   └── PocketFlow.tsx
│       └── lib/
│
├── packages/
│   ├── scanner/                # Shared scanner logic
│   ├── rules/                  # Shared rules
│   └── types/                  # Shared types
│
└── supabase/
    ├── functions/              # Edge Functions
    │   ├── scan-repo/          # GitHub scanning
    │   └── analyze-code/       # PocketFlow analysis
    └── migrations/             # DB schema
```

### Database Schema (Extended for Web)

```sql
-- Existing tables (Phase 1)
create table platforms (...);
create table policies (...);
create table violation_rules (...);
create table policy_chunks (...);

-- New tables for Web UI (Phase 2)

-- Scan results (shareable)
create table scans (
  id uuid primary key default uuid_generate_v4(),
  github_url text,
  branch text default 'main',
  status text check (status in ('queued', 'scanning', 'completed', 'failed')),
  progress int default 0,
  results jsonb,
  created_at timestamptz default now(),
  completed_at timestamptz,
  user_id uuid references auth.users(id),  -- Optional: if adding auth
  share_token text unique,  -- For sharing results
  is_public boolean default false
);

-- Scan violations (detailed)
create table scan_violations (
  id serial primary key,
  scan_id uuid references scans(id) on delete cascade,
  rule_code text,
  severity text,
  file_path text,
  line_number int,
  code_snippet text,
  explanation text,  -- PocketFlow explanation
  fix_tutorial text, -- PocketFlow tutorial
  created_at timestamptz default now()
);

-- SDK detections
create table sdk_detections (
  id serial primary key,
  scan_id uuid references scans(id) on delete cascade,
  sdk_name text,
  sdk_type text,
  file_path text,
  line_number int,
  risk_level text
);

-- Indexes
create index idx_scans_status on scans(status);
create index idx_scans_share_token on scans(share_token);
create index idx_scan_violations_scan_id on scan_violations(scan_id);
```

### API Routes

```typescript
// app/api/scan/route.ts

import { createClient } from '@/lib/supabase';

export async function POST(request: Request) {
  const { githubUrl, branch } = await request.json();

  // Validate GitHub URL
  if (!isValidGitHubUrl(githubUrl)) {
    return Response.json({ error: 'Invalid GitHub URL' }, { status: 400 });
  }

  const supabase = createClient();

  // Create scan record
  const { data: scan } = await supabase
    .from('scans')
    .insert({
      github_url: githubUrl,
      branch: branch || 'main',
      status: 'queued',
      share_token: generateShareToken(),
    })
    .select()
    .single();

  // Queue scanning job (Supabase Edge Function)
  await supabase.functions.invoke('scan-repo', {
    body: { scanId: scan.id, githubUrl, branch },
  });

  return Response.json({ scanId: scan.id });
}

// app/api/scan/[id]/route.ts

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const { data: scan } = await supabase
    .from('scans')
    .select(`
      *,
      violations:scan_violations(*),
      sdk_detections(*)
    `)
    .eq('id', params.id)
    .single();

  return Response.json(scan);
}
```

### Supabase Edge Function (Scanning)

```typescript
// supabase/functions/scan-repo/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const { scanId, githubUrl, branch } = await req.json();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Update status
    await supabase
      .from('scans')
      .update({ status: 'scanning', progress: 0 })
      .eq('id', scanId);

    // Clone repo (to temp storage)
    await updateProgress(scanId, 10, 'Cloning repository...');
    const repoPath = await cloneRepo(githubUrl, branch);

    // Scan files
    await updateProgress(scanId, 30, 'Analyzing files...');
    const files = await discoverFiles(repoPath);

    // Detect SDKs
    await updateProgress(scanId, 50, 'Detecting SDK usage...');
    const sdkDetections = await detectSDKs(files);

    // Run rules
    await updateProgress(scanId, 70, 'Checking policy violations...');
    const violations = await runRules(files);

    // Store results
    await updateProgress(scanId, 90, 'Saving results...');

    for (const violation of violations) {
      await supabase.from('scan_violations').insert({
        scan_id: scanId,
        ...violation,
      });
    }

    for (const detection of sdkDetections) {
      await supabase.from('sdk_detections').insert({
        scan_id: scanId,
        ...detection,
      });
    }

    // Mark complete
    await supabase
      .from('scans')
      .update({
        status: 'completed',
        progress: 100,
        results: { summary: { files: files.length, violations: violations.length } },
        completed_at: new Date().toISOString(),
      })
      .eq('id', scanId);

    // Cleanup
    await cleanup(repoPath);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    await supabase
      .from('scans')
      .update({ status: 'failed', progress: 0 })
      .eq('id', scanId);

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

async function updateProgress(scanId: string, progress: number, message: string) {
  // Update via Supabase Realtime for live updates in UI
  await supabase
    .from('scans')
    .update({ progress })
    .eq('id', scanId);
}
```

### Real-time Progress Updates

```typescript
// components/ScanProgress.tsx

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

export function ScanProgress({ scanId }: { scanId: string }) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('queued');

  useEffect(() => {
    const supabase = createClient();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`scan:${scanId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scans',
          filter: `id=eq.${scanId}`,
        },
        (payload) => {
          setProgress(payload.new.progress);
          setStatus(payload.new.status);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [scanId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {status === 'scanning' ? 'Scanning...' : status}
        </span>
        <span className="text-sm font-medium">{progress}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
```

### PocketFlow Integration (Web)

```typescript
// app/api/analyze/route.ts

export async function POST(request: Request) {
  const { scanId } = await request.json();

  const supabase = createClient();

  // Get scan data
  const { data: scan } = await supabase
    .from('scans')
    .select('*, violations:scan_violations(*)')
    .eq('id', scanId)
    .single();

  // Call LLM for analysis
  const analysis = await generateCodebaseAnalysis({
    githubUrl: scan.github_url,
    violations: scan.violations,
    sdkUsage: scan.sdk_detections,
  });

  return Response.json(analysis);
}

async function generateCodebaseAnalysis(context: any) {
  const prompt = `
    Analyze this codebase and provide:
    1. Core abstractions and their roles
    2. Meta API usage patterns
    3. Architecture overview
    4. Recommendations for improvements

    Context:
    - GitHub: ${context.githubUrl}
    - Violations: ${context.violations.length}
    - SDK Usage: ${context.sdkUsage}

    Provide a beginner-friendly explanation.
  `;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}
```

---

## Deployment

### CLI (Phase 1)
```bash
# Publish to npm
npm publish

# Users install globally
npm install -g meta-policy-scanner
meta-scan scan ./project
```

### Web UI (Phase 2)

**Option A: Vercel (Recommended)**
```bash
# Deploy Next.js app
vercel deploy --prod

# Environment variables:
# - SUPABASE_URL
# - SUPABASE_ANON_KEY
# - OPENAI_API_KEY (for PocketFlow)
```

**Option B: Self-hosted**
```bash
# Docker
docker build -t meta-policy-scanner-web .
docker run -p 3000:3000 meta-policy-scanner-web
```

---

## Cost Comparison

### CLI Only
| Service | Cost |
|---------|------|
| Supabase | Free |
| OpenAI | $2-5/mo |
| **Total** | **$2-5/mo** |

### Web UI + CLI
| Service | Cost |
|---------|------|
| Supabase | Free (or $25 Pro) |
| Vercel | Free (or $20 Pro) |
| OpenAI | $10-20/mo |
| **Total** | **$10-65/mo** |

**Web brings hosting costs but enables:**
- Wider audience
- Freemium model
- Potential revenue ($9-29/mo per user)
- ROI: Break even at 1-3 paying users

---

## Monetization Strategy (Web UI)

### Freemium Model

**Free Tier**:
- 5 scans/month
- Public repos only
- Basic violations
- Results expire after 30 days

**Pro Tier ($19/month)**:
- Unlimited scans
- Private repos
- PocketFlow analysis
- Persistent results
- API access
- Priority support

**Enterprise ($99/month)**:
- Everything in Pro
- Team collaboration
- Custom rules
- SSO integration
- SLA guarantees

---

## Timeline (Both)

### Phase 1: CLI (Weeks 1-6) ✅
- Core scanner
- Rule engine
- GitHub integration
- npm package

### Phase 2: Web UI (Weeks 7-12)
- Next.js app
- Supabase integration
- Real-time scanning
- PocketFlow integration
- Deploy to Vercel

**Total**: 12 weeks for both

---

## Recommendation: Hybrid Approach 🎯

### Why Both?

1. **Market Coverage**
   - CLI: Developers, CI/CD (80% of early adopters)
   - Web: Non-devs, quick checks (20%, but growing)

2. **Shared Backend**
   - Rules database (used by both)
   - Embeddings (used by both)
   - Scanner logic (shared package)
   - **Not 2x the work!**

3. **Revenue Potential**
   - CLI: Open source, npm downloads, credibility
   - Web: Freemium SaaS, recurring revenue

4. **Product Evolution**
   - Start with CLI (fast MVP)
   - Add web UI (expand market)
   - Both feed into each other

### Decision Matrix

| Criteria | CLI Only | Web Only | Both |
|----------|----------|----------|------|
| Time to MVP | 4-6 weeks | 8-10 weeks | 6 weeks (CLI first) |
| Market reach | Developers | Everyone | Maximum |
| Revenue potential | Low | Medium | High |
| Complexity | Low | Medium | Medium |
| Hosting cost | $0 | $20-50/mo | $20-50/mo |
| CI/CD integration | Excellent | Poor | Excellent |
| **Recommendation** | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## Final Recommendation

### Build Both (Staged)

**Stage 1 (Weeks 1-6): CLI MVP**
- Focus on core functionality
- npm package
- Perfect for developers
- Get feedback

**Stage 2 (Weeks 7-12): Web UI**
- Build on proven CLI
- Add PocketFlow features
- Broader market
- Revenue potential

**Stage 3 (Months 4-6): Ecosystem**
- VS Code extension
- GitHub Action
- API access
- Enterprise features

---

## Next Steps

1. **Decide on approach**:
   - CLI only (fastest)
   - Web only (accessible)
   - Both (recommended) ✅

2. **If Both**:
   - Start with CLI implementation
   - Launch on npm
   - Get feedback
   - Build web UI
   - Launch SaaS

3. **Create Web UI designs**:
   - Figma mockups
   - User flows
   - Component library

Would you like me to create:
1. Detailed web UI mockups (Figma-style ASCII)?
2. Complete Next.js boilerplate code?
3. Supabase Edge Functions for scanning?
4. Marketing landing page copy?

Let me know and I'll create those files!
