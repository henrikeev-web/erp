#!/usr/bin/env bash
# Regressão de segurança ponta a ponta: banco descartável + servidor real (precisa de `next build` feito e do
# container erp-dev-db). Uso: bash scripts/e2e-security.sh   (apaga o banco de teste ao final)
set -u
cd "$(dirname "$0")/.."
DB=erp_sec_test; PORT=3998; B=http://localhost:$PORT; J=$(mktemp); FAILS=0
export DATABASE_URL=postgresql://postgres:dev@localhost:5433/$DB
psql_() { docker exec erp-dev-db psql -U postgres -d "$1" -tAq -c "$2"; }
ok(){ if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got '$2' want '$3')"; FAILS=$((FAILS+1)); fi; }
cleanup(){ for P in $PORT 3997; do kill $(ss -ltnp | grep ":$P" | grep -o 'pid=[0-9]*' | cut -d= -f2) 2>/dev/null; done; psql_ postgres "drop database if exists $DB" >/dev/null 2>&1; rm -f "$J" certs/SENTINELA.txt public/uploads/products/{legit,shared}.webp; }
trap cleanup EXIT
psql_ postgres "drop database if exists $DB" >/dev/null; psql_ postgres "create database $DB" >/dev/null
# banco novo e vazio: `db push` simples basta (sem --accept-data-loss)
npx prisma db push >/dev/null 2>&1 || { echo 'FALHA: prisma db push'; exit 99; }
npx tsx prisma/seed.ts >/dev/null 2>&1 || { echo 'FALHA: seed'; exit 99; }
psql_ $DB 'update "StockItem" set quantity=500'
(env WHATSAPP_API_KEY=chave-de-teste-123 NEXTAUTH_URL=$B NEXTAUTH_SECRET=teste BASE_DOMAIN= AUTH_HOST= COOKIE_DOMAIN= nohup npx next start -H 127.0.0.1 -p $PORT >/dev/null 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null $B/api/unit && break; sleep 1; done

echo "== pagamento (InfinitePay simulada)"; npx tsx scripts/test-payment-e2e.ts 2>&1 | grep -E "^(ok|FAIL)|tudo ok|FALHA" | grep -v "^ok" | sed 's/^/   /'; [ "${PIPESTATUS[0]}" = 0 ] || FAILS=$((FAILS+1))
psql_ $DB 'update "StockItem" set quantity=500; delete from "Order"'
psql_ $DB "update \"Unit\" set \"infinitepayHandle\"=null"

echo "== vazamento no checkout"
psql_ $DB "update \"Customer\" set cpf='123.456.789-00', notes='CLIENTE VIP interno', email='vitima@x.com', \"passwordHash\"='\$2a\$10\$HASHSECRETO' where id=(select id from \"Customer\" where type='RETAIL' and \"unitId\"=(select id from \"Unit\" where slug='matriz') limit 1)"
PHONE=$(psql_ $DB "select phone from \"Customer\" where cpf='123.456.789-00'"); [ -n "$PHONE" ] || { echo 'FALHA: preparação do cliente de teste'; exit 99; }; PID=$(psql_ $DB "select id from \"Product\" where active and kind='SIMPLE' limit 1")
R=$(curl -s -X POST $B/api/checkout -H 'content-type: application/json' -d "{\"customer\":{\"name\":\"Atacante\",\"phone\":\"$PHONE\"},\"type\":\"PICKUP\",\"paymentMethod\":\"PIX\",\"items\":[{\"productId\":\"$PID\",\"quantity\":1}]}")
for s in HASHSECRETO 123.456.789 "CLIENTE VIP" vitima@x.com passwordHash googleId; do ok "resposta não contém $s" "$(echo "$R" | grep -c "$s")" 0; done
ok "pedido criado" "$(echo "$R" | grep -c '"number"')" 1

echo "== sessão admin"
CSRF=$(curl -s -c $J $B/api/auth/csrf | python3 -I -c "import json,sys;print(json.load(sys.stdin)['csrfToken'])")
curl -s -b $J -c $J -o /dev/null -X POST $B/api/auth/callback/credentials -d "csrfToken=$CSRF&email=admin@banguelas.com.br&password=admin123&json=true"
ok "login admin" "$(curl -s -b $J $B/api/auth/session | grep -c ADMIN)" 1

echo "== path traversal / uploads"
mkdir -p public/uploads/products; echo x > certs/SENTINELA.txt
for u in "/uploads/../../certs/SENTINELA.txt" "/uploads/products/../x.webp" "javascript:alert(1)"; do
  ok "POST imagem recusa $u" "$(curl -s -b $J -o /dev/null -w '%{http_code}' -X POST $B/api/produtos/$PID/imagens -H 'content-type: application/json' -d "{\"url\":\"$u\"}")" 400; done
psql_ $DB "insert into \"ProductImage\"(id,\"productId\",url,\"isMain\",\"order\") values ('evil1','$PID','/uploads/../../certs/SENTINELA.txt',false,0)"
curl -s -b $J -o /dev/null -X DELETE $B/api/produtos/$PID/imagens/evil1
ok "DELETE com url maliciosa preserva arquivo fora de uploads" "$(test -f certs/SENTINELA.txt && echo existe)" existe
echo i > public/uploads/products/legit.webp; echo i > public/uploads/products/shared.webp
OTHER=$(psql_ $DB "select id from \"Product\" where id<>'$PID' limit 1")
psql_ $DB "insert into \"ProductImage\"(id,\"productId\",url,\"isMain\",\"order\") values ('l1','$PID','/uploads/products/legit.webp',false,0),('s1','$PID','/uploads/products/shared.webp',false,0),('s2','$OTHER','/uploads/products/shared.webp',false,0)"
curl -s -b $J -o /dev/null -X DELETE $B/api/produtos/$PID/imagens/l1; curl -s -b $J -o /dev/null -X DELETE $B/api/produtos/$PID/imagens/s1
ok "DELETE apaga upload sem outras referências" "$(test -f public/uploads/products/legit.webp && echo existe || echo apagado)" apagado
ok "DELETE preserva arquivo usado por outro produto" "$(test -f public/uploads/products/shared.webp && echo existe || echo apagado)" existe
ok "PATCH imagem recusa url traversal" "$(curl -s -b $J -o /dev/null -w '%{http_code}' -X PATCH $B/api/produtos/$OTHER/imagens/s2 -H 'content-type: application/json' -d '{"url":"/uploads/../x.webp"}')" 400
ok "banner recusa javascript:" "$(curl -s -b $J -o /dev/null -w '%{http_code}' -X POST $B/api/banner-slides -H 'content-type: application/json' -d '{"desktopImageUrl":"/uploads/banners/a.webp","mobileImageUrl":"/uploads/banners/b.webp","linkUrl":"javascript:alert(1)"}')" 400
ok "banner válido aceito" "$(curl -s -b $J -o /dev/null -w '%{http_code}' -X POST $B/api/banner-slides -H 'content-type: application/json' -d '{"desktopImageUrl":"/uploads/banners/a.webp","mobileImageUrl":"/uploads/banners/b.webp","linkUrl":"/cardapio"}')" 201

echo "== webhook forjado"
OID=$(psql_ $DB "select id from \"Order\" limit 1")
ok "webhook sem corpo" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/pagamentos/webhook -H 'content-type: application/json' -d '{}')" 400
ok "webhook de pedido inexistente" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/pagamentos/webhook -H 'content-type: application/json' -d '{"order_nsu":"x","transaction_nsu":"y","invoice_slug":"z"}')" 404

