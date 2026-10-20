# Linktree da Talita

Página de canais oficiais, para subir na Hostinger. **Não faz parte do PIE** — é
um arquivo estático solto, sem servidor, sem login e sem banco.

## É um arquivo só, de propósito

`index.html` carrega a foto de fundo e a logo **embutidas dentro dele**. Não
existe pasta de imagem para esquecer de subir, nem caminho para escrever errado:
sobe o arquivo e a página está pronta. São 176 KB, que abre rápido em 4G.

## Como subir na Hostinger

1. hPanel → **Gerenciador de Arquivos**
2. Entre na pasta **`public_html`**
3. Botão **Enviar arquivo** → escolha o `index.html`
4. Se já existir um `index.html` lá, ele será substituído — guarde uma cópia do
   antigo antes, se aquele site ainda importar

Se quiser a página num endereço próprio, tipo `talitaoliveira.com/links`, crie a
pasta `links` dentro de `public_html` e ponha o `index.html` dentro dela.

## Onde entram os links

Os cinco canais estão numa lista só, no começo do `gerar.py`. Onde estiver
escrito `COLE-AQUI-O-LINK-DO-...`, troque pelo endereço de verdade e rode:

```
python3 gerar.py
```

Dá para editar direto no `index.html` também — procure por `COLE-AQUI`, são três
lugares. Mas aí a próxima vez que alguém rodar o `gerar.py` desfaz a edição, então
o certo é mexer no `gerar.py`.

Já vêm preenchidos:

| canal | valor |
|---|---|
| WhatsApp | `557192330000` — o número impresso nos cards já distribuídos |
| Site oficial | `talitaoliveiraoficial.com` |

## A identidade é a mesma da plataforma, não parecida

Os valores foram lidos de `src/app/login/page.tsx`, não estimados de olho:

- foto `capa-talita.jpg` cobrindo a tela
- degradê `rgba(5,37,247,.42) → rgba(7,12,48,.80)` a 150°
- cartão branco, canto de 22 px, sombra `0 24px 64px rgba(0,0,0,.40)`
- azul `#2a45f8`, selo arredondado com o mesmo tracking de 0,15em
- verde `#22b455 → #149a45` no botão principal
- fonte Poppins

O WhatsApp veste o verde porque é o canal que atende de verdade; os outros são
linhas brancas iguais entre si, para nenhum roubar a atenção do que importa.

## O que ainda falta

A pré-visualização de link (aquela imagem que aparece quando alguém manda o
endereço no WhatsApp) precisa de uma imagem hospedada num endereço público —
`og:image` não aceita imagem embutida. Depois que a página estiver no ar, é só
subir a `capa-talita.jpg` ao lado dela e me avisar que eu ligo.
