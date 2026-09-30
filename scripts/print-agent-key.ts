// Uso: npx tsx scripts/print-agent-key.ts <slug-da-unidade>
// Requer PRINT_AGENT_SECRET no ambiente. Coloque a saída em PRINT_AGENT_KEY no .env do print-agent.
import { printAgentKey } from "../src/lib/api-auth";

const slug = process.argv[2];
if (!slug) { console.error("Informe o slug da unidade (ex: matriz)"); process.exit(1); }
const key = printAgentKey(slug);
if (!key) { console.error("PRINT_AGENT_SECRET não definido"); process.exit(1); }
console.log(key);
