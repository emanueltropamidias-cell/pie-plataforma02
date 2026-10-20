"use client";

import { useEffect, useState } from "react";
import { UserCheck, Users, ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// "Essa pessoa a gente já conhece."
//
// ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
//
// Com vários números, o mesmo eleitor vê o anúncio de manhã e escreve para o
// número 1; à tarde vê outro criativo e escreve para o número 3. São duas
// conversas — corretamente, porque a resposta tem de voltar por onde veio.
//
// Mas para a operação são DUAS MENINAS trabalhando a mesma pessoa, e nenhuma
// das duas sabe. As duas perguntam o nome, as duas perguntam a cidade, as duas
// mandam o kit. Para o eleitor a campanha parece desorganizada; para a campanha
// é o dobro do custo pelo mesmo voto.
//
// O banco nunca duplicou: `confirmar_cadastro` acha pelo telefone e atualiza.
// O que faltava era a menina saber ANTES de perguntar. Descobrir depois não
// evita o retrabalho — evita só a linha repetida.

type Cadastro = {
  nome: string | null;
  municipio: string | null;
  bairro: string | null;
  tipo: string | null;
  em: string;
  por: string | null;
  via: string | null;
};

type Outra = {
  conversa_id: number;
  numero: string;
  cor: string;
  atendente: string | null;
  ultima: string | null;
};

type Resposta = {
  ok: boolean;
  cadastrada: boolean;
  cadastro: Cadastro | null;
  outras_conversas: Outra[];
  vezes: number;
};

function quando(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "America/Bahia",
  });
}

export function JaConhecida({
  conversaId,
  aoAbrirOutra,
}: {
  conversaId: number;
  /** Pular para a conversa da colega, em vez de só saber que ela existe. */
  aoAbrirOutra: (id: number) => void;
}) {
  const supabase = createClient();
  // O par {de, dados} em vez de dois estados: sem ele existe um instante em que
  // a conversa já é a nova e o aviso ainda é o da anterior — e aí a menina lê
  // que a pessoa está cadastrada quando não está.
  const [r, setR] = useState<{ de: number; dados: Resposta | null }>({
    de: 0,
    dados: null,
  });

  useEffect(() => {
    let vivo = true;
    supabase
      .rpc("pessoa_ja_conhecida", { p_conversa: conversaId })
      .then(({ data }) => {
        if (vivo) setR({ de: conversaId, dados: (data as Resposta) ?? null });
      });
    return () => {
      vivo = false;
    };
  }, [conversaId, supabase]);

  if (r.de !== conversaId || !r.dados?.ok) return null;

  const { cadastrada, cadastro, outras_conversas: outras } = r.dados;
  if (!cadastrada && outras.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* ── já está na base ──────────────────────────────────────────────── */}
      {cadastrada && cadastro && (
        <div className="rounded-lg border border-[#cbe3d4] bg-[#f1f8f3] px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-bold text-[#12703c]">
            <UserCheck size={13} strokeWidth={2.4} />
            Já cadastrada
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[#12703c]">
            {cadastro.nome && <b>{cadastro.nome}</b>}
            {cadastro.municipio && <> · {cadastro.municipio}</>}
            {cadastro.bairro && <>, {cadastro.bairro}</>}
          </p>
          <p className="mt-0.5 text-[11px] text-[#12703c] opacity-75">
            {cadastro.via === "import"
              ? "Veio da base antiga"
              : `Por ${cadastro.por ?? "alguém da equipe"}`}
            {cadastro.em && ` em ${quando(cadastro.em)}`}
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[#12703c] opacity-75">
            Não precisa pedir nome e cidade de novo.
          </p>
        </div>
      )}

      {/* ── a colega está atendendo a mesma pessoa ───────────────────────── */}
      {outras.length > 0 && (
        <div className="rounded-lg border border-[#f0dcc0] bg-[#fdf6ea] px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-bold text-[#a35a00]">
            <Users size={13} strokeWidth={2.4} />
            {outras.length === 1
              ? "Essa pessoa também escreveu em outro número"
              : `Essa pessoa está em mais ${outras.length} números`}
          </p>

          {outras.map((o) => (
            <button
              key={o.conversa_id}
              onClick={() => aoAbrirOutra(o.conversa_id)}
              className="mt-1.5 flex w-full items-center gap-2 rounded-md bg-white/70 px-2 py-1.5 text-left transition-colors hover:bg-white"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: o.cor }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11.5px] font-semibold text-[#a35a00]">
                  {o.numero}
                </span>
                <span className="block truncate text-[11px] text-[#a35a00] opacity-75">
                  {o.atendente ? `com ${o.atendente}` : "sem dono ainda"}
                  {o.ultima && ` · ${quando(o.ultima)}`}
                </span>
              </span>
              <ArrowUpRight
                size={13}
                className="shrink-0 text-[#a35a00] opacity-60"
              />
            </button>
          ))}

          <p className="mt-1.5 text-[11px] leading-relaxed text-[#a35a00] opacity-80">
            Combine com a colega antes de mandar o kit — senão a pessoa recebe
            duas vezes.
          </p>
        </div>
      )}
    </div>
  );
}
