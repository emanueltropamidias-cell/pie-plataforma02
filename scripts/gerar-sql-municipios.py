#!/usr/bin/env python3
"""Gera supabase/historico/atendimentos-municipios.sql a partir do de-para.

Por que gerado, e nao escrito a mao: o de-para vale para DUAS camadas — a
planilha que vai entrar e as 45 pessoas que ja estao gravadas com grafia solta.
Escrever a lista nos dois lugares e a receita conhecida de desencontro: alguem
corrige um municipio na planilha, esquece do SQL, e o mapa continua errado do
lado que ninguem olhou.

    python3 scripts/gerar-sql-municipios.py
"""
import json
import os
import re
import unicodedata
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def chave(s):
    s = unicodedata.normalize("NFD", (s or "").strip().lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "", s)


def carregar_de_para():
    """Achata o JSON. As secoes sao so para leitura humana."""
    bruto = json.load(open(os.path.join(RAIZ, "scripts/municipios-de-para.json")))
    mapa = {}
    for secao, v in bruto.items():
        if not isinstance(v, dict):
            continue
        for de, para in v.items():
            if de != "_por_que":
                mapa[chave(de)] = para
    return mapa


def _conexao():
    chave_env = open(os.path.expanduser("~/.pie-supabase.env")).read().split("=", 1)[1].strip()
    url = [
        l.split("=", 1)[1].strip().strip('"')
        for l in open(os.path.join(RAIZ, ".env.local"))
        if l.startswith("NEXT_PUBLIC_SUPABASE_URL=")
    ][0]
    return url, {"apikey": chave_env, "Authorization": "Bearer " + chave_env}


def _get(caminho):
    url, h = _conexao()
    req = urllib.request.Request(url + "/rest/v1/" + caminho, headers=h)
    return json.loads(urllib.request.urlopen(req, timeout=90).read().decode())


def oficiais():
    return {chave(m["nome"]): m["nome"] for m in _get("municipios_ba?select=nome&limit=500")}


def grafias_na_base():
    """O que esta gravado hoje, com quantas pessoas em cada grafia."""
    conta = {}
    for p in range(40):
        lote = _get(f"liderancas?select=municipio&limit=1000&offset={p * 1000}")
        for r in lote:
            m = (r["municipio"] or "").strip()
            if m:
                conta[m] = conta.get(m, 0) + 1
        if len(lote) < 1000:
            break
    return conta


def aspas(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    de_para = carregar_de_para()
    oficial = oficiais()

    # A pergunta nao e "quais grafias eu listei", e sim "o que esta gravado no
    # banco que o mapa nao consegue somar". Perguntar ao banco pega tambem as
    # grafias que entraram por outras secoes do de-para — 'Bahia', 'Chapada
    # Diamantina', 'Ilha de Maré' vieram da importacao anterior, nao desta.
    na_base = grafias_na_base()
    soltas = {g: n for g, n in na_base.items() if chave(g) not in oficial}

    sem_regra = {g: n for g, n in soltas.items() if chave(g) not in de_para}
    if sem_regra:
        print("SEM REGRA no de-para (ficam como estao):")
        for g, n in sorted(sem_regra.items(), key=lambda x: -x[1]):
            print(f"   {g!r}  {n}")

    # Agrupa por destino: um UPDATE por destino em vez de um por grafia.
    por_destino = {}
    afetadas = 0
    for g, n in soltas.items():
        destino = de_para.get(chave(g))
        if destino is None or destino == "__fora_ba":
            continue
        por_destino.setdefault(destino, []).append(g)
        afetadas += n

    linhas = [
        "-- ============================================================================",
        "-- AS GRAFIAS SOLTAS SAEM DO MAPA — E O MAPA SO CONTA QUEM CASA EXATO",
        "-- ============================================================================",
        "--",
        "-- GERADO por scripts/gerar-sql-municipios.py a partir de",
        "-- scripts/municipios-de-para.json. Nao edite aqui: edite o JSON e gere de",
        "-- novo, senao a planilha e o banco passam a discordar.",
        "--",
        "-- Rode inteiro. Pode rodar de novo sem medo.",
        "--",
        "-- ── O QUE ISTO CONSERTA ─────────────────────────────────────────────────────",
        "--",
        "-- O mapa da Bahia soma por NOME EXATO contra municipios_ba. Uma grafia solta",
        "-- nao produz erro em lugar nenhum: a pessoa simplesmente some do mapa, e o",
        "-- municipio aparece mais vazio do que e. E o defeito mais silencioso que",
        "-- existe nesta base — ninguem olha um numero que nunca apareceu.",
        "--",
        f"-- Sao {sum(soltas.values())} pessoas assim hoje, em {len(soltas)} grafias, de"
        f" {sum(na_base.values())} com municipio preenchido.",
        f"-- Destas, {afetadas} voltam para o mapa aqui embaixo.",
        "--",
        "-- Fora do estado fica como esta, de proposito: a pessoa e de Sao Paulo mesmo.",
        "-- Trocar por nulo esconderia que ela existe; o mapa da Bahia ja a ignora.",
        "",
    ]

    for destino in sorted(por_destino, key=lambda d: (d == "", d)):
        grafias = sorted(por_destino[destino])
        alvo = "null" if destino == "" else aspas(oficial[chave(destino)])
        nota = "sem cidade legivel — lixo de digitacao, ou regiao em vez de municipio" if destino == "" else f"vai para {oficial[chave(destino)]}"
        linhas.append(f"-- {nota}")
        linhas.append("update public.liderancas")
        linhas.append(f"   set municipio = {alvo}")
        linhas.append(f" where municipio in ({', '.join(aspas(g) for g in grafias)});")
        linhas.append("")

    linhas += [
        "-- ── AS OBSERVACOES DA PLANILHA PRECISAM DE ONDE MORAR ───────────────────────",
        "--",
        "-- 2.714 das 3.346 linhas tem observacao, e e a parte mais util da planilha:",
        "-- 'tem 1.000 votos no condominio', 'pediu ajuda com exame de vista', 'quer",
        "-- entregar panfleto'. Nao existe coluna para isso em liderancas hoje.",
        "--",
        "-- NAO vai para a tabela `demandas`: la e fila de atendimento, com status e",
        "-- prazo. Despejar 2.714 tickets abertos afogaria uma tela que a equipe usa",
        "-- para trabalhar. Isto aqui e anotacao sobre a pessoa, nao pedido em aberto.",
        "alter table public.liderancas",
        "  add column if not exists observacoes text;",
        "",
        "comment on column public.liderancas.observacoes is",
        "  'Anotacao livre sobre a pessoa, vinda do atendimento. Nao e fila: pedido em aberto vai para a tabela demandas.';",
        "",
        "-- ── conferencia ─────────────────────────────────────────────────────────────",
        "select count(*)                                   as pessoas,",
        "       count(municipio)                           as com_municipio,",
        "       count(*) filter (where observacoes is not null) as com_observacao",
        "  from public.liderancas;",
        "",
    ]

    saida = os.path.join(RAIZ, "supabase/historico/atendimentos-municipios.sql")
    open(saida, "w").write("\n".join(linhas))
    print(f"escrito: {saida}  ({len(por_destino)} UPDATEs)")


if __name__ == "__main__":
    main()
