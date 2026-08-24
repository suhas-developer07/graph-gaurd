/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@graphguard/config", "@graphguard/db", "@graphguard/observability"],
};

export default nextConfig;
