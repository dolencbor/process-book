import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{
      protocol: "https",
      hostname: "cdn.sanity.io",
      pathname: "/images/6ny2t94o/production/**",
    }],
  },
};

export default nextConfig;