echo "== cabeçalhos de segurança"
H=$(curl -s -D - -o /dev/null $B/cardapio)
for h in "content-security-policy" "x-frame-options: DENY" "x-content-type-options: nosniff" "referrer-policy" "strict-transport-security" "permissions-policy"; do ok "header $h" "$(echo "$H" | grep -ic "^$h")" 1; done
ok "sem X-Powered-By" "$(echo "$H" | grep -ic '^x-powered-by')" 0

echo "== CSP no navegador (Chromium, em container isolado: não instala nada no host)"
docker run --rm --ipc=host --network host -v "$PWD":/work:ro -w /work -e BASE=$B mcr.microsoft.com/playwright:v1.60.0-noble npx tsx scripts/test-csp.ts 2>&1 | grep -E "^(ok|FAIL)|tudo ok|violações|Refused" | sed 's/^/   /'; [ "${PIPESTATUS[0]}" = 0 ] || FAILS=$((FAILS+1))

echo "== rate limit"
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
for i in $(seq 1 6); do LAST=$(code -X POST $B/api/minha-conta/register -H 'content-type: application/json' -d '{}'); done
ok "register: 6ª tentativa na hora é 429" "$LAST" 429
for i in $(seq 1 21); do LAST=$(code -X POST $B/api/checkout -H 'content-type: application/json' -d '{}'); done
ok "checkout: 21ª tentativa em 10 min é 429" "$LAST" 429
ok "429 traz Retry-After" "$(curl -s -D - -o /dev/null -X POST $B/api/checkout -H 'content-type: application/json' -d '{}' | grep -ic '^retry-after')" 1
for i in $(seq 1 31); do LAST=$(code -X POST $B/api/cupons/validar -H 'content-type: application/json' -d '{"code":"X","subtotal":10}'); done
ok "cupom: 31ª tentativa é 429" "$LAST" 429
ok "cupom com corpo inválido não derruba (400)" "$(code -X POST $B/api/cupons/validar -H 'content-type: application/json' -d '{"code":123}' -H 'x-forwarded-for: 9.9.9.9')" 400
# força bruta no login do painel: 5 senhas erradas bloqueiam a conta, mesmo com a senha certa depois
login(){ C=$(mktemp); T=$(curl -s -c $C $B/api/auth/csrf | python3 -I -c "import json,sys;print(json.load(sys.stdin)['csrfToken'])"); curl -s -b $C -c $C -o /dev/null -X POST $B/api/auth/callback/credentials -d "csrfToken=$T&email=$1&password=$2&json=true"; curl -s -b $C $B/api/auth/session | grep -c ADMIN; rm -f $C; }
for i in 1 2 3 4 5; do login admin@banguelas.com.br errada123 >/dev/null; done
ok "conta bloqueada após 5 erros (senha certa também é recusada)" "$(login admin@banguelas.com.br admin123)" 0

