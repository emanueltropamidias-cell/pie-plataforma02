"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { adivinharColuna, lerCSV, normalizarTelefone } from "@/lib/csv";
import { lerVcf } from "@/lib/vcard";

// Subir uma base de fora do PIE — a antiga de Talita, a de Manassés, a de uma
// dobradinha.
//
// ── ELA VAI PARA A GAVETA DELA, NUNCA PARA A BASE DA CAMPANHA ───────────────
//
// O importador de Pessoas (components/importar) grava em `liderancas`: a pessoa
// vira cadastro da campanha e entra no mapa, na fila e no disparo. Aqui é o
// oposto, e é pedido explícito do Emanuel: "sem se misturarem em hipótese
// alguma". Por isso esta tela não reaproveita aquele caminho — escreve só pelas
// funções `base_externa_*` (supabase/migrations/0029_bases_externas.sql), que
// gravam numa tabela à parte, com o id desta base em cada linha.
//
// O arquivo é lido NO NAVEGADOR e sobe em lotes de 2.000. Uma base de 30 mil
// numa chamada só passaria do limite de 8 segundos da conta logada; em lotes,
// cada um leva ~130 ms e a barra anda de verdade.

type Linha = Record<string, string>;

const CATEGORIAS = [
  { valor: "mandato", rotulo: "Mandato / base antiga" },
  { valor: "dobradinha", rotulo: "Dobradinha" },
  { valor: "parceiro", rotulo: "Parceiro / apoiador" },
  { valor: "outra", rotulo: "Outra" },
];

const CAMPOS = [
  { chave: "nome", rotulo: "Nome", alvos: ["nome", "nome completo", "eleitor", "contato"] },
  { chave: "telefone", rotulo: "Telefone", alvos: ["whatsapp", "celular", "telefone", "fone", "numero", "contato"] },
  { chave: "ddd", rotulo: "DDD (se vier separado)", alvos: ["ddd"] },
  { chave: "municipio", rotulo: "Município", alvos: ["municipio", "cidade"] },
  { chave: "bairro", rotulo: "Bairro", alvos: ["bairro", "distrito", "localidade"] },
] as const;

type Chave = (typeof CAMPOS)[number]["chave"];

const LOTE = 2000;

function celula(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  return String(v).trim();
}

/**
 * Planilha antiga costuma ter título, logo ou linha em branco antes do
 * cabeçalho. O cabeçalho é a primeira linha, entre as 20 primeiras, que tem
 * pelo menos metade das colunas preenchidas.
 */
function acharCabecalho(linhas: string[][]): number {
  const largura = Math.max(0, ...linhas.slice(0, 20).map((l) => l.filter(Boolean).length));
  const i = linhas.slice(0, 20).findIndex((l) => l.filter(Boolean).length >= Math.max(2, Math.ceil(largura / 2)));
  return Math.max(0, i);
}

/** Parece telefone: de 10 a 13 dígitos, e nenhuma letra. */
function pareceTelefone(v: string) {
  const t = (v ?? "").trim();
  if (!t || /[a-zA-ZÀ-ÿ]/.test(t)) return false;
  const d = t.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 13;
}

function montar(matriz: string[][]): { colunas: string[]; linhas: Linha[] } {
  const inicio = acharCabecalho(matriz);
  // ── PLANILHA SEM CABEÇALHO ────────────────────────────────────────────────
  //
  // A base do Manassés é uma lista de NÚMEROS: a primeira linha já é telefone,
  // não título de coluna. Tomada como cabeçalho, ela sumia da importação — um
  // número a menos em cada arquivo, calado, e o cabeçalho virava "5571…".
  const semCabecalho = (matriz[inicio] ?? []).some(pareceTelefone);
  const vistos = new Map<string, number>();
  const colunas = (matriz[inicio] ?? []).map((c, i) => {
    const base = semCabecalho ? `coluna ${i + 1}` : c.trim() || `coluna ${i + 1}`;
    const n = vistos.get(base) ?? 0;
    vistos.set(base, n + 1);
    return n ? `${base} (${n + 1})` : base;
  });
  const linhas = matriz
    .slice(semCabecalho ? inicio : inicio + 1)
    .filter((l) => l.some((v) => v))
    .map((l) => Object.fromEntries(colunas.map((c, i) => [c, l[i] ?? ""])));
  return { colunas, linhas };
}

