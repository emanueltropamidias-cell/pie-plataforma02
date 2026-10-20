# Entregar arquivo na mão

Quando o trabalho gera um arquivo para o usuário usar fora do editor (HTML para subir na
Hostinger, SVG para levar à gráfica, PDF), **não basta dizer o caminho.** Ele respondeu
"não estou conseguindo achar nada" a um caminho dentro do repositório.

**Por que:** ele opera pelo Finder e por painéis web, não pelo terminal. Caminho tipo
`PIEPLATAFORMA/linktree/index.html` é invisível para quem não navega por pasta de projeto —
e o arquivo fica enterrado entre `src`, `public` e `node_modules`.

**Como aplicar:** ao terminar um entregável desse tipo, na mesma resposta:

- `open -R <arquivo>` para revelar no Finder
- `open <arquivo>` quando fizer sentido ver o resultado
- `cp` para uma pasta nomeada na Área de Trabalho

Se o destino pede zip (Hostinger), gerar o zip já com o arquivo na raiz — pasta dentro do
zip quebra o endereço do site.
