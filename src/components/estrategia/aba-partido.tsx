"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag, Target } from "lucide-react";
import { MapaVotos, type BaseCidade, type MedidaMapa } from "@/components/estrategia/mapa-votos";
import type { RaioXCandidato } from "@/components/estrategia/painel-estrategia-eleitoral";
import { Barra, CAIXA, Carregando, SemDado, Titulo, fmt, pct } from "./comum";

// O partido inteiro num cargo do estado: a soma de todos os candidatos dele
// mais o voto de legenda, cidade a cidade. É o que um dirigente partidário
// quer ver — onde a legenda é forte, onde não existe.
//
// E a LACUNA: cidades onde o partido do candidato teve muito voto e ele teve
// pouco. Se ele fizesse ali a mesma fatia do partido que faz no estado,
// quantos votos teria? A diferença é voto que já é do partido e ainda não é
// dele — crescer ali não exige disputar o eleitor de outro partido.

type Partido = {
  sigla: string;
  votos_por_municipio: Record<string, number>;
  total: number;
  total_cargo: number;
  total_por_cidade: Record<string, number>;
  partidos: { sigla: string; votos: number }[];
};

const MEDIDAS: { id: MedidaMapa; rotulo: string }[] = [
  { id: "votos", rotulo: "Votos" },
  { id: "validos", rotulo: "Fatia na cidade" },
];