echo "== revogação de sessão de staff"
SJ=$(mktemp)
slogin(){ T=$(curl -s -c $SJ $B/api/auth/csrf | python3 -I -c "import json,sys;print(json.load(sys.stdin)['csrfToken'])"); curl -s -b $SJ -c $SJ -o /dev/null -X POST $B/api/auth/callback/credentials -d "csrfToken=$T&email=$1&password=$2&json=true"; }
sess(){ curl -s -b $SJ $B/api/auth/session; }
api(){ curl -s -b $SJ -o /dev/null -w '%{http_code}' $B/api/clientes; }
# conta própria para não colidir com o bloqueio de força bruta do admin do teste acima
psql_ $DB "insert into \"User\"(id,\"unitId\",name,email,\"passwordHash\",role,active,\"sessionVersion\",\"createdAt\",\"updatedAt\") select 'u-rev',\"unitId\",'Rev','rev@x.com',\"passwordHash\",'ADMIN',true,0,now(),now() from \"User\" where email='admin@banguelas.com.br'"
psql_ $DB "update \"User\" set \"passwordHash\"='$(node -e "console.log(require('bcryptjs').hashSync('Revoga-123456',10))")' where id='u-rev'"
slogin rev@x.com Revoga-123456
ok "sessão válida" "$(sess | grep -c '"role":"ADMIN"')" 1
ok "API do painel responde 200" "$(api)" 200
psql_ $DB "update \"User\" set active=false where id='u-rev'"
ok "usuário desativado: sessão cai na hora" "$(sess | grep -c '"user"')" 0
ok "usuário desativado: API recusa (401)" "$(api)" 401
psql_ $DB "update \"User\" set active=true where id='u-rev'"
ok "reativado: a mesma sessão volta" "$(api)" 200
psql_ $DB "update \"User\" set role='STAFF' where id='u-rev'"
ok "papel vem do banco (rebaixado para STAFF)" "$(sess | grep -c '"role":"STAFF"')" 1
ok "rebaixado: rota de ADMIN passa a recusar" "$(curl -s -b $SJ -o /dev/null -w '%{http_code}' $B/api/financeiro/resumo)" 401
psql_ $DB "update \"User\" set role='ADMIN' where id='u-rev'"
psql_ $DB "update \"User\" set \"sessionVersion\"=\"sessionVersion\"+1 where id='u-rev'"
ok "sessionVersion mudou (senha trocada/revogado): sessão cai" "$(sess | grep -c '"user"')" 0
slogin rev@x.com Revoga-123456
ok "novo login após a revogação funciona" "$(sess | grep -c '"role":"ADMIN"')" 1
# troca de senha pela API encerra a própria sessão
CODE=$(curl -s -b $SJ -o /dev/null -w '%{http_code}' -X POST $B/api/conta/senha -H 'content-type: application/json' -d '{"currentPassword":"Revoga-123456","newPassword":"Outra-senha-9876"}')
ok "troca de senha pela API" "$CODE" 200
ok "após trocar a senha a sessão antiga cai" "$(sess | grep -c '"user"')" 0
slogin rev@x.com Outra-senha-9876
ok "login com a senha nova" "$(sess | grep -c '"role":"ADMIN"')" 1
# cliente: conta desativada pelo painel perde a sessão na hora
CH=$(node -e "console.log(require('bcryptjs').hashSync('Cliente-123456',10))")
UNIT=$(psql_ $DB "select id from \"Unit\" where slug='matriz'"); BRAND=$(psql_ $DB "select \"brandId\" from \"Unit\" where slug='matriz'")
psql_ $DB "insert into \"Customer\"(id,\"brandId\",\"unitId\",name,phone,\"passwordHash\",active,type,\"updatedAt\") values ('c-rev','$BRAND','$UNIT','Cli Rev','17988887777','$CH',true,'RETAIL',now())"
T=$(curl -s -c $SJ $B/api/auth/csrf | python3 -I -c "import json,sys;print(json.load(sys.stdin)['csrfToken'])")
curl -s -b $SJ -c $SJ -o /dev/null -X POST $B/api/auth/callback/customer-credentials -d "csrfToken=$T&identifier=17988887777&password=Cliente-123456&json=true"
ok "cliente: sessão válida" "$(sess | grep -c '"role":"CUSTOMER"')" 1
psql_ $DB "update \"Customer\" set active=false where id='c-rev'"
ok "cliente desativado: sessão cai na hora" "$(sess | grep -c '"user"')" 0
rm -f $SJ

