import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

let supabaseInstance: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase configuration.\n' +
      'Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.\n' +
      'Run: meta-scan init to create a configuration file.'
    );
  }

  supabaseInstance = createSupabaseClient(supabaseUrl, supabaseKey);
  return supabaseInstance;
}

export function getClient(): SupabaseClient | null {
  return supabaseInstance;
}

export async function testConnection(): Promise<boolean> {
  try {
    const client = createClient();
    const { error } = await client.from('platforms').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}
