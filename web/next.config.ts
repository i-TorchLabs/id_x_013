import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    async redirects() {
        return [
            {
                source: "/",
                destination: "/f/login",
                permanent: false,
            },
        ];
    },
    allowedDevOrigins: ["*"],
};

export default nextConfig;
