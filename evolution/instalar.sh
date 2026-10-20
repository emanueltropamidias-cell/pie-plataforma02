#!/usr/bin/env bash
#
# INSTALA A EVOLUTION NO VPS — do Ubuntu limpo ao HTTPS respondendo.
#
# Rode como root, no servidor:
#
#   bash instalar.sh evo.talitaoliveiraoficial.com \
#        <CHAVE_API> <SENHA_POSTGRES> <SEGREDO_WEBHOOK> \
#        https://www.talitaoliveiraoficial.com
#
# Pode rodar de novo sem medo: cada passo confere antes de agir.
#
# ── POR QUE UM SCRIPT E NÃO SEIS COMANDOS COLADOS ──────────────────────────
#
# Comando colado à mão erra em silêncio: a colagem corta no meio, um espaço
# vira quebra de linha, e o `.env` fica com metade de uma senha. Já aconteceu
# três vezes hoje com SQL. Aqui os valores chegam como argumento e o arquivo é
# escrito de uma vez.

set -euo pipefail

DOMINIO="${1:?falta o dominio, ex: evo.talitaoliveiraoficial.com}"
API_KEY="${2:?falta a chave da API}"
PG_SENHA="${3:?falta a senha do postgres}"
WEBHOOK_SEGREDO="${4:?falta o segredo do webhook}"
PIE_URL="${5:?falta a url do PIE, ex: https://www.talitaoliveiraoficial.com}"

DIR=/opt/evolution
# Fixa a versão. `latest` troca sozinho numa madrugada e derruba a operação sem
# ninguém ter mexido em nada.
VERSAO=v2.3.7

