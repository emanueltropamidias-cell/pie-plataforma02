"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Search, Users } from "lucide-react";
import { ondeDisputa } from "@/lib/eleicao";
import type { CandidatoBusca } from "@/components/estrategia/painel-estrategia-eleitoral";

// Escolher o candidato pela lista, e não só pela busca.
//
// Mostra todos os candidatos do estado na eleição, cargo e partido escolhidos,
// do mais votado ao menos, com a foto de urna. Escolher um partido no filtro
// já lista os candidatos dele — sem precisar digitar nada.

type Lista = {
  total: number;
  cargos: { valor: string; n: number }[];
  partidos: { valor: string; n: number }[];
  candidatos: (CandidatoBusca & { total_votos: number })[];
};

/** Foto de urna com reserva: falhou, mostra as iniciais — nunca imagem quebrada. */
export function FotoUrna({ src, nome, tamanho }: { src: string | null; nome: string; tamanho: number }) {
  // Uma segunda tentativa antes de desistir: a foto vem do TSE, e um tropeço
  // de rede não pode virar "candidato sem foto".
  const [tentativa, setTentativa] = useState<{ src: string | null; n: number }>({ src, n: 0 });
  const n = tentativa.src === src ? tentativa.n : 0;
  const falhou = n >= 2 ? src : null;
  const atual = src && n === 1 ? `${src}${src.includes("?") ? "&" : "?"}r=1` : src;
  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 font-bold text-slate-400"
      style={{ width: tamanho, height: tamanho, fontSize: Math.max(9, tamanho / 3.2) }}
    >
      {src && falhou !== src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={atual!}
          alt={nome}
          loading="lazy"
          referrerPolicy="origin"
          className="h-full w-full object-cover object-top"
          onError={() =>
            setTimeout(() => setTentativa({ src, n: n + 1 }), n === 0 ? 800 : 0)
          }
        />
      ) : (
        iniciais
      )}
    </span>
  );
}

export function SeletorCandidatos({
  ano,
  uf,
  cargo,
  partido,
  idAtual,
  onEscolher,
  onOpcoes,
}: {
  ano: number;
  uf: string;
  cargo: string;
  partido: string;
  idAtual: number;
  onEscolher: (c: CandidatoBusca) => void;
  /** Cargos e partidos que existem neste estado e eleição — alimentam os filtros. */
  onOpcoes?: (o: { cargos: Lista["cargos"]; partidos: Lista["partidos"] }) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [pagina, setPagina] = useState(0);
  const [lista, setLista] = useState<{ chave: string; dados: Lista } | null>(null);
  const [extras, setExtras] = useState<Lista["candidatos"]>([]);

  const chave = `${ano}|${uf}|${cargo}|${partido}|${q}`;
  const carregando = lista?.chave !== chave;

  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      const p = new URLSearchParams({ lista: "1", ano: String(ano), uf });
      if (cargo !== "TODOS") p.set("cargo", cargo);
      if (partido !== "TODOS") p.set("partido", partido);
      if (q.trim()) p.set("q", q.trim());
      try {
        const r = await fetch(`/api/eleicao?${p}`);
        const dados: Lista = await r.json();
        if (!vivo) return;
        setLista({ chave, dados });
        setExtras([]);
        setPagina(0);
        onOpcoes?.({ cargos: dados.cargos, partidos: dados.partidos });
      } catch {
        if (vivo) setLista({ chave, dados: { total: 0, cargos: [], partidos: [], candidatos: [] } });
      }
    }, 200);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
    // onOpcoes muda a cada render do pai; a lista só depende dos filtros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, ano, uf, cargo, partido, q]);

  async function maisCandidatos() {
    const p = new URLSearchParams({ lista: "1", ano: String(ano), uf, pagina: String(pagina + 1) });
    if (cargo !== "TODOS") p.set("cargo", cargo);
    if (partido !== "TODOS") p.set("partido", partido);
    if (q.trim()) p.set("q", q.trim());
    const dados: Lista = await (await fetch(`/api/eleicao?${p}`)).json();
    setExtras((e) => [...e, ...dados.candidatos]);
    setPagina((n) => n + 1);
  }

  const candidatos = carregando ? [] : [...(lista?.dados.candidatos ?? []), ...extras];
  const total = lista?.dados.total ?? 0;
  const visiveis = aberto ? candidatos : candidatos.slice(0, 8);

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_4px_20px_rgb(0,0,0,0.02)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-600">
            <Users size={13} /> Escolher candidato
          </span>
          <h2 className="text-base font-extrabold text-slate-900">
            {carregando ? "Carregando…" : `${total.toLocaleString("pt-BR")} candidatos`}{" "}
            <span className="font-medium text-slate-500">
              · {uf === "BR" ? "Brasil" : uf} · {ano}
              {cargo !== "TODOS" ? ` · ${cargo.toLowerCase()}` : ""}
              {partido !== "TODOS" ? ` · ${partido}` : ""}
            </span>
          </h2>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrar por nome, número ou cidade"
            className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-8 pr-3 text-[12.5px] outline-none transition focus:border-blue-500 focus:bg-white"
          />
        </div>
      </div>

      {!carregando && candidatos.length === 0 && (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-[12.5px] text-slate-500">
          Nenhum candidato com esses filtros nesta eleição.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {carregando &&
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[60px] animate-pulse rounded-xl bg-slate-100" />
          ))}
        {visiveis.map((c) => {
          const ativo = c.id === idAtual;
          return (
            <button
              key={c.id}
              onClick={() => onEscolher(c)}
              className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                ativo ? "border-blue-500 bg-blue-50/60" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <FotoUrna src={c.foto_url} nome={c.nome_urna} tamanho={40} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[12.5px] font-bold text-slate-900">{c.nome_urna}</span>
                  {ativo && <Check size={13} className="shrink-0 text-blue-600" />}
                </span>
                <span className="block truncate text-[11px] text-slate-500">
                  {c.partido_sigla} · {c.numero} · {c.cargo.toLowerCase()}
                  {c.cargo === "VEREADOR" || c.cargo === "PREFEITO" ? ` · ${ondeDisputa(c)}` : ""}
                </span>
                <span className="block text-[11px] font-semibold text-slate-700">
                  {c.total_votos.toLocaleString("pt-BR")} votos
                  {c.situacao && /ELEITO/.test(c.situacao) && !/NÃO/.test(c.situacao) && (
                    <span className="ml-1.5 rounded bg-emerald-50 px-1 text-[10px] font-bold text-emerald-700">
                      {c.situacao}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {!carregando && candidatos.length > 8 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => setAberto((a) => !a)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ChevronDown size={14} className={aberto ? "rotate-180 transition" : "transition"} />
            {aberto ? "Mostrar menos" : `Ver todos os ${candidatos.length} carregados`}
          </button>
          {aberto && candidatos.length < total && (
            <button
              onClick={maisCandidatos}
              className="rounded-xl bg-blue-600 px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-blue-700"
            >
              Carregar mais ({(total - candidatos.length).toLocaleString("pt-BR")} restantes)
            </button>
          )}
        </div>
      )}
    </section>
  );
}
