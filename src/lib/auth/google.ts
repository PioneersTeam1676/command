import { decodeIdToken, generateCodeVerifier, generateState, Google } from "arctic";
import { getEnv, googleAuthEnabled } from "@/lib/env";
import type { GoogleClaims } from "@/lib/accounts";

/** Google OAuth via `arctic`. Kept in one file so the library is easy to swap. */
function client() {
  const e = getEnv();
  return new Google(e.GOOGLE_CLIENT_ID!, e.GOOGLE_CLIENT_SECRET!, `${e.APP_URL.replace(/\/$/, "")}/auth/google/callback`);
}

export const googleEnabled = googleAuthEnabled;

export function startGoogleAuth() {
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = client().createAuthorizationURL(state, verifier, ["openid", "profile", "email"]);
  url.searchParams.set("prompt", "select_account");
  return { url, state, verifier };
}

export async function finishGoogleAuth(code: string, verifier: string): Promise<GoogleClaims | null> {
  try {
    const tokens = await client().validateAuthorizationCode(code, verifier);
    const claims = decodeIdToken(tokens.idToken()) as Record<string, unknown>;
    if (typeof claims.sub !== "string" || typeof claims.email !== "string") return null;
    return {
      sub: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true,
      name: typeof claims.name === "string" ? claims.name : claims.email,
    };
  } catch {
    return null;
  }
}
