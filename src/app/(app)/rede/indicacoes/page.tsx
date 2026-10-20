import { Network } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { paginar } from "@/lib/paginar";
import { Cabecalho, Indicador } from "@/components/ui/pagina";
import type { No } from "@/components/rede/arvore";
import { RedeClient } from "@/components/rede/rede-client";

export default async function RedePage() {
  const supabase = await createClient();

  // Só quem participa da árvore: as lideranças e quem tem vínculo. Munícipe
  // solto não aparece aqui, e são eles a quase totalidade da base — ler os 29
  // mil para desenhar algumas centenas de nós era o que travava esta página.
  const todos = await paginar<No>((de, ate) =>
    supabase
      .from("liderancas")
      .select("id, nome, municipio, parent_id, tipo")
      .or("tipo.eq.lideranca,tipo.is.null,parent_id.not.is.null")
      .range(de, ate),
  );

  const raizes = todos.filter(
    (n) => (n.tipo ?? "lideranca") === "lideranca" && !n.parent_id,
  );
  const totalContatos = todos.filter((n) => n.tipo === "contato").length;
  const totalLeads = todos.filter(
    (n) => n.tipo === "lead" && n.parent_id,
  ).length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <Cabecalho
        voltar="/base"
        sobretitulo="Rede"
        titulo="Rede de indicações"
        descricao="A rede de todas as lideranças. Clique numa delas para abrir a rede dela."
      />

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Indicador
          rotulo="Lideranças raiz"
          valor={raizes.length.toLocaleString("pt-BR")}
          contexto="começam uma rede própria"
        />
        <Indicador
          rotulo="Indicações"
          valor={(totalContatos + totalLeads).toLocaleString("pt-BR")}
          contexto="pessoas com origem identificada"
          destaque
        />
        <Indicador
          rotulo="Pelo WhatsApp"
          valor={totalContatos.toLocaleString("pt-BR")}
          contexto="cadastros sem telefone, vindos de ficha"
        />
      </div>

      {raizes.length === 0 ? (
        <div className="mt-6 flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-tinta-300 bg-white/60 text-center">
          <Network size={26} className="text-tinta-300" />
          <p className="mt-3 text-sm font-bold text-tinta-800">
            A rede ainda não começou.
          </p>
          <p className="mt-1 max-w-sm text-[13px] text-tinta-500">
            Cadastre lideranças em <b>Lideranças</b> e elas aparecem aqui como
            raízes da rede.
          </p>
        </div>
      ) : (
        <div className="mt-5">
          <RedeClient nos={todos} />
        </div>
      )}
    </div>
  );
}
