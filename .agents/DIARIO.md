# Diário de bordo — Claude ⇄ Gemini

Regras de uso em `.agents/rules/05-passagem-de-bastao.md`. Ler antes de mexer; atualizar a
cada ação concluída.

## Em andamento

- 22/10/2026 · Claude · Estratégia v2 juntada na `main` com aprovação do Emanuel. FALTA: testar a aba Comparar clicando (não testada); conferir a aba Perguntar no ar (chave da Vercel); depois de 25/10 regerar 2026 (2º turno) e, quando o TSE fechar, as contas de 2026 (`scripts/gerar-eleicao-extras.mjs`).

## Feito (mais recente no topo)

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

- Prestação de contas do TSE repete o mesmo gasto em várias prestações (relatório financeiro, parcial, final, regularização). O gerador usa UMA por candidato; somar o arquivo inteiro infla o valor.
- A CDN do TSE limita cada conexão a ~40 KB/s: arquivo grande só baixa em pedaços paralelos (faixas de bytes).
- Chrome sem janela não desenha abaixo de 500 px: print "de celular" com `--window-size=390` sai cortado e não é defeito da página.

- `conteudo/` é do setor de vídeo da Opifex (o processo mora em `~/Desktop/V.E.R.T.U.S`); não é importada pelo app. MP4, WAV e `conteudo/referencias/` ficam fora do git para não pesar no deploy.
- Desde 20/10/2026 só ManuFlow: não migrar nem conferir a instalação do Manassés.
- ManuFlow é multi-campanha: usar as classes de paleta de `src/app/globals.css`, não cor
  fixa.
