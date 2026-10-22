import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { getCurrentUnit } from "@/lib/unit";
import AnnouncementsHost from "@/components/admin/AnnouncementsHost";
import ContaClient from "@/components/admin/ContaClient";

const STAFF_ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF"];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  const unit = await getCurrentUnit();
  const user = session?.user;

  // Painel só para staff, e só na própria unidade (SUPER_ADMIN, da matriz, acessa qualquer uma).
  // Cliente logado ou usuário de outra franquia não passa daqui.
  if (!user || !unit || !STAFF_ROLES.includes(user.role) || (user.role !== "SUPER_ADMIN" && user.unitId !== unit.id)) {
    redirect("/admin/login");
  }

  // Senha provisória: só a tela de troca de senha, sem menu nem páginas do painel
  if (user.mustChangePassword) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <ContaClient name={user.name ?? null} email={user.email ?? null} forced />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden">
      <AdminSidebar user={session.user} unitType={unit.type} />
      {unit.type === "FRANCHISE" && <AnnouncementsHost />}
      <main className="flex-1 overflow-y-auto lg:ml-0">
        {children}
      </main>
    </div>
  );
}
