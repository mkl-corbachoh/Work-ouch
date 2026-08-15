import { z } from "zod";

const schema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  VITE_AUTH_PROVIDERS: z.string().min(1),
  VITE_AUTH_SCOPES_JSON: z.string().default("{}"),
});
export type WebEnv = z.infer<typeof schema>;
export function getEnv(): WebEnv {
  const parsed = schema.safeParse(import.meta.env);
  if (!parsed.success)
    throw new Error(
      "Web auth configuration is incomplete. Set VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_AUTH_PROVIDERS and VITE_AUTH_SCOPES_JSON.",
    );
  return parsed.data;
}
