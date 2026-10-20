# Arranca os blocos APP1 (EXIF) de um JPEG. Os pixels não são tocados.
#
# Existe porque o `sips` do macOS grava "gire esta imagem 90 graus" como
# ETIQUETA em vez de girar os pixels. O navegador obedece a etiqueta, e a foto
# que estava de pé no arquivo aparece deitada no site.
import sys, struct

def limpar(caminho):
    b = open(caminho, "rb").read()
    if b[:2] != b"\xff\xd8":
        raise SystemExit(f"{caminho} não é JPEG")
    saida, i, tirados = bytearray(b[:2]), 2, 0
    while i < len(b):
        if b[i] != 0xFF:
            saida += b[i:]; break
        marcador = b[i+1]
        # Início do dado comprimido: daqui em diante é pixel, copia tudo.
        if marcador == 0xDA:
            saida += b[i:]; break
        tam = struct.unpack(">H", b[i+2:i+4])[0]
        if marcador == 0xE1:            # APP1 = onde o EXIF mora
            tirados += 1
        else:
            saida += b[i:i+2+tam]
        i += 2 + tam
    open(caminho, "wb").write(saida)
    return tirados

for c in sys.argv[1:]:
    print(f"  {c}: {limpar(c)} bloco(s) EXIF removido(s)")
