"""Monta as folhas A0 do mapa de parede.

Regras de tinta, que num mapa de escritório valem mais que estética:

  - A região é a cor do chão. A tinta já foi quase branca, quando ainda se
    escrevia a caneta em cima — caneta sobre cor forte não se lê. Não se escreve
    mais nada aqui: espeta-se tachinha. Então a cor pode ter corpo, e passou a
    ter: os nomes continuam com 9:1 de contraste em cima dela, medido, e o mapa
    finalmente diz de longe onde uma região acaba e outra começa.
  - Quem tem espaço ganha o nome dentro, e quem não tem ganha chamada com fio.
    Nenhum município fica de fora: o mapa é para montar estratégia, e estratégia
    não pode ter buraco.

É UMA FOLHA SÓ. Já foram duas — a segunda ampliava a Região Metropolitana, o
Recôncavo e o Baixo Sul, onde os municípios ficam com menos de 3 mm de miolo na
escala do estado inteiro. Ficou de fora a pedido: o que vai para a parede é o
estado inteiro numa folha. Aquele aglomerado continua apertado aqui, e é onde
está o voto — se um dia precisar de ampliação de novo, ela está no histórico.
"""

import sys, math

sys.path.insert(0, "/Users/talitasantosdeoliveira/PIEPLATAFORMA/mapa-parede")
import geometria

PAG_W, PAG_H = 1000, 1000         # 1 m × 1 m, o tamanho que foi plotado
MARGEM = 18
CABECA = 74
FIO = 0.18
TINTA = "#1a2433"
VOTOS = "#2b3340"     # cinza dos votos; clareia junto com o chao e some
DIVISA = "#414a58"    # contorno de municipio

# Quanto a cor da regiao e puxada para o branco antes de virar chao do mapa.
# Zero e a cor cheia; 1 e papel branco.
#
# Ja esteve em 0,87 — quase papel, de quando se escrevia a caneta por cima.
# Agora e 0,25, e os dois limites foram medidos, nao chutados:
#
#   - o nome do municipio fica com 6,6:1 de contraste sobre a cor. Em texto de
#     2 mm impresso isso e folgado; e o texto dos VOTOS que aperta primeiro, e
#     por isso ele escureceu junto — em #3f4a5c dava 3,8:1 e ficaria cinza sobre
#     cor, ilegivel de perto.
#   - a tachinha tem de aparecer EM CIMA do chao colorido. O pior par e o
#     alfinete azul sobre a regiao SUL, com dE 42 — acima de 25 ja se distingue
#     sem esforco, entao ha folga de sobra. Foi a duvida que fez medir: cor
#     forte demais engoliria o alfinete, e ai a legenda inteira nao serve.
#
# Tudo isto sai em CMYK sem susto: sao matizes de saturacao media, dentro do
# gamute de impressao. Cor fluorescente e que nao sobrevive a plotagem.
LAVAGEM = 0.25

# As cinco regioes do mapa.
#
# A malha do PIE vem com nove mesorregioes, e elas continuam nove LA — o
# regioes-ba.ts alimenta os graficos da plataforma, e mexer nele mudaria o
# painel inteiro. O agrupamento em cinco vive so aqui, porque e decisao de
# mapa de parede: cinco cores se distinguem a tres metros de distancia, nove
# nao.
# LESTE junta com CENTRO-LESTE, e nao com NORDESTE. A primeira versao juntava
# com NORDESTE e o mapa saia contiguo do mesmo jeito — mas punha SALVADOR e toda
# a Regiao Metropolitana dentro de uma regiao chamada "NORDESTE". Num mapa de
# campanha isso e leitura errada: a RMS leva 40% da verba da estrategia, e quem
# olhar a parede tem de achar Salvador no LESTE.
GRUPO = {
    "NORTE": "NORTE",           "CENTRO-NORTE": "NORTE",
    "NORDESTE": "NORDESTE",
    "LESTE": "LESTE",           "CENTRO-LESTE": "LESTE",
    "OESTE": "OESTE",
    "SUDOESTE": "SUL",          "SUL": "SUL",           "EXTREMO-SUL": "SUL",
}

