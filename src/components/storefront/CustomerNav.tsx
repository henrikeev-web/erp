"use client";

import { signOut } from "next-auth/react";
import { useCart } from "@/store/cart";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { User, MapPin, Baby, ShoppingBag, Star, Bell, LogOut } from "lucide-react";

const NAV_LINKS = [
  { href: "/minha-conta", label: "Perfil", icon: User, exact: true },
  { href: "/minha-conta/enderecos", label: "Endereços", icon: MapPin },
  { href: "/minha-conta/filhos", label: "Filhos", icon: Baby },
  { href: "/minha-conta/pedidos", label: "Pedidos", icon: ShoppingBag },
  { href: "/minha-conta/fidelidade", label: "Fidelidade", icon: Star },
  { href: "/minha-conta/notificacoes", label: "Notificações", icon: Bell },
];

interface Props {
  user: { name?: string | null; email?: string | null };
}

export default function CustomerNav({ user }: Props) {
  const pathname = usePathname();

  return (
    <header style={{ background: "#fff", borderBottom: "1px solid #e8dcc8", position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 16px" }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0 8px" }}>
          <Link href="/cardapio" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            <div style={{ width: 32, height: 32, background: "#F26C21", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>B</span>
            </div>
            <span style={{ color: "#F26C21", fontWeight: 700, fontSize: 15 }}>Banguelas</span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#78716c" }}>Olá, {user.name?.split(" ")[0]}</span>
            <button
              onClick={() => { useCart.getState().clear(); signOut({ callbackUrl: "/cardapio" }); }}
              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#a8a29e", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 6 }}
            >
              <LogOut size={14} />
              Sair
            </button>
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ display: "flex", gap: 0, overflowX: "auto", paddingBottom: 1 }}>
          {NAV_LINKS.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "8px 12px",
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active ? "#F26C21" : "#78716c",
                  borderBottom: active ? "2px solid #F26C21" : "2px solid transparent",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  transition: "color 0.15s",
                }}
              >
                <Icon size={14} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