echo "== validação de entrada do painel"
slogin2(){ T=$(curl -s -c $SJ $B/api/auth/csrf | python3 -I -c "import json,sys;print(json.load(sys.stdin)['csrfToken'])"); curl -s -b $SJ -c $SJ -o /dev/null -X POST $B/api/auth/callback/credentials -d "csrfToken=$T&email=$1&password=$2&json=true"; }
SJ=$(mktemp); slogin2 rev@x.com Outra-senha-9876
pj(){ curl -s -b $SJ -o /dev/null -w '%{http_code}' -X "$1" "$B$2" -H 'content-type: application/json' -d "$3"; }
# produto: campos fora da lista são ignorados; valores inválidos recusados
PID2=$(psql_ $DB "select id from \"Product\" where active and kind='SIMPLE' limit 1")
ok "produto: preço negativo recusado" "$(pj PUT /api/produtos/$PID2 '{"price":-5}')" 400
ok "produto: preço texto recusado" "$(pj PUT /api/produtos/$PID2 '{"price":"abc"}')" 400
ok "produto: sourceProductId/priceCustom do corpo são ignorados" "$(pj PUT /api/produtos/$PID2 '{"name":"Nome ok","sourceProductId":"hack","priceCustom":true,"unitId":"x"}')" 200
ok "produto: sourceProductId NÃO foi gravado" "$(psql_ $DB "select count(*) from \"Product\" where id='$PID2' and (\"sourceProductId\"='hack' or \"priceCustom\")")" 0
# cupom: usedCount nunca vem do corpo
curl -s -b $SJ -o /dev/null -X POST $B/api/cupons -H 'content-type: application/json' -d '{"type":"FIXED","code":"teste10","value":10}'
CID=$(psql_ $DB "select id from \"Coupon\" where code='TESTE10'")
ok "cupom: criado em maiúsculas" "$([ -n "$CID" ] && echo sim)" sim
ok "cupom: PATCH com usedCount/unitId é aceito mas ignora esses campos" "$(pj PATCH /api/cupons/$CID '{"active":false,"usedCount":0,"unitId":"x","value":-1}')" 400
ok "cupom: PATCH válido" "$(pj PATCH /api/cupons/$CID '{"active":false,"usedCount":999,"unitId":"x"}')" 200
ok "cupom: usedCount não mudou" "$(psql_ $DB "select \"usedCount\" from \"Coupon\" where id='$CID'")" 0
ok "cupom: % acima de 100 recusado" "$(pj POST /api/cupons '{"type":"PERCENTAGE","code":"x100","value":150}')" 400
# estoque
SID=$(psql_ $DB "select id from \"StockItem\" limit 1")
ok "estoque: quantidade negativa recusada" "$(pj POST /api/estoque/$SID/movimentar '{"type":"IN","quantity":-5}')" 400
ok "estoque: quantidade texto recusada" "$(pj POST /api/estoque/$SID/movimentar '{"type":"IN","quantity":"abc"}')" 400
BEFORE=$(psql_ $DB "select quantity from \"StockItem\" where id='$SID'")
ok "estoque: entrada válida" "$(pj POST /api/estoque/$SID/movimentar '{"type":"IN","quantity":7}')" 200
ok "estoque: saldo somou 7" "$(psql_ $DB "select quantity from \"StockItem\" where id='$SID'")" $((BEFORE+7))
# checkout: limites de tamanho (IP diferente para não cair no rate limit)
BIG=$(python3 -I -c "print('a'*600)")
ok "checkout: observação gigante recusada (422)" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/checkout -H 'content-type: application/json' -H 'x-forwarded-for: 7.7.7.7' -d "{\"customer\":{\"name\":\"X Y\",\"phone\":\"17999990000\"},\"type\":\"PICKUP\",\"paymentMethod\":\"PIX\",\"notes\":\"$BIG\",\"items\":[{\"productId\":\"$PID2\",\"quantity\":1}]}")" 422
ok "checkout: quantidade absurda recusada (422)" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/checkout -H 'content-type: application/json' -H 'x-forwarded-for: 7.7.7.8' -d "{\"customer\":{\"name\":\"X Y\",\"phone\":\"17999990000\"},\"type\":\"PICKUP\",\"paymentMethod\":\"PIX\",\"items\":[{\"productId\":\"$PID2\",\"quantity\":999999}]}")" 422
# WhatsApp (n8n): Bearer obrigatório e comparado em tempo constante
ok "whatsapp sem chave: 401" "$(curl -s -o /dev/null -w '%{http_code}' $B/api/whatsapp/cardapio)" 401
ok "whatsapp chave errada: 401" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer chave-errada' $B/api/whatsapp/cardapio)" 401
ok "whatsapp chave de tamanho diferente: 401" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer x' $B/api/whatsapp/cardapio)" 401
ok "whatsapp chave certa: 200" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer chave-de-teste-123' $B/api/whatsapp/cardapio)" 200
# NFS-e: o webservice só pode ser da GISS
ok "NFS-e: URL fora da GISS recusada" "$(pj PUT /api/escola/config '{"cnpj":"1","wsUrl":"https://evil.example.com/ws","wsHomologUrl":"https://ws-ficticio.giss.com.br/x"}')" 400
ok "NFS-e: URL http recusada" "$(pj PUT /api/escola/config '{"cnpj":"1","wsUrl":"http://ws-sjrp.giss.com.br/x","wsHomologUrl":"https://ws-ficticio.giss.com.br/x"}')" 400
ok "NFS-e: URL da GISS aceita" "$(pj PUT /api/escola/config '{"cnpj":"1","wsUrl":"https://ws-sjrp.giss.com.br/service-ws/nf/nfse-ws","wsHomologUrl":"https://ws-ficticio.giss.com.br/x"}')" 200
rm -f $SJ

