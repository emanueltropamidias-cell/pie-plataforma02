# Domínio do PIE — fatos medidos

## Lead de tráfego não é disparo

O mesmo WhatsApp carrega duas operações, e Emanuel corrigiu isso em 23/08/2026 depois que
elas foram somadas no painel. **Nunca somar as duas.**

- **Lead de tráfego** — a pessoa escreveu primeiro. Veio de anúncio ou indicação. Cabe SLA,
  fila e funil: ela está esperando.
- **Disparo para base** — a campanha escreveu primeiro, para lista que já existia. SLA não
  significa nada; a métrica é retorno.

**Como separar:** direção da primeira mensagem. É exato. Medido em 45 conversas: das
`template_pending`, 13 de 13 começaram com a campanha; das outras, 30 de 31 começaram com a
pessoa.

**Por que importa:** somadas, "não atendido" — que existe para apontar falha da equipe —
passa a incluir quem ignorou um disparo e nunca pediu nada. O número que deveria mandar
reforçar o time fica inflado.

**Como aplicar:** antes de criar qualquer métrica de atendimento, perguntar de qual dos
dois universos ela fala. Se serve para os dois, provavelmente está errada.

## O que a API do GabiFlow entrega

Levantado em 23/08/2026 chamando a API direto, não lendo documentação.

**Só dois endpoints funcionam:** `/conversations` e `/messages?phone=`. `agents`, `users`,
`departments`, `stats`, `metrics`, `contacts` dão 404.

**A lista está capada em 384 de 2013 conversas** — nenhum filtro muda isso. Mas
`/messages?phone=` alcança QUALQUER conversa, inclusive as que a lista esconde. A lista de
telefones das outras vem da exportação CSV do painel (botão Exportar), que tem a coluna
`Agent`.

**`assignedTo` vem vazio em 91%**, até em conversa que a planilha diz ter atendente.
**`sentBy` nas mensagens outbound está preenchido em 35 de 35** — é por ele que se sabe
quem atendeu.

**Não existe origem do lead.** Nenhum campo liga a pessoa ao anúncio. Só muda se o link do
Meta passar a mandar código na mensagem inicial.

Vazios apesar de existirem na tela: Sentiment, SLA Met, Rating (1376 de 1376). Tags
`[TRANSFERIR_HUMANO:x]`: zero. Sem histórico de mudança de status.

**91% das mensagens são texto legível.** 9% são áudio/imagem sem transcrição — aí a IA fica
cega. Há limite de chamadas por minuto no `/messages`.
