-- Migration: Multi-Provider Embeddings Support
--
-- This migration updates the schema to support multiple embedding providers:
-- - Voyage AI (1024 dimensions) - FREE 200M tokens
-- - HuggingFace (384 dimensions) - FREE
-- - OpenAI (1536 dimensions) - Paid
--
-- RUN THIS AFTER the initial schema.sql

-- Step 1: Add embedding_dimensions column to track what was used
ALTER TABLE policy_chunks ADD COLUMN IF NOT EXISTS embedding_dimensions int;

-- Step 2: Drop the existing vector column and recreate without dimension constraint
-- NOTE: This will DELETE existing embeddings. Re-ingest docs after running this.
ALTER TABLE policy_chunks DROP COLUMN IF EXISTS embedding;

-- Step 3: Add new embedding column - we'll use 512 for Voyage AI voyage-3-lite (FREE)
-- For other providers, see the migration notes below
ALTER TABLE policy_chunks ADD COLUMN embedding vector(512);

-- Step 4: Update the metadata to include provider info
COMMENT ON COLUMN policy_chunks.embedding IS 'Vector embedding (1024 dims for Voyage AI, modify for other providers)';
COMMENT ON COLUMN policy_chunks.embedding_dimensions IS 'Actual dimensions of the embedding (384, 1024, or 1536)';

-- Step 5: Recreate the index for the new dimension
DROP INDEX IF EXISTS idx_policy_chunks_embedding;
CREATE INDEX idx_policy_chunks_embedding
  ON policy_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Step 6: Update the search function to accept variable dimension embeddings
-- Note: The query embedding MUST match the stored embedding dimensions
CREATE OR REPLACE FUNCTION search_policy_chunks(
  query_embedding vector(512),  -- Match the column dimension (512 for voyage-3-lite)
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id int,
  policy_id int,
  chunk_text text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pc.id,
    pc.policy_id,
    pc.chunk_text,
    pc.metadata,
    1 - (pc.embedding <=> query_embedding) AS similarity
  FROM policy_chunks pc
  WHERE pc.embedding IS NOT NULL
    AND 1 - (pc.embedding <=> query_embedding) > match_threshold
  ORDER BY pc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- ALTERNATIVE MIGRATIONS FOR OTHER PROVIDERS
-- ============================================================================

-- FOR HUGGINGFACE (384 dimensions), run this instead of Step 3:
-- ALTER TABLE policy_chunks ADD COLUMN embedding vector(384);
-- And update the search function parameter to vector(384)

-- FOR OPENAI (1536 dimensions), keep the original schema or run:
-- ALTER TABLE policy_chunks ADD COLUMN embedding vector(1536);
-- And update the search function parameter to vector(1536)

-- ============================================================================
-- IMPORTANT NOTES
-- ============================================================================
--
-- 1. All embeddings in the database MUST use the same provider/dimensions
-- 2. If you switch providers, you need to re-embed all documents
-- 3. The query embedding dimension MUST match the stored embedding dimension
-- 4. Voyage AI (1024 dims) is recommended - FREE 200M tokens!
--
-- To re-ingest after migration:
--   node dist/bin/cli.js docs ingest urls.txt --provider voyage
