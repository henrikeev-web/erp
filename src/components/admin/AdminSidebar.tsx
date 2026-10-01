"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingBag, Users, Package, BarChart3,
  Settings, Tag, MapPin, LogOut, Menu, X, ChefHat,
  FileText, Star, Bell, Layers, School, Wallet, Bike, Boxes, Store, Network, Megaphone, Trophy, Truck, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/admin/pedidos", icon: ShoppingBag, label: "Pedidos" },
  { href: "/admin/producao", icon: ChefHat, label: "Produção" },
  { href: "/admin/clientes", icon: Users, label: "Clientes" },
  { href: "/admin/produtos", icon: Package, label: "Produtos" },
  { href: "/admin/combos", icon: Boxes, label: "Combos" },
  { href: "/admin/categorias", icon: Layers, label: "Categorias" },
  { href: "/admin/estoque", icon: Package, label: "Estoque" },
  { href: "/admin/cupons", icon: Tag, label: "Cupons" },
  { href: "/admin/fidelidade", icon: Star, label: "Fidelidade" },
  { href: "/admin/follow-up", icon: Bell, label: "Follow-up" },
  { href: "/admin/relatorios", icon: BarChart3, label: "Relatórios" },
  { href: "/admin/financeiro", icon: Wallet, label: "Financeiro", adminOnly: true },
  { href: "/admin/escola", icon: School, label: "Escola / NFS-e", hqOnly: true },
  { href: "/admin/fiscal", icon: FileText, label: "Fiscal" },
  { href: "/admin/rede", icon: Network, label: "Dashboard da rede", adminOnly: true, hqOnly: true },
  { href: "/admin/franquias", icon: Store, label: "Franquias", adminOnly: true, hqOnly: true },
  { href: "/admin/avisos", icon: Megaphone, label: "Avisos às franquias", adminOnly: true, hqOnly: true },
  { href: "/admin/premiacoes", icon: Trophy, label: "Premiações" }, // matriz: só admin (ver página); franquia: todos
  { href: "/admin/reposicao", icon: Truck, label: "Pedidos à matriz", adminOnly: true, franchiseOnly: true },
  { href: "/admin/zonas", icon: MapPin, label: "Zonas de entrega" },
  { href: "/admin/entregadores", icon: Bike, label: "Entregadores", adminOnly: true },
  { href: "/admin/configuracoes", icon: Settings, label: "Configurações" },
];

interface AdminSidebarProps {
  user: { name?: string | null; email?: string | null; image?: string | null; role?: string };
  unitType?: "HQ" | "FRANCHISE";
}

export default function AdminSidebar({ user, unitType }: AdminSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("admin-sidebar-collapsed") === "1"); } catch {}
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try { localStorage.setItem("admin-sidebar-collapsed", c ? "0" : "1"); } catch {}
      return !c;
    });
  }

  const firstName = user.name?.trim().split(/\s+/)[0] || "Admin";
  const initial = firstName[0].toUpperCase();

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
          "fixed left-0 top-0 bottom-0 z-50 w-60 bg-zinc-900 border-r border-zinc-800 flex flex-col transition-all lg:static lg:translate-x-0",
          collapsed && "lg:w-16",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className={cn("flex items-center justify-between px-4 py-4 border-b border-zinc-800", collapsed && "lg:px-0 lg:justify-center")}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div title={firstName} className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-sm leading-none">{initial}</span>
            </div>
            <div className={cn("min-w-0", collapsed && "lg:hidden")}>
              <p className="text-sm font-semibold text-white leading-none truncate">{firstName}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Admin</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden w-7 h-7 rounded-lg hover:bg-zinc-800 flex items-center justify-center">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className={cn("hidden lg:flex items-center gap-3 mx-2 mt-2 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 transition-colors", collapsed && "justify-center px-0")}
        >
          {collapsed ? <ChevronsRight className="w-4 h-4 shrink-0" /> : <><ChevronsLeft className="w-4 h-4 shrink-0" /> Recolher menu</>}
        </button>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-0.5">
          {NAV.filter((item) => (!("adminOnly" in item && item.adminOnly) || ["ADMIN", "SUPER_ADMIN"].includes(user.role ?? "")) && (!("hqOnly" in item && item.hqOnly) || unitType !== "FRANCHISE") && (!("franchiseOnly" in item && item.franchiseOnly) || unitType === "FRANCHISE") && !(item.href === "/admin/premiacoes" && unitType !== "FRANCHISE" && !["ADMIN", "SUPER_ADMIN"].includes(user.role ?? ""))).map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                title={collapsed ? label : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  collapsed && "lg:justify-center lg:px-0",
                  active
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                )}
              >
                <Icon className={cn("w-4 h-4 shrink-0", active ? "text-orange-400" : "")} />
                <span className={cn(collapsed && "lg:hidden")}>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-zinc-800">
          <Link href="/admin/conta" onClick={() => setOpen(false)} title="Minha conta e alterar senha" className={cn("flex items-center gap-2 px-2 py-2 mb-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors", collapsed && "lg:justify-center")}>
            <div className="w-7 h-7 bg-zinc-700 rounded-full flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
              {initial}
            </div>
            <div className={cn("flex-1 min-w-0", collapsed && "lg:hidden")}>
              <p className="text-xs font-medium text-zinc-200 truncate">{user.name ?? "Admin"}</p>
              <p className="text-xs text-zinc-500 truncate">{user.email}</p>
            </div>
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            title="Sair"
            className={cn("flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-zinc-500 hover:bg-zinc-800 hover:text-red-400 transition-colors", collapsed && "lg:justify-center lg:px-0")}
          >
            <LogOut className="w-4 h-4 shrink-0" /> <span className={cn(collapsed && "lg:hidden")}>Sair</span>
          </button>
        </div>
      </aside>
    </>
  );
}
