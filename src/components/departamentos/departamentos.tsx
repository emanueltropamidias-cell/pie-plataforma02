"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, Star, Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Cabecalho, Cartao } from "@/components/ui/pagina";
import {
  EditorSetor,
  type SetorCompleto,
} from "@/components/departamentos/editor";
import { FaltaInstalar } from "@/components/falta-instalar";

// Os setores do gabinete.
//
// A LISTA MOSTRA A OPERAÇÃO; O PAINEL CONFIGURA UM SETOR.
//
// Antes tudo era editado na própria linha. Bom para trocar um nome, ruim para
// configurar: horário de funcionamento, prazo e roteamento não cabem numa linha,
// e espremer isso ali faria a lista virar um formulário disfarçado — perdendo o
// que ela faz de melhor, que é responder de relance "onde está o buraco agora?".

export type Setor = SetorCompleto & {
  ordem: number;
  aberto_agora: boolean;
  membros: number;
  abertas: number;
  aguardando: number;
  foraDoSla: number;
  turnos: number;
  membroIds: string[];
};

type Atendente = { id: string; nome: string };

export function Departamentos({
  setores,
  atendentes,
  faltaSql,
}: {
  setores: Setor[];
  atendentes: Atendente[];
  faltaSql: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [editando, setEditando] = useState<Setor | null>(null);
  const [, transicao] = useTransition();

  function recarregar() {
    transicao(() => router.refresh());
  }

  async function criar() {
    setErro(null);
    const { data, error } = await supabase
      .from("departamentos")
      .insert({ nome: "Novo setor", ordem: (setores.at(-1)?.ordem ?? 0) + 10 })
      .select("*")
      .single();
    if (error) return setErro(error.message);
    // Abre o painel já no setor recém-criado: criar e configurar é um gesto só,
    // e um "Novo setor" sem nada dentro na lista é convite para esquecer.
    setEditando({
      ...(data as SetorCompleto),
      ordem: data.ordem,
      aberto_agora: true,
      membros: 0,
      abertas: 0,
      aguardando: 0,
      foraDoSla: 0,
      turnos: 0,
      membroIds: [],
    });
    recarregar();
  }

  async function alternarMembro(setor: Setor, atendenteId: string) {
    setOcupado(setor.id);
    setErro(null);
    const dentro = setor.membroIds.includes(atendenteId);
    const { error } = dentro
      ? await supabase
          .from("departamento_membros")
          .delete()
          .eq("departamento_id", setor.id)
          .eq("atendente_id", atendenteId)
      : await supabase
          .from("departamento_membros")
          .insert({ departamento_id: setor.id, atendente_id: atendenteId });
    setOcupado(null);
    if (error) return setErro(error.message);
    recarregar();
  }

  const semPadrao =
    setores.length > 0 && !setores.some((s) => s.padrao && s.ativo);

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-5 px-6 py-7 md:px-8">
      <Cabecalho
        voltar="/atendimento"
        sobretitulo="Atendimento"
        titulo="Departamentos"
        descricao="Os setores do gabinete, quem responde por cada um e em que horário."
        acoes={
          <button
            onClick={criar}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-tema px-3.5 text-[13px] font-semibold text-white"
          >
            <Plus size={15} strokeWidth={2.4} />
            Novo setor
          </button>
        }
      />

      {faltaSql && (
        <FaltaInstalar oQue="A tabela de turnos dos setores" />
      )}
      {erro && (
        <p className="rounded-lg border border-[#f3d3d3] bg-[#fdf1f1] px-4 py-3 text-[13px] text-[#c02020]">
          {erro}
        </p>
      )}

      {/* Sem setor padrão, conversa nova não cai em lugar nenhum. É a falha que
          não dá erro em tela alguma. */}
      {semPadrao && (
        <p className="rounded-lg border border-[#f0dcc0] bg-[#fdf6ea] px-4 py-3 text-[13px] leading-relaxed text-[#8a4a10]">
          <b>Nenhum setor é o padrão.</b> Conversa que chegar não vai cair em
          setor nenhum, e a transferência manual passa a ser o único caminho.
          Abra um setor e marque <b>Setor padrão</b>.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {setores.map((s) => (
          <Linha
            key={s.id}
            s={s}
            atendentes={atendentes}
            ocupado={ocupado === s.id}
            aoAbrir={() => setEditando(s)}
            onAlternaMembro={(a) => alternarMembro(s, a)}
          />
        ))}
      </div>

      {setores.length === 0 && !faltaSql && (
        <Cartao>
          <p className="px-5 py-10 text-center text-[13px] text-tinta-400">
            Nenhum setor ainda. Crie o primeiro no botão acima.
          </p>
        </Cartao>
      )}

      <p className="text-[11.5px] leading-relaxed text-tinta-400">
        Transferir entrega a conversa a quem estiver menos cheio no destino, em
        proporção da capacidade. Se ninguém do setor estiver de plantão, ela vai
        para lá <b>sem dono</b> e aparece na supervisão — não volta calada para
        quem transferiu, nem some.
      </p>

      {editando && (
        <EditorSetor
          setor={editando}
          ehPadrao={editando.padrao}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null);
            recarregar();
          }}
        />
      )}
    </div>
  );
}

