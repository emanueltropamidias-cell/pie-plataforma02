"use client";

import { useState } from "react";
import { hojeBahia } from "@/lib/trafego/meta";
import {
  META_CONVERSAS_DIA,
  diaMenos,
  funilDoDia,
  projetarDia,
  somar,
  type Funil,
  type LinhaDia,
  type ResumoConta,
} from "@/lib/trafego/painel";

// O topo da aba Tráfego.
//
// ── A REGRA DESTA TELA: BATEU O OLHO, ENTENDEU ──────────────────────────────
//
// Pedido do Emanuel ao aprovar a proposta. Na prática, três decisões:
//
//   1. Todo bloco abre com uma FRASE que já é a conclusão ("CA 01 ficou 45%
//      mais cara em 3 dias"), e só depois o número. Título genérico como
//      "Custo por conversa (R$)" obriga a pessoa a fazer a leitura sozinha.
//   2. Uma conta, um cartão. A proposta tinha tabela de contas e gráfico de
//      saturação separados; junto, a pessoa não precisa cruzar os dois.
//   3. Gráfico só onde a forma diz algo que o número não diz — a curvinha do
//      custo na conta. Sem eixo, sem grade: ela mostra direção, e o número ao
//      lado mostra o valor.
//
// Os cálculos moram em src/lib/trafego/painel.ts.

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const COR = {
  bom: { texto: "#12703c", fundo: "#eef7f1", borda: "#cbe3d4" },
  atencao: { texto: "#a35a00", fundo: "#fdf6ea", borda: "#f0dcc0" },
  ruim: { texto: "#c02020", fundo: "#fdf1f1", borda: "#f3d3d3" },
};

// ── 1. HOJE ─────────────────────────────────────────────────────────────────