export function SubirBase({ bases = [] }: { bases?: { id: string; nome: string; pessoas: number }[] }) {
  const router = useRouter();
  const arquivoRef = useRef<HTMLInputElement>(null);

  // "nova" ou o id de uma base que já existe. Base de candidato costuma chegar
  // em pedaços; sem isto, cada arquivo virava uma gaveta e ninguém sabia o
  // total sem somar cartão na tela.
  const [alvo, setAlvo] = useState("nova");
  const existente = bases.find((b) => b.id === alvo) ?? null;
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("mandato");
  const [descricao, setDescricao] = useState("");

  const [arquivo, setArquivo] = useState("");
  const [abas, setAbas] = useState<{ nome: string; matriz: string[][] }[]>([]);
  const [aba, setAba] = useState(0);
  const [mapa, setMapa] = useState<Record<Chave, string>>({ nome: "", telefone: "", ddd: "", municipio: "", bairro: "" });
  const [guardarExtras, setGuardarExtras] = useState(true);

  const [lendo, setLendo] = useState(false);
  const [subindo, setSubindo] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState("");

  const { colunas, linhas } = useMemo(() => montar(abas[aba]?.matriz ?? []), [abas, aba]);

  function adivinhar(cols: string[], linhas: Linha[] = []) {
    const auto = {} as Record<Chave, string>;
    const usadas = new Set<string>();
    for (const c of CAMPOS) {
      const achou = adivinharColuna(cols.filter((x) => !usadas.has(x)), [...c.alvos]);
      auto[c.chave] = achou;
      if (achou) usadas.add(achou);
    }
    // Sem cabeçalho não há nome para adivinhar: acha o telefone pelo CONTEÚDO —
    // a coluna que mais parece telefone nas primeiras linhas. É a base só de
    // números, que chega sem uma palavra escrita.
    if (!auto.telefone && linhas.length) {
      const amostra = linhas.slice(0, 30);
      let melhor = "";
      let placar = 0;
      for (const col of cols) {
        const p = amostra.filter((l) => pareceTelefone(l[col] ?? "")).length;
        if (p > placar) {
          placar = p;
          melhor = col;
        }
      }
      if (placar >= Math.max(1, Math.floor(amostra.length / 2))) auto.telefone = melhor;
    }
    setMapa(auto);
  }

  // ── VÁRIAS AGENDAS DE UMA VEZ ─────────────────────────────────────────────
  //
  // 28/09, Emanuel: "mas aí, um por um não dá". Ele está recolhendo agenda de
  // apoiador, e a 6 dias da eleição não dá para subir arquivo por arquivo.
  //
  // Vários .vcf viram UMA base: são todos agenda de celular, o formato é o
  // mesmo, e a deduplicação por telefone já acontece na gravação — o contato
  // que está no celular de três pessoas entra uma vez só.
  //
  // Só vale para .vcf. Planilha tem cabeçalho próprio e colunas em ordem
  // diferente em cada arquivo; juntá-las às cegas misturaria telefone com CEP.
  async function abrirVarios(fs: FileList | null) {
    if (!fs || fs.length === 0) return;
    const lista = Array.from(fs);
    if (lista.length === 1 || !lista.every((f) => /\.vcf$/i.test(f.name)))
      return abrir(lista[0]);

    setErro("");
    setLendo(true);
    setArquivo(`${lista.length} agendas`);
    if (!nome) setNome("Agendas de apoiadores");
    try {
      const linhas: string[][] = [];
      for (const f of lista) {
        // O nome do arquivo vai junto: sem ele, ninguém sabe depois de qual
        // celular veio cada contato, e não dá para apagar a contribuição de
        // uma pessoa que peça para sair.
        const de = f.name.replace(/\.vcf$/i, "");
        for (const c of lerVcf(await f.text())) linhas.push([c.nome, c.telefone, de]);
      }
      if (linhas.length === 0) throw new Error("Não achei contato nenhum nesses arquivos.");
      const matriz = [["nome", "telefone", "de qual agenda"], ...linhas];
      setAbas([{ nome: `${lista.length} agendas`, matriz }]);
      setAba(0);
      const pronta = montar(matriz);
      adivinhar(pronta.colunas, pronta.linhas);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui ler os arquivos.");
    } finally {
      setLendo(false);
    }
  }

  async function abrir(f: File | undefined) {
    if (!f) return;
    setErro("");
    setLendo(true);
    setArquivo(f.name);
    if (!nome) setNome(f.name.replace(/\.[^.]+$/, ""));
    try {
      let lidas: { nome: string; matriz: string[][] }[];
      if (/\.xlsx$/i.test(f.name)) {
        // Carregado só quando precisa: quem sobe CSV não baixa o leitor de Excel.
        const { default: lerExcel } = await import("read-excel-file/universal");
        const folhas = await lerExcel(f);
        lidas = folhas.map((s) => ({ nome: s.sheet, matriz: s.data.map((l) => l.map(celula)) }));
      } else if (/\.(csv|txt)$/i.test(f.name)) {
        const { colunas: cols, linhas: ls } = lerCSV(await f.text());
        lidas = [{ nome: f.name, matriz: [cols, ...ls.map((l) => cols.map((c) => l[c] ?? ""))] }];
      } else if (/\.vcf$/i.test(f.name)) {
        // ── A AGENDA EXPORTADA DO CELULAR ──────────────────────────────────
        //
        // Entrou em 28/09, quando ficou claro que ler a agenda pelo WhatsApp
        // não funciona sempre: contas já migradas para LID entregam
        // `27299030286568@lid` no lugar do número, e em 2.000 contatos do
        // Walter vieram zero telefones.
        //
        // O .vcf não passa pelo WhatsApp. Traz TODOS os contatos, inclusive
        // quem não tem WhatsApp, não pareia aparelho nenhum (logo, não há
        // risco de banimento) e o dono não precisa estar junto na hora.
        //
        // Vira matriz com cabeçalho para seguir pelo mesmo caminho do CSV: a
        // tela de conferência, o "adivinhar coluna" e a gravação continuam
        // sendo os mesmos. Formato novo não pode virar caminho novo.
        const contatos = lerVcf(await f.text());
        lidas = [{
          nome: f.name,
          matriz: [["nome", "telefone", "tipo"],
                   ...contatos.map((c) => [c.nome, c.telefone, c.tipo ?? ""])],
        }];
      } else {
        throw new Error("Aceito agenda de celular (.vcf), planilha do Excel (.xlsx) ou CSV. Arquivo .xls antigo: abra no Excel e salve como .xlsx.");
      }
      const comDados = lidas.filter((s) => s.matriz.length > 1);
      if (!comDados.length) throw new Error(/\.vcf$/i.test(f.name) ? "Não achei contato nenhum neste arquivo de agenda." : "A planilha está vazia.");
      setAbas(comDados);
      setAba(0);
      const pronta = montar(comDados[0].matriz);
      adivinhar(pronta.colunas, pronta.linhas);
    } catch (e) {
      setAbas([]);
      setErro(e instanceof Error ? e.message : "Não consegui ler esse arquivo.");
    } finally {
      setLendo(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  }

  // Cada linha já no formato que o banco recebe, e a conta do que vai entrar.
  const preparo = useMemo(() => {
    const mapeadas = new Set(Object.values(mapa).filter(Boolean));
    const extrasCols = guardarExtras ? colunas.filter((c) => !mapeadas.has(c)) : [];
    const vistos = new Set<string>();
    let comTelefone = 0;
    let repetidos = 0;
    let semTelefone = 0;
    let telInvalido = 0;
    const saida = linhas.map((l, i) => {
      const brutoTel = l[mapa.telefone] ?? "";
      const ddd = (l[mapa.ddd] ?? "").replace(/\D/g, "");
      const digitos = brutoTel.replace(/\D/g, "");
      const tel = normalizarTelefone(ddd && digitos.length <= 9 ? ddd + digitos : brutoTel);
      const d = tel.replace(/\D/g, "");
      if (d) {
        if (vistos.has(d)) repetidos++;
        else {
          vistos.add(d);
          comTelefone++;
        }
      } else {
        semTelefone++;
        if (digitos) telInvalido++;
      }
      const extras: Record<string, string> = {};
      for (const c of extrasCols) if (l[c]) extras[c] = l[c];
      return {
        linha: i + 1,
        nome: l[mapa.nome] ?? "",
        telefone: d,
        municipio: l[mapa.municipio] ?? "",
        bairro: l[mapa.bairro] ?? "",
        extras,
      };
    });
    return { saida, comTelefone, repetidos, semTelefone, telInvalido, extrasCols };
  }, [linhas, mapa, colunas, guardarExtras]);

  async function subir() {
    setErro("");
    if (!existente && !nome.trim())
      return setErro("Dê um nome para a base — é assim que ela aparece na lista.");
    if (!mapa.telefone && !mapa.nome) return setErro("Aponte ao menos a coluna do telefone ou do nome.");
    setSubindo(true);
    setProgresso(0);
    const supabase = createClient();

    // Acrescentar reabre a gaveta que já existe; criar abre uma nova. Daí para
    // frente o caminho é o mesmo, e o telefone repetido é juntado dentro da
    // base — mandar o mesmo arquivo duas vezes não duplica ninguém.
    const { data: id, error } = existente
      ? await supabase
          .rpc("base_externa_reabrir", {
            p_base: existente.id,
            p_arquivo: arquivo,
            p_linhas: preparo.saida.length,
          })
          .then((r) => ({ data: r.error ? null : existente.id, error: r.error }))
      : await supabase.rpc("base_externa_criar", {
          p_nome: nome.trim(),
          p_categoria: categoria,
          p_descricao: descricao,
          p_arquivo: arquivo,
          p_linhas: preparo.saida.length,
        });
    if (error || !id) {
      setSubindo(false);
      return setErro(error?.message ?? "Não consegui abrir a base.");
    }

    const total = preparo.saida.length;
    for (let i = 0; i < total; i += LOTE) {
      const { error: e } = await supabase.rpc("base_externa_adicionar", {
        p_base: id,
        p_linhas: preparo.saida.slice(i, i + LOTE),
      });
      if (e) {
        setSubindo(false);
        // A base fica marcada como incompleta, e a tela dela oferece apagar.
        setErro(`Parou na linha ${i + 1} de ${total}: ${e.message}. A base ficou incompleta — abra-a na lista para apagar e subir de novo.`);
        return;
      }
      setProgresso(Math.round((Math.min(i + LOTE, total) / total) * 100));
    }

    const { error: erroFim } = await supabase.rpc("base_externa_concluir", { p_base: id });
    if (erroFim) {
      setSubindo(false);
      return setErro(`As linhas subiram, mas não consegui marcar como pronta: ${erroFim.message}`);
    }
    router.push(`/base/externas/${id}`);
    router.refresh();
  }

  const n = (v: number) => v.toLocaleString("pt-BR");

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-tinta-200 bg-white p-5 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
        {bases.length > 0 && (
          <div className="mb-3 flex flex-col gap-1.5 border-b border-tinta-100 pb-3">
            <Label className="text-[12px]">Para onde vai</Label>
            <select
              value={alvo}
              onChange={(e) => setAlvo(e.target.value)}
              className="h-10 rounded-md border border-input bg-white px-2 text-[13px] outline-none"
            >
              <option value="nova">Criar uma base nova</option>
              {bases.map((b) => (
                <option key={b.id} value={b.id}>
                  Acrescentar em: {b.nome} ({b.pessoas.toLocaleString("pt-BR")} hoje)
                </option>
              ))}
            </select>
            {existente && (
              <p className="text-[11.5px] leading-relaxed text-tinta-500">
                Os números entram nesta gaveta, junto com os que já estão lá. Telefone repetido é
                juntado, então mandar o mesmo arquivo duas vezes não duplica ninguém.
              </p>
            )}
          </div>
        )}

        <div className={`grid gap-3 sm:grid-cols-3 ${existente ? "hidden" : ""}`}>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[12px]">Nome da base</Label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Talita — mandato 2019-2022"
              className="h-10 rounded-md border border-input bg-white px-3 text-[13px] outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[12px]">Tipo</Label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="h-10 rounded-md border border-input bg-white px-2 text-[13px] outline-none"
            >
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[12px]">Observação (opcional)</Label>
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="De onde veio, quem mandou"
              className="h-10 rounded-md border border-input bg-white px-3 text-[13px] outline-none"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-tinta-300 bg-white p-6 text-center">
        <FileSpreadsheet size={22} className="mx-auto text-tinta-400" />
        <p className="mt-2 text-sm font-semibold text-tinta-800">{arquivo || "Planilha da base"}</p>
        <p className="mt-1 text-[12px] text-tinta-500">
          Agenda de celular (.vcf), Excel (.xlsx) ou CSV. O arquivo é lido aqui no navegador antes de subir.
          <br />
          <b className="text-tinta-600">Pode escolher várias agendas de uma vez</b> — elas viram
          uma base só, e quem está em dois celulares conta uma vez.
        </p>
        <input
          ref={arquivoRef}
          type="file"
          accept=".vcf,.xlsx,.csv,.txt,text/vcard,text/x-vcard,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          multiple
          onChange={(e) => abrirVarios(e.target.files)}
        />
        <Button variant="outline" className="mt-3" disabled={lendo || subindo} onClick={() => arquivoRef.current?.click()}>
          <Upload size={15} /> {lendo ? "Lendo…" : arquivo ? "Trocar arquivo" : "Escolher arquivo"}
        </Button>
      </div>

      {colunas.length > 0 && (
        <div className="rounded-xl border border-tinta-200 bg-white p-5 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-tinta-700">Colunas do arquivo</p>
              <p className="mt-1 text-[12px] text-tinta-500">Adivinhei pelo cabeçalho. Confira cada uma antes de subir.</p>
            </div>
            {abas.length > 1 && (
              <select
                value={aba}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setAba(i);
                  const m = montar(abas[i].matriz);
                  adivinhar(m.colunas, m.linhas);
                }}
                className="h-9 rounded-md border border-input bg-white px-2 text-[13px] outline-none"
              >
                {abas.map((a, i) => (
                  <option key={a.nome + i} value={i}>
                    Aba: {a.nome}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {CAMPOS.map((c) => (
              <div key={c.chave} className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-[12px]">{c.rotulo}</Label>
                <select
                  value={mapa[c.chave]}
                  onChange={(e) => setMapa((m) => ({ ...m, [c.chave]: e.target.value }))}
                  className="h-10 min-w-0 rounded-md border border-input bg-white px-2 text-[13px] outline-none"
                >
                  <option value="">— não tem —</option>
                  {colunas.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {preparo.extrasCols.length > 0 || !guardarExtras ? (
            <label className="mt-4 flex items-start gap-2 text-[12.5px] text-tinta-600">
              <input type="checkbox" checked={guardarExtras} onChange={(e) => setGuardarExtras(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                Guardar também as outras colunas
                {guardarExtras && preparo.extrasCols.length > 0 && (
                  <span className="text-tinta-400"> ({preparo.extrasCols.join(", ")})</span>
                )}{" "}
                — elas voltam na exportação.
              </span>
            </label>
          ) : null}
        </div>
      )}

      {linhas.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-tinta-200 bg-white shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tinta-100 px-4 py-3">
            <p className="text-[13px] leading-relaxed text-tinta-600">
              <b className="text-tinta-900">{n(linhas.length)}</b> linhas ·{" "}
              <b className="text-tinta-900">{n(preparo.comTelefone)}</b> telefones diferentes
              {preparo.repetidos > 0 && <> · {n(preparo.repetidos)} repetidos (juntados)</>}
              {preparo.semTelefone > 0 && (
                <>
                  {" "}
                  · {n(preparo.semTelefone)} sem telefone
                  {preparo.telInvalido > 0 && <> ({n(preparo.telInvalido)} com número que não é telefone)</>}
                </>
              )}
            </p>
            <Button onClick={subir} disabled={subindo || lendo}>
              {subindo ? `Subindo… ${progresso}%` : `Subir ${n(linhas.length)} linhas`}
            </Button>
          </div>
          <div className="max-h-[380px] overflow-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="sticky top-0 bg-tinta-50">
                <tr className="text-left text-[11px] uppercase tracking-wide text-tinta-500">
                  <th className="px-4 py-2">Nome</th>
                  <th className="px-4 py-2">Telefone</th>
                  <th className="px-4 py-2">Município</th>
                  <th className="px-4 py-2">Bairro</th>
                </tr>
              </thead>
              <tbody>
                {preparo.saida.slice(0, 50).map((r) => (
                  <tr key={r.linha} className={`border-b border-tinta-100 ${r.telefone ? "" : "text-tinta-400"}`}>
                    <td className="px-4 py-2 font-medium">{r.nome || "—"}</td>
                    <td className="tabular px-4 py-2">{r.telefone ? normalizarTelefone(r.telefone) : "—"}</td>
                    <td className="px-4 py-2">{r.municipio || "—"}</td>
                    <td className="px-4 py-2">{r.bairro || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {linhas.length > 50 && (
              <p className="px-4 py-2 text-[12px] text-tinta-400">Mostrando as 50 primeiras. Sobem todas.</p>
            )}
          </div>
        </div>
      )}

      {erro && <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{erro}</div>}
    </div>
  );
}
