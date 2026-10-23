#!/usr/bin/env bash
# Gera o pacote da loja (Windows): banguelas-print.exe + config.json + LEIAME.txt num .zip.
#
# Uso:  PRINT_AGENT_KEY=<chave> [ERP_URL=https://cardapio.banguelas.com.br] bash build-exe.sh [saida.zip]
# A chave (npx tsx scripts/print-agent-key.ts <slug>) vai SÓ para o config.json do pacote — nunca para o repositório.
set -euo pipefail
cd "$(dirname "$0")"

: "${PRINT_AGENT_KEY:?Informe PRINT_AGENT_KEY}"
ERP_URL="${ERP_URL:-https://cardapio.banguelas.com.br}"
OUT="${1:-dist/banguelas-print-loja.zip}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

npx pkg . --targets node22-win-x64 --output "$STAGE/banguelas-print.exe"

cat > "$STAGE/config.json" <<JSON
{
  "erpUrl": "$ERP_URL",
  "key": "$PRINT_AGENT_KEY",
  "width": 48,
  "type": "epson"
}
JSON
cp LEIAME.txt "$STAGE/LEIAME.txt"

mkdir -p "$(dirname "$OUT")"
python3 - "$STAGE" "$OUT" <<'PY'
import sys, zipfile, os
stage, out = sys.argv[1:3]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in ("banguelas-print.exe", "config.json", "LEIAME.txt"):
        z.write(os.path.join(stage, f), f)
PY
chmod 600 "$OUT"
echo "Pacote: $OUT ($(du -h "$OUT" | cut -f1)) — contém a chave da unidade: não publique nem coloque no Git."
