# Site oficial — Talita Oliveira 1022

**Não faz parte do PIE.** É site estático: HTML que o servidor entrega direto, sem
WordPress, sem banco e sem painel. Em campanha isso vale por três motivos — abre
rápido no celular da rua, não quebra sozinho no meio da eleição, e não tem porta
de invasão para defender.

## O que sobe para o servidor

```
index.html
politica-de-privacidade.html
robots.txt
sitemap.xml
assets/          (3,1 MB de imagens)
```

Vai tudo dentro de `public_html`, na raiz do domínio. **A pasta `assets` precisa
subir junto** — diferente do linktree, aqui as fotos são arquivos, não estão
embutidas. São muitas e grandes demais para caber dentro do HTML.

O que **não** sobe: `gerar.py`, `dados.py`, `estilo.py`, `tratar.sh`, `originais/`
e `fotos/`. São a oficina, não o produto.

## Ao comprar o domínio

Abra `dados.py`, ache `SITE["dominio"]` e troque pelo endereço novo. Depois rode
`python3 gerar.py`. Esse valor alimenta o canonical, o `og:url` que o WhatsApp e o
Facebook leem ao compartilhar, o `sitemap.xml` e o schema — apontar para o
endereço errado manda quem clica para o lugar errado.

## Fotos novas na galeria

A galeria e **so Talita com gente**: encontro, rua, palestra, evento. Retrato de
estudio saiu de la — foto de fundo cinza nao conta historia e diluia as que
contam. Os estudios seguem no topo e no "Quem e Talita", que e onde servem.

Para acrescentar:

```
# 1. jogue as fotos em fotos-novas/
./adicionar-fotos.sh          # reduz, renomeia e imprime as linhas prontas
# 2. cole as linhas em GALERIA, no dados.py, com categoria e legenda
python3 gerar.py
```

Categorias: `povo`, `palestra`, `eventos`, `bahia`, `mandato`.

A legenda (`alt`) nao e enfeite: e o que uma pessoa cega ouve no lugar da foto e
o que o Google le. Descreva o que esta acontecendo, nao "foto 1".

## Como atualizar

Todo o conteúdo está em **`dados.py`**. Agenda, notícias, bandeiras, contato e
redes sociais são listas em português; edite e rode:

```
python3 gerar.py
```

O script reescreve `index.html`, a política de privacidade, o `robots.txt` e o
`sitemap.xml`, e avisa no terminal o que ainda falta de informação.

`estilo.py` guarda o visual. `gerar.py` monta as seções.

## A regra que não se quebra

**Nada é inventado.** O que a equipe não informou fica marcado como
`[A EQUIPE PRECISA INFORMAR]` e aparece na tela com fundo âmbar, como aviso —
placeholder visível é honesto; telefone chutado é dano. Hoje faltam:

| item | situação |
|---|---|
| Instagram, YouTube, X | sem URL confirmada — os ícones não aparecem |
| E-mail da assessoria | marcado na seção Contato |
| Agenda | vazia; a tela diz que não há evento em vez de mostrar data inventada |
| Notícias | idem |
| Analytics / Meta Pixel | `ANALYTICS` em `dados.py` está com `None`, e nenhuma tag é escrita |
| +300 proposições · 414 de 417 municípios | em `NUMEROS_AGUARDANDO`, **fora do ar** até validação |

## O rodapé legal

Exigência do TSE e da Meta, e o motivo de o rótulo de anúncio ter sido reprovado
uma vez. O que importa nele é **como** está servido: texto puro dentro de
`<footer>`, na raiz, visível sem clique, e **sem depender de JavaScript** — o
rastreador da Meta não executa script nem lê imagem.

Para conferir depois de publicar: abra o site, botão direito → Exibir código-fonte
→ procure `68.237.041`. Se achar, passa.

## A moldura #TimeTôComTalita

A pessoa sobe a foto e baixa ela já dentro da moldura, em 1080 × 1920 (story).
**Tudo acontece no navegador dela**: a foto não sobe para servidor nenhum, não
passa por aqui e não fica guardada. Isso evita custo e evita responsabilidade
sobre foto de terceiro, que sob a LGPD é dado pessoal.

⚠️ **Não funciona abrindo o arquivo com dois cliques.** Em `file://` o navegador
trata a moldura como origem diferente, "contamina" o canvas e o download falha
com SecurityError. Publicado no domínio funciona normalmente — a tela avisa isso
em vez de ficar quieta. Para testar antes de publicar, sirva por HTTP:

```
cd site-talita && python3 -m http.server 8000
# depois abra http://localhost:8000
```

Para trocar a arte da moldura, substitua `assets/images/marca/moldura.png`
mantendo 1080 × 1920 com o miolo transparente.

## Decisões de desenho

**A paleta foi amostrada, não escolhida.** A primeira versão era azul e escura, e
destoava de tudo que a campanha publica. Rodei um amostrador de cor sobre as artes
reais — o santinho e a moldura:

| cor | ocorrência | é |
|---|---|---|
| `#48b008` | 53.091 px no santinho | o verde `#4ab608` do manual |
| `#006800` | 4.674 px na moldura | o verde escuro das sombras |
| `#f8b000` | 2.069 px nos dois | o âmbar `#ffb700` do manual |
| azul | **nenhum pixel** | — |

O azul não existe na comunicação da campanha. Saiu do site também.

**Contraste medido, não estimado.** Branco sobre o verde da marca dá 2,63:1 e
reprova — por isso texto sobre verde e âmbar é sempre escuro (6,31:1 e 9,49:1).
Branco sobre o verde escuro das seções dá 12,52:1.

**Todo SVG tem tamanho declarado.** Ícone em linha sem largura vira 300 × 150 px,
que é o padrão do navegador — um desses dentro de um botão estoura a largura da
página no celular.

**As fotos foram reduzidas.** 35,8 MB de originais viraram 2,6 MB para a web (93%
menor), com os arquivos de câmera preservados em `originais/`. O `IMG_0376.PNG`
sozinho tinha 25 MB. `tratar.sh` refaz o processo se chegarem fotos novas.

**Nenhuma imagem de IA na galeria.** Material sintético não pode ser apresentado
como registro fotográfico de acontecimento. A galeria diz isso em voz alta no
rodapé dela.

## O formulário

O site não tem servidor, então o formulário do "Participe" **não envia nada para
lugar nenhum**: ele monta a mensagem com o que a pessoa escreveu e abre o WhatsApp
da campanha, para ela mesma enviar. É honesto e não perde contato no meio do
caminho — mas quer dizer que não existe banco de leads aqui. Se a campanha quiser
capturar os dados direto, aí precisa de um serviço de formulário ou de uma rota no
PIE, e isso é outra conversa.