# Cinco matizes bem separados: azul, terracota, verde, roxo e ocre.
#
# O par mais proximo e terracota com ocre, a uns 20 graus de matiz. Fica assim
# de proposito: NORDESTE e OESTE estao em pontas opostas do estado e nao fazem
# divisa em lugar nenhum, entao as duas cores nunca se encostam no papel. Ocre
# no OESTE evita o par verde-com-verde-agua da versao anterior, que se tocava no
# meio do mapa, que e onde a confusao custa caro.
CORES = {
    "NORTE":    "#6d8fc9",
    "NORDESTE": "#d99a6c",
    "LESTE":    "#5fae8f",
    "SUL":      "#9b7fcf",
    "OESTE":    "#c9ae5c",
}

def clarear(hexa, t):
    n = int(hexa[1:], 16)
    f = lambda c: round(c + (255 - c) * t)
    return "#%02x%02x%02x" % (f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255))


def escurecer(hexa, t):
    n = int(hexa[1:], 16)
    f = lambda c: round(c * (1 - t))
    return "#%02x%02x%02x" % (f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255))


# As quatro tachinhas que vão para o mapa. A cor vem primeiro porque é ela que a
# pessoa vê na parede; o nome da cor entra escrito ao lado de propósito, já que
# tinta de plotter e plástico de tachinha nunca saem do mesmo tom — quem estiver
# com o alfinete na mão confere pela palavra, não pelo desenho impresso.
#
# As quatro são bem separadas em matiz — amarelo, rosa, verde e azul caem em
# quadrantes diferentes do círculo de cor. Duas cores vizinhas (laranja ao lado
# do amarelo, por exemplo) se confundiriam de longe, que é justamente a distância
# de onde se olha um mapa de parede.
TACHINHAS = [
    ("#efb003", "AMARELO", "Pastores"),
    ("#e8459b", "ROSA", "Mulheres que governam"),
    ("#2f9e44", "VERDE", "Lideranças territoriais"),
    ("#1c64d1", "AZUL", "Conservadores"),
]


def tachinha(o, x, y, cor, r=2.3):
    """Desenha uma tachinha de lado: cabeça redonda, agulha e um brilho.

    De lado, e não de cima, porque de cima ela vira um círculo colorido — que é
    exatamente o que o mapa já usa para outra coisa. O contorno escuro não é
    enfeite: o amarelo sozinho sobre papel branco quase não se vê.
    """
    escura = escurecer(cor, 0.42)
    # Agulha curta. Com o comprimento que parecia certo isolado, ela alcançava a
    # cabeça da tachinha da linha de baixo e as três viravam uma corrente
    # vertical — parecia um só objeto comprido, não três alfinetes.
    o.append(f'<line x1="{x:.2f}" y1="{y + r * 0.7:.2f}" x2="{x:.2f}" y2="{y + r * 1.9:.2f}"'
             f' stroke="{escura}" stroke-width="0.55"/>')
    o.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r:.2f}" fill="{cor}"'
             f' stroke="{escura}" stroke-width="0.35"/>')
    o.append(f'<circle cx="{x - r * 0.33:.2f}" cy="{y - r * 0.35:.2f}" r="{r * 0.27:.2f}"'
             f' fill="#ffffff" opacity="0.55"/>')


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def larg_txt(txt, tam):
    return len(txt) * tam * 0.5


def quebrar(nome, tam, limite):
    if larg_txt(nome, tam) <= limite:
        return [nome]
    palavras = nome.split()
    for corte in range(len(palavras) - 1, 0, -1):
        a, b = " ".join(palavras[:corte]), " ".join(palavras[corte:])
        if larg_txt(a, tam) <= limite and larg_txt(b, tam) <= limite:
            return [a, b]
    return [nome]


def caminho(aneis):
    return "".join("M" + "L".join(f"{x:.2f},{y:.2f}" for x, y in a) + "Z" for a in aneis)


