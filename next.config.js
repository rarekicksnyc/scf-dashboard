/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained production server under .next/standalone so the
  // Docker image (or any host) runs the app with only Node — no full
  // node_modules copy. Standard Next.js production setting.
  output: "standalone",
  // The Postgres driver uses Node built-ins (fs/net/etc.); keep it out of the
  // webpack bundle and require it at runtime.
  serverExternalPackages: ["pg"],
};

module.exports = nextConfig;