export function PainelHoje({
  linhas,
  todasLinhas,
  funil,
  umaConta,
  ini,
  fim,
}: {
  /** Linhas da conta selecionada (ou de todas). */
  linhas: LinhaDia[];
  /** Linhas de todas as contas — o custo por cadastro só existe no todo. */
  todasLinhas: LinhaDia[];
  funil: Funil;
  umaConta: string | null;
  /** A janela escolhida no filtro de período. Vazio nos dois = "Tudo". */
  ini: string;
  fim: string;
}) {
  const hoje = hojeBahia();

  // ── ESTE PAINEL SEGUE O FILTRO ────────────────────────────────────────────
  //
  // Ele era fixo em hoje de propósito: respondia "como está agora", e o filtro
  // servia para olhar o passado. Na prática não funcionou — ele fica logo
  // ABAIXO do seletor, e quem clica em "Ontem" lê os números de cima como
  // sendo de ontem. Em 21/09 o Emanuel apontou: "Ontem não está puxando".
  //
  // Não estava puxando porque nunca esteve ligado. Agora está, e o rótulo diz
  // qual janela é — o rótulo fixo "hoje" embaixo de um botão "Ontem" aceso era
  // metade do problema.
  const tudo = !ini && !fim;
  const de = ini || fim || hoje;
  const ate = fim || ini || hoje;
  const doPeriodo = tudo ? linhas : linhas.filter((l) => l.data >= de && l.data <= ate);

  const h = somar(doPeriodo);
  const semana = somar(linhas.filter((l) => l.data >= diaMenos(7) && l.data <= diaMenos(1)));

  const ehHoje = !tudo && de === hoje && ate === hoje;
  const umDia = !tudo && de === ate;
  // Quantos dias a janela cobre, para a meta diária virar meta do período.
  const dias = tudo
    ? Math.max(1, new Set(linhas.map((l) => l.data)).size)
    : Math.max(1, Math.round((Date.parse(ate) - Date.parse(de)) / 86400000) + 1);
  const meta = META_CONVERSAS_DIA * dias;

  const quando = tudo
    ? "no período todo"
    : ehHoje
      ? "hoje"
      : umDia && de === diaMenos(1)
        ? "ontem"
        : umDia
          ? `em ${dataCurta(de)}`
          : `de ${dataCurta(de)} a ${dataCurta(ate)}`;

  const pct = Math.min(100, (h.conversas / meta) * 100);
  // A projeção só existe para um dia que ainda está correndo. Projetar um dia
  // fechado é inventar: ele já acabou, o número dele é o número dele.
  const proj = umaConta || !ehHoje ? null : projetarDia(h.conversas, funil?.ritmo);

  // Ontem, e não hoje: cadastro de hoje ainda está acontecendo, e custo por
  // cadastro de um dia pela metade sai sempre alto e sempre errado.
  const ontem = funilDoDia(todasLinhas, funil, diaMenos(1));
  const semanaPassada = funilDoDia(todasLinhas, funil, diaMenos(8));

  const variacaoCusto =
    h.custoConversa && semana.custoConversa ? h.custoConversa / semana.custoConversa - 1 : null;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="col-span-2 rounded-xl border border-tinta-200 bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-tinta-400">
          Conversas {quando}
          {umaConta ? ` · ${umaConta}` : ""}
        </p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="tabular text-[34px] font-extrabold leading-none tracking-tight text-tinta-900">
            {inteiro(h.conversas)}
          </span>
          {!umaConta && (
            <span className="text-[15px] font-semibold text-tinta-500">
              de {inteiro(meta)}
              {dias > 1 && (
                <span className="font-normal text-tinta-400">
                  {" "}
                  ({inteiro(META_CONVERSAS_DIA)}/dia × {dias})
                </span>
              )}
            </span>
          )}
        </p>
        {!umaConta && (
          <>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-tinta-100">
              <div className="h-full rounded-full bg-tema" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-[13px] text-tinta-600">
              {proj ? (
                <>
                  No ritmo de hoje, fecha em <b className="text-tinta-900">~{inteiro(proj.valor)}</b>
                  {proj.valor < META_CONVERSAS_DIA
                    ? ` — faltariam ${inteiro(META_CONVERSAS_DIA - proj.valor)} para a meta.`
                    : " — acima da meta."}
                </>
              ) : ehHoje ? (
                <>
                  Faltam {inteiro(Math.max(0, meta - h.conversas))}. A projeção aparece depois das
                  primeiras horas do dia.
                </>
              ) : h.conversas >= meta ? (
                <>
                  Bateu a meta — <b className="text-tinta-900">{inteiro(h.conversas - meta)}</b> acima.
                </>
              ) : (
                <>
                  Ficou <b className="text-tinta-900">{inteiro(meta - h.conversas)}</b> abaixo da meta
                  {dias > 1 ? " do período" : " do dia"}.
                </>
              )}
            </p>
          </>
        )}
      </div>

      <Numero
        rotulo={`Investido ${quando}`}
        valor={reais(h.gasto)}
        nota={`${reais(semana.gasto / 7)} por dia na última semana`}
      />

      <Numero
        rotulo="Custo por conversa"
        valor={h.custoConversa != null ? reais(h.custoConversa) : "—"}
        nota={
          variacaoCusto == null
            ? `sem conversa ${quando}`
            : `${variacaoCusto >= 0 ? "▲" : "▼"} ${Math.abs(variacaoCusto * 100).toFixed(0)}% sobre a semana (${reais(semana.custoConversa!)})`
        }
        tom={variacaoCusto != null && variacaoCusto >= 0.15 ? "ruim" : variacaoCusto != null && variacaoCusto <= -0.1 ? "bom" : undefined}
      />

      {!umaConta && (
        <div className="col-span-2 lg:col-span-4">
          <FunilOntem ontem={ontem} semanaPassada={semanaPassada} />
        </div>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, nota, tom }: { rotulo: string; valor: string; nota: string; tom?: "bom" | "ruim" }) {
  const c = tom ? COR[tom] : null;
  return (
    <div
      className="rounded-xl border bg-white p-5"
      style={c ? { borderColor: c.borda, background: c.fundo } : { borderColor: "var(--color-tinta-200)" }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-tinta-400">{rotulo}</p>
      <p className="tabular mt-1 text-[26px] font-extrabold leading-none tracking-tight" style={{ color: c?.texto ?? "#101114" }}>
        {valor}
      </p>
      <p className="mt-2 text-[12.5px]" style={{ color: c?.texto ?? "#71727a" }}>
        {nota}
      </p>
    </div>
  );
}

// ── 2. DO ANÚNCIO AO CADASTRO ───────────────────────────────────────────────
//
// Quatro números em degrau, com a perda escrita entre eles. É o bloco que só o
// PIE consegue montar: a Meta sabe as duas primeiras pontas, nunca as últimas.

function FunilOntem({
  ontem,
  semanaPassada,
}: {
  ontem: ReturnType<typeof funilDoDia>;
  semanaPassada: ReturnType<typeof funilDoDia>;
}) {
  if (ontem.chegaram == null) return null;

  const etapas = [
    { rotulo: "A Meta iniciou", valor: ontem.conversasMeta, nota: "conversas" },
    { rotulo: "Chegaram no PIE", valor: ontem.chegaram, nota: "todas as origens" },
    { rotulo: "Foram respondidas", valor: ontem.respondidas ?? 0, nota: "pela equipe" },
    { rotulo: "Viraram cadastro", valor: ontem.cadastros ?? 0, nota: "" },
  ];
  const cadastroPor100 = ontem.conversasMeta ? Math.round(((ontem.cadastros ?? 0) / ontem.conversasMeta) * 100) : null;

  // A maior perda entre duas etapas vira a frase. "Chegaram" pode passar da
  // Meta — conversa orgânica, QR, indicação —, e ali não há perda a apontar.
  let pior = { i: -1, perda: 0 };
  for (let i = 1; i < etapas.length; i++) {
    const a = etapas[i - 1].valor, b = etapas[i].valor;
    if (a > 0 && b < a && (a - b) / a > pior.perda) pior = { i, perda: (a - b) / a };
  }
  const onde = ["", "antes de chegar no PIE", "na fila, sem resposta", "entre a resposta e o cadastro"][pior.i] ?? "";

  const custo = ontem.custoCadastro;
  const custoAntes = semanaPassada.custoCadastro;
  const subiu = custo != null && custoAntes != null ? custo / custoAntes - 1 : null;

  return (
    <div className="rounded-xl border border-tinta-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-tinta-900">
            Ontem, de cada 100 conversas da Meta, {cadastroPor100 ?? "—"} viraram cadastro.
          </p>
          {pior.i > 0 && (
            <p className="mt-0.5 text-[13px] text-tinta-500">
              A maior perda foi {onde}: {Math.round(pior.perda * 100)}% ficaram pelo caminho.
            </p>
          )}
        </div>
        {custo != null && (
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-tinta-400">Custo por cadastro</p>
            <p className="tabular text-[22px] font-extrabold leading-tight text-tinta-900">{reais(custo)}</p>
            {subiu != null && (
              <p className="text-[12px]" style={{ color: subiu > 0.1 ? COR.ruim.texto : subiu < -0.1 ? COR.bom.texto : "#71727a" }}>
                {subiu >= 0 ? "▲" : "▼"} {Math.abs(subiu * 100).toFixed(0)}% sobre o mesmo dia da semana passada
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {etapas.map((e, i) => {
          const antes = i > 0 ? etapas[i - 1].valor : null;
          const perda = antes && e.valor < antes ? (antes - e.valor) / antes : null;
          const destaque = i === pior.i;
          return (
            <div key={e.rotulo} className="relative rounded-lg bg-tinta-50 px-4 py-3">
              <p className="text-[12px] text-tinta-500">{e.rotulo}</p>
              <p className="tabular text-[24px] font-extrabold leading-tight text-tinta-900">{inteiro(e.valor)}</p>
              <p className="text-[11.5px]" style={{ color: destaque ? COR.ruim.texto : "#9b9ca4", fontWeight: destaque ? 600 : 400 }}>
                {perda != null ? `−${Math.round(perda * 100)}% da etapa anterior` : e.nota}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 3. AS CONTAS ────────────────────────────────────────────────────────────

const FRASE: Record<string, { texto: string; tom: keyof typeof COR }> = {
  subindo: { texto: "Custo subindo com o mesmo gasto", tom: "ruim" },
  cara: { texto: "A mais cara da semana", tom: "atencao" },
  barata: { texto: "A mais barata da semana", tom: "bom" },
};

export function CartoesContas({
  resumos,
  conta,
  onConta,
}: {
  resumos: ResumoConta[];
  conta: string;
  onConta: (id: string) => void;
}) {
  const subindo = resumos.filter((r) => r.leituras.includes("subindo"));
  const titulo = subindo.length
    ? `${subindo.map((r) => r.nome).join(", ")} ${subindo.length > 1 ? "ficaram" : "ficou"} mais cara${subindo.length > 1 ? "s" : ""} sem gastar mais`
    : "Nenhuma conta encareceu nos últimos 3 dias";

  return (
    <div>
      <p className="text-[15px] font-semibold text-tinta-900">{titulo}</p>
      <p className="mt-0.5 text-[13px] text-tinta-500">
        Custo por conversa nos últimos 7 dias. A linha mostra os últimos 14 — clique numa conta para ver só ela.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {resumos
          .filter((r) => r.sete.gasto > 0 || r.hoje.gasto > 0)
          .map((r) => {
            const ativa = conta === r.conta_id;
            const leitura = r.leituras.map((l) => FRASE[l]).sort((a, b) => (a.tom === "ruim" ? -1 : b.tom === "ruim" ? 1 : 0))[0];
            return (
              <button
                key={r.conta_id}
                type="button"
                onClick={() => onConta(ativa ? "" : r.conta_id)}
                className={`rounded-xl border bg-white p-4 text-left transition-colors ${
                  ativa ? "border-tema ring-2 ring-tema/20" : "border-tinta-200 hover:border-tinta-300"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[14px] font-bold text-tinta-900">{r.nome}</p>
                  <p className="tabular text-[12px] text-tinta-500">{reais(r.sete.gastoDia)}/dia</p>
                </div>

                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <p className="tabular text-[24px] font-extrabold leading-none tracking-tight text-tinta-900">
                      {r.sete.custoConversa != null ? reais(r.sete.custoConversa) : "—"}
                    </p>
                    <p className="mt-1 text-[12px] text-tinta-500">
                      por conversa · {inteiro(r.sete.conversas)} na semana
                    </p>
                  </div>
                  <Curva serie={r.serie} />
                </div>

                <div className="mt-3 flex min-h-[22px] flex-wrap items-center gap-2">
                  {leitura && (
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold"
                      style={{ color: COR[leitura.tom].texto, background: COR[leitura.tom].fundo }}
                    >
                      {leitura.texto}
                    </span>
                  )}
                  {r.variacao != null && Math.abs(r.variacao) >= 0.1 && (
                    <span className="text-[11.5px] text-tinta-500">
                      {r.variacao > 0 ? "▲" : "▼"} {Math.abs(r.variacao * 100).toFixed(0)}% nos últimos 3 dias
                    </span>
                  )}
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
}

// A curvinha do custo por conversa, 14 dias fechados. Sem eixo e sem grade de
// propósito: ela diz a DIREÇÃO, o número grande ao lado diz o valor. Dia sem
// conversa quebra a linha, em vez de ligar dois pontos distantes como se houvesse
// dado no meio.
function Curva({ serie }: { serie: ResumoConta["serie"] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const W = 132, H = 44, P = 4;
  const vals = serie.map((s) => s.custo);
  const validos = vals.filter((v): v is number => v != null);
  if (validos.length < 2) return <div style={{ width: W, height: H }} />;
  const max = Math.max(...validos), min = Math.min(...validos);
  const faixa = max - min || 1;
  const x = (i: number) => P + (i * (W - 2 * P)) / (serie.length - 1);
  const y = (v: number) => H - P - ((v - min) / faixa) * (H - 2 * P);

  let d = "";
  let aberto = false;
  vals.forEach((v, i) => {
    if (v == null) { aberto = false; return; }
    d += `${aberto ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    aberto = true;
  });
  let ult = vals.length - 1;
  while (ult >= 0 && vals[ult] == null) ult--;
  const f = foco != null ? serie[foco] : null;

  return (
    <div className="relative shrink-0" onMouseLeave={() => setFoco(null)}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <path d={d} fill="none" stroke="#0525f7" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {ult >= 0 && <circle cx={x(ult)} cy={y(vals[ult]!)} r={3.5} fill="#0525f7" stroke="#fff" strokeWidth={2} />}
        {foco != null && vals[foco] != null && (
          <circle cx={x(foco)} cy={y(vals[foco]!)} r={4} fill="#fff" stroke="#0525f7" strokeWidth={2} />
        )}
        {serie.map((_, i) => (
          <rect
            key={i}
            x={x(i) - (W - 2 * P) / (serie.length - 1) / 2}
            y={0}
            width={(W - 2 * P) / (serie.length - 1)}
            height={H}
            fill="transparent"
            onMouseEnter={() => setFoco(i)}
          />
        ))}
      </svg>
      {f && (
        <div className="pointer-events-none absolute bottom-full right-0 z-10 mb-1 whitespace-nowrap rounded-md bg-tinta-900 px-2.5 py-1.5 text-[11.5px] leading-snug text-white shadow">
          <b>{dataCurta(f.dia)}</b>
          <br />
          {f.custo != null ? `${reais(f.custo)} por conversa` : "sem conversa"}
          <br />
          {reais(f.gasto)} · {inteiro(f.conversas)} conversas
        </div>
      )}
    </div>
  );
}
