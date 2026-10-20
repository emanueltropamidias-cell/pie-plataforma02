"""Divide a exportação de conversas do supervisor em uma planilha por atendente.

USO
    python3 dividir-por-atendente.py ~/Downloads/supervisor-conversas-....csv

O que sai: um CSV por atendente, com as MESMAS colunas do original, mais um
arquivo "outros-atendentes" com quem não se encaixou em nenhum dos nomes pedidos.

POR QUE O ARQUIVO DE SOBRA EXISTE. Foram pedidas três planilhas — Boneca,
Victoria e Juliana —, mas a exportação tem cinco atendentes e algumas linhas sem
atendente nenhum. Só as três deixariam 116 pessoas fora, sem ninguém perceber:
some do arquivo e some do acompanhamento. Então tudo que não entra nas três vai
para um quarto arquivo, que é fácil de apagar e impossível de não ver.

DUAS ARMADILHAS TRATADAS AQUI:

  1. "Altineia Boneca " vem com espaço no fim. Sem tirar, ela vira duas pessoas
     diferentes em qualquer contagem que alguém faça depois.
  2. O CSV sai com BOM (utf-8-sig). Sem ele, o Excel no Windows abre "João" como
     "JoÃ£o" — e aí a planilha inteira parece corrompida.
"""

import collections
import csv
import pathlib
import sys
import unicodedata

# nome do arquivo -> pedaços que identificam o atendente na coluna Agent.
# Talita e Thami dividem o mesmo arquivo, a pedido: juntas somam 113 conversas e
# separadas virariam dois arquivos pequenos demais para acompanhar.
ATENDENTES = {
    "boneca": ("altineia", "boneca"),
    "victoria": ("victoria",),
    "juliana": ("juliana",),
    "talita-e-thami": ("talita", "thami"),
}
# As linhas sem atendente ficam num arquivo com o nome do que elas são. Jogá-las
# junto com a Talita e a Thami daria um arquivo com nome mentiroso.
SOBRA = "sem-atendente"


def normalizar(t):
    t = unicodedata.normalize("NFD", (t or "").strip().lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def de_quem(agente):
    n = normalizar(agente)
    for arquivo, pistas in ATENDENTES.items():
        if any(p in n for p in pistas):
            return arquivo
    return SOBRA


def main(origem):
    origem = pathlib.Path(origem).expanduser()
    if not origem.exists():
        sys.exit(f"não encontrei o arquivo: {origem}")

    with origem.open(encoding="utf-8-sig", newline="") as f:
        leitor = csv.DictReader(f)
        colunas = leitor.fieldnames
        linhas = list(leitor)

    if "Agent" not in (colunas or []):
        sys.exit("a planilha não tem a coluna 'Agent' — confira se é a exportação certa")

    grupos = collections.defaultdict(list)
    for linha in linhas:
        # O espaço sobrando no fim do nome é gravado limpo, senão vira dois
        # atendentes diferentes na hora de somar.
        linha["Agent"] = (linha.get("Agent") or "").strip()
        grupos[de_quem(linha["Agent"])].append(linha)

    destino = pathlib.Path.home() / "Desktop" / "CONVERSAS POR ATENDENTE"
    destino.mkdir(parents=True, exist_ok=True)

    print(f"{len(linhas)} conversas em {origem.name}\n")
    for arquivo in list(ATENDENTES) + [SOBRA]:
        dados = grupos.get(arquivo, [])
        if not dados:
            continue
        caminho = destino / f"conversas-{arquivo}.csv"
        with caminho.open("w", encoding="utf-8-sig", newline="") as f:
            escritor = csv.DictWriter(f, fieldnames=colunas)
            escritor.writeheader()
            escritor.writerows(dados)
        quem = sorted({d["Agent"] or "(em branco)" for d in dados})
        print(f"  {caminho.name:34s} {len(dados):5d} conversas   {', '.join(quem)}")

    somado = sum(len(v) for v in grupos.values())
    print(f"\n  soma: {somado} de {len(linhas)} — "
          f"{'bate, ninguém ficou de fora' if somado == len(linhas) else 'NÃO BATE, confira'}")
    print(f"\n  pasta: {destino}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("uso: python3 dividir-por-atendente.py <arquivo.csv>")
    main(sys.argv[1])
