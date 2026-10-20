# Mapa de parede — Bahia por município

Isto **não faz parte do PIE**. É material de impressão, para pendurar no escritório
e montar estratégia com a tachinha na mão. Não tem servidor, não tem login e não lê
banco: é um arquivo de desenho gerado por script.

## Como imprimir

Abra `imprimir.html` no navegador e mande imprimir:

| ajuste | valor |
|---|---|
| destino | Salvar como PDF |
| tamanho do papel | **1000 × 1000 mm** (personalizado) |
| margens | nenhuma |
| escala | **100%** |

1 × 1 m não é medida de papel padrão: no diálogo de impressão é preciso criar um
tamanho personalizado, não escolher da lista.

Nunca use "ajustar à página": ela encolhe o desenho e o nome dos municípios
pequenos some. Na gráfica, peça plotagem de 1 × 1 m em **papel fosco** — o
brilhante não segura marcação nem caneta.

**Confirme a largura da bobina antes de fechar.** A mais comum em plotter é a de
914 mm, que não comporta 1 m — e a gráfica costuma reduzir o desenho para caber
sem avisar ninguém. Para sair em 1 m de verdade, a casa precisa de bobina de
1067 mm ou mais.

## É uma folha só

`mapa-bahia.svg` — a Bahia inteira, 1 × 1 m, com os 417 municípios, cada um com nome
e voto de 2022. Quem diz a liderança é a tachinha espetada.

Já foram duas folhas: a segunda ampliava 2,9× a Região Metropolitana, o Recôncavo e o
Baixo Sul. **Saiu a pedido** — o que vai para a parede é o estado inteiro numa folha.

Vale saber o que se perdeu junto, porque volta a aparecer na hora de espetar alfinete:
naquele aglomerado os municípios ficam com **menos de 3 mm de miolo** na escala do
estado inteiro. Muitos entram no mapa por chamada com fio, e uma tachinha ali cobre o
vizinho. É também onde está a maior parte do voto. Se um dia a ampliação fizer falta,
ela está no histórico do git — ou cabe como encarte no vazio do canto inferior
esquerdo, que na folha quadrada é grande.

## As tachinhas

O cabeçalho das **duas** folhas traz a legenda dos alfinetes — folha 2 também, porque
quem está espetando ali não vai atravessar a sala para conferir a cor na folha 1:

| cor | o que marca |
|---|---|
| 🟡 amarelo | pastores |
| 🩷 rosa | mulheres que governam |
| 🟢 verde | lideranças territoriais |
| 🔵 azul | conservadores |

As quatro cores caem em quadrantes diferentes do círculo de cor. Duas vizinhas —
laranja ao lado do amarelo, por exemplo — se confundiriam de longe, que é
justamente a distância de onde se olha um mapa de parede.

O nome da cor vem escrito ao lado do desenho de propósito. Tinta de plotter e plástico
de tachinha nunca saem do mesmo tom, e quem está com o alfinete na mão confere pela
palavra, não pelo desenho impresso.

Para mudar as cores ou o que cada uma quer dizer, mexa em `TACHINHAS`, no topo do
`desenhar.py`, e rode o script de novo. A legenda se remonta sozinha e se realinha —
a largura das colunas sai do texto.

## Decisões de desenho

**Cinco regiões, e cor com corpo.** A malha do PIE vem com nove mesorregiões, e
elas continuam nove lá — `src/lib/regioes-ba.ts` alimenta os gráficos da
plataforma. O agrupamento em cinco vive só no `desenhar.py`, em `GRUPO`: cinco
cores se distinguem a três metros de parede, nove não.

| região | municípios | vem de |
|---|---:|---|
| NORTE | 139 | NORTE + CENTRO-NORTE |
| LESTE | 132 | LESTE + CENTRO-LESTE |
| SUL | 94 | SUDOESTE + SUL + EXTREMO-SUL |
| OESTE | 33 | OESTE |
| NORDESTE | 19 | NORDESTE |

LESTE junta com CENTRO-LESTE, e não com NORDESTE. As duas versões saem contíguas,
mas a outra punha **Salvador e toda a RMS numa região chamada NORDESTE** — leitura
errada num mapa de campanha, onde a RMS leva 40% da verba da estratégia.

O par de cores mais próximo é terracota (NORDESTE) com ocre (OESTE), a uns 20° de
matiz. É de propósito: as duas regiões estão em pontas opostas do estado e não
fazem divisa em lugar nenhum, então nunca se encostam no papel.

**Nenhuma mancha solta.** Um município cuja região não é a de nenhum vizinho vira
borrão no meio de outra cor. Havia 26 assim, herdados do arquivo de regiões; todos
foram para a região da maioria dos seus vizinhos, medida na malha do IBGE, e a
correção foi para o `regioes-ba.ts` — mapa e plataforma concordam.

A tinta já foi quase branca (`LAVAGEM` em 0,87), de quando ainda se escrevia a
caneta por cima. Não se escreve mais — espeta-se tachinha —, então a cor tem
corpo: `LAVAGEM` está em **0,25**, onde 0 é a cor cheia e 1 é papel branco.

Os dois limites foram medidos, não estimados:

- **O nome do município** fica com 6,6:1 de contraste sobre a cor. Quem aperta
  primeiro é o texto dos **votos**, não o nome — por isso ele escureceu junto,
  de `#8894a8` (2,7:1, já ilegível antes de tudo isto) para `#2b3340` (5,4:1).
- **A tachinha tem de aparecer em cima do chão colorido.** O pior par é o
  alfinete azul sobre a região SUL, com ΔE 42 — acima de 25 já se distingue sem
  esforço. Era o risco real de escurecer o mapa: cor forte demais engoliria o
  alfinete, e aí a legenda inteira deixa de servir.

Para impressão isso é seguro: são matizes de saturação média, dentro do gamute
CMYK. Cor fluorescente é que não sobrevive à plotagem.

**Nome dentro, preso ao círculo inscrito.** O centroide não serve para escrever
nome — em município com forma de C ele cai fora do próprio município, e o nome
vai parar no vizinho. O script calcula o polo de inacessibilidade, que é o ponto
mais longe de qualquer fronteira, e usa o raio do maior círculo inscrito para
decidir o que cabe: nome em duas linhas, em uma, ou nada.

**Sem linha pautada.** O mapa já teve linha para escrever o nome da liderança dentro
de cada município. Saiu: linha pautada debaixo de alfinete não se escreve, e a
tachinha diz a categoria sozinha. Sem elas sobra altura no círculo inscrito, então
nome que antes não cabia agora cabe — e menos município precisa de chamada com fio.

**Ninguém fica de fora.** Quem não comporta o nome por dentro sai por fora, com
fio ligando ao município. Mapa de estratégia não pode ter buraco.

## Regerar

```
python3 desenhar.py
```

Lê a malha do IBGE e os votos de 2022 de dentro do PIE
(`public/bahia-municipios.json`, `src/lib/votos-talita.ts`, `src/lib/regioes-ba.ts`)
e reescreve o `mapa-bahia.svg` e o `imprimir.html`. Quando o voto ou a lista de
municípios mudar lá, basta rodar de novo.

O `mapa-bahia.pdf` é o arquivo que vai para a gráfica: vetorial, com a Arial Narrow
embutida, 1000 × 1000 mm. Para refazer depois de mudar o desenho:

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless \
  --no-pdf-header-footer --print-to-pdf=mapa-bahia.pdf imprimir.html
```

`previa.py` só serve para conferir o resultado na tela antes de gastar plotagem.