def rotulo(m, o, ocupadas=None):
    """Escreve o município no maior formato que couber DENTRO dele.

    Tudo é preso ao círculo inscrito, que é o que o polo de inacessibilidade
    devolveu — em município com forma de C o centroide cai fora do próprio
    município, e o nome iria parar no vizinho.

    Não há mais linha de escrita aqui dentro. Quem diz a liderança agora é a
    tachinha espetada, e linha pautada sob um alfinete não se escreve. Sem elas
    sobra altura no círculo, então nome que antes não cabia agora cabe: sai menos
    município para a chamada com fio, e o mapa fica com menos rabicho.
    """
    cx, cy, raio = m["cx"], m["cy"], m["raio"]

    if raio >= 11:
        tam = 3.1
    elif raio >= 6.5:
        tam = 2.5
    elif raio >= 3.3:
        tam = 2.1
    else:
        return False

    linhas = quebrar(m["nome"], tam, raio * 1.7)
    # Nome que não cabe nem quebrado sai por fora, com fio. Melhor chamada
    # limpa do que nome vazando por cima do vizinho.
    if max(larg_txt(ln, tam) for ln in linhas) > raio * 1.9:
        return False

    alto = len(linhas) * tam * 1.05 + (tam * 1.15 if m["votos"] else 0)

    # Guarda o retângulo do nome: a chamada com fio precisa saber que ele está
    # aqui, senão pousa em cima e vira "São Felipe ogipe".
    if ocupadas is not None:
        meia_n = max(larg_txt(ln, tam) for ln in linhas) / 2
        ocupadas.append((cx - meia_n, cy - alto / 2, cx + meia_n, cy + alto / 2))

    y = cy - alto / 2 + tam * 0.9
    for ln in linhas:
        o.append(f'<text x="{cx:.2f}" y="{y:.2f}" text-anchor="middle" font-size="{tam:.2f}"'
                 f' font-weight="700" fill="{TINTA}">{esc(ln)}</text>')
        y += tam * 1.05
    if m["votos"]:
        o.append(f'<text x="{cx:.2f}" y="{y + tam * 0.1:.2f}" text-anchor="middle"'
                 f' font-size="{tam * 0.8:.2f}" fill="{VOTOS}">{m["votos"]} votos</text>')
    return True


def chamadas(sobraram, o, caixa, ocupado):
    """Quem não coube por dentro sai por fora, com fio ligando ao município."""
    x0, y0, x1, y1 = caixa
    for m in sorted(sobraram, key=lambda x: -x["area"]):
        tam = 2.1
        larg = larg_txt(m["nome"], tam)
        posto = None
        for r in (6, 9, 13, 18, 24, 31):
            for passo in range(18):
                ang = (passo * 100) % 360          # espalha em vez de varrer em ordem
                px = m["cx"] + math.cos(math.radians(ang)) * r
                py = m["cy"] + math.sin(math.radians(ang)) * r
                a, b = px - larg / 2, px + larg / 2
                if a < x0 or b > x1 or py < y0 or py > y1:
                    continue
                if any(a < c[2] and b > c[0] and py - 2.3 < c[3] and py + 2.3 > c[1] for c in ocupado):
                    continue
                posto = (px, py)
                break
            if posto:
                break
        if not posto:
            continue
        px, py = posto
        ocupado.append((px - larg / 2, py - 2.3, px + larg / 2, py + 2.3))
        o.append(f'<line x1="{m["cx"]:.2f}" y1="{m["cy"]:.2f}" x2="{px:.2f}" y2="{py + 0.7:.2f}"'
                 f' stroke="{DIVISA}" stroke-width="{FIO}"/>')
        o.append(f'<circle cx="{m["cx"]:.2f}" cy="{m["cy"]:.2f}" r="0.7" fill="{TINTA}"/>')
        o.append(f'<text x="{px:.2f}" y="{py:.2f}" text-anchor="middle" font-size="{tam}"'
                 f' font-weight="700" fill="{TINTA}" paint-order="stroke" stroke="#ffffff"'
                 f' stroke-width="1">{esc(m["nome"])}</text>')


