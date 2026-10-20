import { MapPin, Phone, PhoneOff, Users, UserPlus } from "lucide-react";
import type { Contagem } from "@/lib/painel-territorio";
import { Cartao } from "@/components/ui/pagina";
import { rotuloOrigem } from "@/lib/origem-cadastro";

export type ResumoLeads = {
  total: number;
  /**
   * Cadastros com `tipo = 'contato'` — hoje, 1.780 pessoas, TODAS sem telefone.
   *
   * Isto se chamava "contatos pelo QR" e mostrava 4.161. Era falso em dois
   * níveis: `tipo = 'contato'` nunca teve relação com QR, e a tabela do QR de
   * verdade (`link_leituras`) tem CINCO leituras, nenhuma virou cadastro. O
   * cartão dizia que quase toda a base tinha chegado por um canal que nunca
   * trouxe ninguém.
   *
   * Ficam FORA de `total` porque `painel_territorio()` exclui `contato` — sem
   * telefone não há como trabalhar a pessoa. O cartão existe para essa gente
   * não sumir sem explicação.
   */
  contatos: number;
  comTelefone: number;
  vinculados: number;
  novosSemana: number;
  porMunicipio: { nome: string; qtd: number }[];
  porOrigem: { nome: string; qtd: number }[];
  /**
   * Quem entrou sem município.
   *
   * O banco já devolvia este número e a tela jogava fora. Essas pessoas contam
   * no Painel e aparecem na Lista, mas NÃO existem no Mapa — mapa precisa de
   * cidade. As três abas divergiam e nada na tela dizia por quê.
   */
  semMunicipio: number;
  /** Quantos dos 417 têm gente. Vem do banco — ver `painel_territorio()`. */
  municipiosAlcancados: number;
  municipiosDaBahia: number;
  /** As grafias que não são município da Bahia, com quanta gente em cada. */
  aRevisar: Contagem[];
};

function pct(parte: number, total: number) {
  if (!total) return 0;
  return Math.round((parte / total) * 100);
}

export function PainelLeads({ r }: { r: ResumoLeads }) {
  const semTelefone = r.total - r.comTelefone;
  const soltos = r.total - r.vinculados;
  const maior = r.porMunicipio[0]?.qtd ?? 0;

  // A conta vem do banco. Estava escrita aqui E no `mapa/page.tsx`, com o
  // mesmo comentário copiado — e faltava no filtro de município do /leads,
  // que oferecia "Pernambuco" como opção de município baiano.
  const reconhecidos = r.municipiosAlcancados;
  const foraDaLista = r.aRevisar.length;

  const cartoes = [
    {
      icone: PhoneOff,
      rotulo: "Sem telefone",
      valor: r.contatos.toLocaleString("pt-BR"),
      apoio: "base antiga — não entram nos números ao lado",
    },
    {
      icone: Users,
      rotulo: "Munícipes na base",
      valor: r.total.toLocaleString("pt-BR"),
      // Importação em massa marca todo mundo como entrada da semana, e "+29.244
      // nesta semana" descreveria o dia do arquivo, não o trabalho da equipe.
      // Só vale como importação acima de algumas centenas: com meia dúzia de
      // cadastros feitos à mão, "+6 nesta semana" é a leitura certa.
      apoio:
        r.novosSemana >= r.total && r.total >= 500
          ? "base importada"
          : r.novosSemana > 0
            ? `+${r.novosSemana.toLocaleString("pt-BR")} nesta semana`
            : "sem entradas nesta semana",
    },
    {
      icone: Phone,
      rotulo: "Com telefone",
      valor: `${pct(r.comTelefone, r.total)}%`,
      apoio: `${semTelefone.toLocaleString("pt-BR")} sem contato de WhatsApp`,
    },
    {
      icone: UserPlus,
      rotulo: "Vinculados a uma liderança",
      valor: `${pct(r.vinculados, r.total)}%`,
      apoio: `${soltos.toLocaleString("pt-BR")} ainda sem liderança`,
    },
    {
      icone: MapPin,
      rotulo: "Municípios alcançados",
      valor: `${reconhecidos}`,
      // O buraco entre as abas, escrito. Quem cadastra sem cidade não some da
      // base — some do mapa, que é diferente e ninguém adivinha.
      apoio: [
        `de ${r.municipiosDaBahia} na Bahia`,
        foraDaLista > 0 ? `${foraDaLista} a conferir` : "",
        r.semMunicipio > 0 ? `${r.semMunicipio} sem cidade fora do mapa` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ];

  return (
    <section className="mt-6 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cartoes.map((c) => (
          <div
            key={c.rotulo}
            className="rounded-xl border border-tinta-200 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(22,32,46,0.04)]"
          >
            <div className="flex items-center gap-1.5 text-tinta-500">
              <c.icone size={12} />
              <p className="text-[10px] font-bold uppercase tracking-[0.1em]">{c.rotulo}</p>
            </div>
            <p className="tabular mt-2 text-[26px] font-extrabold leading-none tracking-[-0.03em] text-tinta-900">
              {c.valor}
            </p>
            <p className="mt-1.5 text-[11.5px] leading-snug text-tinta-400">{c.apoio}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Onde a base está concentrada — orienta onde falta trabalhar */}
        <Cartao titulo="Onde estão os munícipes" descricao="Dez municípios com mais gente na base">
          <div className="flex flex-col gap-2.5 px-5 py-4">
            {r.porMunicipio.slice(0, 10).map((m) => (
              <div key={m.nome} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-[13px] text-tinta-700">{m.nome}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-tinta-100">
                  <div
                    className="h-full rounded-full bg-tema/75"
                    style={{ width: `${maior ? Math.max(2, (m.qtd / maior) * 100) : 0}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-tinta-600">
                  {m.qtd.toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
            {r.porMunicipio.length === 0 && (
              <p className="text-[13px] text-tinta-400">Nenhum município preenchido ainda.</p>
            )}
          </div>
        </Cartao>

        {/* Como entraram: mostra o que a operação está de fato usando */}
        <Cartao titulo="Como entraram" descricao="Origem do cadastro">
          <div className="flex flex-col gap-3 px-5 py-4">
            {r.porOrigem.map((o) => (
              <div key={o.nome}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] text-tinta-700">{rotuloOrigem(o.nome)}</span>
                  <span className="text-[12.5px] font-semibold tabular-nums text-tinta-600">
                    {o.qtd.toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-tinta-100">
                  <div
                    className="h-full rounded-full bg-tema/45"
                    style={{ width: `${pct(o.qtd, r.total)}%` }}
                  />
                </div>
              </div>
            ))}
            {r.porOrigem.length === 0 && (
              <p className="text-[13px] text-tinta-400">Sem origem registrada.</p>
            )}
          </div>
        </Cartao>
      </div>
    </section>
  );
}
