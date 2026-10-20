"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, MapPin, MessageSquare, Pencil, Phone, Trash2, User, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { IconeCategoria } from "./icone-categoria";
import { STATUS, categoria, cor, humanizar, rotulo, type Demanda } from "./constantes";

// Painel de leitura.
//
// Na lista, o pedido precisa caber em duas linhas para caber a triagem do dia.
// Aqui ele aparece inteiro: o texto como a pessoa falou, o contato para ligar
// de volta e o campo de resposta. Ler e responder no mesmo lugar evita o
// vaivém entre lista e formulário.

function dataBR(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function dias(iso: string) {
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}

/** Acha um telefone solto no meio do texto, para virar botão de ligar. */
function acharTelefone(...textos: (string | null)[]) {
  for (const t of textos) {
    const m = (t ?? "").match(/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/);
    if (m) return m[0];
  }
  return null;
}

export function DemandaDetalhe({
  demanda,
  isAdmin,
  onFechar,
  onEditar,
}: {
  demanda: Demanda | null;
  isAdmin: boolean;
  onFechar: () => void;
  onEditar: (d: Demanda) => void;
}) {
  const router = useRouter();
  const [resposta, setResposta] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    setResposta(demanda?.resposta ?? "");
    setErro("");
  }, [demanda]);

  useEffect(() => {
    if (!demanda) return;
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [demanda, onFechar]);

  if (!demanda) return null;

  const d = demanda;
  const hoje = new Date().toISOString().slice(0, 10);
  const atrasada = !!d.prazo && d.prazo < hoje && d.status !== "resolvida" && d.status !== "sem_solucao";
  const tel = acharTelefone(d.descricao, d.municipe_nome);
  const area = categoria(d.categoria);

  async function gravar(campos: Partial<Demanda>) {
    setSalvando(true);
    setErro("");
    const supabase = createClient();
    const { error } = await supabase.from("demandas").update(campos).eq("id", d.id);
    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    router.refresh();
  }

  async function excluir() {
    if (!confirm(`Excluir a demanda "${humanizar(d.titulo)}"?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("demandas").delete().eq("id", d.id);
    if (error) return setErro(error.message);
    onFechar();
    router.refresh();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-tinta-900/25 backdrop-blur-[1px]"
        onClick={onFechar}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label="Detalhe da demanda"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col border-l border-tinta-200 bg-white shadow-[0_0_40px_rgba(22,32,46,0.18)]"
      >
        <header className="flex items-start gap-3 border-b border-tinta-100 px-5 py-4">
          <IconeCategoria valor={d.categoria} tamanho={40} />
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: area.cor }}>
              {area.rotulo}
            </p>
            <h2 className="mt-0.5 text-[17px] font-bold leading-snug text-tinta-900">
              {humanizar(d.titulo)}
            </h2>
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="shrink-0 rounded-md p-1.5 text-tinta-400 transition-colors hover:bg-tinta-100 hover:text-tinta-700"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${cor(STATUS, d.status)}`}>
              {rotulo(STATUS, d.status)}
            </span>
            {d.prioridade === "alta" && (
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10.5px] font-bold text-red-700 ring-1 ring-inset ring-red-200">
                Prioridade alta
              </span>
            )}
            {atrasada && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-[10.5px] font-bold text-white">
                <CircleAlert size={12} /> Prazo vencido
              </span>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-[18px_1fr] gap-x-2.5 gap-y-3 text-[13px]">
            <User size={15} className="mt-0.5 text-tinta-400" />
            <div>
              <dt className="sr-only">Quem pediu</dt>
              <dd className="font-semibold text-tinta-900">{d.municipe_nome ?? "Sem nome"}</dd>
            </div>

            <MapPin size={15} className="mt-0.5 text-tinta-400" />
            <div>
              <dt className="sr-only">Onde</dt>
              <dd className="text-tinta-700">
                {[d.municipio, d.bairro].filter(Boolean).join(" · ") || "Local não informado"}
              </dd>
            </div>

            {tel && (
              <>
                <Phone size={15} className="mt-0.5 text-tinta-400" />
                <div>
                  <dt className="sr-only">Telefone</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <span className="tabular text-tinta-700">{tel}</span>
                    <a
                      href={`https://api.whatsapp.com/send?phone=55${tel.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11.5px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 transition-colors hover:bg-emerald-100"
                    >
                      <MessageSquare size={12} /> Falar no WhatsApp
                    </a>
                  </dd>
                </div>
              </>
            )}
          </dl>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-y border-tinta-100 py-2.5 text-[11.5px] text-tinta-500">
            <span>
              Aberta há <b className="tabular text-tinta-700">{dias(d.created_at)}</b> dia(s)
            </span>
            {d.prazo && (
              <span>
                Prazo <b className={atrasada ? "text-red-600" : "text-tinta-700"}>{dataBR(d.prazo)}</b>
              </span>
            )}
            {d.resolvida_em && (
              <span>
                Resolvida em <b className="text-tinta-700">{dataBR(d.resolvida_em)}</b>
              </span>
            )}
          </div>

          <section className="mt-4">
            <h3 className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-tinta-500">
              O que foi pedido
            </h3>
            {/* whitespace-pre-line: a atendente quebra linha ao anotar, e a
                quebra costuma separar informações diferentes. */}
            <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-tinta-800">
              {d.descricao?.trim() || (
                <span className="text-tinta-400">
                  Sem descrição. O título é tudo que foi registrado.
                </span>
              )}
            </p>
          </section>

          <section className="mt-5">
            <h3 className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-tinta-500">
              Resposta do gabinete
            </h3>
            <textarea
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
              rows={4}
              placeholder="O que foi feito, com quem foi falado, o que ficou combinado…"
              className="mt-2 w-full rounded-lg border border-input bg-white px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-tema"
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={salvando || resposta === (d.resposta ?? "")}
              onClick={() => gravar({ resposta: resposta.trim() || null })}
            >
              {salvando ? "Salvando…" : "Salvar resposta"}
            </Button>
          </section>

          {erro && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              {erro}
            </p>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-tinta-100 px-5 py-3">
          <select
            value={d.status}
            onChange={(e) =>
              gravar({
                status: e.target.value,
                // Quem marca como resolvida está dizendo "acabou hoje".
                resolvida_em:
                  e.target.value === "resolvida" ? new Date().toISOString().slice(0, 10) : null,
              })
            }
            disabled={salvando}
            className="h-9 flex-1 rounded-md border border-input bg-white px-2.5 text-[13px] outline-none"
            aria-label="Situação"
          >
            {STATUS.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.rotulo}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => onEditar(d)}>
            <Pencil size={14} /> Editar
          </Button>
          {isAdmin && (
            <button
              onClick={excluir}
              aria-label="Excluir demanda"
              className="rounded-md p-2 text-tinta-400 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={16} />
            </button>
          )}
        </footer>
      </aside>
    </>
  );
}
