"use client";

import { useMemo, useState } from "react";
import { ChevronRight, CircleAlert, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Cabecalho } from "@/components/ui/pagina";
import { DemandaDialog } from "./demanda-dialog";
import { DemandaDetalhe } from "./demanda-detalhe";
import { IconeCategoria } from "./icone-categoria";
import {
  CATEGORIAS,
  STATUS,
  cor,
  humanizar,
  rotulo,
  type Demanda,
} from "./constantes";

function dataBR(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}
function diasDe(iso: string) {
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}

/** Indicador de topo: número grande, e a cor só quando ela quer dizer algo. */
function Contador({
  rotulo: texto,
  valor,
  tom,
  ativo,
  onClick,
}: {
  rotulo: string;
  valor: number;
  tom: string;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border bg-white px-5 py-4 text-left transition-colors ${
        ativo ? "border-tinta-900" : "border-tinta-200 hover:border-tinta-300"
      }`}
    >
      <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-tinta-500">
        {texto}
      </p>
      <p
        className={`tabular mt-2 text-[30px] font-extrabold leading-none ${tom}`}
      >
        {valor}
      </p>
    </button>
  );
}

export function DemandasClient({
  demandas,
  meuId,
  isAdmin,
}: {
  demandas: Demanda[];
  meuId: string;
  isAdmin: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("abertas");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Demanda | null>(null);
  const [lendo, setLendo] = useState<Demanda | null>(null);

  const hoje = new Date().toISOString().slice(0, 10);
  const abertas = demandas.filter(
    (d) => d.status === "aberta" || d.status === "andamento",
  );
  const resolvidas = demandas.filter((d) => d.status === "resolvida");
  // Atrasada = tem prazo e o prazo passou. É o que o gabinete precisa ver primeiro.
  const atrasadas = abertas.filter((d) => d.prazo && d.prazo < hoje);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return demandas.filter((d) => {
      if (
        filtroStatus === "abertas" &&
        (d.status === "resolvida" || d.status === "sem_solucao")
      )
        return false;
      if (filtroStatus === "atrasadas") {
        const atrasada =
          d.prazo &&
          d.prazo < hoje &&
          d.status !== "resolvida" &&
          d.status !== "sem_solucao";
        if (!atrasada) return false;
      } else if (
        filtroStatus !== "abertas" &&
        filtroStatus &&
        d.status !== filtroStatus
      ) {
        return false;
      }
      if (filtroCategoria && d.categoria !== filtroCategoria) return false;
      if (!q) return true;
      return (
        d.titulo.toLowerCase().includes(q) ||
        (d.descricao ?? "").toLowerCase().includes(q) ||
        (d.municipe_nome ?? "").toLowerCase().includes(q) ||
        (d.municipio ?? "").toLowerCase().includes(q) ||
        (d.bairro ?? "").toLowerCase().includes(q)
      );
    });
  }, [demandas, busca, filtroStatus, filtroCategoria, hoje]);

  // Clicar no contador filtra: o número vira caminho em vez de enfeite.
  function alternar(valor: string) {
    setFiltroStatus((v) => (v === valor ? "" : valor));
  }

  return (
    <>
      <Cabecalho
        voltar="/gabinete"
        sobretitulo="Mandato"
        titulo="Demandas"
        descricao="O que o munícipe pediu, em que pé está e o que já foi resolvido."
        acoes={
          <Button
            onClick={() => {
              setEditando(null);
              setAberto(true);
            }}
          >
            + Nova demanda
          </Button>
        }
      />

      <div className="mt-7 grid grid-cols-3 gap-4">
        <Contador
          rotulo="Em aberto"
          valor={abertas.length}
          tom="text-tinta-900"
          ativo={filtroStatus === "abertas"}
          onClick={() => alternar("abertas")}
        />
        <Contador
          rotulo="Atrasadas"
          valor={atrasadas.length}
          tom={atrasadas.length ? "text-red-600" : "text-tinta-900"}
          ativo={filtroStatus === "atrasadas"}
          onClick={() => alternar("atrasadas")}
        />
        <Contador
          rotulo="Resolvidas"
          valor={resolvidas.length}
          tom="text-emerald-600"
          ativo={filtroStatus === "resolvida"}
          onClick={() => alternar("resolvida")}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-400"
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por pedido, pessoa, bairro ou município…"
            className="h-10 pl-9"
          />
        </div>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="h-10 rounded-md border border-input bg-white px-3 text-[13px] outline-none"
        >
          <option value="abertas">Em aberto</option>
          <option value="atrasadas">Atrasadas</option>
          <option value="">Todas</option>
          {STATUS.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.rotulo}
            </option>
          ))}
        </select>
        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="h-10 rounded-md border border-input bg-white px-3 text-[13px] outline-none"
        >
          <option value="">Todas as áreas</option>
          {CATEGORIAS.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.rotulo}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-tinta-200 bg-white shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
        <div className="flex items-center justify-between border-b border-tinta-100 px-5 py-2.5">
          <p className="text-[11.5px] text-tinta-500">
            <b className="tabular text-tinta-800">{lista.length}</b>{" "}
            {lista.length === 1 ? "demanda" : "demandas"}
          </p>
          <p className="text-[11.5px] text-tinta-400">
            Clique numa linha para ler tudo
          </p>
        </div>

        {lista.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-tinta-500">
            {demandas.length === 0
              ? 'Nenhuma demanda registrada. Clique em "Nova demanda" para começar.'
              : "Nenhuma demanda neste filtro."}
          </p>
        ) : (
          lista.map((d) => {
            const atrasada =
              d.prazo &&
              d.prazo < hoje &&
              d.status !== "resolvida" &&
              d.status !== "sem_solucao";
            const local = [d.municipio, d.bairro].filter(Boolean).join(" · ");
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setLendo(d)}
                className="flex w-full items-center gap-3.5 border-b border-tinta-100 px-5 py-3.5 text-left transition-colors last:border-0 hover:bg-tinta-50"
              >
                <IconeCategoria valor={d.categoria} />

                <div className="min-w-0 flex-1">
                  {/* Duas linhas no máximo: a lista serve para varrer e escolher,
                      não para ler. O texto inteiro está a um clique. */}
                  <p className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-tinta-900">
                    {humanizar(d.titulo)}
                  </p>
                  <p className="mt-1 truncate text-[12px] text-tinta-500">
                    <span className="font-medium text-tinta-700">
                      {d.municipe_nome ?? "Sem nome"}
                    </span>
                    {local && <> · {local}</>} · há {diasDe(d.created_at)}{" "}
                    dia(s)
                    {d.prazo && (
                      <>
                        {" "}
                        · prazo{" "}
                        <span
                          className={
                            atrasada ? "font-semibold text-red-600" : ""
                          }
                        >
                          {dataBR(d.prazo)}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                  {atrasada && (
                    <span
                      title="Prazo vencido"
                      className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white"
                    >
                      <CircleAlert size={11} /> Atrasada
                    </span>
                  )}
                  {d.prioridade === "alta" && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-inset ring-red-200">
                      Alta
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${cor(STATUS, d.status)}`}
                  >
                    {rotulo(STATUS, d.status)}
                  </span>
                </div>

                <ChevronRight size={16} className="shrink-0 text-tinta-300" />
              </button>
            );
          })
        )}
      </div>

      <DemandaDetalhe
        demanda={lendo}
        isAdmin={isAdmin}
        onFechar={() => setLendo(null)}
        onEditar={(d) => {
          setLendo(null);
          setEditando(d);
          setAberto(true);
        }}
      />

      <DemandaDialog
        demanda={editando}
        meuId={meuId}
        aberto={aberto}
        onOpenChange={setAberto}
      />
    </>
  );
}
