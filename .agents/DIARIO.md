# Diário de bordo — Claude ⇄ Gemini

Regras de uso em `.agents/rules/05-passagem-de-bastao.md`. Ler antes de mexer; atualizar a
cada ação concluída.

## Em andamento

- 26/10/2026 · Claude · Estratégia v2 NO AR (pieplataforma.vercel.app e talitaoliveiraoficial.com). FALTA: o Emanuel adicionar `manuflow.vercel.app` em Domains na Vercel (a trava bloqueia o Claude); depois trocar o padrão de `app` em `src/lib/candidato.ts` para ele e publicar; o Emanuel entrar e testar a aba Perguntar logado; 2º turno de 2026 quando o TSE publicar (`PRESIDENTE|2` em `apuracao/BA.json`): `gerar-eleicao-arquivos.mjs --ano=2026` (APAGA a pasta do ano), depois `gerar-eleicao-extras.mjs --ano=2026` e `--pessoas`, e subir; contas finais de 2026 quando o TSE fechar.

## Feito (mais recente no topo)

- 27/10/2026 · Claude · recado de conta nova e de liderança apontam para o endereço principal (`CANDIDATO.app` = pieplataforma.vercel.app), não mais para `atendimento.…` · `6d35df7` · publicado
- 27/10/2026 · Claude · textos da plataforma viram ManuFlow (aba, barra lateral, relatórios, painel, espera de aprovação, package.json, README) · `22f54d2` — publicado 27/10
- 27/10/2026 · Claude · publicado em produção com o `ddfe675` (2º turno sem apuração)
- 26/10/2026 · Claude · Estratégia: presidente na lista de cargos do estado; filtro por resultado; resultado final do 2º turno no selo; 1º → 2º turno por cidade (aba Disputa); planilhas (lista filtrada e votos por cidade); aba Partido com lacunas do candidato (dados `partido/<UF>.json`, etapa `partido` do gerador); simulador de chapa (`src/lib/quociente.ts`, reproduz o oficial em 23/23 disputas testadas). No ar desde a publicação de 26/10 14:08
- 26/10/2026 · Claude + Emanuel · produção consertada: as variáveis da Vercel apontavam para o Supabase antigo (`unmjcm…`, apagado depois da migração de 20/10); trocadas pelas do banco novo (`lrccsrz…`), publicado pelo Emanuel. Dados de 2026 regerados e subidos (18.543 arquivos)
- 24/10/2026 · Claude · aba Comparar testada no navegador (sem erros); medida "as bases se parecem X%"; legenda sem chave repetida; `.vercelignore` (sem `.cache/` e `conteudo/`); token do GitHub tirado do endereço do `origin` — o git usa o login do `gh`
- 22/10/2026 · Claude · login volta para onde a pessoa ia (`?proximo=`), sitemaps de candidatos e robots.txt
- 22/10/2026 · Claude · Estratégia v2 (branch `estrategia-v2`): abas Quociente/Disputa, Comparar, Trajetória, Gastos, Perguntar; mapa em % do eleitorado; cidade com eleitorado e perfil; página pública `/candidato/[id]`; dados extras do TSE via `scripts/gerar-eleicao-extras.mjs`
- 22/10/2026 · Claude · pasta `conteudo/` criada: contexto de conteúdo do Manuflow para o setor Criação de Vídeo da Opifex (`conteudo/PROJETO.md`) e os vídeos feitos (`conteudo/videos/`); mídia fora do git · `357c33e`
- 22/10/2026 · Gemini · foto de urna preenchendo o círculo no card da Estratégia (removido span wrapper com border redundante) · `d9514bc`
- 21/10/2026 · Claude · criado este diário e a regra 05 de passagem de bastão
- 20/10/2026 · — · layout de celular na Estratégia e nos indicadores · `51bada9`
- 20/10/2026 · — · identidade ManuFlow (pino, escuro padrão, claro com menu preto) · `4bafe24`
- 20/10/2026 · — · escolher as abas de cada usuário ao criar a conta (migração 0060) · `ec4790f`
- 20/10/2026 · — · atalhos de lideranças saem da Estratégia para `/liderancas` · `27b7b5a`
- 20/10/2026 · — · fotos de urna maiores · `fbf99c3`

## Armadilhas

- Renomear para ManuFlow NÃO alcança o que é da campanha da Talita: página 1022, política de privacidade (ela é a controladora na LGPD), mensagens de WhatsApp, `site-talita/`, `linktree/`, links de panfleto `talitaoliveiraoficial.com/l/…` e `evo.talitaoliveiraoficial.com` (WhatsApp depende dele). `manuflow.com.br` e `manuflow.com` já têm dono (27/10).

- Sobras do quociente: a última fase vai para TODAS as agremiações (STF, fev/2024), e isso vale também para 2022 — o TSE recontou (Amapá trocou deputados) e o dado oficial já é o recontado. Com a regra antiga o simulador erra o Amapá 2022.

- A Vercel NÃO publica a partir do GitHub: publicar é `npx vercel deploy --prod` na pasta (desde 27/10 liberado para o Claude em `.claude/settings.local.json`, só `npx vercel deploy --prod --yes`). As variáveis do banco moram na Vercel e NÃO acompanham o `.env.local`: trocou de banco, trocar lá também (`vercel env update NOME -e production`; as `NEXT_PUBLIC_` pedem `--type config`).

- `gerar-eleicao-arquivos.mjs --ano=X` (sem `--uf`) apaga `.cache/eleicao-arquivos/X/` inteira, inclusive os extras: sempre rodar `gerar-eleicao-extras.mjs --ano=X` e `--pessoas` logo depois.

- O `origin` tinha um token do GitHub dentro do endereço (`https://usuario:ghp_…@github.com/…`) e uma linha vazia de `credential.helper` no `.git/config`. Os dois foram tirados em 24/10: o envio usa o login do `gh` (conta com permissão no repositório). Nunca pôr token no endereço do remoto.

- Prestação de contas do TSE repete o mesmo gasto em várias prestações (relatório financeiro, parcial, final, regularização). O gerador usa UMA por candidato; somar o arquivo inteiro infla o valor.
- A CDN do TSE limita cada conexão a ~40 KB/s: arquivo grande só baixa em pedaços paralelos (faixas de bytes).
- Chrome sem janela não desenha abaixo de 500 px: print "de celular" com `--window-size=390` sai cortado e não é defeito da página.

- `conteudo/` é do setor de vídeo da Opifex (o processo mora em `~/Desktop/V.E.R.T.U.S`); não é importada pelo app. MP4, WAV e `conteudo/referencias/` ficam fora do git para não pesar no deploy.
- Desde 20/10/2026 só ManuFlow: não migrar nem conferir a instalação do Manassés.
- ManuFlow é multi-campanha: usar as classes de paleta de `src/app/globals.css`, não cor
  fixa.
