# Evolution API no VPS

O transporte do WhatsApp. Ela **só transporta**: não decide quem atende, não
classifica, não cadastra. Isso tudo é do PIE — trocar de fornecedor um dia mexe
só aqui.

Estes arquivos sobem quatro contêineres: a Evolution, o Postgres dela, o Redis e
o Caddy, que resolve o HTTPS sozinho.

---

## Antes de começar

Você vai precisar de um **VPS** (2 vCPU e 4 GB dão folga; a sessão do WhatsApp
vive em memória e é ela que consome) e de um **subdomínio apontando para o IP
dele** — por exemplo `evo.talitaoliveiraoficial.com`, com um registro A.

O domínio precisa estar apontando **antes** de subir o Caddy: ele valida o
certificado no ar, e se o DNS ainda não propagou fica tentando em silêncio.

---

## 1. Preparar o servidor

```bash
# Docker
curl -fsSL https://get.docker.com | sh

# Firewall: só o que precisa entrar
ufw default deny incoming
ufw allow 22/tcp      # seu acesso
ufw allow 80,443/tcp  # o Caddy
ufw enable
```

**A porta da Evolution não entra nessa lista, e é de propósito.** Quem alcança a
API dela manda mensagem pelo número da campanha. Ela fica visível só para os
contêineres vizinhos; quem fala com o mundo é o Caddy.

Se puder, troque o acesso SSH de senha para chave — é a porta que sobra aberta.

---

## 2. Configurar

Copie esta pasta para o servidor e:

```bash
cp .env.exemplo .env
openssl rand -hex 32   # gere um valor para AUTHENTICATION_API_KEY
openssl rand -hex 24   # e outro para POSTGRES_PASSWORD
openssl rand -hex 32   # e um terceiro para o segredo do webhook
```

Preencha o `.env` e troque o domínio no `Caddyfile`. Três valores precisam
**bater exatamente** entre o servidor e a Vercel:

| no `.env` do VPS | na Vercel | o que é |
|---|---|---|
| `AUTHENTICATION_API_KEY` | `EVOLUTION_API_KEY` | a chave global do servidor |
| `SERVER_URL` | `EVOLUTION_URL` | o endereço público, sem barra no fim |
| o `?k=` do `WEBHOOK_GLOBAL_URL` | `EVOLUTION_WEBHOOK_SEGREDO` | o segredo do webhook |

E mais uma que só existe depois do passo 4: `EVOLUTION_INSTANCIA`, o **nome** da
instância.

---

## 3. Subir

```bash
docker compose up -d
docker compose logs -f evolution
```

Confira do seu computador:

```bash
curl https://evo.SEUDOMINIO.com.br
```

Tem que responder algo da Evolution. Se der erro de certificado, o DNS ainda não
propagou — espere e tente de novo.

---

## 4. Criar a instância e ler o QR

```bash
curl -X POST https://evo.SEUDOMINIO.com.br/instance/create \
  -H "apikey: SUA_AUTHENTICATION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"instanceName":"talita","integration":"WHATSAPP-BAILEYS","qrcode":true}'
```

`talita` é o nome da instância — é ele que vai em `EVOLUTION_INSTANCIA`, e é o
que o webhook confere. A resposta traz o QR em base64; para ver como imagem:

```bash
curl -s https://evo.SEUDOMINIO.com.br/instance/connect/talita \
  -H "apikey: SUA_AUTHENTICATION_API_KEY"
```

Leia o QR pelo WhatsApp do número, em **Aparelhos conectados**.

> **Use um número de teste primeiro.** A Evolution conecta lendo o QR de um
> WhatsApp comum, e a Meta apertou o banimento desses números em 2026. O número
> impresso nos cards é o ativo mais caro da campanha — migre ele só depois da
> operação estar rodando.

Confirme que conectou:

```bash
curl -s https://evo.SEUDOMINIO.com.br/instance/connectionState/talita \
  -H "apikey: SUA_AUTHENTICATION_API_KEY"
```

Tem que dizer `open`.

---

## 5. Ligar no PIE

Na Vercel, em **Settings → Environment Variables**, ambiente *Production e
Preview*:

```
EVOLUTION_URL=https://evo.SEUDOMINIO.com.br
EVOLUTION_API_KEY=<a AUTHENTICATION_API_KEY>
EVOLUTION_INSTANCIA=talita
EVOLUTION_WEBHOOK_SEGREDO=<o mesmo do ?k= no .env>
```

**Depois mande um redeploy.** Variável nova não entra em build que já existe —
sem isso, o PIE continua achando que a Evolution não está configurada.

Confira em `/api/versao` (logado): as quatro têm que aparecer como `true`.

---

## 6. Provar que funciona

Mande uma mensagem de um celular qualquer para o número conectado. Em segundos
ela tem que aparecer em **/caixa**, sem recarregar a página.

Se não aparecer, nesta ordem:

1. **`docker compose logs evolution`** — a Evolution recebeu a mensagem?
2. **Vercel → Registros**, filtrando `/api/whatsapp/evolution` — a chamada
   chegou? Se aparecer `chamada sem o segredo na URL`, o `?k=` do `.env` não
   bate com a variável da Vercel.
3. **Supabase → SQL Editor**: `select count(*) from public.mensagens;`

O webhook responde **200 mesmo quando descarta** a chamada. É de propósito — a
Evolution desliga webhook que devolve erro, e perder a captação inteira é pior
do que perder uma mensagem. O preço é que a falha aparece só no log, nunca como
erro visível.

---

## Manutenção

**Backup do volume do Postgres, diariamente.** Perder o banco da Evolution
significa reconectar o WhatsApp lendo o QR de novo — e, dependendo de quando,
perder mensagem que ainda não tinha chegado ao PIE.

**Atualizar** é trocar a tag da imagem no `docker-compose.yml` e rodar
`docker compose up -d`. Leia as notas da versão antes: é a peça que conversa com
o WhatsApp, e mudança de comportamento dela aparece como conversa que some.
