# Gera a página num arquivo SÓ, com estilo, script, foto e favicons dentro.
#
# ── POR QUE EXISTE ───────────────────────────────────────────────────────────
#
# Em 15/09 o Emanuel arrastou para a Netlify o "arquivo único" em vez da pasta.
# O site subiu com o desenho certo e SEM a foto: o estilo estava embutido, mas a
# imagem, os favicons e o script continuavam sendo buscados em arquivos ao lado,
# que não existiam lá. Deu 404 em cinco dos seis.
#
# A culpa foi do nome que eu dei. Chamar de "arquivo único" alguma coisa que
# ainda depende de cinco vizinhos é convidar esse erro — e quem usou fez o
# óbvio a partir do nome.
#
# Agora ele é único de verdade. Custa ~70 KB a mais que a pasta, porque base64
# engorda um terço. É o preço de caber num arquivo só, e vale quando o caminho
# de publicação é arrastar UM arquivo.
#
# ── USO ──────────────────────────────────────────────────────────────────────
#
#   python3 paulo-rocha/gerar-arquivo-unico.py
#
# Sai em paulo-rocha/index.html — o UNICO arquivo no nivel de cima, que e o
# que o Emanuel sobe. A materia-prima fica aqui dentro de fonte/ para ele nao
# ter escolha na hora do upload: escolha aqui foi o que subiu o CSS de 15/09.

import base64
import pathlib
import sys

AQUI = pathlib.Path(__file__).parent


def embutir(nome: str, tipo: str) -> str:
    dados = (AQUI / nome).read_bytes()
    return f"data:{tipo};base64," + base64.b64encode(dados).decode()


def main() -> int:
    html = (AQUI / "index.html").read_text()

    trocas = [
        ('<link rel="stylesheet" href="styles.css">',
         "<style>\n" + (AQUI / "styles.css").read_text() + "\n</style>"),
        ('<script src="script.js"></script>',
         "<script>\n" + (AQUI / "script.js").read_text() + "\n</script>"),
        ('src="selo.jpg"',          f'src="{embutir("selo.jpg", "image/jpeg")}"'),
        ('href="favicon-32.png"',   f'href="{embutir("favicon-32.png", "image/png")}"'),
        ('href="favicon-180.png"',  f'href="{embutir("favicon-180.png", "image/png")}"'),
    ]
    for antes, depois in trocas:
        if antes not in html:
            print(f"  NÃO ACHEI no index.html: {antes[:48]}")
            return 1
        html = html.replace(antes, depois)

    # Conferir em vez de confiar: se sobrou qualquer chamada a arquivo vizinho,
    # o "único" volta a ser mentira e o erro se repete.
    restos = [m for m in ('href="styles.css"', 'src="script.js"', 'src="selo.jpg"',
                          'href="favicon-32.png"', 'href="favicon-180.png"') if m in html]
    if restos:
        print("  ainda depende de arquivo de fora:", ", ".join(restos))
        return 1

    # A imagem social (og:image) fica de fora de propósito: prévia de link no
    # WhatsApp e no Facebook não lê data URI, precisa de endereço de verdade.
    saida = pathlib.Path(__file__).resolve().parent.parent / "index.html"
    saida.write_text(html)
    print(f"  gravado: {saida}")
    print(f"  tamanho: {len(html) / 1024:.0f} KB")
    print("  não depende de nenhum arquivo ao lado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
