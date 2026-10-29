import { z } from "zod";

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : !["false", "0", "no", "off"].includes(v.toLowerCase())));

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.preprocess(emptyToUndef, z.url().default("http://localhost:3000")),
  TZ: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LEADERBOARD_ENABLED: bool(true),
  GOOGLE_CLIENT_ID: z.preprocess(emptyToUndef, z.string().optional()),
  GOOGLE_CLIENT_SECRET: z.preprocess(emptyToUndef, z.string().optional()),
  SMTP_HOST: z.preprocess(emptyToUndef, z.string().optional()),
  SMTP_PORT: z.preprocess(emptyToUndef, z.coerce.number().int().positive().default(587)),
  SMTP_USER: z.preprocess(emptyToUndef, z.string().optional()),
  SMTP_PASSWORD: z.preprocess(emptyToUndef, z.string().optional()),
  SMTP_FROM: z.preprocess(emptyToUndef, z.string().optional()),
  GOOGLE_CALENDAR_MODE: z.preprocess(emptyToUndef, z.enum(["off", "ics", "api"]).default("off")),
  /** Let the ICS address point at a private network (e.g. a calendar server on your LAN). Off by default. */
  ICS_ALLOW_PRIVATE_NETWORKS: bool(false),
  GOOGLE_CALENDAR_ICS_URL: z.preprocess(emptyToUndef, z.string().optional()),
  GOOGLE_CALENDAR_ID: z.preprocess(emptyToUndef, z.string().optional()),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.preprocess(emptyToUndef, z.string().optional()),
  /** Encrypts shared-login passwords and authenticator secrets. Unset turns the feature off. */
  SHARED_LOGIN_KEY: z.preprocess(emptyToUndef, z.string().min(32, "SHARED_LOGIN_KEY must be at least 32 characters (openssl rand -base64 32)").optional()),
  SETUP_TOKEN: z.preprocess(emptyToUndef, z.string().min(8).optional()),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parse and cache environment. Throws a readable error listing every problem. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  cached = parsed.data;
  return cached;
}

export const smtpConfigured = () => {
  const e = getEnv();
  return Boolean(e.SMTP_HOST && e.SMTP_FROM);
};

export const googleAuthEnabled = () => {
  const e = getEnv();
  return Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
};

/** Test-only helper. */
export function resetEnvCache() {
  cached = undefined;
}
