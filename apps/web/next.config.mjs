/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@integraguard/schemas",
    "@integraguard/workflow",
    "@integraguard/artifact-builder",
    "@integraguard/agents",
    "@integraguard/tools",
  ],
};

export default nextConfig;
