# Passagem de bastão entre Claude e Gemini

Claude (Claude Code) e Gemini (Antigravity) trabalham no mesmo repositório e se revezam:
o Claude tem cota curta de tokens e pode parar no meio de uma tarefa. **Qualquer um dos
dois tem que conseguir continuar o trabalho do outro sem perguntar nada ao Emanuel.**

O elo é o arquivo `.agents/DIARIO.md`.

## Ao começar

1. Ler `.agents/DIARIO.md` inteiro — principalmente a seção **Em andamento**.
2. Rodar `git status` e `git log --oneline -10` para ver o que mudou desde a última
   anotação (o outro agente pode ter commitado sem anotar).
3. Se houver tarefa em andamento, continuar dela antes de começar outra.

## A cada ação concluída (não só no fim)

Atualizar `.agents/DIARIO.md` **antes** de passar para o próximo passo:

- **Em andamento** — o que está sendo feito, qual passo vem agora, e os arquivos tocados.
  Escrever como instrução para quem pega no meio: "falta X em `arquivo`", não "estou
  fazendo X".
- **Feito** — uma linha por entrega, no topo: data · agente · o que mudou · commit.
- **Armadilhas** — o que se descobriu e não está no código (banco alterado à mão,
  migração pendente, variável de ambiente nova, decisão do Emanuel).

Commitar o diário junto com o código da mesma etapa. Diário desatualizado é pior que
nenhum: quem pega acredita nele.

## Ao parar (cota acabando, tarefa grande)

Deixar **Em andamento** com o próximo passo exato e o que já foi conferido e o que NÃO
foi (regra 01). Commitar e dar push mesmo com o trabalho pela metade, desde que o build
não quebre; se quebrar, deixar em branch `wip/<assunto>` e anotar o nome no diário.

## Regras de convivência

- Commitar só os arquivos que você mesmo alterou — o outro pode ter mudanças abertas.
- Manter o diário curto: **Feito** guarda as últimas ~30 entregas; o resto o `git log`
  tem.
