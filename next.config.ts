import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "pg", "web-push", "node-ical", "nodemailer", "googleapis"],
};

export default config;
