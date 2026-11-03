import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnon, getSupabaseUrl, isConfigured } from "./config";

let client: SupabaseClient | null = null;

export function getClient() {
  if (!isConfigured()) return null;
  if (!client) {
    client = createClient(getSupabaseUrl(), getSupabaseAnon(), {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

export function resetClient() {
  client = null;
}