echo "== edição de cupom pela tela (Chromium)"
docker run --rm --ipc=host --network host -v "$PWD":/work:ro -w /work -e BASE=$B -e EMAIL=rev@x.com -e PASS=Outra-senha-9876 mcr.microsoft.com/playwright:v1.60.0-noble npx tsx scripts/test-cupom-ui.ts 2>&1 | grep -E "^(ok|FAIL)|tudo ok" | sed 's/^/   /'; [ "${PIPESTATUS[0]}" = 0 ] || FAILS=$((FAILS+1))
ok "banco: valor 25, descrição e validade (fim do dia em Brasília)" "$(psql_ $DB "select value||'|'||description||'|'||to_char(\"validTo\" at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI') from \"Coupon\" where code='TESTE10'")" "25|Cupom editado pela tela|2031-01-01T02:59"

echo "== produtos pela tela: novo produto + foto (Chromium e Firefox)"
docker run --rm --ipc=host --network host -v "$PWD":/work:ro -w /work -e BASE=$B -e EMAIL=rev@x.com -e PASS=Outra-senha-9876 mcr.microsoft.com/playwright:v1.60.0-noble npx tsx scripts/test-produto-ui.ts 2>&1 | grep -E "^(ok|FAIL)|tudo ok|FALHA|console|^\s+(error|warning)" | sed 's/^/   /'; [ "${PIPESTATUS[0]}" = 0 ] || FAILS=$((FAILS+1))

