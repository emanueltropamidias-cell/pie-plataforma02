"use client";

import { useMemo, useState } from "react";
import { REGION_COLORS, REGIONS_DATA } from "@/lib/regioes-ba";
import { VOTOS_TALITA } from "@/lib/votos-talita";
import type { MunicipioBase } from "./mapa-bahia";

// O mapa mostra onde a gente está. Este gráfico mostra onde a gente ganhou voto
// e ainda não tem ninguém cadastrado — que é a decisão que a equipe precisa
// tomar toda semana: para onde ir.

function normaliza(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/** Escurece uma cor em direção ao preto, para separar as duas séries. */
function escurecer(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const m = (c: number) => Math.round(c * (1 - t));
  return `rgb(${m((n >> 16) & 255)}, ${m((n >> 8) & 255)}, ${m(n & 255)})`;
}
function clarear(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const m = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${m((n >> 16) & 255)}, ${m((n >> 8) & 255)}, ${m(n & 255)})`;
}

type Linha = {
  regiao: string;
  cor: string;
  pessoas: number;
  votos: number;
  municipios: number;
  comBase: number;
  lacunas: { municipio: string; votos: number }[];
};

export function GraficoRegioes({
  base,
  aoEscolher,
}: {
  base: MunicipioBase[];
  aoEscolher: (municipio: string) => void;
}) {
  const [aberta, setAberta] = useState<string | null>(null);

  const { linhas, totalPessoas, totalVotos } = useMemo(() => {
    const pessoasPorMun = new Map<string, number>();
    for (const m of base) pessoasPorMun.set(normaliza(m.municipio), m.qtd);

    const votosPorMun = new Map<string, number>();
    for (const [nome, v] of Object.entries(VOTOS_TALITA)) votosPorMun.set(normaliza(nome), v);

    const linhas: Linha[] = Object.entries(REGIONS_DATA).map(([regiao, municipios]) => {
      let pessoas = 0;
      let votos = 0;
      let comBase = 0;
      const lacunas: { municipio: string; votos: number }[] = [];

      for (const mun of municipios) {
        const n = normaliza(mun);
        const p = pessoasPorMun.get(n) ?? 0;
        const v = votosPorMun.get(n) ?? 0;
        pessoas += p;
        votos += v;
        if (p > 0) comBase++;
        // Voto sem cadastro: gente que já votou e com quem não temos contato.
        else if (v > 0) lacunas.push({ municipio: mun, votos: v });
      }

      lacunas.sort((a, b) => b.votos - a.votos);
      return {
        regiao,
        cor: REGION_COLORS[regiao] ?? "#9AA3AF",
        pessoas,
        votos,
        municipios: municipios.length,
        comBase,
        lacunas,
      };
    });

    linhas.sort((a, b) => b.votos - a.votos);
    return {
      linhas,
      totalPessoas: linhas.reduce((s, l) => s + l.pessoas, 0),
      totalVotos: linhas.reduce((s, l) => s + l.votos, 0),
    };
  }, [base]);

  const maiorPessoas = Math.max(1, ...linhas.map((l) => l.pessoas));
  const maiorVotos = Math.max(1, ...linhas.map((l) => l.votos));
  const totalLacunas = linhas.reduce((s, l) => s + l.lacunas.reduce((x, y) => x + y.votos, 0), 0);

  return (
    <div className="rounded-xl border border-tinta-200 bg-white p-5 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-tinta-500">
            Base × votos
          </p>
          <h2 className="text-lg font-bold tracking-tight text-tinta-900">Presença por região</h2>
        </div>
        <div className="flex items-center gap-4 text-[11.5px] text-tinta-500">
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-4 rounded-sm bg-tinta-400" />
            pessoas na base
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-4 rounded-sm bg-tinta-800" />
            votos em 2022 (tom mais forte)
          </span>
          <span className="text-tinta-400">— cada região na cor do mapa</span>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3.5">
        {linhas.map((l) => {
          const cobertura = l.municipios ? Math.round((l.comBase / l.municipios) * 100) : 0;
          const votosPerdidos = l.lacunas.reduce((s, x) => s + x.votos, 0);
          const escolhida = aberta === l.regiao;
          return (
            <div key={l.regiao}>
              <button
                onClick={() => setAberta(escolhida ? null : l.regiao)}
                className="w-full text-left"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-tinta-700">
                    <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: l.cor }} />
                    {l.regiao}
                  </span>
                  <span className="text-[11.5px] tabular-nums text-tinta-400">
                    {l.comBase}/{l.municipios} municípios · {cobertura}%
                  </span>
                </div>

                {/* Duas barras: cada uma na sua própria escala, porque pessoa e
                    voto não são a mesma unidade — o que se compara é o formato. */}
                <div className="mt-1.5 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-tinta-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(1, (l.pessoas / maiorPessoas) * 100)}%`,
                          background: clarear(l.cor, 0.25),
                        }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-[12px] font-semibold tabular-nums text-tinta-700">
                      {l.pessoas.toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-tinta-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(1, (l.votos / maiorVotos) * 100)}%`,
                          background: escurecer(l.cor, 0.3),
                        }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-[12px] font-semibold tabular-nums text-tinta-700">
                      {l.votos.toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
              </button>

              {votosPerdidos > 0 && (
                <p className="mt-1 text-[11px] text-tinta-400">
                  {l.lacunas.length} município(s) com voto e sem cadastro ·{" "}
                  <b className="font-semibold" style={{ color: escurecer(l.cor, 0.35) }}>
                    {votosPerdidos.toLocaleString("pt-BR")} votos
                  </b>{" "}
                  {escolhida ? "— clique para fechar" : "— clique para ver"}
                </p>
              )}

              {escolhida && l.lacunas.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg bg-tinta-50 p-2.5">
                  {l.lacunas.slice(0, 24).map((x) => (
                    <button
                      key={x.municipio}
                      onClick={() => aoEscolher(x.municipio)}
                      className="rounded-md border border-tinta-200 bg-white px-2 py-1 text-[11.5px] text-tinta-600 hover:border-tinta-400 hover:text-tinta-900"
                    >
                      {x.municipio}{" "}
                      <span className="font-semibold tabular-nums text-tinta-400">{x.votos}</span>
                    </button>
                  ))}
                  {l.lacunas.length > 24 && (
                    <span className="self-center text-[11px] text-tinta-400">
                      +{l.lacunas.length - 24}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 border-t border-tinta-100 pt-3 text-[11.5px] text-tinta-500">
        {totalPessoas.toLocaleString("pt-BR")} pessoas na base ·{" "}
        {totalVotos.toLocaleString("pt-BR")} votos em 2022 ·{" "}
        <b className="font-semibold text-tinta-800">{totalLacunas.toLocaleString("pt-BR")} votos</b>{" "}
        em municípios onde ninguém está cadastrado.
      </p>
    </div>
  );
}
