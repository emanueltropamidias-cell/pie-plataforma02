import { UserPlus, Shield, Trophy, Target, Compass, Handshake } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Central, Faixa, Atalho } from "@/components/ui/central";

// Central de lideranças e território.
//
// Estes atalhos moravam no topo da aba Estratégia, e em 20/10/2026 o Emanuel
// pediu que saíssem de lá: a aba virou o painel eleitoral do Brasil inteiro, e
// os cartões empurravam o painel para baixo da dobra. Ganharam casa própria,
// com item no menu.
//
// Voltam também dois atalhos que o layout novo da Estratégia tinha perdido de
// vista: o Placar e os votos de 2022 até o bairro.

export const dynamic = "force-dynamic";

export default async function CentralLiderancas() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("liderancas")
    .select("id", { count: "exact", head: true })
    .eq("tipo", "lideranca");

  return (
    <Central
      sobretitulo="Lideranças"
      titulo="Lideranças e território"
      descricao="Quem trabalha o voto em cada cidade, a meta de cada uma e as parcerias."
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
        <Atalho href="/crm" icone={Shield} tom="verde" titulo="Ver lideranças" nota="Todas, município a município" />
        <Atalho href="/ranking" icone={Trophy} tom="ambar" titulo="Placar" nota="Quem mais trouxe gente" />
      </Faixa>

      <Faixa titulo="Território" nota="Onde está o voto e onde falta.">
        <Atalho href="/metas" icone={Target} tom="verde" titulo="Metas por cidade" nota="Quanto falta para a meta de cada uma" />
        <Atalho href="/dobradinha" icone={Handshake} tom="roxo" titulo="Dobradinhas" nota="A votação da parceira ao lado da nossa" />
        <Atalho
          href="/estrategia"
          icone={Compass}
          tom="azul"
          titulo="Estratégia eleitoral"
          nota="Votos até o bairro, sem liderança em destaque"
        />
      </Faixa>
    </Central>
  );
}
