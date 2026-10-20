#!/usr/bin/env python3
"""A Planilha de Atendimentos entra na base.

    python3 scripts/importar-atendimentos.py           # so mostra o que faria
    python3 scripts/importar-atendimentos.py --gravar  # grava

Pode rodar de novo sem medo: quem ja esta na base nao duplica.

── POR QUE SCRIPT, E NAO UM .sql COMO A IMPORTACAO ANTERIOR ─────────────────

`supabase/historico/importar-planilha.sql` tem 191 linhas escritas a mao no proprio
arquivo. Esta planilha tem 3.346. O mesmo desenho daria um comando de meio
megabyte, que o editor do Supabase engasga — e falha de editor no meio de um
insert e a pior forma de descobrir um problema.

Aqui a verdade continua no repositorio: a planilha, o de-para dos municipios e
este arquivo. Rodar de novo reproduz o mesmo resultado.

── O QUE NAO ENTRA ──────────────────────────────────────────────────────────

Classificacao politica. A planilha nao tem essa coluna — tem "Tipo de Interesse
/ Demanda", que e quase toda "Geral". E `liderancas` nem tem onde guardar
status: apoiador/multiplicador/hater vivem em `atendimentos`, que vem do
WhatsApp. Carimbar 82% das linhas como apoiador daria um total bonito e uma
pessoa errada em cada linha.
"""
import argparse
import json
import os
import re
import time
import unicodedata
import urllib.error
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLANILHA = os.path.expanduser("~/Downloads/Planilha de Atendimentos.xlsx")
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# Coluna A da planilha -> conta no PIE. Quem nao e pessoa fica sem credito, em
# vez de ser atribuido a alguem por parecer: credito errado vira metrica errada
# de trabalho, e e por metrica de trabalho que a coordenacao decide escala.
ATENDENTES = {
    "victoria": "Victória",
    "maiana": "Maiana",
    "matheus": "Matheus",
    "lutiane": "Lutiane",
    "ariane": "Ariane",
    "deise": "Deise",
    "thami oliveira": "Thami Oliveira",
    "tiago": "thiago",
    "boneca": "boneca",
    "altineia boneca": "altineiasantos78",
    # Juliana (108) nao tem conta no PIE.
    # "Controle de Encaminhamentos", "Fichas / Transcricao" e "Gabiflow" nao
    # sao pessoas — sao a origem do registro, e ja estao na observacao.
}

# Coluna G -> `tipo` de liderancas, que so aceita lead/contato/lideranca.
TIPOS = {"lideranca": "lideranca", "liderança": "lideranca"}


def chave(s):
    s = unicodedata.normalize("NFD", (s or "").strip().lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "", s)


def nome_proprio(s):
    """Mesma regra de src/lib/csv.ts, para os nomes sairem iguais aos da tela."""
    minusculas = {"da", "de", "do", "das", "dos", "e", "di", "du"}
    partes = (s or "").strip().lower().split()
    return " ".join(
        p if (p in minusculas and i > 0) else (p[:1].upper() + p[1:])
        for i, p in enumerate(partes)
    )


DDDS = set(
    "11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 "
    "44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 "
    "79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99".split()
)


def digitos_do_telefone(v):
    """Os 11 digitos, ou vazio. Mesma regra de src/lib/csv.ts.

    Vazio de proposito quando nao fecha: numero torto gravado do jeito que veio
    casaria com a pessoa errada no `telefone_digitos`, que e por onde a conversa
    do WhatsApp encontra o cadastro.

    O corte dos 12 digitos esta explicado em csv.ts. Aqui ele derruba tambem os
    ids de GRUPO do WhatsApp (18 digitos, '120363...'), que a planilha traz como
    se fossem telefone.
    """
    d = re.sub(r"\D", "", v or "")
    if d.startswith("55") and len(d) > 11:
        d = d[2:]
    if len(d) == 12 and d[:2] in DDDS and d[2] == "9":
        d = d[:11]
    if len(d) == 10 and d[2] in "6789":
        d = d[:2] + "9" + d[2:]
    return d if len(d) == 11 else ""


def observacao(lin):
    """Coluna H, mais a origem da coluna I quando ela acrescenta alguma coisa.

    'Cadastramento Diário - Victoria' fica de fora: e a mesma informacao que ja
    esta em `cadastrado_por`, e repetida em 2 mil fichas so faz a anotacao de
    verdade — 'tem 1.000 votos no condominio' — ficar mais dificil de achar.
    """
    partes = [(lin.get("H") or "").strip()]
    origem = (lin.get("I") or "").strip()
    if origem and not origem.lower().startswith("cadastramento diário"):
        partes.append(origem)
    return " · ".join(p for p in partes if p)


def data_iso(v):
    m = re.match(r"^\s*(\d{1,2})/(\d{1,2})/(\d{4})", v or "")
    if not m:
        return None
    dia, mes, ano = (int(x) for x in m.groups())
    if not (1 <= mes <= 12 and 1 <= dia <= 31):
        return None
    return f"{ano:04d}-{mes:02d}-{dia:02d}T12:00:00+00:00"


