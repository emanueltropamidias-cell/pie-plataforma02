# Contexto do ManuFlow

Retrato do produto em 05/11/2026. O estado do dia a dia mora em `.agents/DIARIO.md`, e ele
vence este arquivo quando os dois discordarem. Mudou um fato daqui, corrigir aqui.

## O que é

**ManuFlow** (antigo PIE) é uma plataforma de inteligência eleitoral: reúne a rede de
lideranças, o mapa eleitoral (Brasil, estado, município), o placar de metas, o atendimento
por WhatsApp e a gestão do tráfego pago de uma campanha. Assinatura da marca: "ManuFlow, uma
empresa Opifex". Opifex é a casa-mãe dos negócios do Emanuel, tocada a partir de
`~/Desktop/V.E.R.T.U.S`.

## Linha do tempo

- **Origem:** plataforma da pré-campanha de **Talita Oliveira (BA, urna 1022)**, que segue
  sendo a primeira instalação. Tem usuários reais desde 03/08/2026.
- **15/09/2026:** o código passa a aceitar mais de uma instalação. O que muda entre elas
  fica em `src/lib/candidato.ts` e `src/lib/modulos.ts`.
- **20/10/2026:** deixa de ser exclusiva da Talita e vira produto multi-campanha, com a
  identidade ManuFlow. A instalação do Manassés saiu de uso: não migrar nem conferir.
- **22/10/2026:** decisão do Emanuel de abrir o ManuFlow para todos, como rede social
  política, com monetização depois. O porquê da rede social ficou para conversa futura. Foco
  da época: aba Estratégia, com dados das 3 últimas eleições, Brasil inteiro.
- **26/10/2026:** Estratégia v2 no ar.
- **27/10/2026:** textos da plataforma viram ManuFlow.

## Módulos

Cada um pode ser escondido por instalação com `NEXT_PUBLIC_MODULOS_OCULTOS` (trava de tela,
ver `src/lib/modulos.ts`).

| Módulo | Rotas | O que faz |
|---|---|---|
| dashboard | `/dashboard` | Visão geral |
| atendimento | `/atendimento` | WhatsApp: caixa, supervisão, números, conexão, métricas, etiquetas, kits, áudios, mensagens, departamentos, links |
| trafego | `/trafego` | Meta Ads: KPIs, gerenciador em 3 níveis, criativos, metas por campanha, análise da IA |
| base | `/base`, `/rede`, `/leads`, `/mapa`, `/municipios` | Base de pessoas, rede de indicações, mapa |
| estrategia | `/estrategia` | Inteligência eleitoral com dados do TSE (abaixo) |
| liderancas | `/liderancas`, `/crm`, `/ranking`, `/metas`, `/dobradinha` | Cadastro de lideranças, placar da estratégia A Raiz Continua |
| gabinete | `/gabinete`, `/demandas`, `/conversas` | Demandas e registro de atendimentos |

**Estratégia:** quociente e disputa, comparar candidatos, trajetória pelo título de eleitor,
gastos de campanha, partido com lacunas do candidato, simulador de chapa
(`src/lib/quociente.ts`), perguntas por IA, mapa em % do eleitorado. Os dados do TSE de
2022 a 2026 ficam em arquivos no Storage (bucket `eleicao`, ver `src/lib/eleicao-arquivos.ts`).

**Páginas públicas**, fora da área logada: `/1022` (urna de treino e grupo), `/instituto`,
`/portal` (liderança), `/c/[code]` (ponte de WhatsApp por liderança), `/l/[slug]` (links de
panfleto), `/candidato/[id]`, `/privacidade`.

## Técnica

- **Stack:** Next.js 16 (App Router, React 19), Supabase (Postgres, Auth, RPC, Storage),
  Tailwind 4, shadcn/base-ui, d3-geo, SDK da Anthropic.
- **Next.js 16 muda APIs:** ler `node_modules/next/dist/docs/` antes de escrever código.
- **Banco:** `supabase/migrations/`, numeradas até `0060`. Nunca rodar `supabase/historico/`.
  SQL só por `node scripts/rodar-sql.mjs <arquivo>`.
- **WhatsApp:** Evolution API em VPS (`evo.talitaoliveiraoficial.com`), com Meta Cloud API
  como alternativa (`WA_PROVEDOR`). A chave da Evolution é global do servidor, então cada
  candidato precisa do próprio servidor.
