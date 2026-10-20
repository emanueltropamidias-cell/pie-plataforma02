# Testes

Sem runner e sem `npm test`: são páginas HTML que se abrem no navegador e
mostram o resultado na tela. Escolha feita porque a regra testada aqui precisa
ser conferível por quem coordena o atendimento, e não só por quem programa —
abrir um arquivo e ler "20 testes passaram" não pede ambiente montado.

| arquivo | o que verifica |
|---|---|
| `atribuicao.html` | a regra de distribuição de conversas (`src/lib/atribuicao.ts`) |
| `cadastro-automatico.html` | a extração de indicação, município e bairro da mensagem (`src/lib/cadastro-automatico.ts`) |

**Atenção:** cada teste carrega uma CÓPIA da função, sem os tipos. Ao mexer em
`src/lib/atribuicao.ts`, atualize a cópia — senão o teste continua passando
sobre a versão velha e não vale nada.
