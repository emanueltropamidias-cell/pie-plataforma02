# Diário de bordo — Claude ⇄ Gemini

Regras de uso em `.agents/rules/05-passagem-de-bastao.md`. Ler antes de mexer; atualizar a
cada ação concluída.

## Em andamento

- 22/10/2026 · Claude · **Estratégia v2** na branch `estrategia-v2` (pedido do Emanuel: aplicar todas as melhorias propostas). FEITO no código: correções (Presença real, selo de resultado, abre o mais votado em vez de sortear, camada "sua campanha" só com base, demo e painel duplicado apagados, `/estrategia/votos` redireciona), mapa em votos / % eleitorado / % válidos, abas Quociente/Disputa, Comparar, Trajetória, Gastos, Perguntar (IA com ferramentas, `/api/eleicao/pergunta`), cidade com eleitorado e perfil, página pública `/candidato/[id]`. Dados: `scripts/gerar-eleicao-extras.mjs`; 2022 gerado e no Storage (apuração, quociente, perfil, ficha, pessoas). FALTA: (1) terminar downloads em `.cache/tse` (perfil 2024/2026, prestação de contas 2022/2024/2026) — baixador paralelo em pedaços, a CDN do TSE limita cada conexão a ~40 KB/s; (2) `--so=perfil,contas` por ano e `--so=contas` 2022; (3) subir 2024 e 2026 com `--apenas="^(apuracao|quociente|perfil|contas|pessoas|ficha)/"`; (4) `next build`, mostrar ao Emanuel, merge.

## Feito (mais recente no topo)

- 22/10/2026 · Claude · pasta `conteudo/` criada: contexto de conteúdo do Manuflow para o setor Criação de Vídeo da Opifex (`conteudo/PROJETO.md`) e os vídeos feitos (`conteudo/videos/`); mídia fora do git · `357c33e`
- 22/10/2026 · Gemini · foto de urna preenchendo o círculo no card da Estratégia (removido span wrapper com border redundante) · `d9514bc`
- 21/10/2026 · Claude · criado este diário e a regra 05 de passagem de bastão
- 20/10/2026 · — · layout de celular na Estratégia e nos indicadores · `51bada9`
- 20/10/2026 · — · identidade ManuFlow (pino, escuro padrão, claro com menu preto) · `4bafe24`
- 20/10/2026 · — · escolher as abas de cada usuário ao criar a conta (migração 0060) · `ec4790f`
- 20/10/2026 · — · atalhos de lideranças saem da Estratégia para `/liderancas` · `27b7b5a`
- 20/10/2026 · — · fotos de urna maiores · `fbf99c3`

## Armadilhas

- `conteudo/` é do setor de vídeo da Opifex (o processo mora em `~/Desktop/V.E.R.T.U.S`); não é importada pelo app. MP4, WAV e `conteudo/referencias/` ficam fora do git para não pesar no deploy.
- Desde 20/10/2026 só ManuFlow: não migrar nem conferir a instalação do Manassés.
- ManuFlow é multi-campanha: usar as classes de paleta de `src/app/globals.css`, não cor
  fixa.