function Linha({
  s,
  atendentes,
  ocupado,
  aoAbrir,
  onAlternaMembro,
}: {
  s: Setor;
  atendentes: Atendente[];
  ocupado: boolean;
  aoAbrir: () => void;
  onAlternaMembro: (atendenteId: string) => void;
}) {
  const vazio = s.ativo && s.membroIds.length === 0;

  return (
    <div
      className={`rounded-lg border bg-white px-4 py-3.5 ${
        s.ativo
          ? "border-tinta-200"
          : "border-dashed border-tinta-200 opacity-60"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className="h-5 w-5 shrink-0 rounded-md ring-1 ring-inset ring-black/10"
          style={{ background: s.cor }}
        />

        <button
          onClick={aoAbrir}
          className="text-[14px] font-bold text-tinta-900 underline-offset-4 hover:underline"
        >
          {s.nome}
        </button>

        {s.padrao && (
          <span className="flex items-center gap-1 rounded-full border border-tema/30 bg-tema/10 px-2 py-0.5 text-[10.5px] font-bold text-tema">
            <Star size={9} strokeWidth={3} />
            padrão
          </span>
        )}

        {s.ativo && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
              s.aberto_agora
                ? "bg-[#f1f8f3] text-[#12703c]"
                : "bg-tinta-100 text-tinta-500"
            }`}
            title={
              s.turnos === 0
                ? "Sem horário definido — aberto sempre"
                : s.aberto_agora
                  ? "Dentro do horário de funcionamento"
                  : "Fora do horário de funcionamento"
            }
          >
            {s.aberto_agora ? "aberto" : "fechado agora"}
          </span>
        )}

        {!s.auto_atribuir && (
          <span className="rounded-full bg-tinta-100 px-2 py-0.5 text-[10.5px] font-bold text-tinta-500">
            sem distribuição automática
          </span>
        )}

        <div className="ml-auto flex items-center gap-4">
          <Conta rotulo="abertas" valor={s.abertas} />
          <Conta
            rotulo="aguardando"
            valor={s.aguardando}
            alerta={s.aguardando > 0}
          />
          <Conta
            rotulo="fora do prazo"
            valor={s.foraDoSla}
            ruim={s.foraDoSla > 0}
          />
          <Conta
            rotulo="atendentes"
            valor={s.membros}
            alerta={s.membros === 0}
          />

          <button
            onClick={aoAbrir}
            className="flex h-8 items-center gap-1.5 rounded-md border border-tinta-200 px-2.5 text-[12px] font-semibold text-tinta-600 transition-colors hover:border-tinta-300 hover:text-tinta-900"
          >
            <Settings2 size={13} />
            Configurar
          </button>
        </div>
      </div>

      {s.descricao && (
        <p className="mt-1 pl-8 text-[12px] text-tinta-500">{s.descricao}</p>
      )}

      <p className="mt-1 pl-8 text-[11.5px] text-tinta-400">
        Prazo de primeira resposta:{" "}
        <b className="text-tinta-600">{s.sla_resposta_min} min</b>
        {s.turnos > 0 && ` · ${s.turnos} turno(s) na semana`}
        {s.turnos === 0 && s.ativo && " · sem horário definido, aberto sempre"}
      </p>

      {vazio && (
        <p className="mt-2 rounded-md bg-[#fdf6ea] px-2.5 py-1.5 text-[11.5px] text-[#8a4a10]">
          Setor sem ninguém. Marque abaixo quem responde por ele.
        </p>
      )}

      {/* QUEM RESPONDE POR ESTE SETOR.
          Eram etiquetas que ficavam azuis ao clicar — dava para marcar sem
          perceber, e não dava para ler de relance quem estava dentro. Agora é
          lista com caixa de marcar: quem está no setor aparece em cima, com
          marca; quem não está fica embaixo, apagado. */}
      <div className="mt-3 border-t border-tinta-100 pt-3">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-tinta-400">
          Quem responde por este setor
        </span>

        {atendentes.length === 0 ? (
          <p className="mt-1.5 text-[12px] italic text-tinta-400">
            Nenhuma atendente cadastrada ainda — comece por Atendentes.
          </p>
        ) : (
          <div className="mt-1.5 grid gap-0.5 sm:grid-cols-2">
            {[...atendentes]
              .sort((a, b) => {
                const da = s.membroIds.includes(a.id) ? 0 : 1;
                const db = s.membroIds.includes(b.id) ? 0 : 1;
                return da - db || a.nome.localeCompare(b.nome);
              })
              .map((a) => {
                const dentro = s.membroIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    disabled={ocupado}
                    onClick={() => onAlternaMembro(a.id)}
                    className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-tinta-50 disabled:opacity-40"
                  >
                    <span
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors ${
                        dentro
                          ? "border-tema bg-tema text-white"
                          : "border-tinta-300 bg-white"
                      }`}
                    >
                      {dentro && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span
                      className={`truncate text-[12.5px] ${
                        dentro
                          ? "font-semibold text-tinta-900"
                          : "text-tinta-500"
                      }`}
                    >
                      {a.nome}
                    </span>
                  </button>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

function Conta({
  rotulo,
  valor,
  alerta,
  ruim,
}: {
  rotulo: string;
  valor: number;
  alerta?: boolean;
  ruim?: boolean;
}) {
  return (
    <span className="text-center">
      <span
        className={`tabular block text-[15px] font-bold leading-none ${
          ruim ? "text-[#c02020]" : alerta ? "text-[#a35a00]" : "text-tinta-900"
        }`}
      >
        {valor}
      </span>
      <span className="block whitespace-nowrap text-[10px] uppercase tracking-[0.08em] text-tinta-400">
        {rotulo}
      </span>
    </span>
  );
}
