import { redirect } from "next/navigation";

// "Votos de 2022 até o bairro" era uma segunda tela de Estratégia, presa aos
// votos da Talita em 2022 (arquivo fixo `votos-talita.ts`). A Estratégia faz o
// mesmo para qualquer candidato e ano, com a candidatura da casa aberta por
// padrão — inclusive Salvador por bairro. Link antigo cai lá.
export default function VotosAntigos() {
  redirect("/estrategia");
}
