import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", "node_modules/**", "registry/**", "drizzle/**", "public/sw.js", "next-env.d.ts"] },
];

export default config;
