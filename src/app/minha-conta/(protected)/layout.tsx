import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import CustomerNav from "@/components/storefront/CustomerNav";

export default async function MinhaContaLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "CUSTOMER") {
    redirect("/minha-conta/login");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FBF6EC" }}>
      <CustomerNav user={session.user} />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px 48px" }}>
        {children}
      </main>
    </div>
  );
}
