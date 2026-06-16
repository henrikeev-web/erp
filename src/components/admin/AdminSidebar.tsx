"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingBag, Users, Package, BarChart3,
  Settings, Tag, MapPin, LogOut, Menu, X, ChefHat,
  FileText, Star, Bell, Layers, School,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/admin/pedidos", icon: ShoppingBag, label: "Pedidos" },
  { href: "/admin/producao", icon: ChefHat, label: "Produção" },
  { href: "/admin/clientes", icon: Users, label: "Clientes" },
  { href: "/admin/produtos", icon: Package, label: "Produtos" },
  { href: "/admin/categorias", icon: Layers, label: "Categorias" },
  { href: "/admin/estoque", icon: Package, label: "Estoque" },
  { href: "/admin/cupons", icon: Tag, label: "Cupons" },
  { href: "/admin/fidelidade", icon: Star, label: "Fidelidade" },
  { href: "/admin/follow-up", icon: Bell, label: "Follow-up" },
  { href: "/admin/relatorios", icon: BarChart3, label: "Relatórios" },
  { href: "/admin/escola", icon: School, label: "Escola / NFS-e" },
  { href: "/admin/fiscal", icon: FileText, label: "Fiscal" },
  { href: "/admin/zonas", icon: MapPin, label: "Zonas de entrega" },
  { href: "/admin/configuracoes", icon: Settings, label: "Configurações" },
];

interface AdminSidebarProps {
  user: { name?: string | null; email?: string | null; image?: string | null };
}

export default function AdminSidebar({ user }: AdminSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 w-10 h-10 bg-white rounded-xl shadow-md flex items-center justify-center"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Overlay mobile */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 z-50 w-60 bg-zinc-900 border-r border-zinc-800 flex flex-col transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-sm leading-none">B</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-none">Banguelas</p>
              <p className="text-xs text-zinc-500 mt-0.5">Admin</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden w-7 h-7 rounded-lg hover:bg-zinc-800 flex items-center justify-center">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  active
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                )}
              >
                <Icon className={cn("w-4 h-4 shrink-0", active ? "text-orange-400" : "")} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-zinc-800">
          <div className="flex items-center gap-2 px-2 py-2 mb-1 rounded-lg bg-zinc-800">
            <div className="w-7 h-7 bg-zinc-700 rounded-full flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
              {user.name?.[0]?.toUpperCase() ?? "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-200 truncate">{user.name ?? "Admin"}</p>
              <p className="text-xs text-zinc-500 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-zinc-500 hover:bg-zinc-800 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </aside>
    </>
  );
}
