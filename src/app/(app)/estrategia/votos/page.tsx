import { createClient } from "@/lib/supabase/server";
import { lerTerritorio } from "@/lib/painel-territorio";
import { MUNICIPIOS_BA } from "@/lib/municipios-ba";
import { Cabecalho, Cartao, Indicador } from "@/components/ui/pagina";
import { MapaVotos } from "@/components/estrategia/mapa-votos";
import {
  TOTAL_VOTOS,
  MUNICIPIOS_COM_VOTO,
  chave,
  cobertura,
  conferirBairros,
  topMunicipios,
  votosDe,
} from "@/lib/eleicao";
import { VOTOS_TALITA } from "@/lib/votos-talita";

// Estratégia.
//
// As outras telas mostram o que a campanha construiu até aqui. Esta mostra o
// que a eleição passada já disse — e a distância entre as duas coisas é onde há
// trabalho a fazer.
//
// A aba cresce sozinha conforme os dados do TSE entram: hoje ela conhece o
// estado inteiro por município e Salvador por bairro. Onde não conhece, diz que
// não conhece, em vez de repartir número por conta própria.

export default async function EstrategiaPage() {
  const supabase = await createClient();
  const territorio = await lerTerritorio(supabase);

  const cob = cobertura();

  // Onde houve voto e não há uma pessoa sequer na base. É o cruzamento que
  // transforma o mapa em tarefa: o eleitor já votou uma vez e ninguém do lado
  // de cá conhece ninguém lá.
  // Só o que É município da Bahia. Grafia solta — outro estado, região, erro de
  // digitação — não vira lacuna nem vira cobertura, e contá-la é contar cidade
  // que não existe. Mesmo defeito que o mapa tinha ao lado.
  const oficiaisBA = new Set(MUNICIPIOS_BA.map((n) => chave(n)));
  const comBase = new Set(
    territorio.mapa
      .map((m) => chave(m.municipio))
      .filter((k) => oficiaisBA.has(k)),
  );
  const lacunas = Object.entries(VOTOS_TALITA)
    .filter(([nome]) => !comBase.has(chave(nome)))
    .map(([municipio, votos]) => ({ municipio, votos }))
    .sort((a, b) => b.votos - a.votos);
  const votosSemRede = lacunas.reduce((s, l) => s + l.votos, 0);

  const topo = topMunicipios(12);
  const maiorTopo = topo[0]?.votos ?? 0;

  // Concentração: quanto da votação total está nos dez maiores municípios.
  // Campanha concentrada se defende e se amplia; dispersa evapora.
  const dezMaiores = topMunicipios(10).reduce((s, m) => s + m.votos, 0);
  const concentracao = TOTAL_VOTOS > 0 ? (dezMaiores / TOTAL_VOTOS) * 100 : 0;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <Cabecalho
        voltar="/estrategia"
        sobretitulo="Estratégia"
        titulo="Onde a Talita já teve voto"
        descricao="A eleição de 2022 no mapa. Clique num município para descer ao bairro, à zona e ao local de votação."
      />

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="Votos em 2022"
          valor={TOTAL_VOTOS.toLocaleString("pt-BR")}
          contexto={`em ${MUNICIPIOS_COM_VOTO} municípios da Bahia`}
          destaque
        />
        <Indicador
          rotulo="Detalhado por bairro"
          valor={`${cob.pct.toFixed(0)}%`}
          contexto={`${cob.votosDetalhados.toLocaleString("pt-BR")} votos · ${cob.municipios} município(s)`}
        />
        <Indicador
          rotulo="Nos 10 maiores"
          valor={`${concentracao.toFixed(0)}%`}
          contexto="quanto da votação está concentrada"
        />
        <Indicador
          rotulo="Voto sem rede"
          valor={votosSemRede.toLocaleString("pt-BR")}
          contexto={`${lacunas.length} municípios sem ninguém na base`}
        />
      </div>

      {/* O que a aba ainda não sabe, dito antes de qualquer análise. Uma leitura
          sobre parte da votação apresentada como se fosse sobre o todo é pior
          do que leitura nenhuma. */}
      <div className="mt-3 rounded-xl border border-tinta-200 bg-white px-5 py-4">
        <p className="text-[12.5px] font-bold text-tinta-800">
          O que já foi importado
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-tinta-500">
          Todo o estado por município. Por bairro,{" "}
          {cob.municipios === 0 ? "nenhum" : ""}
          {cob.lista.map((d, i) => (
            <span key={d.municipio}>
              {i > 0 ? ", " : " "}
              <b className="text-tinta-700">{d.municipio}</b> (
              {conferirBairros(d.municipio).quantos} bairros
              {conferirBairros(d.municipio).bate ? ", fecha ✓" : ", não fecha"})
            </span>
          ))}
          {cob.municipiosComZona > 0 && (
            <>. Por zona e seção, {cob.municipiosComZona} município(s).</>
          )}{" "}
          O resto entra conforme sair do TSE.
        </p>
      </div>

      <div className="mt-5">
        <MapaVotos semRede={lacunas.map((l) => l.municipio)} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Cartao
          titulo="Maiores votações de 2022"
          descricao="onde a base eleitoral já existe"
        >
          <div className="space-y-2 px-5 py-4">
            {topo.map((m, i) => (
              <div key={m.municipio} className="flex items-center gap-3">
                <span className="tabular w-5 shrink-0 text-[11px] font-bold text-tinta-300">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-tinta-800">
                    {m.municipio}
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-tinta-100">
                    <span
                      className="block h-full rounded-full bg-tema"
                      style={{
                        width: `${Math.max(3, (m.votos / maiorTopo) * 100)}%`,
                      }}
                    />
                  </span>
                </span>
                <span className="tabular w-14 shrink-0 text-right text-[12.5px] font-bold text-tinta-900">
                  {m.votos.toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        </Cartao>

        <Cartao
          titulo="Voto sem rede"
          descricao={`${lacunas.length} municípios votaram e não temos ninguém lá`}
        >
          <div className="space-y-2 px-5 py-4">
            {lacunas.slice(0, 12).map((l, i) => (
              <div key={l.municipio} className="flex items-center gap-3">
                <span className="tabular w-5 shrink-0 text-[11px] font-bold text-tinta-300">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-tinta-800">
                  {l.municipio}
                </span>
                <span className="tabular shrink-0 text-[12.5px] font-bold text-amber-600">
                  {l.votos.toLocaleString("pt-BR")}
                </span>
                <span className="shrink-0 text-[11px] text-tinta-400">
                  votos
                </span>
              </div>
            ))}
            {lacunas.length === 0 && (
              <p className="py-6 text-center text-[12.5px] text-tinta-500">
                Todo município com voto já tem alguém na base.
              </p>
            )}
          </div>
        </Cartao>
      </div>

      <p className="mt-6 text-[11.5px] leading-relaxed text-tinta-400">
        A análise por IA entra quando a votação por bairro estiver importada
        para os municípios que importam. Ela vai responder apenas com número
        calculado no banco — e dizer que não tem o dado quando não tiver, em vez
        de estimar. Hoje isso valeria para {cob.pct.toFixed(0)}% da votação, o
        que ainda é pouco para decidir gasto de campanha.
      </p>
    </div>
  );
}