- **Instalação nova:** `INSTALAR.md`. `NEXT_PUBLIC_WA_NUMERO` não tem padrão e quebra o
  build de propósito. O Pixel tem padrão (o da Talita): outra campanha precisa trocar ou
  deixar em branco, senão treina os anúncios dela.
- **Segredos:** só em `.env.local` e no painel da Vercel. Nomes das variáveis no `README.md`.

## Onde está publicado

- **Vercel:** projeto `pieplataforma`, região `gru1`, cron diário de tráfego em
  `/api/trafego/sync?modo=recente`.
- **Endereços:** `manuflow-app.vercel.app` (plataforma, usado nos recados de acesso),
  `pieplataforma.vercel.app` e `talitaoliveiraoficial.com`. `manuflow.vercel.app` é de outra
  conta. `manuflow.com.br` e `manuflow.com` já têm dono, então não há domínio próprio.
- **Publicar:** `npx vercel deploy --prod --yes`, na pasta do projeto. Enviar para o GitHub
  **não** publica.
- **GitHub:** `origin` = `emanueltropamidias-cell/pie-plataforma02` (atual); `antigo` =
  `emanuelcontatocomercial1-sys/PIEPLATAFORMA`. A Vercel segue ligada ao antigo até o Emanuel
  reconectar em Settings, Git.
- **Sessão do Claude:** abrir em `~/PIEPLATAFORMA`. As permissões valem pela pasta em que a
  sessão começou, e em outra pasta a publicação é barrada.

## Marca

- **Fonte da verdade:** bloco "IDENTIDADE MANUFLOW" em `src/app/globals.css` e
  `src/app/layout.tsx`.
- **Nome e símbolo:** ManuFlow ("Manu" em negrito, "Flow" fino), "M" dentro de um pino de
  mapa (`src/components/marca/logo-manuflow.tsx`). Subtítulo: "Plataforma de Inteligência".
- **Visual:** escuro é o padrão (noite `#080B14`, cartões `#111727`, vidro, azul `#3B6CFF`);
  claro tem menu preto. Sora em títulos e números, Inter no texto.
- **Tela nova:** usar as classes de paleta, não hexadecimal, e testar nos dois modos. A marca
  de cada campanha entra dentro do produto (login e páginas públicas).

## O que continua sendo da campanha da Talita

Renomear para ManuFlow não alcança: a página 1022, a política de privacidade (ela é a
controladora na LGPD), as mensagens de WhatsApp, `site-talita/`, `linktree/`, os links de
panfleto `talitaoliveiraoficial.com/l/…` e `evo.talitaoliveiraoficial.com`. Sem revisão
própria, não mexer: o WhatsApp depende do último.

## Conteúdo e vídeo

Vídeos e Instagram são do setor Estúdio da Opifex. Contexto em `conteudo/PROJETO.md`, processo
em `~/Desktop/V.E.R.T.U.S`. O app não importa `conteudo/`. Meta: 3 posts por dia no Instagram.
Ainda **a definir pelo Emanuel:** público, tom, chamada, perfil e se o perfil toma lado
político. Dados eleitorais só da plataforma ou de fonte oficial. Foto de político real em
post público só com decisão dele; até lá, desfocar.

## Pendências (05/11/2026)

- O Emanuel testar a aba Perguntar logado.
- 2º turno de 2026 quando o TSE publicar, e contas finais quando o TSE fechar. Passos no
  diário: o gerador apaga a pasta do ano.
- Migração do Mac para a conta `emanuelsilva`: depois dela, os caminhos em `/Users/…` mudam.
- Backlog da Estratégia: velocidade do site e tela de partido no estilo do Gabinete Online
  (pesquisar antes de desenhar e combinar com o Gemini, autor do layout atual).
- `README.md` desatualizado em marca e fontes (ainda cita navy, verde-limão, Poppins, Bebas
  Neue), tabelas, endereço de produção e na lista da estrutura. Nesses pontos, vale este
  arquivo.

## Onde está cada coisa

Regras de trabalho e fatos medidos: `00` a `04` nesta pasta. Revezamento com o Gemini:
`05-passagem-de-bastao.md`. Instalação: `INSTALAR.md`. Banco: `supabase/README.md`. Fila de
atendimento: `FILA-ATENDIMENTO.md`. Meta Cloud API: `META-CLOUD-API.md`.
