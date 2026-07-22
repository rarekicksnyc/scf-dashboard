/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Postgres driver uses Node built-ins (fs/net/etc.); keep it out of the
  // webpack bundle and require it at runtime.
  serverExternalPackages: ["pg"],
};

module.exports = nextConfig;
