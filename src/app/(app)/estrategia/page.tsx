import { UserPlus, Shield, Trophy, Target, Compass, Handshake } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Central, Faixa, Atalho } from "@/components/ui/central";

// A central de Estratégia.
//
// ── POR QUE ELA EXISTE ──────────────────────────────────────────────────────
//
// O PIE cresceu por tipo de tela — Atendimento, Rede, Análise — e em 15/09 o
// Emanuel pediu a divisão por SETOR: cada coisa onde o trabalho dela acontece.
// Estratégia é o território e a eleição: onde a Talita teve voto, com quem dobra,
// a meta de cada cidade, e as lideranças que vão buscar esse voto.
//
// E foi pedido explícito que o cadastro de lideranças morasse AQUI, e não na
// base: liderança é peça da estratégia de território, não um contato a mais.
// Por isso ele abre a central, e com o formulário já aberto.
//
// A página de votos de 2022, que era /estrategia, foi para /estrategia/votos.

export const dynamic = "force-dynamic";

export default async function CentralEstrategia() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("liderancas")
    .select("id", { count: "exact", head: true })
    .eq("tipo", "lideranca");

  return (
    <Central
      sobretitulo="Estratégia"
      titulo="Central de estratégia"
      descricao="Território, eleição e as lideranças que vão buscar o voto."
      numeros={[{ rotulo: "Lideranças", valor: (count ?? 0).toLocaleString("pt-BR"), tom: "bom" }]}
    >
      <Faixa titulo="Lideranças" nota="Quem trabalha o voto em cada cidade.">
        <Atalho
          destaque
          href="/crm?nova=1"
          icone={UserPlus}
          tom="verde"
          titulo="Cadastrar liderança"
          nota="Abre o formulário direto"
        />
        <Atalho
          href="/crm"
          icone={Shield}
          tom="verde"
          titulo="Lideranças"
          nota="Todas, município a município"
        />
        <Atalho
          href="/ranking"
          icone={Trophy}
          tom="ambar"
          titulo="Placar"
          nota="Quem mais trouxe gente"
        />
      </Faixa>

      <Faixa titulo="Território" nota="Onde está o voto e onde falta.">
        <Atalho
          href="/estrategia/votos"
          icone={Compass}
          tom="azul"
          titulo="Votos de 2022"
          nota="Onde a campanha já teve voto, até o bairro"
        />
        <Atalho
          href="/metas"
          icone={Target}
          tom="verde"
          titulo="Metas por município"
          nota="Quanto falta para a meta de cada cidade"
        />
        <Atalho
          href="/dobradinha"
          icone={Handshake}
          tom="roxo"
          titulo="Dobradinha"
          nota="A votação da parceira ao lado da nossa"
        />
      </Faixa>
    </Central>
  );
}
