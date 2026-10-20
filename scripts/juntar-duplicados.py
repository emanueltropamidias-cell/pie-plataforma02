#!/usr/bin/env python3
"""Junta os cadastros que são a mesma pessoa, depois do conserto do nono dígito.

    python3 scripts/juntar-duplicados.py            # só mostra o plano
    python3 scripts/juntar-duplicados.py --gravar   # junta

── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────

`supabase/historico/o-nono-digito.sql` fez 621 telefones voltarem a casar. Com isso
apareceram 238 chaves com mais de um cadastro: a mesma pessoa entrou pelo
WhatsApp e de novo pelo tráfego, porque a chave velha era irreconhecível e a
importação achou que era gente nova.

── O QUE ELE NÃO JUNTA, DE PROPÓSITO ────────────────────────────────────────

Grupo em que os PRIMEIROS NOMES são diferentes fica de fora. Telefone repetido
nem sempre é a mesma pessoa — marido e mulher dividem número, e o caso mais
claro da base é 71983987676, que tem "Emanuel Rodrigues Silva", "Emanuel" e
"Talita" no mesmo aparelho. Juntar ali apagaria uma pessoa de verdade.

Nome de WhatsApp atrapalha esse teste ("Deus é nosso refúgio" é o mesmo Zá Val
Reis), então o corte deixa gente junta que poderia ser separada. Errar para o
lado de NÃO apagar é o lado certo de errar.

── QUEM SOBREVIVE ───────────────────────────────────────────────────────────

Ganha o cadastro com login, depois o de tipo mais forte, depois o de nome mais
confiável, depois o mais antigo. E o que sobrevive HERDA os campos vazios do
outro: município, bairro, observação, crédito da atendente, quem indicou.
Juntar não pode perder informação — se perdesse, era melhor deixar duplicado.
"""
import argparse
import importlib.util
import json
import os
import re
import unicodedata
import urllib.error
import urllib.request
from collections import defaultdict

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location(
    "imp", os.path.join(RAIZ, "scripts/importar-atendimentos.py")
)
imp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(imp)

CAMPOS = "id,nome,telefone,telefone_digitos,municipio,bairro,tipo,created_via,parent_id,cadastrado_por,observacoes,created_at,votos_comprometidos,link_code,cod_acesso,auth_uid"

FORCA_TIPO = {"lideranca": 3, "lead": 2, "contato": 1, None: 0}


def palavras(nome):
    s = unicodedata.normalize("NFD", (nome or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return [p for p in re.sub(r"[^a-z ]", " ", s).split() if len(p) > 1]


def nome_confiavel(nome):
    """Nome que parece nome: tem letras, não é o próprio telefone."""
    p = palavras(nome)
    if not p:
        return 0
    if re.fullmatch(r"\d+", (nome or "").strip()):
        return 0
    return len(" ".join(p))


def preenchidos(r):
    return sum(
        1
        for c in ("municipio", "bairro", "observacoes", "cadastrado_por", "parent_id",
                  "votos_comprometidos")
        if r.get(c)
    )


def escolher(grupo):
    """O que fica. Ordem: login > tipo > nome > campos > mais antigo."""
    return sorted(
        grupo,
        key=lambda r: (
            0 if r.get("auth_uid") else 1,
            -FORCA_TIPO.get(r.get("tipo"), 0),
            -nome_confiavel(r.get("nome")),
            -preenchidos(r),
            r.get("created_at") or "",
        ),
    )[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gravar", action="store_true")
    args = ap.parse_args()

    banco = imp.Banco()
    todos = banco.tudo("liderancas", CAMPOS)

    grupos = defaultdict(list)
    for r in todos:
        if r["telefone_digitos"]:
            grupos[r["telefone_digitos"]].append(r)
    dups = {c: v for c, v in grupos.items() if len(v) > 1}

    juntar, segurar = [], []
    for c, v in dups.items():
        primeiros = {p[0] for p in (palavras(r["nome"]) for r in v) if p}
        (juntar if len(primeiros) <= 1 else segurar).append((c, v))

    # Quem tem filho ou login não pode ser apagado nem por engano.
    tem_filho = {r["parent_id"] for r in todos if r["parent_id"]}

    plano, travados = [], []
    for c, v in juntar:
        fica = escolher(v)
        saem = [r for r in v if r["id"] != fica["id"]]
        if any(r["auth_uid"] or r["id"] in tem_filho for r in saem):
            travados.append((c, v))
            continue
        herda = {}
        for campo in ("municipio", "bairro", "observacoes", "cadastrado_por",
                      "parent_id", "votos_comprometidos"):
            if not fica.get(campo):
                for r in saem:
                    if r.get(campo):
                        herda[campo] = r[campo]
                        break
        # Nome melhor, se o que sobreviveu tiver nome pior que o do outro.
        melhor = max(v, key=lambda r: nome_confiavel(r["nome"]))
        if nome_confiavel(melhor["nome"]) > nome_confiavel(fica["nome"]):
            herda["nome"] = melhor["nome"]
        plano.append((fica, saem, herda))

    print(f"cadastros na base            : {len(todos)}")
    print(f"chaves com mais de um cadastro: {len(dups)}")
    print(f"  juntar (mesmo primeiro nome): {len(plano)}  -> apaga {sum(len(s) for _, s, _ in plano)}")
    print(f"  travados (login ou tem filho): {len(travados)}")
    print(f"  SEGURAR (primeiro nome difere): {len(segurar)}  <- decisão sua, não mexo")
    print(f"\nbase depois de juntar        : {len(todos) - sum(len(s) for _, s, _ in plano)}")

    print("\n--- 8 primeiras junções ---")
    for fica, saem, herda in plano[:8]:
        print(f"  FICA {fica['nome']!r} ({fica['created_via']})")
        for r in saem:
            print(f"   sai {r['nome']!r} ({r['created_via']})")
        if herda:
            print(f"   herda {json.dumps(herda, ensure_ascii=False)[:120]}")

    print("\n--- os que eu NÃO junto ---")
    for c, v in segurar[:15]:
        print(f"  {c}: " + "  ||  ".join(f"{r['nome']} ({r['created_via']})" for r in v))
    if len(segurar) > 15:
        print(f"  ... e mais {len(segurar) - 15}")

    if not args.gravar:
        print("\n(nada gravado — rode com --gravar)")
        return

    feitos = 0
    for fica, saem, herda in plano:
        if herda:
            banco._req(f"liderancas?id=eq.{fica['id']}", "PATCH", herda,
                       {"Prefer": "return=minimal"})
        for r in saem:
            banco._req(f"liderancas?id=eq.{r['id']}", "DELETE", None,
                       {"Prefer": "return=minimal"})
            feitos += 1
        if feitos % 25 == 0:
            print(f"\r  juntados {feitos}", end="", flush=True)
    print(f"\r  {feitos} cadastros duplicados removidos.   ")


if __name__ == "__main__":
    main()
