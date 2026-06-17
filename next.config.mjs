/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle at .next/standalone so the Docker runtime
  // image ships only the traced node_modules, not the full dependency tree.
  output: "standalone",
};

export default nextConfig;
