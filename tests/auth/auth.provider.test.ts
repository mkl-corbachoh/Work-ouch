import { exportJWK, generateKeyPair, generateSecret, SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { SupabaseAuthProvider } from "../../src/modules/auth/auth.provider";

const issuer = "https://issuer.example";
const audience = "training-api";

describe("SupabaseAuthProvider", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("requires a valid RS256 signature, issuer, audience and expiration", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test-key";
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { "content-type": "application/json" },
      });

    const provider = new SupabaseAuthProvider(
      issuer,
      audience,
      `${issuer}/.well-known/jwks.json`,
    );
    const createToken = (tokenIssuer = issuer, tokenAudience = audience) =>
      new SignJWT({ email: "alice@example.com" })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setSubject("alice-sub")
        .setIssuer(tokenIssuer)
        .setAudience(tokenAudience)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);

    await expect(provider.verify(await createToken())).resolves.toEqual({
      provider: "supabase",
      subject: "alice-sub",
      email: "alice@example.com",
    });
    await expect(
      provider.verify(await createToken("https://attacker.example")),
    ).rejects.toThrow();
    await expect(
      provider.verify(await createToken(issuer, "another-api")),
    ).rejects.toThrow();
    const expired = await new SignJWT({ email: "alice@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setSubject("alice-sub")
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("-1s")
      .sign(privateKey);
    await expect(provider.verify(expired)).rejects.toThrow();
    const hmacKey = await generateSecret("HS256");
    const wrongAlgorithm = await new SignJWT({ email: "alice@example.com" })
      .setProtectedHeader({ alg: "HS256", kid: "test-key" })
      .setSubject("alice-sub")
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(hmacKey);
    await expect(provider.verify(wrongAlgorithm)).rejects.toThrow();
  });
});
