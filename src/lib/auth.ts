import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { getCurrentUnit, getUnitBySlug } from "./unit";
import { LOGIN_COOKIE, parseLoginCookie } from "./google-login";
import bcrypt from "bcryptjs";
import { z } from "zod";

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const customerLoginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(6),
});

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/admin/login",
  },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = adminLoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });

        if (!user || !user.passwordHash || !user.active) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          unitId: user.unitId ?? undefined,
        };
      },
    }),
    CredentialsProvider({
      id: "customer-credentials",
      name: "customer",
      credentials: {
        identifier: { label: "Telefone ou Email", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = customerLoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const unit = await getCurrentUnit();
        if (!unit) return null;

        const identifier = parsed.data.identifier.trim();
        const customer = await prisma.customer.findFirst({
          where: {
            unitId: unit.id,
            OR: [{ phone: identifier }, { email: identifier }],
            active: true,
          },
        });

        if (!customer || !customer.passwordHash) return null;

        const valid = await bcrypt.compare(parsed.data.password, customer.passwordHash);
        if (!valid) return null;

        return {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          role: "CUSTOMER",
          unitId: unit.id,
        };
      },
    }),
    // Login Google (só clientes). Sempre acontece no AUTH_HOST; ver src/lib/google-login.ts
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
  ],
  // Com COOKIE_DOMAIN (produção) a sessão vale em todos os subdomínios: o cliente loga no domínio
  // principal e já chega logado na cidade. A unidade da sessão é conferida em cada request.
  ...(process.env.COOKIE_DOMAIN
    ? {
        cookies: {
          sessionToken: {
            name: "__Secure-next-auth.session-token",
            options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: true, domain: process.env.COOKIE_DOMAIN },
          },
        },
      }
    : {}),
  callbacks: {
    // Google só entra com e-mail verificado
    signIn({ account, profile }) {
      if (account?.provider === "google") {
        return (profile as { email_verified?: boolean } | undefined)?.email_verified === true;
      }
      return true;
    },
    async jwt({ token, user, account, profile, trigger, session }) {
      if (account?.provider === "google") {
        const intent = parseLoginCookie((await cookies()).get(LOGIN_COOKIE)?.value);
        const unit = await getUnitBySlug(intent.unit);
        const g = profile as { sub?: string; email?: string; name?: string } | undefined;
        if (!unit || !g?.sub || !g.email) return { ...token, role: undefined, id: undefined };

        const customer =
          (await prisma.customer.findFirst({ where: { unitId: unit.id, googleId: g.sub } })) ??
          (await prisma.customer.findFirst({ where: { unitId: unit.id, email: g.email } }));

        if (customer) {
          if (!customer.active) return { ...token, role: undefined, id: undefined };
          if (!customer.googleId) await prisma.customer.update({ where: { id: customer.id }, data: { googleId: g.sub } });
          return { ...token, id: customer.id, role: "CUSTOMER", phone: customer.phone, unitId: unit.id, name: customer.name };
        }
        // Primeiro acesso: falta o telefone (obrigatório). Sessão pendente até /completar-cadastro.
        return { ...token, id: "", role: "CUSTOMER_PENDING", unitId: unit.id, googleId: g.sub, googleEmail: g.email, name: g.name ?? token.name };
      }

      // Conclusão do cadastro: o cliente só passa de PENDING para CUSTOMER se o registro existir na
      // mesma unidade e estiver vinculado ao MESMO googleId do token (nada vem do corpo da request).
      if (trigger === "update" && token.role === "CUSTOMER_PENDING" && (session as { customerId?: string } | undefined)?.customerId) {
        const c = await prisma.customer.findFirst({
          where: { id: (session as { customerId: string }).customerId, unitId: token.unitId, googleId: token.googleId, active: true },
        });
        if (c) return { ...token, id: c.id, role: "CUSTOMER", phone: c.phone, name: c.name };
        return token;
      }

      if (user) {
        token.role = (user as { role?: string }).role;
        token.id = user.id;
        const uu = user as { unitId?: string };
        if (uu.unitId) token.unitId = uu.unitId;
        const u = user as { phone?: string };
        if (u.phone) token.phone = u.phone;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.unitId = token.unitId as string | undefined;
        (session.user as { role?: string }).role = token.role as string;
        if (token.phone) {
          (session.user as { phone?: string }).phone = token.phone as string;
        }
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