def legenda_tachinhas(o, x_dir, y_topo):
    """A legenda das tachinhas, encostada na direita do cabeçalho.

    Fica nas duas folhas de propósito: quem está espetando alfinete na folha 2
    não vai atravessar a sala para conferir a cor na folha 1.
    """
    # larg_txt vale 0,5 do corpo por caractere, que é a média de texto normal.
    # Negrito em caixa alta passa disso, e a primeira versão colou a descrição no
    # nome da cor: saiu "AMARELOPastores líderes". Aqui a conta é folgada de
    # propósito — sobrar branco entre as colunas não custa nada, faltar arruína a
    # legenda inteira, e ainda protege do caso em que a gráfica não tem a Arial
    # Narrow instalada e o desenho cai numa fonte mais larga.
    tn, td = 6.2, 6.6
    larg = lambda t, tam, f: len(t) * tam * f
    larg_nome = max(larg(n, tn, 0.62) for _, n, _ in TACHINHAS)
    larg_desc = max(larg(d, td, 0.55) for _, _, d in TACHINHAS)
    bloco = 9 + larg_nome + 5 + larg_desc
    x = x_dir - bloco

    o.append(f'<text x="{x:.1f}" y="{y_topo:.1f}" font-size="6.4" font-weight="800"'
             f' fill="{TINTA}" letter-spacing="0.6">TACHINHAS</text>')
    o.append(f'<line x1="{x:.1f}" x2="{x_dir:.1f}" y1="{y_topo + 2.6:.1f}" y2="{y_topo + 2.6:.1f}"'
             f' stroke="#c3ccd9" stroke-width="0.3"/>')

    y = y_topo + 11
    for cor, nome, desc in TACHINHAS:
        tachinha(o, x + 2.9, y - 2.1, cor, r=2.8)
        o.append(f'<text x="{x + 9:.1f}" y="{y:.1f}" font-size="{tn}" font-weight="800"'
                 f' fill="{TINTA}">{esc(nome)}</text>')
        o.append(f'<text x="{x + 9 + larg_nome + 5:.1f}" y="{y:.1f}" font-size="{td}"'
                 f' fill="#5b6779">{esc(desc)}</text>')
        y += 10.5


def cabecalho(o, titulo, linha, cores):
    o.append(f'<text x="{MARGEM}" y="{MARGEM + 23}" font-size="25" font-weight="800"'
             f' fill="{TINTA}">{esc(titulo)}</text>')
    o.append(f'<text x="{MARGEM}" y="{MARGEM + 35}" font-size="7.5" fill="#5b6779">{esc(linha)}</text>')
    x, y = MARGEM, MARGEM + 51
    for reg, cor in cores.items():
        # Mesma lavagem do mapa: a legenda tinha 0,72 contra 0,87 do chao, entao
        # o quadradinho nunca foi a cor que estava desenhada ao lado dele.
        o.append(f'<rect x="{x}" y="{y - 4.6}" width="6" height="6" rx="1"'
                 f' fill="{clarear(cor, LAVAGEM)}" stroke="{clarear(cor, 0.1)}" stroke-width="0.3"/>')
        o.append(f'<text x="{x + 8}" y="{y}" font-size="6.4" font-weight="600"'
                 f' fill="{VOTOS}">{reg}</text>')
        x += 10 + larg_txt(reg, 6.4) + 8
    legenda_tachinhas(o, PAG_W - MARGEM, MARGEM + 14)


def folha(muns, cores, titulo, linha, rodape):
    x0, y0 = MARGEM, MARGEM + CABECA
    x1, y1 = PAG_W - MARGEM, PAG_H - 26
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{PAG_W}mm" height="{PAG_H}mm"'
         f' viewBox="0 0 {PAG_W} {PAG_H}"'
         f' font-family="\'Arial Narrow\',\'Helvetica Neue\',Arial,sans-serif">',
         f'<rect width="{PAG_W}" height="{PAG_H}" fill="#ffffff"/>',
         # Recorte: na folha ampliada o desenho continua para além da janela, e
         # sem isto ele passa por cima do cabeçalho e sangra para fora da folha.
         f'<defs><clipPath id="area"><rect x="{x0}" y="{y0}" width="{x1 - x0}"'
         f' height="{y1 - y0}"/></clipPath></defs>',
         '<g clip-path="url(#area)">']

    for m in muns:
        cor = cores.get(m["regiao"], "#9aa3af")
        o.append(f'<path d="{caminho(m["aneis"])}" fill="{clarear(cor, LAVAGEM)}"'
                 f' stroke="{DIVISA}" stroke-width="{FIO}"/>')

    ocupadas = []
    sobraram = []
    for m in muns:
        if m.get("dentro", True) and not rotulo(m, o, ocupadas):
            sobraram.append(m)
    chamadas(sobraram, o, (x0, y0, x1, y1), ocupadas)

    o.append("</g>")

    # Cabeçalho por último, sobre faixa branca: assim nada do mapa sobe nele.
    o.append(f'<rect x="0" y="0" width="{PAG_W}" height="{y0 - 2}" fill="#ffffff"/>')
    cabecalho(o, titulo, linha, cores)

    o.append(f'<text x="{MARGEM}" y="{PAG_H - 9}" font-size="5.5" fill="#8894a8">{esc(rodape)}</text>')
    o.append("</svg>")
    return "\n".join(o)


