# O banco do PIE

```
migrations/0000_base.sql   o banco inteiro, do zero
seed.sql                   o que é igual entre candidatos
historico/                 75 arquivos que NÃO se rodam
```

## Por que isto mudou

Até aqui o banco era 75 arquivos soltos, escritos incrementalmente, cada um
contra o banco daquele dia. **Ninguém nunca instalou o PIE do zero** — e não
dava: `profiles` e `liderancas`, as duas tabelas mais usadas do sistema (199
referências entre as duas), não eram criadas por arquivo nenhum. Foram feitas à
mão, em algum momento, e nunca registradas.

Pior que isso: quatro arquivos definem `receber_mensagem`, quatro definem
`so_digitos`, três definem `atribuir_conversa`. Rodar o errado instala a versão
**velha** por cima da nova **sem dar erro**. `historico/ingestao.sql` desfaz o
multinúmero; `historico/papel-atendente.sql` devolve os papéis de lista branca
para lista negra; `historico/metricas.sql` recria uma assinatura que deixa a
chamada ambígua. Nada disso aparece na tela — o número só para de bater.

## Como mudar o banco daqui para frente

Arquivo novo em `migrations/`, com data no nome. Nunca editar `0000_base.sql`
à mão, e nunca rodar nada de `historico/` — o `rodar-sql.mjs` recusa.

## Os geradores

| | |
|---|---|
| `scripts/gerar-base.mjs` | relê o banco de produção e regrava `0000_base.sql` |
| `scripts/gerar-semente.mjs` | regrava `seed.sql` |
| `scripts/provar-base.mjs` | instala os dois num schema descartável e confere |

`provar-base.mjs` é o que dá confiança de que a instalação funciona: ele roda a
base e a semente inteiras num schema vazio do próprio servidor, dentro de uma
transação desfeita no fim, com `public` FORA do caminho de busca — para que
nada possa ser emprestado de produção e passar por acidente. No fim compara os
objetos criados com os de produção.

Foi ele que achou, um a um, os defeitos que o dump ingênuo tinha: as 21
sequências que faltavam, as views geradas em ordem alfabética em vez de ordem
de dependência, e as funções que devolvem `setof <tabela>` saindo antes das
tabelas.

## O que a semente NÃO traz, de propósito

**O fluxo automático.** `fluxo_passos.mensagem` é copy de campanha e
`fluxos.telefones_teste` guarda telefone real. Semear entregaria a um candidato
novo um disparo pronto e funcionando, escrito para outra pessoa — e o eleitor
dele receberia.

**Os kits.** `kit_itens.material_id` aponta para arquivos no Storage do projeto
da Talita. Num projeto novo o kit apareceria na tela e não mandaria nada.

Os dois são conteúdo do candidato, não estrutura. Cada instalação cria os seus.

> Hoje não há tela para criar um roteiro de fluxo — ele sempre veio de SQL. Uma
> instalação nova fica sem fluxo e sem como criar um pela interface. É uma
> lacuna conhecida.
