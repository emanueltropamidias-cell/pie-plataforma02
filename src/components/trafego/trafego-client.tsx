"use client";

import { useEffect, useState } from "react";
import { Cabecalho } from "@/components/ui/pagina";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, RefreshCw, AlertTriangle } from "lucide-react";
import { rotuloContaStatus, contaOk } from "@/lib/trafego-labels";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FiltroPeriodo } from "@/components/ui/filtro-periodo";
import { MetricaDialog, type Metrica } from "./metrica-dialog";
import { DashboardTrafego, type MetaCampanha } from "./dashboard-trafego";
import { RelatorioTrafego } from "./relatorio-trafego";
import { AnaliseIA } from "./analise-ia";
import { CriativosGrid, type Criativo } from "./criativos-grid";
import { Gerenciador, type Conjunto, type CampanhaAgg } from "./gerenciador";
import { MetaCampanhaDialog } from "./meta-campanha-dialog";
import { PainelHoje, CartoesContas } from "./painel-trafego";
import { resumirContas, nomeCurto, type Funil } from "@/lib/trafego/painel";

function hojeISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function dataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
function reais(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function pct(a: number, b: number) {
  if (!b) return "0%";
  return ((a / b) * 100).toFixed(2).replace(".", ",") + "%";
}

/** Uma conta de anúncio, como `trafego_contas` guarda. */
export type ContaTrafego = {
  conta_id: string;
  conta_nome: string | null;
  status: number | null;
  saldo: number | null;
  alcance: number | null;
  frequencia: number | null;
  pixel_nome: string | null;
  pixel_ultimo: string | null;
  ultima_sync: string | null;
  erro: string | null;
  erro_em: string | null;
};

// ── HÁ QUANTO TEMPO ─────────────────────────────────────────────────────────
//
// A aba ficou parada de 06/09 a 15/09 mostrando "Última sincronização: 06/09
// 17:03" — um carimbo de data que ninguém lê como alarme. "Há 8 dias", em
// vermelho, se lê. O cron roda de 5 em 5 minutos: passar de 20 já é um sync
// perdido, e passar de 60 é o cron parado.
function haQuanto(iso: string | null, agora: number) {
  if (!iso) return { texto: "nunca sincronizou", tom: "ruim" as const };
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000));
  const texto =
    min < 1 ? "agora" : min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.round(min / 60)} h` : `há ${Math.round(min / 1440)} dias`;
  return { texto, tom: min <= 20 ? ("bom" as const) : min <= 60 ? ("atencao" as const) : ("ruim" as const) };
}
const TOM = {
  bom: "bg-emerald-500",
  atencao: "bg-amber-500",
  ruim: "bg-red-500",
};

export function TrafegoClient({
  registros: todosRegistros,
  campanhasAgg: todasCampanhas,
  conjuntos: todosConjuntos,
  criativos: todosCriativos,
  metas,
  contas,
  funil,
  meuId,
  isAdmin,
}: {
  registros: Metrica[];
  campanhasAgg: CampanhaAgg[];
  conjuntos: Conjunto[];
  criativos: Criativo[];
  metas: MetaCampanha[];
  contas: ContaTrafego[];
  funil: Funil;
  meuId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();

  // ── A CONTA ────────────────────────────────────────────────────────────────
  //
  // Vazio = as cinco. O filtro corta as quatro listas pelo mesmo `conta_id`, e
  // é isso que permite comparar CA 01 com CA 02 — que era a pergunta que o PIE
  // não sabia responder quando só existia uma conta.
  const [conta, setConta] = useState("");
  const daConta = <T extends { conta_id?: string | null }>(xs: T[]) =>
    conta ? xs.filter((x) => x.conta_id === conta) : xs;
  const registros = daConta(todosRegistros);
  const campanhasAgg = daConta(todasCampanhas);
  const conjuntos = daConta(todosConjuntos);
  const criativos = daConta(todosCriativos);
  const contaSel = contas.find((c) => c.conta_id === conta) ?? null;

  // O relógio da tela. Atualiza o "há X min" a cada 30s e relê os dados do
  // servidor a cada 5 minutos — o mesmo passo do cron. Só com a aba visível:
  // uma aba esquecida aberta a noite toda não pode virar 288 leituras.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), 30_000);
    const releitura = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 5 * 60_000);
    return () => {
      clearInterval(relogio);
      clearInterval(releitura);
    };
  }, [router]);

  const maisRecente = contas.reduce<string | null>(
    (m, c) => (c.ultima_sync && (!m || c.ultima_sync > m) ? c.ultima_sync : m),
    null,
  );
  const geral = haQuanto(maisRecente, agora);
  const contasParadas = contas.filter((c) => !contaOk(c.status));
  const [aba, setAba] = useState<
    "dashboard" | "campanhas" | "registros" | "criativos"
  >("dashboard");
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [campanha, setCampanha] = useState("");
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Metrica | null>(null);
  const [relatorio, setRelatorio] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState<{
    tipo: "ok" | "erro";
    texto: string;
  } | null>(null);
  const [metaDialog, setMetaDialog] = useState<{
    campanha: string;
    rotulo: string;
  } | null>(null);

  const campanhas = [
    ...new Set(registros.map((r) => r.campanha).filter(Boolean)),
  ] as string[];
  const filtrados = registros.filter(
    (r) =>
      (!ini || r.data >= ini) &&
      (!fim || r.data <= fim) &&
      (!campanha || r.campanha === campanha),
  );

  function novo() {
    setEditando(null);
    setAberto(true);
  }
  function editar(r: Metrica) {
    setEditando(r);
    setAberto(true);
  }
  async function excluir(r: Metrica) {
    if (
      !confirm(
        `Excluir a métrica de ${dataBR(r.data)}${r.campanha ? ` (${r.campanha})` : ""}?`,
      )
    )
      return;
    const supabase = createClient();
    const { error } = await supabase
      .from("metricas_trafego")
      .delete()
      .eq("id", r.id);
    if (error) return alert("Erro: " + error.message);
    router.refresh();
  }

  async function sincronizar() {
    setSincronizando(true);
    setAviso(null);
    try {
      const resp = await fetch("/api/trafego/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Só o dia de hoje e o de ontem, das contas todas — o mesmo que o cron faz
        // de 5 em 5 minutos. O período escolhido na tela é recorte do que já está
        // no banco (três anos), e não precisa ir à Meta.
        body: JSON.stringify({ modo: "hoje" }),
      });
      const json = await resp.json();
      const res = (json?.resultados ?? []) as { conta: string; ok: boolean; erro?: string }[];
      if (!resp.ok && !res.length) {
        setAviso({ tipo: "erro", texto: json?.erro ?? "Erro ao sincronizar." });
      } else {
        const falhas = res.filter((r) => !r.ok);
        setAviso(
          falhas.length
            ? {
                tipo: "erro",
                texto: `${res.length - falhas.length} de ${res.length} contas atualizadas. Falharam: ${falhas
                  .map((f) => `${f.conta} (${f.erro})`)
                  .join("; ")}`,
              }
            : { tipo: "ok", texto: `As ${res.length} contas atualizadas agora.` },
        );
        router.refresh();
      }
    } catch {
      setAviso({ tipo: "erro", texto: "Falha de rede ao sincronizar." });
    }
    setSincronizando(false);
  }

  function exportarCSV() {
    const cols = [
      "Data",
      "Campanha",
      "Investimento",
      "Alcance",
      "Impressoes",
      "Cliques",
      "CTR",
      "Resultados",
      "Fonte",
    ];
    const linhas = filtrados.map((r) =>
      [
        dataBR(r.data),
        (r.campanha ?? "").replace(/[\r\n;]+/g, " "),
        r.gasto.toFixed(2).replace(".", ","),
        r.alcance,
        r.impressoes,
        r.cliques,
        pct(r.cliques, r.impressoes),
        r.resultados,
        r.fonte === "meta" ? "Meta" : "Manual",
      ].join(";"),
    );
    const csv = "﻿" + [cols.join(";"), ...linhas].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trafego_${hojeISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const podeEditar = (r: Metrica) => isAdmin || r.criado_por === meuId;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <Cabecalho
          voltar="/atendimento"
          sobretitulo="Análise"
          titulo="Tráfego pago"
          descricao="Investimento e resultados das campanhas do Gerenciador de Anúncios."
        />
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            onClick={sincronizar}
            disabled={sincronizando}
          >
            <RefreshCw
              size={15}
              className={sincronizando ? "animate-spin" : ""}
            />
            {sincronizando ? "Atualizando..." : "Atualizar agora"}
          </Button>
          <Button onClick={novo}>+ Novo</Button>
        </div>
      </header>

      {aviso && (
        <div
          className={`mt-4 rounded-lg px-4 py-2.5 text-sm print:hidden ${
            aviso.tipo === "ok"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {aviso.texto}
        </div>
      )}

      {contasParadas.map((c) => (
        <div
          key={c.conta_id}
          className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 print:hidden"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            <b>
              {c.conta_nome}: {rotuloContaStatus(c.status) ?? "situação desconhecida"}.
            </b>{" "}
            Mesmo com campanhas marcadas como &quot;Ativa&quot;, os anúncios desta conta{" "}
            <b>não estão sendo veiculados</b> enquanto ela estiver assim.
            {c.saldo ? ` Saldo devedor: ${reais(c.saldo)}.` : ""}
          </span>
        </div>
      ))}

      {/* ── A SITUAÇÃO DAS CONTAS ────────────────────────────────────────────
          Uma pastilha por conta, clicável: é também o filtro. Cada uma tem a
          sua bolinha de "há quanto tempo", porque uma conta pode travar sozinha
          — token sem acesso a ela, conta desativada — enquanto as outras
          seguem. Com um carimbo só, isso passaria despercebido. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-tema/[0.04] px-3 py-2 text-[12.5px] text-tinta-600 print:hidden">
        <span className="mr-1 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${TOM[geral.tom]}`} />
          <b className="text-tinta-800">Atualizado {geral.texto}</b>
        </span>
        <button
          onClick={() => setConta("")}
          className={`rounded-md border px-2.5 py-1 font-semibold transition-colors ${
            !conta ? "border-tema bg-tema text-white" : "border-tinta-200 bg-white text-tinta-600 hover:border-tinta-300"
          }`}
        >
          Todas as contas
        </button>
        {contas.map((c) => {
          const h = haQuanto(c.ultima_sync, agora);
          const tom = c.erro ? "ruim" : h.tom;
          const ativa = conta === c.conta_id;
          return (
            <button
              key={c.conta_id}
              onClick={() => setConta(ativa ? "" : c.conta_id)}
              title={
                c.erro
                  ? `Último erro (${c.erro_em ? new Date(c.erro_em).toLocaleString("pt-BR") : ""}): ${c.erro}`
                  : `Sincronizada ${h.texto}`
              }
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-semibold transition-colors ${
                ativa ? "border-tema bg-tema text-white" : "border-tinta-200 bg-white text-tinta-700 hover:border-tinta-300"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${TOM[tom]}`} />
              {(c.conta_nome ?? c.conta_id).replace(/\s+/g, " ")}
            </button>
          );
        })}
      </div>

      {contas.some((c) => c.erro) && (
        <p className="mt-2 text-[12px] text-red-700 print:hidden">
          {contas
            .filter((c) => c.erro)
            .map((c) => `${(c.conta_nome ?? c.conta_id).replace(/\s+/g, " ")}: ${c.erro}`)
            .join(" · ")}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="inline-flex rounded-lg border border-tinta-200 bg-white p-1">
          <button
            onClick={() => setAba("dashboard")}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${aba === "dashboard" ? "bg-tema text-white" : "text-tinta-600 hover:bg-tinta-50"}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setAba("campanhas")}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${aba === "campanhas" ? "bg-tema text-white" : "text-tinta-600 hover:bg-tinta-50"}`}
          >
            Gerenciador
          </button>
          <button
            onClick={() => setAba("registros")}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${aba === "registros" ? "bg-tema text-white" : "text-tinta-600 hover:bg-tinta-50"}`}
          >
            Registros
          </button>
          <button
            onClick={() => setAba("criativos")}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${aba === "criativos" ? "bg-tema text-white" : "text-tinta-600 hover:bg-tinta-50"}`}
          >
            Criativos
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {campanhas.length > 0 && (
            <select
              value={campanha}
              onChange={(e) => setCampanha(e.target.value)}
              className="h-9 rounded-md border border-input bg-white px-2 text-[13px] outline-none"
            >
              <option value="">Todas as campanhas</option>
              {campanhas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <FiltroPeriodo
            ini={ini}
            fim={fim}
            onChange={(i, f) => {
              setIni(i);
              setFim(f);
            }}
          />
          <Button variant="outline" className="h-9" onClick={exportarCSV}>
            CSV
          </Button>
          <Button
            variant="outline"
            className="h-9"
            onClick={() => setRelatorio(true)}
          >
            Relatório
          </Button>
        </div>
      </div>

      {aba === "dashboard" ? (
        <>
          {/* O topo operacional: a janela escolhida, o funil de ontem e as
              contas. O painel de cima SEGUE o filtro de período desde 21/09 —
              ficar fixo em hoje logo abaixo do seletor fazia "Ontem" parecer
              quebrado. Os cartões de conta continuam em janela fixa, porque
              comparam contas entre si e precisam da mesma régua. */}
          <div className="mt-6 flex flex-col gap-6">
            <PainelHoje
              linhas={registros}
              todasLinhas={todosRegistros}
              funil={funil}
              umaConta={contaSel ? nomeCurto(contaSel.conta_nome, contaSel.conta_id) : null}
              ini={ini}
              fim={fim}
            />
            <CartoesContas
              resumos={resumirContas(todosRegistros, contas)}
              conta={conta}
              onConta={setConta}
            />
          </div>

          <div className="mt-10 border-t border-tinta-200 pt-6">
            <p className="text-[15px] font-semibold text-tinta-900">Diagnóstico do período</p>
            <p className="mt-0.5 text-[13px] text-tinta-500">
              Alcance, cliques, CPM e o resto — segue o período e a campanha escolhidos acima.
            </p>
          </div>
          <DashboardTrafego
            registros={filtrados}
            metas={metas}
            isAdmin={isAdmin}
            onDefinirMeta={(camp, rot) =>
              setMetaDialog({ campanha: camp, rotulo: rot })
            }
            // Alcance e frequência ÚNICOS só existem por conta: quem viu
            // anúncio de duas contas é uma pessoa, e somar as cinco contaria
            // duas vezes. Com "Todas as contas", o número único não é passado e
            // o painel cai no cálculo dele — que é aproximado, e não inventado.
            alcanceReal={
              !ini && !fim && contaSel ? (contaSel.alcance ?? undefined) : undefined
            }
            frequenciaReal={
              !ini && !fim && contaSel ? (contaSel.frequencia ?? undefined) : undefined
            }
          />
          <div className="mt-6">
            <AnaliseIA
              registros={filtrados}
              ini={ini}
              fim={fim}
              campanha={campanha}
            />
          </div>
        </>
      ) : aba === "campanhas" ? (
        <Gerenciador
          registros={filtrados}
          campanhasAgg={campanhasAgg}
          usarAgg={!ini && !fim}
          conjuntos={conjuntos}
          criativos={criativos}
          metas={metas}
          isAdmin={isAdmin}
          onDefinirMeta={(camp, rot) =>
            setMetaDialog({ campanha: camp, rotulo: rot })
          }
        />
      ) : aba === "registros" ? (
        <div className="mt-6 overflow-x-auto rounded-xl border border-tinta-200 bg-white shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-tinta-200 text-left text-[12px] uppercase tracking-wide text-tinta-500">
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Campanha</th>
                <th className="px-4 py-3 text-right">Investimento</th>
                <th className="px-4 py-3 text-right">Impressões</th>
                <th className="px-4 py-3 text-right">Cliques</th>
                <th className="px-4 py-3 text-right">CTR</th>
                <th className="px-4 py-3 text-right">Resultados</th>
                <th className="px-4 py-3">Fonte</th>
                <th className="px-4 py-3 print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-tinta-500"
                  >
                    Nenhum dado no período para esta seleção.
                  </td>
                </tr>
              ) : (
                filtrados.map((r) => (
                  <tr key={r.id} className="border-b border-tinta-100">
                    <td className="px-4 py-3 font-medium text-tinta-900">
                      {dataBR(r.data)}
                    </td>
                    <td className="px-4 py-3 text-tinta-600">
                      {r.campanha ?? <span className="text-tinta-300">-</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-tinta-900">
                      {reais(r.gasto)}
                    </td>
                    <td className="px-4 py-3 text-right text-tinta-600">
                      {r.impressoes.toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-right text-tinta-600">
                      {r.cliques.toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-right text-tinta-500">
                      {pct(r.cliques, r.impressoes)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[#059669]">
                      {r.resultados.toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          r.fonte === "meta"
                            ? "bg-tema/[0.07] text-tema"
                            : "bg-tinta-100 text-tinta-500"
                        }`}
                      >
                        {r.fonte === "meta" ? "Meta" : "Manual"}
                      </span>
                    </td>
                    <td className="px-4 py-3 print:hidden">
                      {podeEditar(r) && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => editar(r)}
                            className="rounded-md p-2 text-tinta-400 hover:bg-tinta-100 hover:text-tinta-700"
                            aria-label="Editar"
                          >
                            <Pencil size={15} />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => excluir(r)}
                              className="rounded-md p-2 text-tinta-400 hover:bg-red-50 hover:text-red-600"
                              aria-label="Excluir"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <CriativosGrid criativos={criativos} />
      )}

      <MetricaDialog
        metrica={editando}
        meuId={meuId}
        aberto={aberto}
        onOpenChange={setAberto}
      />

      {relatorio && (
        <RelatorioTrafego
          registros={filtrados}
          ini={ini}
          fim={fim}
          campanha={campanha}
          onFechar={() => setRelatorio(false)}
        />
      )}

      <MetaCampanhaDialog
        campanha={metaDialog?.campanha ?? null}
        rotuloSugerido={metaDialog?.rotulo ?? ""}
        metaAtual={
          metaDialog
            ? (metas.find((m) => m.campanha === metaDialog.campanha)?.meta ?? 0)
            : 0
        }
        meuId={meuId}
        aberto={!!metaDialog}
        onOpenChange={(v) => {
          if (!v) setMetaDialog(null);
        }}
      />
    </>
  );
}
