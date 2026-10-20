import { createClient } from "@/lib/supabase/server";
import { lerTerritorio } from "@/lib/painel-territorio";
import { MapaBahia, type MunicipioBase, type EstimativaDdd } from "@/components/mapa/mapa-bahia";
import { VOTOS_TOTAL } from "@/lib/votos-talita";
import { Cabecalho } from "@/components/ui/pagina";
import { MUNICIPIOS_BA } from "@/lib/municipios-ba";

export default async function MapaPage() {
  const supabase = await createClient();

  // O Postgres agrupa e devolve pronto: municípios com seus bairros, sem
  // trazer a base inteira para somar aqui.
  const territorio = await lerTerritorio(supabase);
  const base: MunicipioBase[] = territorio.mapa;

  // Quem não tem município, distribuído pelo DDD — só esta tela usa, e por isso
  // a conta não mora em `painel_territorio()`, que alimenta Dashboard e Leads.
  // Se falhar, o mapa segue sem o botão da estimativa: nunca sem o confirmado.
  const { data: dddBruto } = await supabase.rpc("mapa_estimativa_ddd");
  const estimativa = (dddBruto ?? null) as EstimativaDdd | null;
  const outroEstado = territorio.outroEstado ?? [];

  const totalPessoas = base.reduce((s, m) => s + m.qtd, 0);
  const semMunicipio = territorio.semMunicipio;

  // ── A CONTA VEM DO BANCO ─────────────────────────────────────────────────
  //
  // Esta conta — quantas GRAFIAS são município de verdade — estava escrita
  // aqui E no painel de leads, com o mesmo comentário copiado nos dois. E
  // faltava no filtro de município do /leads, que oferecia "Pernambuco" como
  // opção. Duas cópias e um esquecimento.
  //
  // Agora `painel_territorio()` já devolve só município reconhecido em `mapa`
  // e em `porMunicipio`, e manda as grafias soltas em `aRevisar`. Tela nova
  // não tem como nascer errada.
  const reconhecidos = territorio.municipiosAlcancados;
  const aConferir = territorio.aRevisar.length;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
      <Cabecalho
        voltar="/base"
        sobretitulo="Território"
        titulo="Mapa da Bahia"
        descricao={
          <>
            <b className="text-tinta-700">
              {totalPessoas.toLocaleString("pt-BR")}
            </b>{" "}
            pessoas na base em{" "}
            <b className="text-tinta-700">{reconhecidos}</b> de{" "}
            {MUNICIPIOS_BA.length} municípios ·{" "}
            <b className="text-tinta-700">
              {VOTOS_TOTAL.toLocaleString("pt-BR")}
            </b>{" "}
            votos em 2022
            {aConferir > 0 && (
              <span className="text-tinta-400">
                {" "}
                · {aConferir} grafia{aConferir > 1 ? "s" : ""} a conferir
              </span>
            )}
            {semMunicipio > 0 && (
              <span className="text-tinta-400">
                {" "}
                · {semMunicipio.toLocaleString("pt-BR")} sem município
              </span>
            )}
          </>
        }
      />

      <div className="mt-6">
        <MapaBahia base={base} estimativa={estimativa} />
      </div>

      {/* ── AS GRAFIAS QUE NÃO SÃO MUNICÍPIO DAQUI ────────────────────────────
          Antes elas entravam no mapa como se fossem município e inflavam a
          cobertura: 569 numa Bahia de 417. Agora saem do mapa — mas NÃO somem,
          porque cada linha é gente com telefone esperando alguém dizer de qual
          cidade ela é.

          Ordenada por quantidade: consertar "Pernambuco" resolve 14 de uma vez,
          e é assim que uma lista de 192 vira trabalho de meia hora. */}
      {territorio.aRevisar.length > 0 && (
        <section className="mt-8 rounded-xl border border-tinta-200 bg-white p-5">
          <h2 className="text-[15px] font-bold text-tinta-900">
            Grafias a revisar
          </h2>
          <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-tinta-500">
            <b className="text-tinta-700">
              {territorio.pessoasARevisar.toLocaleString("pt-BR")}
            </b>{" "}
            pessoas estão com algo que não é município no campo cidade — região,
            bairro, &ldquo;Bahia&rdquo; ou erro de digitação. Elas continuam na base, ficam
            fora do mapa confirmado, e entram na estimativa pelo DDD até alguém
            corrigir.
          </p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {territorio.aRevisar.map((m) => (
              <span
                key={m.nome}
                className="inline-flex items-baseline gap-1.5 rounded-md border border-tinta-200 bg-tinta-50 px-2.5 py-1 text-[12.5px]"
              >
                <span className="text-tinta-700">{m.nome}</span>
                <span className="font-mono text-[11px] font-semibold text-tinta-400">
                  {m.qtd}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── OUTRO ESTADO ────────────────────────────────────────────────────
          Separado das grafias a revisar desde 15/09. "Pernambuco" não é erro de
          digitação: é gente cadastrada com cidade de outro estado. A regra é o
          município do CADASTRO, nunca o DDD — muita gente mora na Bahia com
          número de fora, e essas pessoas estão no mapa, na cidade delas. */}
      {outroEstado.length > 0 && (
        <section className="mt-4 rounded-xl border border-tinta-200 bg-white p-5">
          <h2 className="text-[15px] font-bold text-tinta-900">Outro estado</h2>
          <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-tinta-500">
            <b className="text-tinta-700">
              {(territorio.pessoasOutroEstado ?? 0).toLocaleString("pt-BR")}
            </b>{" "}
            pessoas cadastradas com município de outro estado. Contam na base, e ficam fora do mapa
            da Bahia. A regra é a cidade do cadastro, não o DDD.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {outroEstado.map((m) => (
              <span
                key={m.nome}
                className="inline-flex items-baseline gap-1.5 rounded-md border border-tinta-200 bg-tinta-50 px-2.5 py-1 text-[12.5px]"
              >
                <span className="text-tinta-700">{m.nome}</span>
                <span className="font-mono text-[11px] font-semibold text-tinta-400">{m.qtd}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
