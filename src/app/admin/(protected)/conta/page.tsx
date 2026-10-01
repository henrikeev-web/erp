import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import ContaClient from "@/components/admin/ContaClient";

export const dynamic = "force-dynamic";

export default async function ContaPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === "CUSTOMER") redirect("/admin");
  return <ContaClient name={session.user.name ?? null} email={session.user.email ?? null} />;
}
