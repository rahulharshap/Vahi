import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["node:sqlite", "postgres"],
};

export default config;
