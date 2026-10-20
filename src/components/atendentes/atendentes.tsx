"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Cabecalho, Cartao } from "@/components/ui/pagina";

// Quem pode atender.
//
// ── O PLANTÃO SAIU ──────────────────────────────────────────────────────────
//
// Havia uma chave de "está no plantão", e a distribuição automática escolhia
// entre quem estivesse ligada. Funcionava e exigia que alguém mantivesse a
// chave em dia — esquecida ligada, o lead ia para quem saiu; esquecida
// desligada, o sistema não achava ninguém. Era um estado a mais para manter,
// num lugar onde ninguém ia lembrar de manter.
//
// Agora o lead chega, fica em "Aguardando", e quem vai atender puxa. Quem puxou
// é quem está lá — não há o que sincronizar.
//
// Esta tela guarda uma coisa só: quem tem permissão de puxar. A chave aqui é
// cadastro, não presença.

export type Linha = {
  id: string;
  email: string;
  papel: string;
  cadastrado: boolean;
  nome: string;
  abertas: number;
  esperando: number;
};

export function Atendentes({ linhas }: { linhas: Linha[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, transicao] = useTransition();

  async function alternar(l: Linha) {
    setOcupado(l.id);
    setErro(null);
    const { error } = l.cadastrado
      ? await supabase.from("atendentes").delete().eq("id", l.id)
      : await supabase.from("atendentes").upsert({ id: l.id, nome: l.nome });
    setOcupado(null);
    if (error) {
      setErro(
        error.code === "23503"
          ? "Esta pessoa tem conversas atribuídas. Transfira ou encerre antes de tirá-la da lista."
          : error.message,
      );
      return;
    }
    transicao(() => router.refresh());
  }

  async function renomear(l: Linha, nome: string) {
    if (!nome.trim() || nome === l.nome) return;
    setOcupado(l.id);
    await supabase
      .from("atendentes")
      .update({ nome: nome.trim() })
      .eq("id", l.id);
    setOcupado(null);
    transicao(() => router.refresh());
  }

  const ativas = linhas.filter((l) => l.cadastrado);

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5 px-6 py-7 md:px-8">
      <Cabecalho
        voltar="/atendimento"
        sobretitulo="Atendimento"
        titulo="Atendentes"
        descricao="Quem pode puxar conversa da fila."
      />

      {erro && (
        <p className="rounded-lg border border-[#f3d3d3] bg-[#fdf1f1] px-4 py-3 text-[13px] text-[#c02020]">
          {erro}
        </p>
      )}

      {ativas.length === 0 && (
        <p className="rounded-lg border border-[#f0dcc0] bg-[#fdf6ea] px-4 py-3 text-[13px] leading-relaxed text-[#8a4a10]">
          <b>Ninguém está na lista.</b> As conversas vão continuar chegando e
          ficando em Aguardando, mas ninguém consegue puxá-las. Marque abaixo
          quem vai atender.
        </p>
      )}

      <Cartao
        titulo="Contas com acesso ao atendimento"
        descricao="Marcada, a pessoa pode puxar conversa da fila e responder."
      >
        <div className="divide-y divide-tinta-100">
          {linhas.map((l) => (
            <Item
              key={l.id}
              l={l}
              ocupado={ocupado === l.id}
              onAlterna={() => alternar(l)}
              onRenomeia={(n) => renomear(l, n)}
            />
          ))}
          {linhas.length === 0 && (
            <p className="px-5 py-8 text-center text-[13px] text-tinta-400">
              Nenhuma conta ativa ainda. Crie em Configurações → Criar conta,
              com o papel Atendente.
            </p>
          )}
        </div>
      </Cartao>

      <p className="text-[11.5px] leading-relaxed text-tinta-400">
        O lead chega e fica em <b>Aguardando</b>, sem dono. A atendente abre,
        clica em <b>Assumir atendimento</b>, e a partir daí a conversa é dela —
        sai de Aguardando e entra em Meus atendimentos. Duas clicando ao mesmo
        tempo: o banco decide, e a segunda vê o nome de quem chegou primeiro.
      </p>
    </div>
  );
}

function Item({
  l,
  ocupado,
  onAlterna,
  onRenomeia,
}: {
  l: Linha;
  ocupado: boolean;
  onAlterna: () => void;
  onRenomeia: (nome: string) => void;
}) {
  const [nome, setNome] = useState(l.nome);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
      <button
        onClick={onAlterna}
        disabled={ocupado}
        aria-label={l.cadastrado ? "Tirar da lista" : "Pôr na lista"}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-40 ${
          l.cadastrado
            ? "border-tema bg-tema text-white"
            : "border-tinta-300 bg-white hover:border-tinta-400"
        }`}
      >
        {l.cadastrado && <Check size={13} strokeWidth={3} />}
      </button>

      <div className="min-w-[200px] flex-1">
        {l.cadastrado ? (
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => onRenomeia(nome)}
            className="w-full max-w-[240px] rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[13.5px] font-semibold text-tinta-900 outline-none hover:border-tinta-200 focus:border-tema"
          />
        ) : (
          <span className="block px-1.5 text-[13.5px] font-semibold text-tinta-500">
            {l.nome}
          </span>
        )}
        <span className="block truncate px-1.5 text-[11px] text-tinta-400">
          {l.email}
          {l.papel !== "atendente" && (
            <span className="ml-1.5 rounded bg-tinta-100 px-1 py-px text-[10px] font-semibold text-tinta-500">
              {l.papel}
            </span>
          )}
        </span>
      </div>

      {l.cadastrado && (
        <span className="shrink-0 text-right">
          <span className="tabular block text-[14px] font-bold text-tinta-900">
            {l.abertas}
          </span>
          <span className="block text-[10px] uppercase tracking-[0.08em] text-tinta-400">
            com ela
          </span>
        </span>
      )}

      {l.cadastrado && l.esperando > 0 && (
        <span className="shrink-0 text-right">
          <span className="tabular block text-[14px] font-bold text-[#a35a00]">
            {l.esperando}
          </span>
          <span className="block text-[10px] uppercase tracking-[0.08em] text-tinta-400">
            esperando
          </span>
        </span>
      )}
    </div>
  );
}
