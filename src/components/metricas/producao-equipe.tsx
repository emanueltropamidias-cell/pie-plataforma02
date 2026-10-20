"use client";

import { Cartao, Indicador } from "@/components/ui/pagina";

/**
 * O que a equipe FEZ no dia — contado pelo dia do trabalho.
 *
 * ── POR QUE ESTE BLOCO EXISTE, SEPARADO DO RESTO DA TELA ────────────────────
 *
 * Todo o resto de Métricas conta pelo dia em que o LEAD CHEGOU. Isso está
 * certo para "o tráfego de terça trouxe quantos apoiadores?" — a resposta não
 * pode mudar porque alguém classificou tarde.
 *
 * Mas gerava um efeito que travou o Emanuel duas vezes: marcar hoje alguém que
 * escreveu em agosto conta em AGOSTO. Em 19/09, das 604 marcações de apoiador
 * feitas no dia, 330 foram em gente de dias anteriores — mais da metade do
 * trabalho ia para trás no calendário, e a coluna "Hoje" ficava parada com a
 * equipe trabalhando.
 *
 * Aqui é a outra pergunta: quanto se produziu hoje. Os dois blocos convivem na
 * mesma tela de propósito, cada um com o rótulo dizendo o que conta — porque o
 * defeito nunca foi o número, foi ninguém saber o que ele mede.
 */

export type ProducaoAtendente = {
  id: string;
  nome: string;
  pessoas_respondidas: number;
  mensagens: number;
  disparos: number;
  cadastrou: number;
  classificou: number;
  apoiadores: number;
  multiplicadores: number;
};

export type Producao = {
  de: string;
  ate: string;
  total: {
    pessoas_respondidas: number;
    mensagens: number;
    disparos: number;
    cadastrou: number;
    classificou: number;
    apoiadores: number;
    multiplicadores: number;
  };
  equipe: ProducaoAtendente[];
};

const n = (v: number) => v.toLocaleString("pt-BR");

/** Barra proporcional à maior da coluna. Comparar número a número numa lista
 *  de quinze linhas é trabalho; comprimento o olho lê sem contar. */
function Barra({ valor, maior }: { valor: number; maior: number }) {
  const pct = maior > 0 ? Math.round((valor / maior) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-right text-[13px] font-semibold tabular-nums text-tinta-800">
        {n(valor)}
      </span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-tinta-100">
        <span
          className="block h-full rounded-full bg-tema transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
}

export function ProducaoEquipe({
  producao,
  rotulo,
}: {
  producao: Producao;
  /** O nome da janela escolhida no topo ("Hoje", "7 dias"). Desde 25/09 este
   *  bloco segue o filtro, e repetir o rótulo dele aqui é o que impede alguém
   *  ler os dois blocos como se fossem períodos diferentes. */
  rotulo?: string;
}) {
  const t = producao.total;
  const equipe = producao.equipe;

  // Quem não fez nada no dia não entra: uma lista com dez zeros esconde as
  // cinco linhas que importam.
  const ativas = equipe.filter(
    (a) => a.pessoas_respondidas + a.cadastrou + a.classificou > 0,
  );
  const maiorResp = Math.max(1, ...ativas.map((a) => a.pessoas_respondidas));

  const diaCurto = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
  const intervalo =
    producao.de === producao.ate
      ? diaCurto(producao.de)
      : `${diaCurto(producao.de)} a ${diaCurto(producao.ate)}`;
  // O rótulo da janela na frente, o intervalo atrás: "7 dias · 19/09 a 25/09"
  // diz ao mesmo tempo o que foi escolhido e que datas isso cobre.
  const quando = rotulo ? `${rotulo} · ${intervalo}` : intervalo;

  return (
    <Cartao
      titulo="Produção da equipe"
      descricao={`Contado pelo dia do TRABALHO, não pelo dia em que o lead chegou · ${quando}`}
    >
      <div className="grid grid-cols-2 gap-px bg-tinta-100 sm:grid-cols-4">
        <Indicador
          rotulo="Pessoas respondidas"
          valor={n(t.pessoas_respondidas)}
          contexto={`${n(t.mensagens)} mensagens`}
          destaque
        />
        <Indicador rotulo="Cadastrou" valor={n(t.cadastrou)} />
        <Indicador
          rotulo="Classificou"
          valor={n(t.classificou)}
          contexto="etiquetas de status e perfil"
        />
        <Indicador
          rotulo="Apoiadores marcados"
          valor={n(t.apoiadores)}
          contexto={
            t.multiplicadores > 0
              ? `${n(t.multiplicadores)} multiplicadores`
              : undefined
          }
        />
      </div>

      {ativas.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-tinta-500">
          Ninguém registrou trabalho neste período ainda.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-tinta-100 text-left">
                {["Atendente", "Respondeu", "Cadastrou", "Classificou", "Apoiador"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-tinta-400 ${
                        i === 0 ? "" : "text-right"
                      } ${i === 1 ? "w-[34%]" : ""}`}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {ativas.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-tinta-50 last:border-0 hover:bg-tinta-50/60"
                >
                  <td className="px-5 py-2.5">
                    <span className="block truncate text-[13px] font-semibold text-tinta-800">
                      {a.nome}
                    </span>
                    {/* Disparo não é atendimento (regra 04-dominio-pie): ele
                        aparece, mas fora da coluna de quem foi respondido. */}
                    {a.disparos > 0 && (
                      <span className="text-[11px] text-tinta-400">
                        {n(a.disparos)} em disparo
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2.5">
                    <Barra valor={a.pessoas_respondidas} maior={maiorResp} />
                  </td>
                  <td className="px-5 py-2.5 text-right text-[13px] tabular-nums text-tinta-700">
                    {n(a.cadastrou)}
                  </td>
                  <td className="px-5 py-2.5 text-right text-[13px] tabular-nums text-tinta-700">
                    {n(a.classificou)}
                  </td>
                  <td className="px-5 py-2.5 text-right text-[13px] font-semibold tabular-nums text-tinta-800">
                    {n(a.apoiadores)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-tinta-100 px-5 py-3 text-[11.5px] leading-relaxed text-tinta-400">
        Os números acima contam <b>quando a ação foi feita</b>. Os do resto da
        tela contam <b>quando o lead chegou</b> — por isso marcar hoje alguém
        que escreveu na semana passada aparece aqui, e lá na coluna da semana
        passada. As duas contas estão certas; elas respondem perguntas
        diferentes.
      </p>
    </Cartao>
  );
}
