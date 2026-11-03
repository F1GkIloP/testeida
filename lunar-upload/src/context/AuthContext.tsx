import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getClient } from "../lib/supabase";
import type { Profile } from "../lib/types";

type Ctx = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    const sb = getClient();
    if (!sb) return;
    for (let i = 0; i < 8; i++) {
      const { data, error } = await sb
        .from("profiles")
        .select("*, nft:nft_usernames!profiles_nft_username_id_fkey(*)")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setProfile(data as Profile);
        return;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    setProfile(null);
  }

  async function refresh() {
    const sb = getClient();
    if (!sb || !session?.user.id) return;
    await loadProfile(session.user.id);
  }

  useEffect(() => {
    const sb = getClient();
    if (!sb) {
      setLoading(false);
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user.id) {
        loadProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, next) => {
      setSession(next);
      if (next?.user.id) loadProfile(next.user.id);
      else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      refresh,
      signOut: async () => {
        await getClient()?.auth.signOut();
        setProfile(null);
      },
    }),
    [session, profile, loading]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}
