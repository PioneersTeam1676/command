import { hash, verify } from "@node-rs/argon2";

// argon2id is the @node-rs/argon2 default algorithm.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, OPTIONS);

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;
/** Verify against a throwaway hash so unknown emails cost the same time as known ones. */
export async function burnPasswordTime(password: string): Promise<void> {
  dummy ??= hash("not-a-real-password", OPTIONS);
  await verifyPassword(await dummy, password);
}
