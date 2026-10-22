"use client";

import { useEffect, useMemo, useState } from "react";
import { GitCompare, Search, X } from "lucide-react";
import { chave, ondeDisputa } from "@/lib/eleicao";
import { FotoUrna } from "@/components/estrategia/seletor-candidatos";
import { MapaVotos, type PinturaMapa } from "@/components/estrategia/mapa-votos";
import type { CandidatoBusca, RaioXCandidato } from "@/components/estrategia/painel-estrategia-eleitoral";
import { CAIXA, SemDado, SeloResultado, Titulo, fmt, pct } from "./comum";

// Dois candidatos no mesmo mapa: onde as bases se cruzam e onde se completam.
// É a pergunta da dobradinha ("quem soma comigo sem disputar o mesmo voto?")
// e a do adversário ("onde ele é mais forte do que eu?").
//
// Mesmo cargo e mesmo ano: compara votos. Cargos ou anos diferentes (um
// deputado e um presidente, 2022 e 2026): compara o PESO de cada cidade na
// votação de cada um — senão o maior sempre "ganha" em toda parte.

const AZUL = ["#c7d7fe", "#5b8cf7", "#1b3a9c"];
const LARANJA = ["#fed7aa", "#fb923c", "#c2410c"];
const EMPATE = "#a8a29e";

