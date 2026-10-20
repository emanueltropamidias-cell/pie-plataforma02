import { redirect } from "next/navigation";

// "Rede" virou "Base" na divisão por setor de 15/09 — é a palavra que a campanha
// usa. O endereço antigo continua valendo para quem tem salvo, e leva à central
// nova. `/rede/indicacoes` segue no mesmo lugar.
export default function RedeAntiga() {
  redirect("/base");
}
