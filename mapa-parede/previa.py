import re, sys

# Encaixa a folha num quadrado, senao a miniatura corta o cabecalho.
#
# O tamanho sai do viewBox do proprio arquivo. Estava fixo em 841 x 1189 aqui
# dentro, entao no dia em que a folha virou 1 x 1 m esta previa passou a
# desenhar sobre uma medida que nao existia mais.
for nome in sys.argv[1:]:
    svg = open(nome, encoding="utf8").read()
    corpo = svg.split(">", 1)[1].rsplit("</svg>", 1)[0]
    W, H = (float(v) for v in re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg).groups())
    lado = max(W, H)
    out = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{lado:.0f}" height="{lado:.0f}" '
           f'viewBox="0 0 {lado:.0f} {lado:.0f}" font-family="\'Arial Narrow\',Arial,sans-serif">'
           f'<rect width="{lado:.0f}" height="{lado:.0f}" fill="#e9edf3"/>'
           f'<g transform="translate({(lado - W) / 2:.1f} {(lado - H) / 2:.1f})">{corpo}</g></svg>')
    open("previa-" + nome, "w", encoding="utf8").write(out)
    print("previa-" + nome)
