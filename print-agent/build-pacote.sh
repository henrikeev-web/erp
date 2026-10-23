#!/usr/bin/env bash
# Gera o pacote da loja SEM .exe (para Windows que bloqueia executável não assinado):
# index.js + node_modules (só produção) + config.json + instalar.bat + LEIAME.txt num .zip.
# Requer Node.js instalado na máquina da loja (o instalar.bat instala via winget).
#
# Uso:  PRINT_AGENT_KEY=<chave> [ERP_URL=https://cardapio.banguelas.com.br] bash build-pacote.sh [saida.zip]
# A chave vai SÓ para o config.json do pacote — nunca para o repositório.
set -euo pipefail
cd "$(dirname "$0")"

: "${PRINT_AGENT_KEY:?Informe PRINT_AGENT_KEY}"
ERP_URL="${ERP_URL:-https://cardapio.banguelas.com.br}"
OUT="$(realpath -m "${1:-dist/banguelas-print-node.zip}")"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir "$STAGE/banguelas-print"
cp index.js package.json package-lock.json instalar.bat "$STAGE/banguelas-print/"
cp LEIAME-NODE.txt "$STAGE/banguelas-print/LEIAME.txt"
(cd "$STAGE/banguelas-print" && npm ci --omit=dev --no-audit --no-fund >/dev/null)

cat > "$STAGE/banguelas-print/config.json" <<JSON
{
  "erpUrl": "$ERP_URL",
  "key": "$PRINT_AGENT_KEY",
  "width": 48,
  "type": "epson"
}
JSON

mkdir -p "$(dirname "$OUT")"
python3 - "$STAGE" "$OUT" <<'PY'
import sys, zipfile, os
stage, out = sys.argv[1:3]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(stage):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, stage))
PY
chmod 600 "$OUT"
echo "Pacote: $OUT ($(du -h "$OUT" | cut -f1)) — contém a chave da unidade: não publique nem coloque no Git."
