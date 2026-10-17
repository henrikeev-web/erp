import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// CSP: o Next injeta scripts/estilos inline (hidratação e style={{}} em todo o front), então 'unsafe-inline' fica;
// o ganho está no resto: nada de plugin/objeto, base-uri fixa, sem iframe de terceiros, conexões só para o próprio site,
// e frame-ancestors 'none' (ninguém embute o painel). Único recurso externo do front: Google Fonts.
// Sem `form-action`: o login Google faz POST no site e termina em redirecionamento para accounts.google.com.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Sem includeSubDomains: o mesmo domínio raiz hospeda outros sistemas
  { key: "Strict-Transport-Security", value: "max-age=15552000" },
];

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