def montar():
    # A área do desenho vem daqui e é a mesma que o recorte da folha usa. Antes a
    # altura passada para o projetor era calculada de um jeito e o recorte de
    # outro, e sobrava um desencontro de milímetros que empurrava o pé do mapa
    # para dentro do rodapé.
    area_y0, area_y1 = MARGEM + CABECA, PAG_H - 26
    largura = PAG_W - MARGEM * 2
    altura = area_y1 - area_y0
    muns, _ = geometria.preparar(largura, altura)
    for m in muns:
        m["regiao"] = GRUPO.get(m["regiao"], "")
    # Em folha quadrada a Bahia é o lado alto que manda: ela ocupa toda a altura
    # e sobra branco à esquerda e à direita. O projetor já centra na horizontal;
    # aqui só se acerta a vertical, para a sobra virar margem igual em cima e em
    # baixo em vez de uma tira só num dos lados.
    topo = min(y for m in muns for a in m["aneis"] for _, y in a)
    base = max(y for m in muns for a in m["aneis"] for _, y in a)
    desloca = area_y0 + (altura - (base - topo)) / 2 - topo
    for m in muns:
        for a in m["aneis"]:
            for i, (x, y) in enumerate(a):
                a[i] = (x + MARGEM, y + desloca)
        m["cx"] += MARGEM
        m["cy"] += desloca

    total = sum(m["votos"] for m in muns)
    com = sum(1 for m in muns if m["votos"])
    fmt = f"{total:,}".replace(",", ".")

    return folha(
        muns, CORES, "BAHIA — LIDERANÇAS POR MUNICÍPIO",
        f"417 municípios · {fmt} votos em 2022, em {com} deles · marque a liderança com a tachinha",
        "Votos de 2022 conforme a apuração conferida na plataforma. Malha municipal do IBGE. "
        "Imprimir em 1000 × 1000 mm, sem redimensionar.",
    )


PAGINA = """<!doctype html>
<meta charset="utf-8">
<title>Mapa de parede — Bahia por município</title>
<style>
  @page {{ size: 1000mm 1000mm; margin: 0; }}
  html, body {{ margin: 0; padding: 0; background: #dfe4ee; }}
  .folha {{ width: 1000mm; height: 1000mm; background: #fff; margin: 0 auto 8mm; }}
  .folha svg {{ display: block; width: 100%; height: 100%; }}
  .aviso {{ font: 14px/1.5 system-ui, sans-serif; color: #16202e; background: #fff;
           max-width: 780px; margin: 20px auto; padding: 18px 22px; border-radius: 10px; }}
  .aviso b {{ display: block; font-size: 16px; margin-bottom: 6px; }}
  @media print {{
    .aviso {{ display: none; }}
    html, body {{ background: #fff; }}
    .folha {{ margin: 0; page-break-after: always; break-after: page; }}
    .folha:last-child {{ page-break-after: auto; break-after: auto; }}
  }}
</style>
<div class="aviso">
  <b>Para imprimir</b>
  Imprimir → destino <b>Salvar como PDF</b> → tamanho do papel <b>1000 × 1000 mm</b>
  (tamanho personalizado; não é medida de papel padrão) → margens <b>nenhuma</b> →
  escala <b>100%</b> (nunca "ajustar à página", que encolhe o texto).
  Na gráfica, peça plotagem de 1 × 1 m em papel fosco — brilhante não aceita caneta.
  Confirme antes que a bobina tem pelo menos 1 m de largura: a de 914 mm, que é a mais
  comum, não dá conta e a gráfica vai reduzir o desenho sem avisar.
  É uma folha só.
</div>
<div class="folha">{f1}</div>
"""

if __name__ == "__main__":
    p = "/Users/talitasantosdeoliveira/PIEPLATAFORMA/mapa-parede/"
    mapa = montar()
    open(p + "mapa-bahia.svg", "w", encoding="utf8").write(mapa)
    open(p + "imprimir.html", "w", encoding="utf8").write(PAGINA.format(f1=mapa))
    print("mapa-bahia.svg + imprimir.html")