def ler_planilha():
    z = zipfile.ZipFile(PLANILHA)
    sst = [
        "".join(t.text or "" for t in si.iter(NS + "t"))
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(NS + "si")
    ]

    def valor(c):
        v = c.find(NS + "v")
        if v is None:
            i = c.find(NS + "is")
            return "".join(x.text or "" for x in i.iter(NS + "t")) if i is not None else ""
        return sst[int(v.text)] if c.get("t") == "s" else (v.text or "")

    ws = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    linhas = [
        {re.sub(r"\d", "", c.get("r")): valor(c) for c in r.findall(NS + "c")}
        for r in ws.iter(NS + "row")
    ]
    return linhas[1:]


def de_para_municipios():
    bruto = json.load(open(os.path.join(RAIZ, "scripts/municipios-de-para.json")))
    mapa = {}
    for secao, v in bruto.items():
        if not isinstance(v, dict):
            continue
        for de, para in v.items():
            if de != "_por_que":
                mapa[chave(de)] = para
    return mapa


class Banco:
    def __init__(self):
        self.chave = open(os.path.expanduser("~/.pie-supabase.env")).read().split("=", 1)[1].strip()
        self.url = [
            l.split("=", 1)[1].strip().strip('"')
            for l in open(os.path.join(RAIZ, ".env.local"))
            if l.startswith("NEXT_PUBLIC_SUPABASE_URL=")
        ][0]

    def _req(self, caminho, metodo="GET", corpo=None, extra=None):
        h = {"apikey": self.chave, "Authorization": "Bearer " + self.chave}
        dados = None
        if corpo is not None:
            h["Content-Type"] = "application/json"
            dados = json.dumps(corpo).encode()
        h.update(extra or {})
        r = urllib.request.Request(self.url + "/rest/v1/" + caminho, data=dados, headers=h, method=metodo)
        return urllib.request.urlopen(r, timeout=180).read().decode()

    def tudo(self, tabela, colunas, filtro=""):
        """Le a tabela inteira em blocos de mil.

        O `order=id` NAO e enfeite. Sem ordem declarada, o Postgres pode
        devolver as linhas em ordem diferente a cada pagina, e ai o offset pula
        umas e repete outras. Deu na pratica: a mesma contagem veio 2.381 numa
        passada e 2.315 na seguinte, e o update deixou gente para tras.
        """
        fora = []
        for p in range(60):
            lote = json.loads(
                self._req(
                    f"{tabela}?select={colunas}&{filtro}order=id&limit=1000&offset={p * 1000}"
                )
            )
            fora += lote
            if len(lote) < 1000:
                break
        return fora

    def inserir(self, tabela, linhas):
        self._req(tabela, "POST", linhas, {"Prefer": "return=minimal"})

    def anotar(self, digitos, texto):
        """So preenche quem esta vazio: anotacao feita a mao na tela vale mais.

        Com repeticao porque sao milhares de chamadas seguidas e a conexao cai
        no meio — ja caiu, no 1.996 de 2.714. Sem isto, a queda de uma chamada
        derruba a passada inteira e as anotacoes restantes ficam para tras.
        """
        for tentativa in range(4):
            try:
                self._req(
                    f"liderancas?telefone_digitos=eq.{digitos}&observacoes=is.null",
                    "PATCH",
                    {"observacoes": texto},
                    {"Prefer": "return=minimal"},
                )
                return
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                if tentativa == 3:
                    raise
                time.sleep(2 * (tentativa + 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gravar", action="store_true")
    args = ap.parse_args()

    banco = Banco()
    de_para = de_para_municipios()
    oficial = {chave(m["nome"]): m["nome"] for m in banco.tudo("municipios_ba", "nome")}
    contas = {chave(p["nome"]): p["id"] for p in banco.tudo("profiles", "id,nome")}
    tem_observacoes = "observacoes" in json.loads(banco._req("liderancas?select=*&limit=1"))[0]

    ja = set()
    sem_fone = set()
    for r in banco.tudo("liderancas", "telefone_digitos,nome,telefone"):
        if r["telefone_digitos"]:
            ja.add(r["telefone_digitos"])
        elif r["nome"]:
            sem_fone.add(chave(r["nome"]))

    novos, motivos = [], Counter()
    vistos = set()
    entram_sem_fone = 0
    total_linhas = 0
    for lin in ler_planilha():
        total_linhas += 1
        nome = nome_proprio(lin.get("C", ""))
        if not nome:
            motivos["sem nome"] += 1
            continue

        dig = digitos_do_telefone(lin.get("D", ""))
        if dig:
            if dig in ja:
                motivos["ja estava na base (telefone)"] += 1
                continue
            if dig in vistos:
                motivos["repetida dentro da propria planilha"] += 1
                continue
            vistos.add(dig)
        else:
            # Sem telefone nao ha como reconhecer a pessoa depois. A rede aqui
            # e o nome, so para que rodar de novo nao crie um segundo cadastro.
            if chave(nome) in sem_fone:
                motivos["ja estava na base (nome, sem telefone)"] += 1
                continue
            sem_fone.add(chave(nome))
            entram_sem_fone += 1

        bruto = (lin.get("F") or "").strip()
        destino = oficial.get(chave(bruto), de_para.get(chave(bruto), bruto))
        if destino == "__fora_ba":
            municipio = bruto  # e de outro estado mesmo; o mapa da Bahia ignora
        else:
            municipio = oficial.get(chave(destino), "") if destino else ""

        bairro = (lin.get("E") or "").strip()
        if bairro.upper() == "X":
            bairro = ""

        pessoa = {
            "nome": nome,
            "telefone": ("55" + dig) if dig else None,
            "municipio": municipio or None,
            "bairro": nome_proprio(bairro) or None,
            "tipo": TIPOS.get((lin.get("G") or "").strip().lower(), "contato"),
            "created_via": "planilha",
            "cadastrado_por": contas.get(chave(ATENDENTES.get((lin.get("A") or "").strip().lower(), ""))),
        }
        data = data_iso(lin.get("B"))
        if data:
            pessoa["created_at"] = data

        obs = observacao(lin)
        if obs and tem_observacoes:
            pessoa["observacoes"] = obs

        novos.append(pessoa)

    print(f"planilha: {total_linhas} linhas")
    for m, n in motivos.most_common():
        print(f"  fora  {m:<40}{n:>5}")
    print(f"  {'PARA GRAVAR':<46}{len(novos):>5}")
    print()
    print(f"  com telefone            : {sum(1 for p in novos if p['telefone'])}")
    print(f"  sem telefone            : {entram_sem_fone}")
    print(f"  com municipio no mapa   : {sum(1 for p in novos if p['municipio'])}")
    print(f"  com atendente creditado : {sum(1 for p in novos if p['cadastrado_por'])}")
    print(f"  com data de cadastro    : {sum(1 for p in novos if p.get('created_at'))}")
    print(f"  com observacao          : {sum(1 for p in novos if p.get('observacoes'))}"
          + ("" if tem_observacoes else "   <- coluna `observacoes` ainda nao existe"))

    if not args.gravar:
        print("\n(nada gravado — rode com --gravar)")
        return

    # O PostgREST recusa um lote onde as linhas nao tem exatamente as mesmas
    # chaves ("All object keys must match"). Linha sem data na planilha nao pode
    # mandar `created_at` — mandar nulo apagaria o default now(). Entao o lote e
    # agrupado por formato em vez de o campo ser forcado.
    grupos = {}
    for p in novos:
        grupos.setdefault(frozenset(p), []).append(p)

    LOTE = 300
    feitos = 0
    for linhas in grupos.values():
        for i in range(0, len(linhas), LOTE):
            try:
                banco.inserir("liderancas", linhas[i : i + LOTE])
            except urllib.error.HTTPError as e:
                print(f"\nPAROU em {feitos}: {e.read().decode()[:400]}")
                return
            feitos += len(linhas[i : i + LOTE])
            print(f"\r  gravados {feitos}/{len(novos)}", end="", flush=True)
    print(f"\n{feitos} pessoas cadastradas.")

    # ── SEGUNDA PASSADA: as anotacoes ─────────────────────────────────────────
    #
    # Fica separada porque a coluna `observacoes` nasce em
    # supabase/historico/atendimentos-municipios.sql, que so o Emanuel roda no editor. Se a
    # primeira execucao acontecer antes disso, as pessoas entram sem anotacao — e
    # rodar de novo depois nao bastaria, porque elas ja existem e o insert as
    # pula. Esta passada conserta exatamente isso.
    #
    # Alcanca tambem as 403 pessoas que ja estavam na base antes da planilha: o
    # que a equipe anotou sobre elas no atendimento tambem vale.
    if not tem_observacoes:
        print("\nA coluna `observacoes` ainda nao existe — as anotacoes ficaram")
        print("de fora. Rode supabase/historico/atendimentos-municipios.sql e depois este")
        print("script de novo: ele nao duplica ninguem e so preenche o que faltou.")
        return

    # Quem ja tem anotacao nao precisa de chamada nenhuma. Uma leitura corrida
    # troca milhares de idas ao banco por tres — e faz a retomada depois de uma
    # queda custar segundos em vez de meia hora.
    ja_anotados = {
        r["telefone_digitos"]
        for r in banco.tudo("liderancas", "telefone_digitos", "observacoes=not.is.null&")
        if r["telefone_digitos"]
    }

    pendentes = {}
    for lin in ler_planilha():
        texto = observacao(lin)
        dig = digitos_do_telefone(lin.get("D", ""))
        if texto and dig and dig not in ja_anotados:
            pendentes.setdefault(dig, texto)

    print(f"\n  anotacoes: {len(ja_anotados)} ja aplicadas, {len(pendentes)} a fazer")
    anotadas = 0
    for dig, texto in pendentes.items():
        banco.anotar(dig, texto)
        anotadas += 1
        if anotadas % 100 == 0:
            print(f"\r  anotando {anotadas}/{len(pendentes)}", end="", flush=True)
    print(f"\r  {anotadas} anotacoes aplicadas (so onde estava vazio)   ")


if __name__ == "__main__":
    main()
