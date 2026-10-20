import { redirect } from "next/navigation";

// "Análise" deixou de existir na divisão por setor de 15/09: juntava tráfego,
// estratégia, dobradinha e demandas, que são trabalho de setores diferentes.
//
//   Tráfego pago          → Atendimento
//   Estratégia, Dobradinha → Estratégia
//   Demandas, Histórico    → Gabinete
//
// O endereço antigo leva ao painel inicial, que tem atalho para os três.
export default function AnaliseAntiga() {
  redirect("/dashboard");
}
