#!/usr/bin/env python3
"""Poe a origem certa em quem entrou pela Planilha de Atendimentos.

    python3 scripts/origem-dos-atendimentos.py           # so mostra
    python3 scripts/origem-dos-atendimentos.py --gravar

── O QUE ESTAVA ERRADO ──────────────────────────────────────────────────────

A importacao gravou as 2.418 pessoas como `tipo = 'contato'`, que era o padrao
do script. Duas consequencias, nenhuma obvia na tela:

1. `painel_territorio()` EXCLUI `contato`. Entao 2.418 munícipes com nome,
   telefone, cidade e atendente creditada simplesmente nao existiam no painel,
   na lista nem no mapa. O cartao dizia 1.181 e a base tinha 5.342.

2. Quatro telas chamam `tipo = 'contato'` de "contatos pelo QR". O cartao
   mostrava 4.161 pessoas "que chegaram pelo link" — sendo que a tabela
   `link_leituras`, que e o QR de verdade, tem CINCO leituras. Essa gente veio
   de trafego pago pelo Gabiflow.

── DE ONDE SAI A ORIGEM ─────────────────────────────────────────────────────

Da coluna "Origem do Registro" da propria planilha, que sempre soube disso:

    Gabiflow System            2512  -> trafego
    Cadastramento Diário - X    617  -> manual
    Encaminhamentos - X         153  -> encaminhamento
    teste1 - X                   64  -> ficha

'teste1' nao e teste: sao fichas de papel transcritas, com nome, telefone e
cidade de gente real.
"""
import argparse
import importlib.util
import json
import os
import urllib.error
import urllib.request
from collections import Counter, defaultdict

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_spec = importlib.util.spec_from_file_location(
    "imp", os.path.join(RAIZ, "scripts/importar-atendimentos.py")
)
imp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(imp)


def origem(lin):
    o = (lin.get("I") or "").strip().lower()
    if o.startswith("gabiflow"):
        return "trafego"
    if o.startswith("cadastramento diário"):
        return "manual"
    if o.startswith("encaminhamentos"):
        return "encaminhamento"
    if o.startswith("teste1"):
        return "ficha"
    return "planilha"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gravar", action="store_true")
    args = ap.parse_args()

    banco = imp.Banco()

    # So mexe em quem a importacao criou: tipo 'contato' E created_via
    # 'planilha'. As lideranças da importacao antiga tambem sao 'planilha', e
    # virar 'lead' as REBAIXARIA — por isso o corte pelo tipo.
    alvo = {
        r["telefone_digitos"]: r["id"]
        for r in banco.tudo(
            "liderancas", "id,telefone_digitos", "tipo=eq.contato&created_via=eq.planilha&"
        )
        if r["telefone_digitos"]
    }

    porOrigem = defaultdict(list)
    vistos = set()
    for lin in imp.ler_planilha():
        dig = imp.digitos_do_telefone(lin.get("D", ""))
        if not dig or dig in vistos or dig not in alvo:
            continue
        vistos.add(dig)
        porOrigem[origem(lin)].append(dig)

    print(f"candidatos no banco (contato+planilha): {len(alvo)}")
    for o, ds in sorted(porOrigem.items(), key=lambda x: -len(x[1])):
        print(f"  {o:<16}-> tipo 'lead'   {len(ds):>5}")
    sobra = len(alvo) - sum(len(d) for d in porOrigem.values())
    print(f"  {'(nao achei na planilha)':<16}   ficam como estao {sobra:>5}")

    if not args.gravar:
        print("\n(nada gravado — rode com --gravar)")
        return

    for o, digitos in porOrigem.items():
        feitos = 0
        for i in range(0, len(digitos), 150):
            lote = digitos[i : i + 150]
            lista = ",".join(lote)
            banco._req(
                f"liderancas?telefone_digitos=in.({lista})&tipo=eq.contato&created_via=eq.planilha",
                "PATCH",
                {"tipo": "lead", "created_via": o},
                {"Prefer": "return=minimal"},
            )
            feitos += len(lote)
            print(f"\r  {o}: {feitos}/{len(digitos)}", end="", flush=True)
        print()


if __name__ == "__main__":
    main()
