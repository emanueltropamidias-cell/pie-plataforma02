# ManuFlow — inteligência eleitoral

Plataforma multi-campanha. A primeira instalação é a da **Talita Oliveira · Bahia**. Reúne num só lugar a rede de
lideranças, o mapa eleitoral do estado, o placar das metas e a gestão do tráfego pago.

Produção: **https://www.talitaoliveiraoficial.com** (Vercel)

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router, React 19) |
| Banco / Auth | Supabase (Postgres + Auth + RPC) |
| Estilo | Tailwind 4, shadcn/base-ui, fontes Poppins / Bebas Neue / Playfair |
| Mapa | d3-geo (malha dos 417 municípios da Bahia) |
| Integrações | Meta Marketing API (tráfego), Anthropic Claude (análise de IA) |

---

## Rodando localmente

```bash
npm install
npm run dev     # http://localhost:3000
```

### Variáveis de ambiente

Crie um `.env.local` na raiz (o `.gitignore` já bloqueia `.env*`):

```bash
# Supabase — obrigatórias, sem elas o app não sobe
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# ── QUEM É O CANDIDATO ──────────────────────────────────────────────────────
#
# NEXT_PUBLIC_WA_NUMERO é OBRIGATÓRIA e não tem valor padrão: o build QUEBRA
# sem ela, de propósito. Ela era `|| "5571992330000"` no código — o número da
# Talita como reserva. Numa instalação de outro candidato que esquecesse a
# variável, o QR e os links seriam gerados, abririam o WhatsApp e mandariam
# TODOS os eleitores dele para o telefone dela. Nada reprova isso: os links são
# válidos, a tela é a mesma, o QR lê. Só apareceria semanas depois.
#
# Formato: DDI + DDD + número, só dígitos. (71) 99233-0000 -> 5571992330000
NEXT_PUBLIC_WA_NUMERO=

# As demais têm padrão (os valores da Talita) e só precisam ser trocadas numa
# instalação nova. O número de urna não é enfeite: a detecção automática de
# apoio procura por ele no texto da conversa.
NEXT_PUBLIC_CANDIDATO_NOME=
NEXT_PUBLIC_CANDIDATO_PRIMEIRO_NOME=
NEXT_PUBLIC_CANDIDATO_CARGO=
NEXT_PUBLIC_CANDIDATO_UF=
NEXT_PUBLIC_CANDIDATO_URNA=
NEXT_PUBLIC_SITE_URL=          # site público, base dos links de QR
NEXT_PUBLIC_APP_URL=           # por onde a EQUIPE entra (vai no recado de acesso)
NEXT_PUBLIC_MODULOS_OCULTOS=   # áreas que esta instalação não usa, ex.: gabinete,trafego (vazio = tudo; ver src/lib/modulos.ts)

# ── A PÁGINA /1022 — grupo e Pixel ──────────────────────────────────────────
#
# O convite do WhatsApp. Tem padrão no código, então a página não quebra sem
# ele; troque aqui quando o grupo lotar (o limite do WhatsApp é 1.024 pessoas,
# e o link do grupo cheio para de aceitar entrada SEM avisar quem clicou).
NEXT_PUBLIC_GRUPO_APOIADORES=

# O Pixel da Meta. É o ID de 15 ou 16 dígitos do Gerenciador de Eventos
# (business.facebook.com/events_manager). NÃO é chave secreta: ele fica visível
# no código da página para qualquer visitante, por definição — então é variável
# comum, nunca Sensitive.
#
# TEM PADRÃO (o pixel da Talita, em src/lib/candidato.ts), e o padrão é
# DESLIGÁVEL. Três estados, todos conferidos em build de verdade:
#
#   ausente        -> usa o pixel da Talita
#   posta em BRANCO -> não carrega pixel nenhum
#   posta com um ID -> usa esse ID
#
# A instalação de outro candidato PRECISA pôr em branco ou pôr a própria, senão
# o tráfego pago dele treina os anúncios dela.
#
# Os três eventos que /1022 dispara, e para que serve cada um:
#
#   PageView      chegou na página. Base de comparação, não meta.
#   VotoTreinado  terminou a urna, os dois cargos. É o sinal de INTENÇÃO.
#                 Evento PERSONALIZADO: aparece no Gerenciador, mas para o
#                 anúncio otimizar por ele é preciso criá-lo como conversão
#                 personalizada na mão.
#   Lead          clicou para entrar no grupo. É O EVENTO DE CONVERSÃO — é por
#                 ele que a campanha deve otimizar. Evento padrão de propósito:
#                 entra na otimização sem configuração nenhuma.
#
# A barra fixa e o botão do meio da página disparam o MESMO `Lead`. São dois
# caminhos para o mesmo grupo; dois eventos partiriam a conversão em dois
# números pela metade, fracos demais para a Meta aprender com eles.
NEXT_PUBLIC_META_PIXEL=

# Meta Marketing API — aba Tráfego. O PIE lê TODAS as contas de anúncio que o
# token enxerga; não há mais conta fixa (META_AD_ACCOUNT_ID saiu em 15/09).
# Use token de USUÁRIO DO SISTEMA (não expira), com ads_read,
# pages_read_engagement e pages_show_list — e a Página atribuída a ele, senão
# anúncio feito de publicação fica só com miniatura.
#
# UMA BM, UM TOKEN. O usuário do sistema mora numa BM só, então conta de outra
# BM não aparece — e não dá erro, some calada. Com contas em mais de uma BM,
# ponha os tokens separados por vírgula; cada conta é lida pelo token que a
# enxerga, e conta compartilhada entre as duas não é contada duas vezes.
META_ACCESS_TOKEN=

# O cron da Vercel manda este valor para /api/trafego/sync. Sem ele a rota
# RECUSA o cron, de propósito: aberta, qualquer um dispararia sync em laço.
# Qualquer texto longo e aleatório serve.
CRON_SECRET=

# Anthropic — necessária só para a "Análise da IA" no dashboard de tráfego
ANTHROPIC_API_KEY=

# WhatsApp (Evolution API, no VPS) — sem as quatro o CRM não recebe nada.
# A chave é a global do servidor (AUTHENTICATION_API_KEY no docker-compose); a
# instância é o NOME dela, não o id. O segredo você inventa, e ele vai na URL do
# webhook cadastrado na Evolution — ela não assina a chamada, então é a URL que
# faz o papel de segredo.
#
# ATENÇÃO no multicandidato: a chave é GLOBAL do servidor. Com ela, o deploy de
# um candidato lista, controla e pede o QR dos chips do outro. Por isso cada
# candidato tem o SEU servidor Evolution, e não só a sua instância.
EVOLUTION_URL=
EVOLUTION_API_KEY=
EVOLUTION_INSTANCIA=
EVOLUTION_WEBHOOK_SEGREDO=

# Qual provedor de WhatsApp usar: "evolution" (padrão) ou "meta".
WA_PROVEDOR=

# Meta Cloud API — só quando WA_PROVEDOR=meta
META_WA_PHONE_ID=
META_WA_TOKEN=
META_WA_APP_SECRET=
META_WA_VERIFY_TOKEN=
WHATSAPP_VERIFY_TOKEN=

# GabiFlow — importação do histórico de conversas do provedor anterior
GABIFLOW_BASE_URL=
GABIFLOW_API_KEY=
IMPORTAR_AO_CONECTAR=          # "1" para puxar o histórico quando um chip conecta

# Importação de CSV por terminal (/api/leads/importar-csv)
IMPORT_TOKEN=
SUPABASE_SERVICE_ROLE_KEY=

# Banco direto (scripts/rodar-sql.mjs e os geradores de supabase/)
SUPABASE_DB_PASSWORD=          # preferida: senha solta, sem escape de URL
SUPABASE_DB_URL=               # alternativa, a URI inteira
```

