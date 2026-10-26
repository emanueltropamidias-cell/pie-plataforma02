# Diário de bordo — Claude ⇄ Gemini

Regras de uso em `.agents/rules/05-passagem-de-bastao.md`. Ler antes de mexer; atualizar a
cada ação concluída.

## Em andamento

- 24/10/2026 · Claude · Estratégia v2 está na `main` e no GitHub, mas NÃO na produção: a Vercel não publica sozinha a partir do GitHub, e a última publicação é de 16/10 (antes também das entregas de 20–22/10). Publicar: `npx vercel deploy --prod` na pasta (o Emanuel roda; a trava do Claude Code bloqueia publicação em produção). Depois de publicar: testar a aba Perguntar logado (a `ANTHROPIC_API_KEY` existe na Vercel). 2º turno de 2026: os arquivos do TSE de 25/10 foram gerados às 12h58 (antes do fim da votação) e ainda não têm o 2º turno; regerado e subido mesmo assim (cadastro atualizado). Quando o TSE publicar o 2º turno (`PRESIDENTE|2` aparece em `apuracao/BA.json`), rodar `gerar-eleicao-arquivos.mjs --ano=2026`, depois `gerar-eleicao-extras.mjs --ano=2026` e `--pessoas` (o primeiro APAGA a pasta do ano) e subir; quando o TSE fechar, as contas de 2026 (`scripts/gerar-eleicao-extras.mjs`).

## Feito (mais recente no topo)

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

- `gerar-eleicao-arquivos.mjs --ano=X` (sem `--uf`) apaga `.cache/eleicao-arquivos/X/` inteira, inclusive os extras: sempre rodar `gerar-eleicao-extras.mjs --ano=X` e `--pessoas` logo depois.

- O `origin` tinha um token do GitHub dentro do endereço (`https://usuario:ghp_…@github.com/…`) e uma linha vazia de `credential.helper` no `.git/config`. Os dois foram tirados em 24/10: o envio usa o login do `gh` (conta com permissão no repositório). Nunca pôr token no endereço do remoto.

- Prestação de contas do TSE repete o mesmo gasto em várias prestações (relatório financeiro, parcial, final, regularização). O gerador usa UMA por candidato; somar o arquivo inteiro infla o valor.
- A CDN do TSE limita cada conexão a ~40 KB/s: arquivo grande só baixa em pedaços paralelos (faixas de bytes).
- Chrome sem janela não desenha abaixo de 500 px: print "de celular" com `--window-size=390` sai cortado e não é defeito da página.

- `conteudo/` é do setor de vídeo da Opifex (o processo mora em `~/Desktop/V.E.R.T.U.S`); não é importada pelo app. MP4, WAV e `conteudo/referencias/` ficam fora do git para não pesar no deploy.
- Desde 20/10/2026 só ManuFlow: não migrar nem conferir a instalação do Manassés.
- ManuFlow é multi-campanha: usar as classes de paleta de `src/app/globals.css`, não cor
  fixa.
