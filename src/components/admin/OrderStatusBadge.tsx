import { Badge } from "@/components/ui/badge";
import { orderStatusLabel } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 border-amber-200",
  CONFIRMED: "bg-blue-100 text-blue-700 border-blue-200",
  IN_PRODUCTION: "bg-purple-100 text-purple-700 border-purple-200",
  READY: "bg-green-100 text-green-700 border-green-200",
  DISPATCHED: "bg-cyan-100 text-cyan-700 border-cyan-200",
  DELIVERED: "bg-zinc-100 text-zinc-600 border-zinc-200",
  CANCELLED: "bg-red-100 text-red-600 border-red-200",
};

export default function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status] ?? "bg-zinc-100 text-zinc-600"}`}>
      {orderStatusLabel(status)}
    </span>
  );
}
