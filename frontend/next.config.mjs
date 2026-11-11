// On Render the blueprint passes the gateway's public hostname as API_HOST; on Vercel set NEXT_PUBLIC_API_URL.
const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.API_HOST ? `https://${process.env.API_HOST.replace(/^https?:\/\//, "")}/api/v1` : "http://localhost:8000/api/v1");

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_API_URL: apiUrl },
  reactStrictMode: true,
  // Docker builds set NEXT_OUTPUT=standalone; Vercel / Render use the default output.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" } : {}),
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self)" },
        ],
      },
    ];
  },
};
export default nextConfig;
