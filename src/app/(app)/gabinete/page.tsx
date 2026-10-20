import { ClipboardList, MessageSquare, History } from "lucide-react";
import { Central, Faixa, Atalho } from "@/components/ui/central";

// A central do Gabinete.
//
// As demandas que chegam da população — saúde, jurídico, obra — são trabalho do
// gabinete, e ficavam em "Análise", ao lado do tráfego pago. Na divisão por setor
// de 15/09 elas ganham casa própria, junto com o arquivo do que veio antes do
// PIE ter CRM próprio.

export default function CentralGabinete() {
  return (
    <Central sobretitulo="Gabinete" titulo="Central do gabinete" descricao="O que a população pede, e o registro do que veio antes.">
      <Faixa titulo="Demandas" nota="O que chegou e precisa de retorno.">
        <Atalho
          destaque
          href="/demandas"
          icone={ClipboardList}
          tom="ambar"
          titulo="Demandas"
          nota="Saúde, jurídico, obra — com responsável"
        />
      </Faixa>

      <Faixa titulo="Arquivo" nota="Consulta. Nada aqui recebe dado novo.">
        <Atalho
          href="/conversas"
          icone={MessageSquare}
          tom="cinza"
          titulo="Histórico antigo"
          nota="Atendimentos anotados antes da caixa de entrada"
        />
        <Atalho
          href="/atendimento/painel"
          icone={History}
          tom="cinza"
          titulo="Painel da base antiga"
          nota="Os números do espelho do GabiFlow"
        />
      </Faixa>
    </Central>
  );
}
