"""Projeta a Bahia e acha, para cada município, o maior círculo que cabe dentro.

O centroide não serve para escrever nome: em município com forma de C ou de L
ele cai fora do próprio município, e o nome vai parar no vizinho. O que serve é
o polo de inacessibilidade — o ponto mais longe de qualquer fronteira. Ele dá de
brinde o raio do maior círculo inscrito, que é exatamente a pergunta que este
mapa faz: cabe escrever aqui dentro, e quanto?
"""

import json, math, re, unicodedata

RAIZ = "/Users/talitasantosdeoliveira/PIEPLATAFORMA"


def chave(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def carregar():
    malha = json.load(open(f"{RAIZ}/public/bahia-municipios.json", encoding="utf8"))
    bruto = open(f"{RAIZ}/src/lib/votos-talita.ts", encoding="utf8").read()
    votos = {chave(m[1]): int(m[2]) for m in re.finditer(r'"([^"]+)":\s*(\d+)', bruto)}
    reg_src = open(f"{RAIZ}/src/lib/regioes-ba.ts", encoding="utf8").read()
    regiao = {}
    for m in re.finditer(r'"([A-ZÊ\-]+)":\s*\[(.*?)\]', reg_src, re.S):
        if not m.group(1).isupper():
            continue
        for nome in re.findall(r'"([^"]+)"', m.group(2)):
            regiao[chave(nome)] = m.group(1)
    cores = dict(re.findall(r'"([A-ZÊ\-]+)":\s*"(#[0-9a-fA-F]{6})"', reg_src))
    return malha, votos, regiao, cores


# Mercator: a Bahia pega 10 graus de latitude, e em projeção plana isso entorta
# a forma o bastante para quem conhece o estado estranhar.
def mercator(lon, lat):
    return lon, math.degrees(math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))


def dist_segmento(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def dentro(px, py, anel):
    d = False
    n = len(anel)
    for i in range(n):
        x1, y1 = anel[i]
        x2, y2 = anel[i - 1]
        if (y1 > py) != (y2 > py) and px < (x2 - x1) * (py - y1) / (y2 - y1) + x1:
            d = not d
    return d


def dist_borda(px, py, aneis):
    d = min(
        dist_segmento(px, py, *a[i], *a[(i + 1) % len(a)])
        for a in aneis
        for i in range(len(a))
    )
    return d if dentro(px, py, aneis[0]) else -d


def polo(aneis, passos=(18, 7, 7)):
    """Grade grossa, depois duas rodadas de refino em volta do melhor ponto."""
    xs = [p[0] for p in aneis[0]]
    ys = [p[1] for p in aneis[0]]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    melhor = ((x0 + x1) / 2, (y0 + y1) / 2, -1e9)
    for rodada, n in enumerate(passos):
        if rodada:
            largura = (x1 - x0) / (passos[rodada - 1] * 1.5)
            altura = (y1 - y0) / (passos[rodada - 1] * 1.5)
            cx, cy = melhor[0], melhor[1]
            x0, x1, y0, y1 = cx - largura, cx + largura, cy - altura, cy + altura
        for i in range(n + 1):
            for j in range(n + 1):
                px = x0 + (x1 - x0) * i / n
                py = y0 + (y1 - y0) * j / n
                d = dist_borda(px, py, aneis)
                if d > melhor[2]:
                    melhor = (px, py, d)
    return melhor


def area(anel):
    a = 0.0
    for i in range(len(anel)):
        x1, y1 = anel[i]
        x2, y2 = anel[(i + 1) % len(anel)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def preparar(largura_mm, altura_mm):
    """Devolve cada município já em milímetros de papel."""
    malha, votos, regiao, cores = carregar()
    brutos = []
    for f in malha["features"]:
        nome = f["properties"]["name"]
        aneis = [[mercator(x, y) for x, y in anel] for anel in f["geometry"]["coordinates"]]
        brutos.append((nome, aneis))

    todos = [p for _, aneis in brutos for a in aneis for p in a]
    mx0 = min(p[0] for p in todos); mx1 = max(p[0] for p in todos)
    my0 = min(p[1] for p in todos); my1 = max(p[1] for p in todos)
    escala = min(largura_mm / (mx1 - mx0), altura_mm / (my1 - my0))
    folga_x = (largura_mm - (mx1 - mx0) * escala) / 2
    folga_y = (altura_mm - (my1 - my0) * escala) / 2

    def para_mm(x, y):
        return (folga_x + (x - mx0) * escala, folga_y + (my1 - y) * escala)

    saida = []
    for nome, aneis in brutos:
        mm = [[para_mm(x, y) for x, y in anel] for anel in aneis]
        cx, cy, raio = polo(mm)
        k = chave(nome)
        saida.append({
            "nome": nome,
            "regiao": regiao.get(k, ""),
            "votos": votos.get(k, 0),
            "cx": round(cx, 2), "cy": round(cy, 2), "raio": round(raio, 2),
            "area": round(sum(area(a) for a in mm), 1),
            "aneis": [[(round(x, 2), round(y, 2)) for x, y in a] for a in mm],
        })
    return saida, cores
