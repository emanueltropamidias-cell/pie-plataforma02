"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { chave, votosDe, TOTAL_VOTOS } from "@/lib/eleicao";
import { compararVotacoes, type CandidatoDobradinha, type VotoDigitado } from "@/lib/dobradinha";
import { MapaDobradinha } from "./mapa-dobradinha";

// A tela da dobradinha: digitar de um lado, ver o mapa mudar do outro.
//
// ── POR QUE A LISTA COMEÇA PELOS MUNICÍPIOS DA TALITA ───────────────────────
//
// São 417 municípios e ninguém vai digitar 417. Quem digita começa pelas
// cidades que decidem, e as cidades que decidem para ESTA campanha são aquelas
// onde a Talita já teve voto — é lá que a dobradinha soma ou se sobrepõe.
//
// Uma lista alfabética de 417 linhas faria a pessoa rolar até Abaíra, digitar
// um município de 30 votos e desistir antes de chegar em Salvador.

type Estado = "parado" | "salvando" | "salvo";

export function PainelDobradinha({
  candidatos,
  votosIniciais,
  municipios,
  podeEditar,
}: {
  candidatos: CandidatoDobradinha[];
  votosIniciais: VotoDigitado[];
  municipios: string[];
  podeEditar: boolean;
}) {
  const supabase = createClient();

  const [lista, setLista] = useState(candidatos);
  const [candidatoId, setCandidatoId] = useState<number | null>(
    candidatos.find((c) => c.ativo)?.id ?? candidatos[0]?.id ?? null,
  );
  const [votos, setVotos] = useState<VotoDigitado[]>(votosIniciais);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [estado, setEstado] = useState<Record<string, Estado>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);
  const [criando, setCriando] = useState(candidatos.length === 0);
  const [novoNome, setNovoNome] = useState("");
  const [novoNumero, setNovoNumero] = useState("");
  const [novoPartido, setNovoPartido] = useState("");

  const candidato = lista.find((c) => c.id === candidatoId) ?? null;

  // ── TROCAR DE CANDIDATA TEM QUE TROCAR OS VOTOS ────────────────────────────
  //
  // A página só traz a votação de quem abre na tela. Sem isto, clicar na segunda
  // candidata mostrava o mapa dela pintado com os números da primeira — e o erro
  // é silencioso, porque um mapa errado tem exatamente a mesma cara de um certo.
  const jaCarregado = useRef(candidatoId);
  useEffect(() => {
    if (candidatoId === null || candidatoId === jaCarregado.current) return;
    const id = candidatoId;
    let vivo = true;
    setVotos([]);
    supabase
      .from("candidato_votos")
      .select("municipio, votos")
      .eq("candidato_id", id)
      .then(({ data, error }) => {
        if (!vivo || candidatoId !== id) return;
        if (error) return setErro(error.message);
        jaCarregado.current = id;
        setVotos((data ?? []) as VotoDigitado[]);
      });
    return () => {
      vivo = false;
    };
    // `supabase` é estável entre renders (createClient devolve o mesmo cliente).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatoId]);

  const { linhas, totalDela, digitadosCount } = useMemo(
    () => compararVotacoes(votos, municipios),
    [votos, municipios],
  );

  const porChave = useMemo(
    () => new Map(linhas.map((l) => [l.chave, l])),
    [linhas],
  );

  // Ordem da lista de digitação: primeiro o que a Talita tem de maior, depois o
  // resto em ordem alfabética. Quem já foi digitado sobe, para conferir e
  // corrigir sem procurar.
  const ordenados = useMemo(() => {
    const digitado = new Set(votos.map((v) => chave(v.municipio)));
    return [...municipios].sort((a, b) => {
      const da = digitado.has(chave(a)) ? 1 : 0;
      const db = digitado.has(chave(b)) ? 1 : 0;
      if (da !== db) return db - da;
      const va = votosDe(a);
      const vb = votosDe(b);
      if (va !== vb) return vb - va;
      return a.localeCompare(b, "pt-BR");
    });
  }, [municipios, votos]);

  const filtrados = useMemo(() => {
    const q = chave(busca);
    const base = q ? ordenados.filter((m) => chave(m).includes(q)) : ordenados;
    return todos || q ? base : base.slice(0, 40);
  }, [ordenados, busca, todos]);

  async function gravar(municipio: string, texto: string) {
    if (!candidato || !podeEditar) return;
    const k = chave(municipio);
    const limpo = texto.trim();
    const atual = votos.find((v) => chave(v.municipio) === k);

    // Campo esvaziado apaga a linha: volta a ser "não digitado", que é
    // diferente de zero voto e precisa ser possível de desfazer.
    if (limpo === "") {
      if (!atual) return;
      setEstado((e) => ({ ...e, [k]: "salvando" }));
      const { error } = await supabase
        .from("candidato_votos")
        .delete()
        .eq("candidato_id", candidato.id)
        .eq("municipio", atual.municipio);
      if (error) return falhar(k, error.message);
      setVotos((vs) => vs.filter((v) => chave(v.municipio) !== k));
      return concluir(k);
    }

    const n = Number(limpo.replace(/\D/g, ""));
    if (!Number.isFinite(n)) return;
    if (atual && atual.votos === n) return;

    setEstado((e) => ({ ...e, [k]: "salvando" }));
    const { error } = await supabase
      .from("candidato_votos")
      .upsert(
        { candidato_id: candidato.id, municipio, votos: n },
        { onConflict: "candidato_id,municipio" },
      );
    if (error) return falhar(k, error.message);

    setVotos((vs) => {
      const fora = vs.filter((v) => chave(v.municipio) !== k);
      return [...fora, { municipio, votos: n }];
    });
    concluir(k);
  }

  function concluir(k: string) {
    setErro(null);
    setEstado((e) => ({ ...e, [k]: "salvo" }));
    setTimeout(() => setEstado((e) => ({ ...e, [k]: "parado" })), 1200);
  }

  function falhar(k: string, msg: string) {
    setEstado((e) => ({ ...e, [k]: "parado" }));
    setErro(msg);
  }

  async function criarCandidata() {
    if (!novoNome.trim() || !podeEditar) return;
    const { data, error } = await supabase
      .from("candidatos_dobradinha")
      .insert({
        nome: novoNome.trim(),
        cargo: "estadual",
        numero: novoNumero.trim() || null,
        partido: novoPartido.trim() || null,
      })
      .select()
      .single();
    if (error) return setErro(error.message);
    setLista((l) => [...l, data as CandidatoDobradinha]);
    setCandidatoId(data.id);
    setVotos([]);
    setCriando(false);
    setNovoNome("");
    setNovoNumero("");
    setNovoPartido("");
  }

  const nome = candidato?.nome ?? "";

  return (
    <div className="flex flex-col gap-5">
      {/* ── quem é a parceira ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {lista.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCandidatoId(c.id)}
            className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              c.id === candidatoId
                ? "border-tinta-900 bg-tinta-900 text-white"
                : "border-tinta-200 bg-white text-tinta-600 hover:border-tinta-300"
            }`}
          >
            {c.nome}
            {c.numero && <span className="ml-1.5 opacity-60">{c.numero}</span>}
          </button>
        ))}
        {podeEditar && !criando && (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-tinta-300 px-3 py-1.5 text-[12.5px] font-semibold text-tinta-500 hover:border-tema hover:text-tema"
          >
            <Plus size={14} /> Nova candidata
          </button>
        )}
      </div>

      {criando && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-tinta-200 bg-white p-4">
          <Campo rotulo="Nome" valor={novoNome} onChange={setNovoNome} largura="w-56" />
          <Campo rotulo="Número" valor={novoNumero} onChange={setNovoNumero} largura="w-24" />
          <Campo rotulo="Partido" valor={novoPartido} onChange={setNovoPartido} largura="w-32" />
          <button
            type="button"
            onClick={criarCandidata}
            disabled={!novoNome.trim()}
            className="h-9 rounded-lg bg-tema px-4 text-[12.5px] font-semibold text-white disabled:opacity-40"
          >
            Salvar
          </button>
          {lista.length > 0 && (
            <button
              type="button"
              onClick={() => setCriando(false)}
              className="h-9 rounded-lg px-3 text-[12.5px] font-semibold text-tinta-500 hover:text-tinta-900"
            >
              Cancelar
            </button>
          )}
        </div>
      )}

      {erro && (
        <p className="rounded-lg border border-[#f3d3d3] bg-[#fdf1f1] px-4 py-3 text-[12.5px] text-[#c02020]">
          {erro}
        </p>
      )}

      {candidato && (
        <>
          {/* ── o placar ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Numero rotulo="Municípios digitados" valor={digitadosCount} />
            <Numero rotulo={`Votos de ${nome}`} valor={totalDela.toLocaleString("pt-BR")} />
            <Numero
              rotulo="Votos da Talita"
              valor={TOTAL_VOTOS.toLocaleString("pt-BR")}
              nota="2022, Bahia inteira"
            />
            <Numero
              rotulo="Falta digitar"
              valor={(municipios.length - digitadosCount).toLocaleString("pt-BR")}
              nota={`de ${municipios.length}`}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
            <MapaDobradinha
              linhas={linhas}
              nomeParceira={nome}
              selecionado={selecionado}
              onSelecionar={(m) => {
                setSelecionado(chave(m));
                setBusca(m);
              }}
            />

            {/* ── digitar ───────────────────────────────────────────── */}
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-400" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar município…"
                  className="h-9 w-full rounded-lg border border-tinta-200 bg-white pl-9 pr-3 text-[13px] outline-none focus:border-tema"
                />
              </div>

              <div className="max-h-[560px] overflow-y-auto rounded-lg border border-tinta-200 bg-white">
                {filtrados.map((m) => {
                  const k = chave(m);
                  const l = porChave.get(k);
                  const st = estado[k] ?? "parado";
                  return (
                    <div
                      key={k}
                      className={`flex items-center gap-3 border-b border-tinta-100 px-3 py-2 last:border-b-0 ${
                        selecionado === k ? "bg-[#eceafe]" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-medium text-tinta-900">{m}</div>
                        <div className="tabular text-[11px] text-tinta-400">
                          Talita {(l?.talita ?? 0).toLocaleString("pt-BR")}
                        </div>
                      </div>
                      <input
                        defaultValue={l?.dela ?? ""}
                        key={`${candidato.id}-${k}-${l?.dela ?? ""}`}
                        inputMode="numeric"
                        placeholder="—"
                        disabled={!podeEditar}
                        onBlur={(e) => gravar(m, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        className="tabular h-8 w-24 rounded-lg border border-tinta-200 px-2 text-right text-[12.5px] outline-none focus:border-tema disabled:bg-tinta-50"
                      />
                      <span className="w-4">
                        {st === "salvando" && (
                          <Loader2 size={14} className="animate-spin text-tinta-400" />
                        )}
                        {st === "salvo" && <Check size={14} className="text-[#12703c]" />}
                      </span>
                    </div>
                  );
                })}
              </div>

              {!todos && !busca && (
                <button
                  type="button"
                  onClick={() => setTodos(true)}
                  className="text-[12px] font-semibold text-tema hover:underline"
                >
                  Mostrar os {municipios.length} municípios
                </button>
              )}

              <p className="text-[11.5px] leading-relaxed text-tinta-400">
                Campo vazio quer dizer <b>ainda não digitei</b> — não zero voto. Por isso o
                mapa hachura em vez de pintar de claro: desistir de uma cidade e ainda não
                ter olhado para ela são coisas diferentes.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string | number; nota?: string }) {
  return (
    <div className="rounded-lg border border-tinta-200 bg-white px-4 py-3.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-tinta-400">
        {rotulo}
      </span>
      <div className="tabular mt-1 text-[27px] font-extrabold leading-none tracking-[-0.02em] text-tinta-900">
        {valor}
      </div>
      {nota && <div className="mt-1 text-[11px] text-tinta-400">{nota}</div>}
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
  largura,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  largura: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-tinta-400">
        {rotulo}
      </span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 rounded-lg border border-tinta-200 px-3 text-[13px] outline-none focus:border-tema ${largura}`}
      />
    </label>
  );
}
