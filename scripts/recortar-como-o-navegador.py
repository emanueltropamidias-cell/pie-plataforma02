# Recorta um PNG na horizontal, do jeito exato que o navegador recorta com
# `background-size:cover` + `background-position: P%`.
#
# Existe porque não dá para acertar enquadramento no escuro: o valor certo de
# P depende da largura do aparelho, e chutar custa uma publicação por tentativa.
import zlib, struct, sys

def ler(caminho):
    d = open(caminho, "rb").read()
    assert d[:8] == b"\x89PNG\r\n\x1a\n"
    i, idat, larg, alt, cor, prof = 8, b"", 0, 0, 0, 0
    while i < len(d):
        tam = struct.unpack(">I", d[i:i+4])[0]; tipo = d[i+4:i+8]
        dados = d[i+8:i+8+tam]
        if tipo == b"IHDR":
            larg, alt, prof, cor = struct.unpack(">IIBB", dados[:10])
        elif tipo == b"IDAT": idat += dados
        elif tipo == b"IEND": break
        i += 12 + tam
    canais = {0:1, 2:3, 4:2, 6:4}[cor]
    assert prof == 8, f"profundidade {prof} não tratada"
    cru = zlib.decompress(idat)
    passo = larg * canais
    linhas, ant = [], bytearray(passo)
    p = 0
    for _ in range(alt):
        f = cru[p]; linha = bytearray(cru[p+1:p+1+passo]); p += 1 + passo
        for x in range(passo):                     # desfaz o filtro do PNG
            a = linha[x-canais] if x >= canais else 0
            b = ant[x]; c = ant[x-canais] if x >= canais else 0
            if   f == 1: linha[x] = (linha[x] + a) & 255
            elif f == 2: linha[x] = (linha[x] + b) & 255
            elif f == 3: linha[x] = (linha[x] + (a+b)//2) & 255
            elif f == 4:
                pa = abs(b-c); pb = abs(a-c); pc = abs(a+b-2*c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                linha[x] = (linha[x] + pr) & 255
        linhas.append(linha); ant = linha
    return larg, alt, canais, linhas

def gravar(caminho, larg, alt, canais, linhas):
    cor = {1:0, 3:2, 4:6}[canais]
    cru = b"".join(b"\x00" + bytes(l) for l in linhas)
    def bloco(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t+d) & 0xffffffff)
    png = (b"\x89PNG\r\n\x1a\n"
           + bloco(b"IHDR", struct.pack(">IIBBBBB", larg, alt, 8, cor, 0, 0, 0))
           + bloco(b"IDAT", zlib.compress(cru, 6)) + bloco(b"IEND", b""))
    open(caminho, "wb").write(png)

entrada, saida, caixa, P = sys.argv[1], sys.argv[2], int(sys.argv[3]), float(sys.argv[4])
larg, alt, canais, linhas = ler(entrada)
ini = round(P * (larg - caixa))
novas = [l[ini*canais:(ini+caixa)*canais] for l in linhas]
gravar(saida, caixa, alt, canais, novas)
print(f"{saida}: janela de {caixa}px começando em {ini} de {larg}")
