const URL_KEY = "lunar_supabase_url";
const ANON_KEY = "lunar_supabase_anon";

export function getSupabaseUrl() {
  return (
    localStorage.getItem(URL_KEY) ||
    import.meta.env.VITE_SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");
}

export function getSupabaseAnon() {
  return (
    localStorage.getItem(ANON_KEY) ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    ""
  );
}

export function saveSupabaseConfig(url: string, anon: string) {
  localStorage.setItem(URL_KEY, url.replace(/\/$/, ""));
  localStorage.setItem(ANON_KEY, anon);
}

export function isConfigured() {
  const url = getSupabaseUrl();
  const anon = getSupabaseAnon();
  return Boolean(url && anon && url.includes("supabase.co"));
}
