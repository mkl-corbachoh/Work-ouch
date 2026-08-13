import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import type { ExternalIdentity } from "./auth.types";

export interface AuthProvider {
  verify(token: string): Promise<ExternalIdentity>;
}

type Claims = JWTPayload & { email?: unknown };

export class SupabaseAuthProvider implements AuthProvider {
  private readonly keys;
  constructor(
    private readonly issuer: string,
    private readonly audience: string,
    jwksUrl: string,
  ) {
    this.keys = createRemoteJWKSet(new URL(jwksUrl));
  }

  async verify(token: string): Promise<ExternalIdentity> {
    const { payload } = await jwtVerify<Claims>(token, this.keys, {
      algorithms: ["RS256"],
      issuer: this.issuer,
      audience: this.audience,
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0)
      throw new Error("Missing subject");
    return {
      provider: "supabase",
      subject: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
    };
  }
}
