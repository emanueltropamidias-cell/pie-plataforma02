import zlib, struct, sys

def ler(caminho):
    d = open(caminho, 'rb').read()
    pos, dados = 8, b""
    while pos < len(d):
        n = struct.unpack(">I", d[pos:pos+4])[0]
        t = d[pos+4:pos+8]; c = d[pos+8:pos+8+n]
        if t == b'IHDR':
            larg, alt = struct.unpack(">II", c[:8]); cor = c[9]
        elif t == b'IDAT': dados += c
        elif t == b'IEND': break
        pos += 12 + n
    bpp = {0:1, 2:3, 3:1, 4:2, 6:4}[cor]
    cru = zlib.decompress(dados); lb = larg*bpp
    ant = bytearray(lb); px = []; i = 0
    for y in range(alt):
        f = cru[i]; i += 1
        l = bytearray(cru[i:i+lb]); i += lb
        for x in range(lb):
            a = l[x-bpp] if x >= bpp else 0
            b = ant[x]; c2 = ant[x-bpp] if x >= bpp else 0
            if f == 1: l[x] = (l[x]+a) & 255
            elif f == 2: l[x] = (l[x]+b) & 255
            elif f == 3: l[x] = (l[x]+(a+b)//2) & 255
            elif f == 4:
                p = a+b-c2; pa, pb, pc = abs(p-a), abs(p-b), abs(p-c2)
                l[x] = (l[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c2)) & 255
        px.append(bytes(l)); ant = l
    return larg, alt, bpp, px

def gravar(caminho, larg, alt, pegar):
    linhas = b""
    for y in range(alt):
        linhas += b"\x00"
        for x in range(larg):
            linhas += bytes(pegar(x, y))
    def pedaco(t, c):
        return struct.pack(">I", len(c)) + t + c + struct.pack(">I", zlib.crc32(t+c) & 0xffffffff)
    png = b"\x89PNG\r\n\x1a\n"
    png += pedaco(b"IHDR", struct.pack(">IIBBBBB", larg, alt, 8, 2, 0, 0, 0))
    png += pedaco(b"IDAT", zlib.compress(linhas, 9))
    png += pedaco(b"IEND", b"")
    open(caminho, 'wb').write(png)
