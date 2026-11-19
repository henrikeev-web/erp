// Executado uma vez quando o servidor Next.js sobe.
export async function register() {
  // Só no runtime Node (não no Edge) e só em servidor rodando (não durante o build).
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { startGoomerOdPoller } = await import("./lib/goomer-od");
  startGoomerOdPoller();
}