export function AbaComparar({ raioX, ufMapa }: { raioX: RaioXCandidato; ufMapa: string }) {
  const a = raioX.candidato;
  const [busca, setBusca] = useState("");
  const [ano, setAno] = useState(a.ano);
  const [sugestoes, setSugestoes] = useState<CandidatoBusca[]>([]);
  const [outro, setOutro] = useState<RaioXCandidato | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (busca.trim().length < 2) return;
    const t = setTimeout(async () => {
      const p = new URLSearchParams({ q: busca.trim(), ano: String(ano), uf: ufMapa, exato: "1" });
      try {
        const j = await (await fetch(`/api/eleicao?${p}`)).json();
        const daqui: CandidatoBusca[] = j.candidatos ?? [];
        // Presidente mora no índice "BR": entra junto na busca do estado.
        const br = ano % 4 === 2 ? (await (await fetch(`/api/eleicao?${new URLSearchParams({ q: busca.trim(), ano: String(ano), uf: "BR", exato: "1" })}`)).json()).candidatos ?? [] : [];
        setSugestoes([...br, ...daqui].filter((c) => c.id !== a.id).slice(0, 12));
      } catch {
        setSugestoes([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [busca, ano, ufMapa, a.id]);

  async function escolher(c: CandidatoBusca) {
    setBusca("");
    setSugestoes([]);
    setCarregando(true);
    try {
      const r = await (await fetch(`/api/eleicao?candidatoId=${c.id}&uf=${ufMapa}`)).json();
      setOutro(r?.candidato ? r : null);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className={CAIXA}>
        <Titulo
          icone={<GitCompare size={13} />}
          sobre={`Comparar em ${ufMapa}`}
          titulo={outro ? `${a.nome_urna} × ${outro.candidato.nome_urna}` : `Com quem comparar ${a.nome_urna}?`}
          nota="Qualquer candidato de 2022, 2024 ou 2026 com voto neste estado: aliado, adversário ou o próprio candidato em outra eleição."
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="grid grid-cols-3 rounded-xl border border-tinta-200 bg-tinta-50 p-1 text-[12px] sm:inline-flex">
            {[2022, 2024, 2026].map((x) => (
              <button
                key={x}
                onClick={() => setAno(x)}
                className={`rounded-lg px-3 py-1.5 font-bold transition ${ano === x ? "bg-white text-blue-700 shadow-sm" : "text-tinta-600"}`}
              >
                {x}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, número ou partido…"
              className="h-10 w-full rounded-xl border border-tinta-200 bg-white pl-9 pr-3 text-[13px] outline-none focus:border-tema"
            />
            {busca.trim().length >= 2 && sugestoes.length > 0 && (
              <div className="absolute left-0 right-0 top-11 z-40 max-h-72 overflow-y-auto rounded-xl border border-tinta-200 bg-white p-1.5 shadow-xl">
                {sugestoes.map((c) => (
                  <button key={c.id} onClick={() => escolher(c)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-tinta-50">
                    <FotoUrna src={c.foto_url} nome={c.nome_urna} tamanho={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-bold text-tinta-900">{c.nome_urna}</span>
                      <span className="block truncate text-[11px] text-tinta-500">{c.partido_sigla} · {c.cargo.toLowerCase()} · {ondeDisputa(c)} · {c.ano}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {outro && (
            <button onClick={() => setOutro(null)} className="flex items-center justify-center gap-1 rounded-xl border border-tinta-200 px-3 text-[12px] font-semibold text-tinta-600 hover:bg-tinta-50">
              <X size={14} /> Limpar
            </button>
          )}
        </div>
        {carregando && <p className="mt-3 text-[12px] text-tinta-500">Carregando a votação…</p>}
      </div>

      {outro && <Comparacao a={raioX} b={outro} uf={ufMapa} />}
      {!outro && !carregando && (
        <SemDado>Escolha o segundo candidato acima. O mapa pinta de azul onde {a.nome_urna} é mais forte e de laranja onde o outro é.</SemDado>
      )}
    </div>
  );
}

function Comparacao({ a, b, uf }: { a: RaioXCandidato; b: RaioXCandidato; uf: string }) {
  const mesmoJogo = a.candidato.cargo === b.candidato.cargo && a.candidato.ano === b.candidato.ano;

  const dados = useMemo(() => {
    const va = a.votos_por_municipio;
    const vb = b.votos_por_municipio;
    const ta = Object.values(va).reduce((s, v) => s + v, 0) || 1;
    const tb = Object.values(vb).reduce((s, v) => s + v, 0) || 1;
    const nomes = [...new Set([...Object.keys(va), ...Object.keys(vb)])];
    const linhas = nomes.map((m) => {
      const x = va[m] ?? 0;
      const y = vb[m] ?? 0;
      // Medida comparável: votos (mesmo cargo e ano) ou peso na própria votação.
      const ma = mesmoJogo ? x : (x / ta) * 100;
      const mb = mesmoJogo ? y : (y / tb) * 100;
      const soma = ma + mb;
      return { municipio: m, k: chave(m), a: x, b: y, ma, mb, margem: soma ? (ma - mb) / soma : 0 };
    });
    const ambos = linhas.filter((l) => l.a > 0 && l.b > 0);
    return {
      ta,
      tb,
      linhas,
      porChave: new Map(linhas.map((l) => [l.k, l])),
      ambos: ambos.length,
      soA: linhas.filter((l) => l.a > 0 && !l.b).length,
      soB: linhas.filter((l) => l.b > 0 && !l.a).length,
      // Quanto da votação de A está em cidades onde B também teve voto.
      sobreposicaoA: (ambos.reduce((s, l) => s + l.a, 0) / ta) * 100,
      sobreposicaoB: (ambos.reduce((s, l) => s + l.b, 0) / tb) * 100,
      fortesA: [...linhas].sort((p, q) => q.ma - q.mb - (p.ma - p.mb)).filter((l) => l.ma > l.mb).slice(0, 8),
      fortesB: [...linhas].sort((p, q) => p.ma - p.mb - (q.ma - q.mb)).filter((l) => l.mb > l.ma).slice(0, 8),
    };
  }, [a, b, mesmoJogo]);

  const pintura: PinturaMapa = useMemo(() => {
    const tom = (m: number) => (Math.abs(m) > 0.6 ? 2 : Math.abs(m) > 0.25 ? 1 : 0);
    const f = mesmoJogo ? (n: number) => `${fmt(n)} votos` : (n: number) => `${pct(n, 2)} da votação`;
    return {
      cor: (k) => {
        const l = dados.porChave.get(k);
        if (!l || (!l.a && !l.b)) return null;
        if (Math.abs(l.margem) < 0.05) return EMPATE;
        return l.margem > 0 ? AZUL[tom(l.margem)] : LARANJA[tom(l.margem)];
      },
      dica: (k) => {
        const l = dados.porChave.get(k);
        if (!l) return "sem voto dos dois";
        return `${a.candidato.nome_urna}: ${f(l.ma)} · ${b.candidato.nome_urna}: ${f(l.mb)}`;
      },
      legenda: [
        { cor: AZUL[2], rotulo: `${a.candidato.nome_urna} bem à frente` },
        { cor: AZUL[0], rotulo: "à frente" },
        { cor: EMPATE, rotulo: "empate" },
        { cor: LARANJA[0], rotulo: "à frente" },
        { cor: LARANJA[2], rotulo: `${b.candidato.nome_urna} bem à frente` },
      ],
    };
  }, [dados, a, b, mesmoJogo]);

  if (!dados.linhas.length) return <SemDado>Nenhum dos dois teve voto em {uf}.</SemDado>;

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <div className={`${CAIXA} xl:col-span-7`}>
        <p className="mb-3 text-[12px] text-tinta-500">
          {mesmoJogo
            ? "Mesmo cargo e mesma eleição: a cor compara votos."
            : "Cargos ou anos diferentes: a cor compara o peso de cada cidade na votação de cada um."}
        </p>
        <MapaVotos uf={uf} votosPorMunicipio={Object.fromEntries(dados.linhas.map((l) => [l.municipio, l.a + l.b]))} pintura={pintura} />
      </div>
      <div className="space-y-4 xl:col-span-5">
        <div className="grid grid-cols-2 gap-2.5">
          <Lado r={a} cor="border-t-blue-600" total={dados.ta} />
          <Lado r={b} cor="border-t-amber-600" total={dados.tb} />
        </div>
        <div className={CAIXA}>
          <Titulo sobre="Bases" titulo={`${dados.ambos} cidades em comum`} nota={`${dados.soA} só de ${a.candidato.nome_urna} · ${dados.soB} só de ${b.candidato.nome_urna}`} />
          <p className="text-[12.5px] leading-relaxed text-tinta-700">
            <b>{pct(dados.sobreposicaoA, 0)}</b> dos votos de {a.candidato.nome_urna} em {uf} vieram de cidades onde {b.candidato.nome_urna} também
            teve voto; no sentido contrário, <b>{pct(dados.sobreposicaoB, 0)}</b>. Quanto menor a sobreposição, mais as bases se completam.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <Lista titulo={`Mais forte: ${a.candidato.nome_urna}`} tom="text-blue-700" linhas={dados.fortesA.map((l) => ({ m: l.municipio, x: l.a, y: l.b }))} />
            <Lista titulo={`Mais forte: ${b.candidato.nome_urna}`} tom="text-amber-700" linhas={dados.fortesB.map((l) => ({ m: l.municipio, x: l.a, y: l.b }))} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Lado({ r, cor, total }: { r: RaioXCandidato; cor: string; total: number }) {
  const c = r.candidato;
  return (
    <div className={`rounded-xl border border-t-4 border-tinta-200 bg-white p-3 ${cor}`}>
      <div className="flex items-center gap-2">
        <FotoUrna src={c.foto_url} nome={c.nome_urna} tamanho={36} />
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] font-bold text-tinta-900">{c.nome_urna}</span>
          <span className="block truncate text-[10.5px] text-tinta-500">{c.partido_sigla} · {c.cargo.toLowerCase()} · {c.ano}</span>
        </span>
      </div>
      <p className="tabular mt-2 text-lg font-extrabold text-tinta-900">{fmt(total)}</p>
      <p className="text-[10.5px] text-tinta-500">votos neste estado · {Object.keys(r.votos_por_municipio).length} cidades</p>
      <SeloResultado situacao={c.situacao} className="mt-1.5" />
    </div>
  );
}

function Lista({ titulo, tom, linhas }: { titulo: string; tom: string; linhas: { m: string; x: number; y: number }[] }) {
  return (
    <div className="min-w-0">
      <p className={`mb-1.5 truncate text-[11px] font-bold uppercase tracking-wider ${tom}`}>{titulo}</p>
      {linhas.length === 0 && <p className="text-[12px] text-tinta-500">Nenhuma cidade.</p>}
      {linhas.map((l) => (
        <div key={l.m} className="flex min-w-0 items-center gap-2 py-0.5 text-[12px]">
          <span className="min-w-0 flex-1 truncate text-tinta-800">{l.m}</span>
          <span className="tabular shrink-0 text-tinta-500">{fmt(l.x)} × {fmt(l.y)}</span>
        </div>
      ))}
    </div>
  );
}
