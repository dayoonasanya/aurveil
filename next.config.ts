import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/aurveil",
  assetPrefix: "/aurveil/",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
