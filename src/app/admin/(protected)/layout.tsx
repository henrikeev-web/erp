import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/admin/login");
  }

  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden">
      <AdminSidebar user={session.user} />
      <main className="flex-1 overflow-y-auto lg:ml-0">
        {children}
      </main>
    </div>
  );
}
