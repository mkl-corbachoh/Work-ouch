import {
  createClient,
  type Provider,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { getEnv } from "./env";

let client: SupabaseClient | undefined;
type AuthSession = { access_token: string };
export type AuthEvent =
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "INITIAL_SESSION";
type AuthListener = (event: AuthEvent, session: AuthSession | null) => void;
const fakeListeners = new Set<AuthListener>();
type AuthClientLike = {
  auth: {
    getSession: () => Promise<{ data: { session: AuthSession | null } }>;
    refreshSession: () => Promise<{
      data: { session: AuthSession | null };
      error: Error | null;
    }>;
    signOut: () => Promise<{ error: Error | null }>;
    signInWithOAuth: (options: {
      provider: Provider;
      options?: { redirectTo?: string; scopes?: string };
    }) => Promise<{ data: { url?: string }; error: Error | null }>;
    exchangeCodeForSession: (code: string) => Promise<{
      data: { session: AuthSession | null };
      error: Error | null;
    }>;
    onAuthStateChange?: (listener: AuthListener) => {
      data: { subscription: { unsubscribe: () => void } };
    };
  };
};
const fakeSession: AuthSession = { access_token: "e2e-token" };
const isFake = () => import.meta.env.VITE_E2E_FAKE_AUTH === "true";
const fakeClient: AuthClientLike = {
  auth: {
    async getSession() {
      return {
        data: {
          session: sessionStorage.getItem("fakeSession") ? fakeSession : null,
        },
      };
    },
    async refreshSession() {
      return { data: { session: fakeSession }, error: null };
    },
    async signOut() {
      sessionStorage.removeItem("fakeSession");
      for (const listener of fakeListeners) listener("SIGNED_OUT", null);
      return { error: null };
    },
    async signInWithOAuth() {
      sessionStorage.setItem("fakeSession", "1");
      for (const listener of fakeListeners) listener("SIGNED_IN", fakeSession);
      return {
        data: { url: `${location.origin}/auth/callback?code=fake` },
        error: null,
      };
    },
    async exchangeCodeForSession(code) {
      if (code === "fail")
        return { data: { session: null }, error: new Error("exchange failed") };
      sessionStorage.setItem("fakeSession", "1");
      for (const listener of fakeListeners) listener("SIGNED_IN", fakeSession);
      return { data: { session: fakeSession }, error: null };
    },
  },
};
export function supabase() {
  if (isFake()) return fakeClient;
  if (!client) {
    const e = getEnv();
    client = createClient(
      e.VITE_SUPABASE_URL,
      e.VITE_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: false,
          persistSession: true,
          autoRefreshToken: true,
        },
      },
    );
  }
  return client;
}
export function subscribeAuth(listener: AuthListener) {
  const client = supabase() as AuthClientLike;
  if (isFake()) {
    fakeListeners.add(listener);
    return () => fakeListeners.delete(listener);
  }
  const subscription =
    client.auth.onAuthStateChange?.(listener).data.subscription;
  return () => subscription?.unsubscribe();
}
export function safeNext(value: string | null) {
  return value?.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
    ? value
    : "/";
}
export async function signIn(provider: Provider) {
  const e = getEnv();
  const scopes = JSON.parse(e.VITE_AUTH_SCOPES_JSON) as Record<string, string>;
  const result = await supabase().auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${location.origin}/auth/callback`,
      scopes: scopes[provider],
    },
  });
  if (result.error) throw result.error;
  if (result.data.url) location.assign(result.data.url);
}
export async function callback(code: string) {
  return supabase().auth.exchangeCodeForSession(code);
}
export type { Session };