echo "== login Google atrás do proxy (produção simulada: HOSTNAME=0.0.0.0, BASE_DOMAIN, AUTH_HOST)"
(env HOSTNAME=0.0.0.0 PORT=3997 NEXTAUTH_URL=https://cardapio.banguelas.com.br NEXTAUTH_SECRET=teste BASE_DOMAIN=banguelas.com.br AUTH_HOST=cardapio.banguelas.com.br nohup npx next start >/dev/null 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null localhost:3997/api/unit && break; sleep 1; done
G=localhost:3997/api/minha-conta/google
loc(){ curl -s -o /dev/null -D - "$@" | grep -i "^location" | tr -d '\r' | sed 's/^[Ll]ocation: //'; }
ok "matriz: start volta para o domínio público (não localhost)" "$(loc -H 'Host: cardapio.banguelas.com.br' -H 'X-Forwarded-Proto: https' "$G/start?returnTo=/minha-conta")" "https://cardapio.banguelas.com.br/minha-conta/login/google"
ok "franquia: start segue para o AUTH_HOST levando o slug" "$(loc -H 'Host: ribeirao.banguelas.com.br' -H 'X-Forwarded-Proto: https' "$G/start?returnTo=/minha-conta")" "https://cardapio.banguelas.com.br/api/minha-conta/google/start?unit=ribeirao&returnTo=%2Fminha-conta"
ok "Host forjado cai no AUTH_HOST" "$(loc -H 'Host: evil.com' -H 'X-Forwarded-Proto: https' "$G/start")" "https://cardapio.banguelas.com.br/minha-conta/login/google"
ok "finish devolve à unidade de origem (franquia)" "$(loc -H 'Host: cardapio.banguelas.com.br' -H 'X-Forwarded-Proto: https' -H 'Cookie: bg_login=%7B%22unit%22%3A%22ribeirao%22%2C%22returnTo%22%3A%22%2Fminha-conta%22%7D' $G/finish)" "https://ribeirao.banguelas.com.br/minha-conta/login?erro=google"
ok "finish matriz" "$(loc -H 'Host: cardapio.banguelas.com.br' -H 'X-Forwarded-Proto: https' $G/finish)" "https://cardapio.banguelas.com.br/minha-conta/login?erro=google"
ok "cookie do login Google é Secure em produção" "$(curl -s -o /dev/null -D - -H 'Host: cardapio.banguelas.com.br' -H 'X-Forwarded-Proto: https' "$G/start" | grep -i '^set-cookie: bg_login' | grep -ci 'secure')" 1

echo; [ $FAILS = 0 ] && echo "TUDO OK" || echo "$FAILS FALHA(S)"; exit $FAILS