export function AbaPartido({
  raioX,
  ufMapa,
  onAbrirMunicipio,
}: {
  raioX: RaioXCandidato;
  ufMapa: string;
  onAbrirMunicipio: (municipio: string) => void;
}) {
  const c = raioX.candidato;
  const [sigla, setSigla] = useState(c.partido_sigla);
  const [medida, setMedida] = useState<MedidaMapa>("votos");
  const [estado, setEstado] = useState<{ chave: string; dados: Partido | null } | null>(null);
  const chave = `${c.ano}|${ufMapa}|${c.cargo}|${c.turno}|${sigla}`;

  useEffect(() => {
    let vivo = true;
    const p = new URLSearchParams({ partido_estado: "1", ano: String(c.ano), uf: ufMapa, cargo: c.cargo, turno: String(c.turno), sigla });
    fetch(`/api/eleicao?${p}`)
      .then((r) => (r.ok ? r.json() : { dados: null }))
      .then((j) => vivo && setEstado({ chave, dados: j?.dados ?? null }))
      .catch(() => vivo && setEstado({ chave, dados: null }));
    return () => {
      vivo = false;
    };
  }, [chave, c.ano, ufMapa, c.cargo, c.turno, sigla]);

  const d = estado?.chave === chave ? estado.dados : undefined;

  // Base do mapa: eleitores da apuração e, como "válidos", o total do cargo na
  // cidade — assim a medida "fatia" é a parte do partido nos votos do cargo.
  const base = useMemo(() => {
    if (!d) return null;
    const b: Record<string, BaseCidade> = {};
    for (const [m, total] of Object.entries(d.total_por_cidade))
      b[m] = { aptos: raioX.base_por_municipio?.[m]?.aptos ?? 0, comparecimento: 0, validos: total };
    return b;
  }, [d, raioX.base_por_municipio]);

  const municipal = c.cargo === "VEREADOR" || c.cargo === "PREFEITO";
  const doCandidato = sigla === c.partido_sigla && !municipal;

  const lacunas = useMemo(() => {
    if (!d || !doCandidato || !d.total) return [];
    const votosCand = raioX.votos_por_municipio;
    const totalCand = Object.values(votosCand).reduce((s, v) => s + v, 0);
    const media = totalCand / d.total; // fatia do partido que o candidato faz no estado
    return Object.entries(d.votos_por_municipio)
      .map(([m, vp]) => {
        const vc = votosCand[m] ?? 0;
        return { municipio: m, partido: vp, candidato: vc, fatia: vp ? vc / vp : 0, potencial: Math.round(vp * media - vc) };
      })
      .filter((x) => x.potencial > 0 && x.fatia < media * 0.5)
      .sort((a, b) => b.potencial - a.potencial)
      .slice(0, 12);
  }, [d, doCandidato, raioX.votos_por_municipio]);

  if (d === undefined) return <div className={CAIXA}><Carregando linhas={5} /></div>;
  if (!d)
    return (
      <div className={CAIXA}>
        <SemDado>Os votos por partido de {c.ano} em {ufMapa} ainda não foram importados.</SemDado>
      </div>
    );

  const posicao = d.partidos.findIndex((p) => p.sigla === sigla) + 1;
  const maiorPartido = d.partidos[0]?.votos ?? 1;
  const cidades = Object.entries(d.votos_por_municipio).sort((a, b) => b[1] - a[1]);
  const maiorCidade = cidades[0]?.[1] ?? 1;
  const mediaCandidato = d.total ? (Object.values(raioX.votos_por_municipio).reduce((s, v) => s + v, 0) / d.total) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-12">
        <div className={`${CAIXA} xl:col-span-8`}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-tinta-100 pb-3">
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-tema">
                <Flag size={13} /> {c.cargo.toLowerCase()} · {ufMapa} · {c.ano}
                {c.turno === 2 ? " · 2º turno" : ""}
              </span>
              <h2 className="text-[15px] font-extrabold text-tinta-900 sm:text-base">
                {sigla}: {fmt(d.total)} votos · {pct((d.total / d.total_cargo) * 100)} do cargo · {posicao}º partido
              </h2>
              <p className="text-[12px] text-tinta-500">Soma de todos os candidatos do partido mais o voto de legenda.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={sigla}
                onChange={(e) => setSigla(e.target.value)}
                aria-label="Partido"
                className="h-9 rounded-xl border border-tinta-200 bg-white px-3 text-[12px] font-semibold text-tinta-700 outline-none focus:border-tema"
              >
                {d.partidos.map((p) => (
                  <option key={p.sigla} value={p.sigla}>
                    {p.sigla} ({fmt(p.votos)})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 rounded-xl border border-tinta-200 bg-tinta-50 p-1 text-[11.5px]" role="group" aria-label="Medida do mapa">
                {MEDIDAS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMedida(m.id)}
                    className={`rounded-lg px-2.5 py-1 font-bold transition ${medida === m.id ? "bg-white text-blue-700 shadow-sm" : "text-tinta-600"}`}
                  >
                    {m.rotulo}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <MapaVotos uf={ufMapa} votosPorMunicipio={d.votos_por_municipio} base={base} medida={medida} ano={c.ano} onAbrirMunicipio={onAbrirMunicipio} />
        </div>

        <div className="space-y-4 xl:col-span-4">
          <div className={CAIXA}>
            <Titulo sobre="Onde o partido é mais forte" titulo={`${cidades.length} cidades com voto`} />
            <div className="space-y-2">
              {cidades.slice(0, 10).map(([m, v]) => (
                <button key={m} onClick={() => onAbrirMunicipio(m)} className="block w-full text-left">
                  <span className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="min-w-0 truncate font-semibold text-tinta-800">{m}</span>
                    <span className="tabular shrink-0 text-tinta-600">
                      {fmt(v)} · {pct((v / (d.total_por_cidade[m] || 1)) * 100)}
                    </span>
                  </span>
                  <span className="mt-1 block"><Barra valor={v} maximo={maiorCidade} /></span>
                </button>
              ))}
            </div>
          </div>
          <div className={CAIXA}>
            <Titulo sobre="Ranking dos partidos" titulo={`${d.partidos.length} partidos no cargo`} />
            <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
              {d.partidos.map((p) => (
                <button
                  key={p.sigla}
                  onClick={() => setSigla(p.sigla)}
                  className={`block w-full rounded-lg px-1.5 py-1 text-left ${p.sigla === sigla ? "bg-blue-50" : "hover:bg-tinta-50"}`}
                >
                  <span className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="font-semibold text-tinta-800">{p.sigla}</span>
                    <span className="tabular text-tinta-600">
                      {fmt(p.votos)} · {pct((p.votos / d.total_cargo) * 100)}
                    </span>
                  </span>
                  <span className="mt-1 block"><Barra valor={p.votos} maximo={maiorPartido} /></span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {doCandidato && (
        <div className={CAIXA}>
          <Titulo
            icone={<Target size={13} />}
            sobre="Lacuna: o partido é forte, o candidato não"
            titulo={lacunas.length ? `${lacunas.length} cidades para crescer dentro do ${sigla}` : "Nenhuma lacuna relevante"}
            nota={`No estado, ${c.nome_urna} fez ${pct(mediaCandidato)} dos votos do ${sigla} para ${c.cargo.toLowerCase()}. Abaixo, cidades onde fez menos da metade disso. "Potencial" é quantos votos a mais teria repetindo ali a própria média.`}
          />
          {lacunas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[12px]">
                <thead>
                  <tr className="border-b border-tinta-100 text-left text-[10.5px] font-bold uppercase tracking-wider text-tinta-500">
                    <th className="py-2 pr-2">Cidade</th>
                    <th className="py-2 pr-2 text-right">Votos do {sigla}</th>
                    <th className="py-2 pr-2 text-right">Votos de {c.nome_urna.split(" ")[0]}</th>
                    <th className="py-2 pr-2 text-right">Fatia no partido</th>
                    <th className="py-2 text-right">Potencial</th>
                  </tr>
                </thead>
                <tbody>
                  {lacunas.map((l) => (
                    <tr key={l.municipio} className="border-b border-tinta-100">
                      <td className="py-2 pr-2">
                        <button onClick={() => onAbrirMunicipio(l.municipio)} className="font-semibold text-tinta-800 hover:text-tema">
                          {l.municipio}
                        </button>
                      </td>
                      <td className="tabular py-2 pr-2 text-right text-tinta-700">{fmt(l.partido)}</td>
                      <td className="tabular py-2 pr-2 text-right text-tinta-700">{fmt(l.candidato)}</td>
                      <td className="tabular py-2 pr-2 text-right text-tinta-600">{pct(l.fatia * 100)}</td>
                      <td className="tabular py-2 text-right font-bold text-emerald-700">+{fmt(l.potencial)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