echo "▸ 1/6  conferindo o DNS"
# ISTO VEM PRIMEIRO DE PROPÓSITO. O Caddy pede o certificado no instante em que
# sobe; se o domínio não apontar para esta máquina, a validação falha e ele fica
# tentando EM SILÊNCIO — o contêiner diz "no ar" e nada funciona.
MEU_IP=$(curl -s --max-time 10 https://api.ipify.org || echo "")
DNS_IP=$(getent hosts "$DOMINIO" | awk '{print $1}' | head -1 || echo "")
if [ -z "$DNS_IP" ]; then
  echo "  ✗ $DOMINIO nao resolve para nenhum IP."
  echo "    Crie o registro A antes:  A  evo  ->  $MEU_IP"
  exit 1
fi
if [ "$DNS_IP" != "$MEU_IP" ]; then
  echo "  ✗ $DOMINIO aponta para $DNS_IP, mas este servidor e $MEU_IP."
  echo "    Corrija o registro A ou espere a propagacao."
  exit 1
fi
echo "  ✓ $DOMINIO -> $MEU_IP"

echo "▸ 2/6  instalando o Docker"
if command -v docker >/dev/null 2>&1; then
  echo "  ✓ ja instalado ($(docker --version))"
else
  curl -fsSL https://get.docker.com | sh >/dev/null
  echo "  ✓ $(docker --version)"
fi

echo "▸ 3/6  montando $DIR"
mkdir -p "$DIR"
cd "$DIR"

cat > Caddyfile <<CADDY
# O Caddy pede e renova o certificado sozinho — nao ha passo de Let's Encrypt
# para lembrar depois.
$DOMINIO {
    reverse_proxy evolution:8080
}
CADDY

cat > docker-compose.yml <<'COMPOSE'
# A EVOLUTION NAO PUBLICA PORTA PARA A INTERNET: so o Caddy publica.
#
# Quem alcanca a API dela manda mensagem pelo numero da campanha, e uma porta
# 8080 aberta com a chave circulando seria o numero da Talita na mao de
# qualquer um. O `expose` deixa o container alcancavel so pelos vizinhos da
# mesma rede Docker.
services:
  evolution:
    image: evoapicloud/evolution-api:VERSAO_AQUI
    restart: always
    depends_on: [postgres, redis]
    expose: ["8080"]
    env_file: .env
    volumes:
      - evolution_instances:/evolution/instances
    networks: [interna]

  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: evolution
    volumes:
      - evolution_pg:/var/lib/postgresql/data
    networks: [interna]

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --appendonly yes
    volumes:
      - evolution_redis:/data
    networks: [interna]

  caddy:
    image: caddy:2-alpine
    restart: always
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks: [interna]

volumes:
  evolution_instances:
  evolution_pg:
  evolution_redis:
  caddy_data:
  caddy_config:

networks:
  interna:
COMPOSE
sed -i "s/VERSAO_AQUI/$VERSAO/" docker-compose.yml

cat > .env <<ENV
AUTHENTICATION_API_KEY=$API_KEY
POSTGRES_PASSWORD=$PG_SENHA
SERVER_URL=https://$DOMINIO

DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://evolution:$PG_SENHA@postgres:5432/evolution
DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=true
DATABASE_SAVE_MESSAGE_UPDATE=true
DATABASE_SAVE_DATA_CONTACTS=true
DATABASE_SAVE_DATA_CHATS=true

CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=redis://redis:6379
CACHE_REDIS_PREFIX_KEY=evolution
CACHE_LOCAL_ENABLED=false

# O segredo na URL e o que prova que a chamada veio da Evolution: ela NAO
# assina o corpo, entao o endereco e a unica credencial.
WEBHOOK_GLOBAL_ENABLED=true
WEBHOOK_GLOBAL_URL=$PIE_URL/api/whatsapp/evolution?k=$WEBHOOK_SEGREDO
WEBHOOK_GLOBAL_BY_EVENTS=false

# So o que interessa. Sem esta lista a Evolution dispara dezenas de eventos
# (presenca, contatos, chats) no mesmo endereco, e o webhook gasta invocacao da
# Vercel so para descartar cada um.
WEBHOOK_EVENTS_MESSAGES_UPSERT=true
WEBHOOK_EVENTS_MESSAGES_UPDATE=false
WEBHOOK_EVENTS_QRCODE_UPDATED=false
WEBHOOK_EVENTS_CONNECTION_UPDATE=true
WEBHOOK_EVENTS_CONTACTS_UPSERT=false
WEBHOOK_EVENTS_CHATS_UPSERT=false
WEBHOOK_EVENTS_PRESENCE_UPDATE=false
WEBHOOK_EVENTS_TYPEBOT_START=false

CONFIG_SESSION_PHONE_CLIENT=PIE
CONFIG_SESSION_PHONE_NAME=Chrome
QRCODE_LIMIT=10
LOG_LEVEL=ERROR
DEL_INSTANCE=false
ENV
chmod 600 .env
echo "  ✓ Caddyfile, docker-compose.yml e .env escritos"

echo "▸ 4/6  subindo os conteineres"
docker compose up -d
echo "  ✓ no ar"

echo "▸ 5/6  esperando o certificado (ate 90s)"
# O Caddy leva alguns segundos para negociar com o Let's Encrypt. Tentar a API
# antes disso da erro de TLS e faz parecer que a instalacao falhou.
ok=0
for i in $(seq 1 18); do
  if curl -sf --max-time 5 "https://$DOMINIO" >/dev/null 2>&1; then ok=1; break; fi
  sleep 5
done
if [ "$ok" != "1" ]; then
  echo "  ✗ https://$DOMINIO ainda nao responde."
  echo "    Veja o motivo:  docker compose -f $DIR/docker-compose.yml logs caddy | tail -30"
  exit 1
fi
echo "  ✓ https://$DOMINIO respondendo"

echo "▸ 6/6  criando a instancia 'talita'"
CRIA=$(curl -s --max-time 20 -X POST "https://$DOMINIO/instance/create" \
  -H "apikey: $API_KEY" -H "Content-Type: application/json" \
  -d '{"instanceName":"talita","integration":"WHATSAPP-BAILEYS"}' || echo "")
if echo "$CRIA" | grep -qi "already in use\|already exists"; then
  echo "  ✓ ja existia"
elif echo "$CRIA" | grep -qi "instanceName\|hash\|token"; then
  echo "  ✓ criada"
else
  echo "  ! resposta inesperada: ${CRIA:0:200}"
fi

echo
echo "════════════════════════════════════════════════════════════"
echo " PRONTO. Agora, no painel da Vercel, crie as variaveis:"
echo
echo "   EVOLUTION_URL              https://$DOMINIO"
echo "   EVOLUTION_API_KEY          (a chave que voce passou)"
echo "   EVOLUTION_INSTANCIA        talita"
echo "   EVOLUTION_WEBHOOK_SEGREDO  (o segredo que voce passou)"
echo
echo " E MANDE UM REDEPLOY. Variavel nova nao entra em build que ja"
echo " existe — sem isso a tela continua dizendo 'sem configuracao'."
echo
echo " Depois: Atendimento -> Conexao -> Gerar QR code"
echo "════════════════════════════════════════════════════════════"
