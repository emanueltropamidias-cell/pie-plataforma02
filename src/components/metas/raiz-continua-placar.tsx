import { Cabecalho } from "@/components/ui/pagina";
import {
  RAIZ_15,
  MESORREGIOES,
  META_RAIZ,
  VOTOS_2022_15,
  normCidade,
} from "@/lib/raiz-continua";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

function Barra({ pct, cor = "#0525F7" }: { pct: number; cor?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-tinta-100">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, pct)}%`, backgroundColor: cor }}
      />
    </div>
  );
}

export function RaizContinuaPlacar({
  cadastros,
}: {
  cadastros: Record<string, number>;
}) {
  // ── SEM META DEFINIDA É ESTADO NORMAL ─────────────────────────────────────
  //
  // "A Raiz Continua" é a estratégia de UMA campanha, não régua do sistema.
  // Numa instalação nova a lista vem vazia, e antes disto a tela desenhava
  // cabeçalho, barra em 0% e nenhuma cidade — o que parece defeito, não
  // ausência. Agora ela diz o que está acontecendo.
  if (RAIZ_15.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
        <Cabecalho
          voltar="/liderancas"
          sobretitulo="Estratégia"
          titulo="Meta por município"
          descricao="Onde a campanha quer chegar, cidade por cidade."
        />
        <p className="mt-6 rounded-xl border border-dashed border-tinta-300 bg-white/60 p-8 text-center text-[12.5px] leading-relaxed text-tinta-500">
          <b className="text-tinta-700">Nenhuma meta definida ainda.</b>
          <br />
          A meta por município é a estratégia desta campanha — quais cidades
          perseguir e até onde. Ela não vem pronta de propósito: a de outro
          candidato não serve para esta.
        </p>
      </div>
    );
  }

  const doCity = (municipio: string) => cadastros[normCidade(municipio)] ?? 0;
  const cadastrosTotal = RAIZ_15.reduce((s, c) => s + doCity(c.municipio), 0);
  const pctGeral = META_RAIZ ? (cadastrosTotal / META_RAIZ) * 100 : 0;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <Cabecalho
        voltar="/liderancas"
        sobretitulo="Estratégia 1"
        titulo="A Raiz Continua"
        descricao="Triplicar os votos nos 15 maiores municípios. Os cadastros contam ao vivo, por cidade."
      />

      {/* Meta da estratégia */}
      <div className="mt-8 rounded-xl border border-tinta-200 bg-white p-6 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[12px] font-medium text-tinta-500">
              Meta da Raiz Continua (triplicar os 15)
            </p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight text-tinta-900">
              {fmt(META_RAIZ)}
              <span className="ml-1 text-base font-medium text-tinta-400">
                votos
              </span>
            </p>
            <p className="mt-1 text-[12px] text-tinta-400">
              Base 2022: {fmt(VOTOS_2022_15)} votos (x3). Piso da frente:
              40.000.
            </p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-extrabold text-tema">
              {fmt(cadastrosTotal)}
            </p>
            <p className="text-[12px] text-tinta-500">Raízes cadastradas</p>
          </div>
        </div>
        <div className="mt-4">
          <Barra pct={pctGeral} />
          <p className="mt-1 text-[11px] text-tinta-400">
            {pctGeral.toFixed(1).replace(".", ",")}% da meta (cadastros / meta)
          </p>
        </div>
      </div>

      {/* Por mesorregião */}
      {MESORREGIOES.map((meso) => {
        const cidades = RAIZ_15.filter((c) => c.mesorregiao === meso.nome);
        const metaMeso = cidades.reduce((s, c) => s + c.metaX3, 0);
        const cadMeso = cidades.reduce((s, c) => s + doCity(c.municipio), 0);
        return (
          <div key={meso.nome} className="mt-8">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-tinta-800">
                {meso.nome}
                <span className="rounded-full bg-tema/[0.07] px-2 py-0.5 text-[10px] font-semibold text-tema">
                  {meso.verbaPct}% da verba
                </span>
              </h2>
              <span className="text-[12px] text-tinta-500">
                {fmt(cadMeso)} / {fmt(metaMeso)}
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-tinta-200 bg-white shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-tinta-200 text-left text-[11px] uppercase tracking-wide text-tinta-500">
                    <th className="px-4 py-3">Município</th>
                    <th className="px-4 py-3 text-right">Votos 2022</th>
                    <th className="px-4 py-3 text-right">Meta x3</th>
                    <th className="px-4 py-3 text-right">Cadastros</th>
                    <th className="px-4 py-3 w-[160px]">Progresso</th>
                  </tr>
                </thead>
                <tbody>
                  {cidades.map((c) => {
                    const cad = doCity(c.municipio);
                    const pct = c.metaX3 ? (cad / c.metaX3) * 100 : 0;
                    return (
                      <tr
                        key={c.municipio}
                        className={`border-b border-tinta-100 last:border-0 ${c.teste ? "bg-[#FFB700]/[0.06]" : ""}`}
                      >
                        <td className="px-4 py-3 font-medium text-tinta-900">
                          <span className="flex items-center gap-2">
                            {c.municipio}
                            {c.teste && (
                              <span className="rounded-full bg-[#FFB700]/20 px-2 py-0.5 text-[10px] font-semibold text-[#9a6b00]">
                                cidade-teste
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-tinta-500">
                          {fmt(c.votos2022)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-tinta-900">
                          {fmt(c.metaX3)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-tema">
                          {fmt(cad)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Barra
                              pct={pct}
                              cor={c.teste ? "#FFB700" : "#0525F7"}
                            />
                            <span className="w-10 shrink-0 text-right text-[11px] text-tinta-400">
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Totalizador */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-tema/15 bg-tema/[0.03] px-6 py-4">
        <p className="text-sm font-bold text-tinta-800">Total das 15 cidades</p>
        <div className="flex items-center gap-6 text-sm">
          <span className="text-tinta-500">
            2022: <b className="text-tinta-800">{fmt(VOTOS_2022_15)}</b>
          </span>
          <span className="text-tinta-500">
            Meta: <b className="text-tinta-800">{fmt(META_RAIZ)}</b>
          </span>
          <span className="text-tinta-500">
            Cadastros: <b className="text-tema">{fmt(cadastrosTotal)}</b>
          </span>
        </div>
      </div>

      <p className="mt-4 text-center text-[12px] text-tinta-400">
        Cadastros contados da rede por município (cidades-teste: Salvador,
        Vitória da Conquista e Feira de Santana).
      </p>
    </div>
  );
}