Em produção essas variáveis vivem no painel da Vercel. **Nenhum segredo entra no repositório.**

Outros comandos: `npm run build`, `npm run start`, `npm run lint`.

### O banco

A instalação inteira sai de [supabase/migrations/](supabase/migrations/), gerada do banco
vivo. Os 75 arquivos antigos foram para `supabase/historico/` e **não se rodam** — quatro
deles definem `receber_mensagem`, quatro definem `so_digitos`, e rodar o errado instala a
versão velha por cima da nova sem dar erro. O `rodar-sql.mjs` recusa qualquer caminho de
`historico/`. O porquê está em [supabase/README.md](supabase/README.md).

```bash
node scripts/gerar-base.mjs     # relê produção e regrava a base
node scripts/gerar-semente.mjs  # regrava a semente
node scripts/provar-base.mjs    # instala as duas num schema descartável e confere
```

### Rodando o SQL

```bash
node scripts/rodar-sql.mjs supabase/migrations/arquivo.sql
```

Precisa de duas linhas no `.env.local`: `PIE_CANDIDATO` (de quem é a instalação) e
`SUPABASE_DB_PASSWORD` — a senha **crua e sozinha**, sem aspas. Não use `SUPABASE_DB_URL`
a menos que já tenha a URI colada: `@`, `#`, `%` e `?` na senha quebram o endereço e o
banco devolve exatamente o mesmo "senha errada" de uma senha de fato errada.

O arquivo inteiro vai numa transação só — se um comando falhar, nada é aplicado — e
**todos** os selects de conferência aparecem, não só o último, que é o que o editor mostra.
Comando que apaga sem recriar (`drop table`, `delete from`, `truncate`…) exige `--confirmo`.

#### Quando a senha do banco vencer

```bash
node scripts/testar-conexao.mjs
```

Ele conecta, conta o que existe e, quando falha, diz o que arrumar — inclusive mandar
esperar antes de reconferir o arquivo, que é o conselho certo na maioria das vezes.

