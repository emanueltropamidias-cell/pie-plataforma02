"use client";

import { useEffect, useState } from "react";
import { X, Plus, Trash2, Star, Clock, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// O formulário de um setor.
//
// POR QUE UM PAINEL E NÃO EDIÇÃO NA LISTA.
//
// A lista editava tudo no lugar, o que é bom para trocar um nome e ruim para
// configurar um setor: horário de funcionamento, SLA e roteamento não cabem numa
// linha, e espremer isso ali faria a lista virar um formulário disfarçado. Aqui
// a lista serve para VER a operação inteira de relance, e o painel para MEXER
// num setor por vez.

export type Turno = { id?: number; dia: number; abre: string; fecha: string };

export type SetorCompleto = {
  id: number;
  nome: string;
  cor: string;
  descricao: string | null;
  ativo: boolean;
  padrao: boolean;
  auto_atribuir: boolean;
  sla_resposta_min: number;
  palavras_chave: string[];
  fuso: string;
};

// 0 = domingo, a mesma convenção do `dow` do Postgres. A ordem de exibição
// começa na segunda porque é assim que se lê uma escala de trabalho.
const DIAS = [
  { n: 1, curto: "Seg" },
  { n: 2, curto: "Ter" },
  { n: 3, curto: "Qua" },
  { n: 4, curto: "Qui" },
  { n: 5, curto: "Sex" },
  { n: 6, curto: "Sáb" },
  { n: 0, curto: "Dom" },
];

const CORES = [
  "#0525f7",
  "#12703c",
  "#8a6009",
  "#5b34c9",
  "#c2185b",
  "#0e7490",
  "#c02020",
  "#52535c",
];

/** "15 min", "4 h", "1 dia" — para o número na caixa ter sentido humano ao lado. */
function emPalavras(min: number) {
  if (min < 60) return `${min} min`;
  if (min < 1440)
    return `${Math.round((min / 60) * 10) / 10} h`.replace(".", ",");
  return `${Math.round((min / 1440) * 10) / 10} dia(s)`.replace(".", ",");
}

export function EditorSetor({
  setor,
  ehPadrao,
  aoFechar,
  aoSalvar,
}: {
  setor: SetorCompleto;
  /** O padrão não sai: sem ele, conversa nova não cai em setor nenhum. */
  ehPadrao: boolean;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const supabase = createClient();
  const [f, setF] = useState<SetorCompleto>(setor);
  const [turnos, setTurnos] = useState<Turno[] | null>(null);
  const [chaves, setChaves] = useState(setor.palavras_chave.join(", "));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [quantas, setQuantas] = useState<number | null>(null);

  // ── EXCLUIR ────────────────────────────────────────────────────────────────
  //
  // Duas etapas, como na exclusão de conta: a primeira conta o que existe no
  // setor, a segunda executa. Aqui o número que importa é quantas conversas
  // moram nele.
  //
  // E elas NÃO ficam órfãs. A chave estrangeira diria "põe nulo", e conversa
  // sem setor some do organograma sem sumir da fila — fica num limbo que
  // ninguém procura. Antes de apagar, tudo é movido para o setor padrão.
  async function pedirExclusao() {
    setErro(null);
    const { count } = await supabase
      .from("conversas")
      .select("id", { count: "exact", head: true })
      .eq("departamento_id", setor.id);
    setQuantas(count ?? 0);
    setConfirmando(true);
  }

  async function excluir() {
    setSalvando(true);
    setErro(null);

    const { data: padrao } = await supabase
      .from("departamentos")
      .select("id")
      .eq("padrao", true)
      .neq("id", setor.id)
      .maybeSingle();

    if (!padrao) {
      setSalvando(false);
      setErro(
        "Não há outro setor marcado como padrão para receber as conversas deste. Marque um antes.",
      );
      return;
    }

    // A ordem importa: mover primeiro. Se algo falhar no meio, o pior caso é
    // conversa já movida e setor ainda existindo — reversível. O contrário
    // deixaria conversa apontando para setor que não existe mais.
    if ((quantas ?? 0) > 0) {
      const { error: e1 } = await supabase
        .from("conversas")
        .update({ departamento_id: padrao.id })
        .eq("departamento_id", setor.id);
      if (e1) {
        setSalvando(false);
        setErro(`Não consegui mover as conversas: ${e1.message}`);
        return;
      }
    }

    const { error: e2 } = await supabase
      .from("departamentos")
      .delete()
      .eq("id", setor.id);
    setSalvando(false);
    if (e2) {
      setErro(
        `As conversas foram movidas, mas o setor não foi apagado: ${e2.message}`,
      );
      return;
    }
    aoSalvar();
  }

  useEffect(() => {
    let vivo = true;
    supabase
      .from("departamento_turnos")
      .select("id, dia, abre, fecha")
      .eq("departamento_id", setor.id)
      .order("dia")
      .order("abre")
      .then(({ data }) => {
        if (!vivo) return;
        setTurnos(
          (data ?? []).map((t) => ({
            id: t.id,
            dia: t.dia,
            // O Postgres devolve "08:00:00"; o input type=time quer "08:00".
            abre: String(t.abre).slice(0, 5),
            fecha: String(t.fecha).slice(0, 5),
          })),
        );
      });
    return () => {
      vivo = false;
    };
  }, [setor.id, supabase]);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [aoFechar]);

  async function salvar() {
    setSalvando(true);
    setErro(null);

    const { error: e1 } = await supabase
      .from("departamentos")
      .update({
        nome: f.nome.trim(),
        cor: f.cor,
        descricao: f.descricao?.trim() || null,
        ativo: f.ativo,
        padrao: f.padrao,
        auto_atribuir: f.auto_atribuir,
        sla_resposta_min: f.sla_resposta_min,
        palavras_chave: chaves
          .split(",")
          .map((p) => p.trim().toLowerCase())
          .filter(Boolean),
      })
      .eq("id", f.id);

    if (e1) {
      setSalvando(false);
      setErro(e1.message);
      return;
    }

    // Os turnos são reescritos por inteiro: apagar e inserir é mais simples e
    // mais seguro que casar cada linha com a que existia, e são meia dúzia de
    // registros. O que não pode é sobrar turno antigo de um dia que a pessoa
    // acabou de fechar.
    if (turnos) {
      await supabase
        .from("departamento_turnos")
        .delete()
        .eq("departamento_id", f.id);
      if (turnos.length > 0) {
        const { error: e2 } = await supabase.from("departamento_turnos").insert(
          turnos.map((t) => ({
            departamento_id: f.id,
            dia: t.dia,
            abre: t.abre,
            fecha: t.fecha,
          })),
        );
        if (e2) {
          setSalvando(false);
          setErro(
            `Os dados do setor foram salvos, mas os turnos não: ${e2.message}`,
          );
          return;
        }
      }
    }

    setSalvando(false);
    aoSalvar();
  }

  function turnosDoDia(dia: number) {
    return (turnos ?? []).filter((t) => t.dia === dia);
  }

  function abrirDia(dia: number) {
    setTurnos([...(turnos ?? []), { dia, abre: "08:00", fecha: "18:00" }]);
  }

  function fecharDia(dia: number) {
    setTurnos((turnos ?? []).filter((t) => t.dia !== dia));
  }

  function mudarTurno(alvo: Turno, campo: "abre" | "fecha", valor: string) {
    setTurnos(
      (turnos ?? []).map((t) => (t === alvo ? { ...t, [campo]: valor } : t)),
    );
  }

  const semTurno = (turnos ?? []).length === 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={aoFechar} />

      <div className="relative flex h-full w-full max-w-[620px] flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-tinta-200 px-6 py-4">
          <div>
            <h2 className="text-[17px] font-bold tracking-[-0.01em] text-tinta-900">
              {f.nome || "Setor"}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-tinta-500">
              Como este setor recebe e responde.
            </p>
          </div>
          <button
            onClick={aoFechar}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-tinta-400 hover:bg-tinta-100 hover:text-tinta-900"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {erro && (
            <p className="mb-4 rounded-lg border border-[#f3d3d3] bg-[#fdf1f1] px-3 py-2 text-[12.5px] text-[#c02020]">
              {erro}
            </p>
          )}

          {/* ── identidade ─────────────────────────────────────────────── */}
          <Bloco titulo="Identidade">
            <Campo rotulo="Nome do setor">
              <input
                value={f.nome}
                onChange={(e) => setF({ ...f, nome: e.target.value })}
                placeholder="Ex.: Gabinete Salvador, Jurídico, Ouvidoria"
                className="h-9 w-full rounded-md border border-tinta-200 px-2.5 text-[13px] outline-none focus:border-tema"
              />
            </Campo>

            <Campo
              rotulo="Descrição"
              nota="Aparece para a atendente na hora de escolher o destino da transferência."
            >
              <input
                value={f.descricao ?? ""}
                onChange={(e) => setF({ ...f, descricao: e.target.value })}
                placeholder="Capital e região metropolitana"
                className="h-9 w-full rounded-md border border-tinta-200 px-2.5 text-[13px] outline-none focus:border-tema"
              />
            </Campo>

            <Campo rotulo="Cor">
              <div className="flex gap-1.5">
                {CORES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setF({ ...f, cor: c })}
                    aria-label={`Cor ${c}`}
                    className={`h-7 w-7 rounded-md ring-1 ring-inset ring-black/10 ${
                      f.cor === c
                        ? "outline outline-2 outline-offset-2 outline-tinta-900"
                        : ""
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </Campo>
          </Bloco>

          {/* ── funcionamento ──────────────────────────────────────────── */}
          <Bloco
            titulo="Horário de funcionamento"
            nota="Fora do horário, a espera não conta contra a equipe."
          >
            {semTurno && (
              <p className="mb-3 rounded-md border border-tinta-200 bg-tinta-50 px-3 py-2 text-[12px] leading-relaxed text-tinta-600">
                <b>Sem horário definido: aberto sempre.</b> É o padrão de
                propósito — setor sem configuração funciona, em vez de a
                operação parar por esquecimento. Marque os dias abaixo para
                definir uma escala.
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              {DIAS.map((d) => {
                const meus = turnosDoDia(d.n);
                const aberto = meus.length > 0;
                return (
                  <div
                    key={d.n}
                    className={`rounded-md border px-2.5 py-2 ${
                      aberto
                        ? "border-tinta-200 bg-white"
                        : "border-tinta-100 bg-tinta-50"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() =>
                          aberto ? fecharDia(d.n) : abrirDia(d.n)
                        }
                        className={`h-[18px] w-[32px] shrink-0 rounded-full transition-colors ${
                          aberto ? "bg-[#12703c]" : "bg-tinta-300"
                        }`}
                        aria-label={
                          aberto ? `Fechar ${d.curto}` : `Abrir ${d.curto}`
                        }
                      >
                        <span
                          className={`block h-[14px] w-[14px] rounded-full bg-white transition-all ${
                            aberto ? "ml-[16px]" : "ml-[2px]"
                          }`}
                        />
                      </button>
                      <span
                        className={`w-[34px] shrink-0 text-[12.5px] font-semibold ${
                          aberto ? "text-tinta-900" : "text-tinta-400"
                        }`}
                      >
                        {d.curto}
                      </span>

                      {!aberto && (
                        <span className="text-[12px] text-tinta-400">
                          fechado
                        </span>
                      )}

                      {aberto && (
                        <button
                          onClick={() => abrirDia(d.n)}
                          className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold text-tema hover:bg-tema/10"
                        >
                          <Plus size={11} strokeWidth={2.6} />
                          turno
                        </button>
                      )}
                    </div>

                    {meus.map((t, i) => (
                      <div
                        key={i}
                        className="mt-1.5 flex items-center gap-2 pl-[45px]"
                      >
                        <Clock size={12} className="shrink-0 text-tinta-300" />
                        <input
                          type="time"
                          value={t.abre}
                          onChange={(e) =>
                            mudarTurno(t, "abre", e.target.value)
                          }
                          className="h-7 rounded-md border border-tinta-200 px-1.5 text-[12.5px] outline-none focus:border-tema"
                        />
                        <span className="text-[12px] text-tinta-400">até</span>
                        <input
                          type="time"
                          value={t.fecha}
                          onChange={(e) =>
                            mudarTurno(t, "fecha", e.target.value)
                          }
                          className="h-7 rounded-md border border-tinta-200 px-1.5 text-[12.5px] outline-none focus:border-tema"
                        />
                        {t.fecha <= t.abre && (
                          <span className="text-[11px] font-semibold text-[#c02020]">
                            fim antes do início
                          </span>
                        )}
                        {meus.length > 1 && (
                          <button
                            onClick={() =>
                              setTurnos((turnos ?? []).filter((x) => x !== t))
                            }
                            aria-label="Remover turno"
                            className="text-tinta-300 hover:text-[#c02020]"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </Bloco>

          {/* ── comportamento ──────────────────────────────────────────── */}
          <Bloco titulo="Como este setor recebe">
            <Chave
              ligada={f.padrao}
              onMuda={() => setF({ ...f, padrao: !f.padrao })}
              icone={<Star size={13} strokeWidth={2.4} />}
              titulo="Setor padrão"
              nota="Recebe toda conversa que chega sem destino definido. Só um setor pode ser o padrão — marcar aqui desmarca o anterior."
            />
            <Chave
              ligada={f.auto_atribuir}
              onMuda={() => setF({ ...f, auto_atribuir: !f.auto_atribuir })}
              titulo="Distribuir automaticamente"
              nota="Ligado, a conversa cai direto para quem está menos cheio. Desligado, ela fica na fila do setor esperando alguém assumir — útil quando quem atende precisa escolher o caso."
            />
          </Bloco>

          {/* ── prazo ──────────────────────────────────────────────────── */}
          <Bloco
            titulo="Prazo de primeira resposta"
            nota="Passado esse tempo, a conversa entra no alarme da supervisão."
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={1}
                max={43200}
                value={f.sla_resposta_min}
                onChange={(e) =>
                  setF({
                    ...f,
                    sla_resposta_min: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                className="tabular h-9 w-24 rounded-md border border-tinta-200 px-2.5 text-[13px] outline-none focus:border-tema"
              />
              <span className="text-[12.5px] text-tinta-500">
                minutos —{" "}
                <b className="text-tinta-800">
                  {emPalavras(f.sla_resposta_min)}
                </b>
              </span>
              <div className="ml-auto flex gap-1">
                {[15, 60, 240, 1440].map((v) => (
                  <button
                    key={v}
                    onClick={() => setF({ ...f, sla_resposta_min: v })}
                    className={`rounded-md border px-2 py-1 text-[11.5px] transition-colors ${
                      f.sla_resposta_min === v
                        ? "border-tema bg-tema/10 font-semibold text-tema"
                        : "border-tinta-200 text-tinta-500 hover:border-tinta-300"
                    }`}
                  >
                    {emPalavras(v)}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-tinta-400">
              Lead de tráfego pago esfria em minutos — 15 é uma régua honesta na
              recepção. Jurídico e saúde pedem apuração, e um dia inteiro não é
              descaso.
            </p>
          </Bloco>

          {/* ── roteamento ─────────────────────────────────────────────── */}
          <Bloco
            titulo="Palavras que trazem para cá"
            nota="Guardadas agora, usadas pelo roteiro quando ele existir."
          >
            <input
              value={chaves}
              onChange={(e) => setChaves(e.target.value)}
              placeholder="advogado, processo, justiça (separe por vírgula)"
              className="h-9 w-full rounded-md border border-tinta-200 px-2.5 text-[13px] outline-none focus:border-tema"
            />
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-tinta-400">
              Ainda <b>não roteiam sozinhas</b> — o fluxo de atendimento não
              existe. Estão aqui para você já registrar a regra enquanto a
              memória está fresca.
            </p>
          </Bloco>

          <Bloco titulo="Situação">
            <Chave
              ligada={f.ativo}
              onMuda={() => setF({ ...f, ativo: !f.ativo })}
              titulo="Setor ativo"
              nota="Desativado, ele some da lista de transferência e não recebe nada. O histórico de quem já passou por ele continua inteiro — por isso desativa, não apaga."
            />
          </Bloco>

          <Bloco titulo="Excluir">
            {ehPadrao ? (
              <p className="rounded-md border border-tinta-200 bg-tinta-50 px-3 py-2 text-[12px] leading-relaxed text-tinta-500">
                Este é o <b>setor padrão</b> e não pode ser excluído. Sem ele,
                conversa nova não cairia em setor nenhum. Marque outro como
                padrão primeiro.
              </p>
            ) : confirmando ? (
              <div className="rounded-lg border border-[#f3d3d3] bg-[#fdf1f1] p-3">
                <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-[#c02020]">
                  <AlertTriangle
                    size={14}
                    strokeWidth={2.4}
                    className="mt-0.5 shrink-0"
                  />
                  <span>
                    {quantas === 0 ? (
                      <>
                        Nenhuma conversa está neste setor. Pode apagar sem mexer
                        em nada.
                      </>
                    ) : (
                      <>
                        <b>{quantas}</b> conversa(s) estão aqui. Elas vão para o{" "}
                        <b>setor padrão</b> — não se perdem, e continuam na
                        fila. O histórico de que passaram por este setor é que
                        se perde.
                      </>
                    )}
                  </span>
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    onClick={excluir}
                    disabled={salvando}
                    className="h-8 rounded-md bg-[#c02020] px-3 text-[12.5px] font-semibold text-white disabled:opacity-40"
                  >
                    {salvando ? "Excluindo…" : "Excluir mesmo assim"}
                  </button>
                  <button
                    onClick={() => setConfirmando(false)}
                    className="h-8 px-2 text-[12.5px] text-tinta-500 hover:text-tinta-900"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={pedirExclusao}
                className="flex items-center gap-1.5 self-start rounded-md border border-tinta-200 px-3 py-1.5 text-[12.5px] font-semibold text-tinta-500 transition-colors hover:border-[#f0c4c4] hover:bg-[#fdf1f1] hover:text-[#c02020]"
              >
                <Trash2 size={13} />
                Excluir este setor
              </button>
            )}
            <p className="text-[11px] leading-relaxed text-tinta-400">
              Se a ideia é só tirar de circulação, <b>desative</b> acima: ele
              some da lista de transferência e o histórico fica inteiro.
            </p>
          </Bloco>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-tinta-200 px-6 py-3.5">
          <button
            onClick={aoFechar}
            className="h-9 rounded-lg px-3.5 text-[13px] text-tinta-500 hover:text-tinta-900"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando || !f.nome.trim()}
            className="h-9 rounded-lg bg-tema px-5 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── peças ───────────────────────────────────────────────────────────────────

function Bloco({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 border-b border-tinta-100 pb-5 last:mb-0 last:border-0 last:pb-0">
      <h3 className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-tinta-400">
        {titulo}
      </h3>
      {nota && (
        <p className="mt-1 text-[12px] leading-relaxed text-tinta-500">
          {nota}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Campo({
  rotulo,
  nota,
  children,
}: {
  rotulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-tinta-700">{rotulo}</span>
      {nota && (
        <span className="mt-0.5 block text-[11.5px] text-tinta-400">
          {nota}
        </span>
      )}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Chave({
  ligada,
  onMuda,
  titulo,
  nota,
  icone,
}: {
  ligada: boolean;
  onMuda: () => void;
  titulo: string;
  nota: string;
  icone?: React.ReactNode;
}) {
  return (
    <button
      onClick={onMuda}
      className="flex w-full items-start gap-3 text-left"
    >
      <span
        className={`mt-0.5 h-[20px] w-[36px] shrink-0 rounded-full transition-colors ${
          ligada ? "bg-[#12703c]" : "bg-tinta-300"
        }`}
      >
        <span
          className={`block h-4 w-4 rounded-full bg-white transition-all ${
            ligada ? "ml-[18px] mt-0.5" : "ml-0.5 mt-0.5"
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-tinta-900">
          {icone}
          {titulo}
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-tinta-500">
          {nota}
        </span>
      </span>
    </button>
  );
}
