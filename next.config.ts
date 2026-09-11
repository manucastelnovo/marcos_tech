import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Without this Turbopack walks up past the project and picks a stray
    // package-lock.json from the user's home directory as the workspace root.
    root: path.resolve(__dirname),
  },
  images: {
    // Repair photos are served either from Vercel Blob or from the local
    // development route. Both are already sized and cached.
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
};

export default nextConfig;