O Supabase mostra a senha **uma única vez**, quando é gerada, e não há tela que mostre a
atual. Ela é uma só para o projeto: resetar para consertar uma máquina derruba a outra no
mesmo segundo. Duas regras, aprendidas gastando uma tarde:

1. **Guarde no gerenciador de senhas antes de fechar a tela do Supabase.** Não ter onde
   guardar foi a causa de tudo, não a senha ser compartilhada.
2. **Troque nas duas máquinas no mesmo dia.** A que ficar para trás para no meio de algo.

Login de banco por máquina **não funciona** no Supabase hospedado — o `postgres` não é
superusuário e não pode conceder a si mesmo, então o login novo não roda migração. Ver o
commit e50f1fd.

---

## Estrutura

```
src/
├── app/
│   ├── (app)/          # área logada — cada pasta é uma aba do menu
│   │   ├── dashboard/  mapa/  metas/
│   │   ├── crm/        rede/  leads/
│   │   ├── conversas/  trafego/  config/
│   ├── api/
│   │   ├── trafego/sync/      # puxa campanhas/conjuntos/anúncios da Meta
│   │   ├── trafego/analise/   # relatório da IA sobre o desempenho
│   │   └── trafego/debug/     # diagnóstico das ações da Meta
│   ├── c/[code]/       # ponte de WhatsApp (link/QR de cada liderança)
│   ├── portal/         # portal público da liderança (compartilhar seu link)
│   ├── login/  auth/callback/  pendente/
│   └── layout.tsx
├── components/         # UI por módulo (trafego/, crm/, conversas/, metas/…)
├── lib/
│   ├── supabase/       # client.ts (browser) e server.ts (SSR)
│   ├── municipios-ba.ts  regioes-ba.ts  votos-talita.ts
│   ├── raiz-continua.ts  # estratégia das 15 cidades
│   └── trafego-labels.ts # tradução das métricas da Meta
└── middleware.ts       # sessão Supabase + proteção de rotas
```

---

## Os módulos

**Dashboard · Mapa · Metas** — visão geral, malha da Bahia com busca de município (zoom,
destaque e card de dados) e o placar da estratégia **A Raiz Continua**.

**A Raiz Continua** ([src/lib/raiz-continua.ts](src/lib/raiz-continua.ts)) é a Estratégia 1 da meta
de 120 mil votos: triplicar a votação nos 15 maiores municípios (base TSE 2022 = 15.988 votos,
meta ×3 = 47.964). O placar agrega por mesorregião — RMS, Centro-Sul, Sul, Norte/Oeste — e conta
os cadastros ao vivo da tabela `liderancas`.

**Lideranças (CRM) · Rede · Leads** — cadastro de lideranças, árvore de indicações e a base de
munícipes. Cada liderança tem um `link_code` próprio; o link/QR aponta para `/c/[code]`, que:

1. busca quem indicou (RPC `nome_lideranca_por_code`) e monta a mensagem
   *"Oii Talita! Vim pela indicação de [nome]"* — assim o atendimento sabe a origem do lead;
2. registra o contato (RPC `registrar_contato_wa`) **deduplicado por aparelho** via `localStorage`,
   para recarga e re-clique não inflarem a Rede;
3. redireciona pro WhatsApp — com fallback de 3,5 s, caso o registro trave.

**Conversas** — registro de atendimentos com responsável, observações, relatório imprimível e CSV.

**Tráfego** — o módulo mais completo. Dashboard com 9 KPIs e gráficos, aba **Gerenciador** que
espelha o Ads Manager em 3 níveis (campanhas / conjuntos / anúncios) com presets de colunas,
aba **Criativos**, metas personalizadas por campanha, relatório e CSV, e **Análise da IA**.

Duas decisões importantes que já custaram bugs:
- o **resultado** vem do `optimization_goal` do conjunto, não do objetivo da campanha — senão
  engajamento aparece rotulado como "conversas iniciadas";
- **alcance e frequência** usam o agregado da Meta (não a soma por dia), para bater 1:1 com
  o Gerenciador. O sync puxa 3 anos e é resiliente: falha de API nunca apaga dado já gravado.

**Configurações** — conta e gestão de usuários.

---

## Acesso

Cadastro aberto (nome + e-mail + senha), mas a conta nasce pendente: o usuário cai em
`/pendente` até um administrador mudar seu `status` para `ativo` em `profiles`.

## Tabelas no Supabase

`liderancas` · `profiles` · `registros_disparo` · `metas_campanha` ·
`campanhas_trafego` · `conjuntos_trafego` · `criativos_trafego` · `metricas_trafego` · `trafego_sync`

RPCs usadas pela ponte de WhatsApp: `nome_lideranca_por_code`, `registrar_contato_wa`.

---

## Convenções

- Código, comentários e UI em **português**.
- Next.js 16 tem mudanças de API em relação a versões anteriores — consulte
  `node_modules/next/dist/docs/` antes de escrever código (ver [AGENTS.md](AGENTS.md)).
- Marca: navy `#0c1f3a`, verde-limão `#c0eb02`, azul `#0525f7`.
