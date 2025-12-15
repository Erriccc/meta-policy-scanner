-- Meta Policy Scanner Database Schema
-- Run this in your Supabase SQL Editor

-- Enable pgvector extension for embeddings
create extension if not exists vector;

-- Platforms table
create table if not exists platforms (
  id serial primary key,
  name text unique not null,  -- 'facebook', 'instagram', 'messenger', 'whatsapp', 'ads'
  display_name text not null,
  api_docs_url text,
  created_at timestamptz default now()
);

-- SDK patterns table
create table if not exists sdk_patterns (
  id serial primary key,
  platform_id int references platforms(id),
  sdk_name text not null,
  sdk_type text check (sdk_type in ('official', 'wrapper', 'unofficial', 'deprecated')),
  package_names text[] not null,
  import_patterns text[],
  class_names text[],
  risk_level text check (risk_level in ('safe', 'caution', 'violation')),
  recommendation text,
  policy_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Violation rules table
create table if not exists violation_rules (
  id serial primary key,
  rule_code text unique not null,  -- e.g., 'RATE_LIMIT_MISSING'
  name text not null,
  description text,
  platform text check (platform in ('facebook', 'instagram', 'messenger', 'whatsapp', 'ads', 'all')),
  severity text check (severity in ('error', 'warning', 'info')) default 'warning',
  category text,  -- 'rate-limiting', 'data-storage', 'authentication', etc.

  -- Detection configuration
  detection jsonb not null,  -- {type, pattern, astQuery, semanticHint, fileTypes}

  -- Metadata
  recommendation text,
  fix_example text,  -- Code example of correct implementation
  doc_urls text[],
  tags text[],

  -- Control
  enabled boolean default true,
  is_builtin boolean default false,  -- Built-in vs user-created

  -- Audit
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by text,  -- User/system that created the rule

  -- Search (embedding for semantic search of rules)
  embedding vector(1536)
);

-- Policy documents table (scraped from Meta docs)
create table if not exists policies (
  id serial primary key,
  platform_id int references platforms(id),
  title text not null,
  url text unique not null,
  content text,  -- Full markdown content
  content_hash text,  -- To detect changes
  last_scraped timestamptz,
  created_at timestamptz default now()
);

-- Policy chunks with embeddings (for RAG)
create table if not exists policy_chunks (
  id serial primary key,
  policy_id int references policies(id) on delete cascade,
  chunk_text text not null,
  chunk_index int not null,
  embedding vector(1536),  -- OpenAI text-embedding-3-small
  metadata jsonb,  -- {section, subsection, tags, token_count}
  created_at timestamptz default now()
);

-- Scan results table (optional - for tracking scans)
create table if not exists scan_results (
  id serial primary key,
  source_type text not null,  -- 'local' or 'github'
  source_path text,
  source_url text,
  files_scanned int,
  violations_count int,
  errors_count int,
  warnings_count int,
  scan_duration_ms int,
  results jsonb,  -- Full scan results
  created_at timestamptz default now()
);

-- Create indexes for performance
create index if not exists idx_policy_chunks_embedding
  on policy_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists idx_violation_rules_embedding
  on violation_rules using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists idx_violation_rules_platform on violation_rules(platform);
create index if not exists idx_violation_rules_enabled on violation_rules(enabled);
create index if not exists idx_violation_rules_category on violation_rules(category);
create index if not exists idx_policies_platform on policies(platform_id);
create index if not exists idx_policy_chunks_policy on policy_chunks(policy_id);

-- Triggers for updated_at
create or replace function update_modified_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_sdk_patterns_modtime on sdk_patterns;
create trigger update_sdk_patterns_modtime
  before update on sdk_patterns
  for each row execute function update_modified_column();

drop trigger if exists update_violation_rules_modtime on violation_rules;
create trigger update_violation_rules_modtime
  before update on violation_rules
  for each row execute function update_modified_column();

-- Seed platforms
insert into platforms (name, display_name, api_docs_url) values
  ('facebook', 'Facebook', 'https://developers.facebook.com/docs/graph-api'),
  ('instagram', 'Instagram', 'https://developers.facebook.com/docs/instagram-api'),
  ('messenger', 'Messenger', 'https://developers.facebook.com/docs/messenger-platform'),
  ('whatsapp', 'WhatsApp', 'https://developers.facebook.com/docs/whatsapp'),
  ('ads', 'Marketing API', 'https://developers.facebook.com/docs/marketing-apis')
on conflict (name) do nothing;

-- Function to search policy chunks by similarity
create or replace function search_policy_chunks(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 10
)
returns table (
  id int,
  policy_id int,
  chunk_text text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    pc.id,
    pc.policy_id,
    pc.chunk_text,
    pc.metadata,
    1 - (pc.embedding <=> query_embedding) as similarity
  from policy_chunks pc
  where 1 - (pc.embedding <=> query_embedding) > match_threshold
  order by pc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Function to search rules by similarity
create or replace function search_rules(
  query_embedding vector(1536),
  match_threshold float default 0.5,
  match_count int default 5
)
returns table (
  id int,
  rule_code text,
  name text,
  description text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    vr.id,
    vr.rule_code,
    vr.name,
    vr.description,
    1 - (vr.embedding <=> query_embedding) as similarity
  from violation_rules vr
  where vr.embedding is not null
    and 1 - (vr.embedding <=> query_embedding) > match_threshold
  order by vr.embedding <=> query_embedding
  limit match_count;
end;
$$;
