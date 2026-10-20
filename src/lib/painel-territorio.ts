import { cookies } from "next/headers";
import type { createClient } from "./supabase/server";
import { paginar } from "./paginar";
// A MESMA peneira que as telas usavam. O caminho reserva tem de contar igual ao
// banco — "às vezes certo" é pior que sempre errado.
import { chave } from "./conferir-municipios";
import { MUNICIPIOS_BA } from "./municipios-ba";

// Uma leitura só para alimentar painel, filtro de município e mapa.
//
// O caminho rápido é a função painel_territorio() no Postgres: ela agrupa onde
// os dados estão e devolve algumas centenas de linhas. O caminho lento (ler a
// base inteira em blocos de 1000) fica como rede de segurança para o caso de a
// função ainda não existir no banco — sem ele, a página quebraria entre o
// deploy do código e a execução do SQL.

export type Contagem = { nome: string; qtd: number };
export type MunicipioMapa = { municipio: string; qtd: number; bairros: Contagem[] };

export type Territorio = {
  mapa: MunicipioMapa[];
  porMunicipio: Contagem[];
  /**
   * As grafias que NÃO são município da Bahia, com quanta gente tem em cada.
   *
   * "Pernambuco", "Chapada Diamantina", "Não Informou". É lista de TRABALHO e
   * não descarte: cada linha é gente com telefone esperando alguém dizer de
   * qual cidade ela é. Consertar "Pernambuco" resolve 14 de uma vez.
   */
  aRevisar: Contagem[];
  porOrigem: Contagem[];
  total: number;
  comTelefone: number;
  vinculados: number;
  novosSemana: number;
  semMunicipio: number;
  /** Quantos dos 417 têm ao menos uma pessoa. Contado no banco, não na tela. */
  municipiosAlcancados: number;
  municipiosDaBahia: number;
  /** Quanta gente está numa grafia que não é município daqui. */
  pessoasARevisar: number;
  /**
   * Gente cadastrada com município de OUTRO ESTADO — pelo município escrito no
   * cadastro, nunca pelo DDD. Até 15/09 isto vinha misturado em `aRevisar`, e
   * "Pernambuco" aparecia como grafia errada. Opcional: a leitura antiga, sem a
   * migração 0024, não tem.
   */
  outroEstado?: Contagem[];
  pessoasOutroEstado?: number;
  /**
   * A leitura FALHOU — os números abaixo não valem nada.
   *
   * Existe porque zero é uma resposta legítima ("não tem ninguém") e também o
   * que sobra quando a consulta morre. A tela precisa saber a diferença: em
   * 12/09 o banco devolveu 503 por um instante, a página mostrou
   * "0 munícipes na rede", e o Emanuel achou que a base tinha sido apagada.
   *
   * Havia 6.430 pessoas lá.
   */
  falhou?: boolean;
};

const VAZIO: Territorio = {
  mapa: [],
  porMunicipio: [],
  aRevisar: [],
  porOrigem: [],
  total: 0,
  comTelefone: 0,
  vinculados: 0,
  novosSemana: 0,
  semMunicipio: 0,
  municipiosAlcancados: 0,
  municipiosDaBahia: 417,
  pessoasARevisar: 0,
};

type Cliente = Awaited<ReturnType<typeof createClient>>;

// Cache curto por sessão.
//
// O agregado é o mesmo para as três abas de Munícipes e para o Mapa: sem isso,
// alternar entre elas refazia a mesma soma. Um minuto de validade é curto o
// bastante para um cadastro novo aparecer sem ninguém reclamar, e longo o
// bastante para a navegação ficar instantânea.
//
// A chave inclui a sessão de quem pediu: o que uma pessoa pode ver depende das
// políticas do banco, e cache compartilhado entre contas mostraria a uma o
// recorte da outra.
const VALIDADE = 60_000;
const cache = new Map<string, { t: number; dados: Territorio }>();

async function chaveDaSessao() {
  try {
    const jar = await cookies();
    const token = jar
      .getAll()
      .filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))
      .map((c) => c.value)
      .join("|");
    if (!token) return null;
    // Só um resumo do token vira chave — o valor inteiro não fica guardado.
    let h = 0;
    for (let i = 0; i < token.length; i++) h = (Math.imul(31, h) + token.charCodeAt(i)) | 0;
    return `s${h}`;
  } catch {
    return null;
  }
}

export async function lerTerritorio(supabase: Cliente): Promise<Territorio> {
  const chave = await chaveDaSessao();
  const agora = Date.now();

  if (chave) {
    const guardado = cache.get(chave);
    if (guardado && agora - guardado.t < VALIDADE) return guardado.dados;
  }

  const { data, error } = await supabase.rpc("painel_territorio");

  let dados: Territorio;
  if (!error && data) {
    dados = { ...VAZIO, ...(data as Territorio) };
  } else {
    // O caminho de reserva percorre a tabela inteira. Ele existe para quando a
    // função ainda não está no banco — e nesse caso funciona. Mas quando a
    // falha é de CONEXÃO, ele falha igual e devolve tudo zerado.
    const reserva = await somarNoServidor(supabase);
    // Zero com erro na frente não é "não tem ninguém": é "não consegui ler".
    dados = reserva.total === 0 ? { ...reserva, falhou: true } : reserva;
    console.error(
      `territorio: a função falhou (${error?.message ?? "sem dados"}), reserva devolveu ${reserva.total}`,
    );
  }

  // ── FALHA NÃO SE GUARDA ───────────────────────────────────────────────────
  //
  // Sem isto, um tropeço de um segundo ficaria um minuto inteiro na memória, e
  // todo mundo que abrisse a tela nesse minuto veria zero — muito depois de o
  // banco ter voltado.
  if (chave && !dados.falhou) {
    // Instância de servidor não vive muito; ainda assim, teto para não crescer.
    if (cache.size > 50) cache.clear();
    cache.set(chave, { t: agora, dados });
  }
  return dados;
}

/** Fallback: soma linha a linha quando a função ainda não está no banco. */
async function somarNoServidor(supabase: Cliente): Promise<Territorio> {
  type Linha = {
    municipio: string | null;
    bairro: string | null;
    created_via: string | null;
    tipo: string | null;
    telefone: string | null;
    parent_id: string | null;
    created_at: string | null;
  };

  const linhas = await paginar<Linha>((de, ate) =>
    supabase
      .from("liderancas")
      .select("municipio, bairro, created_via, tipo, telefone, parent_id, created_at")
      .neq("tipo", "contato")
      // ORDEM FIXA, e não é enfeite: sem `order`, o Postgres não promete a
      // mesma sequência entre uma página e a seguinte. Linha repetida ou
      // pulada vira total errado — e errado em silêncio, que é o pior.
      .order("id")
      .range(de, ate),
  );

  const porMun = new Map<string, { qtd: number; bairros: Map<string, number> }>();
  const porMunicipio = new Map<string, number>();
  const porOrigem = new Map<string, number>();
  const limite = Date.now() - 7 * 86_400_000;

  let total = 0;
  let comTelefone = 0;
  let vinculados = 0;
  let novosSemana = 0;
  let semMunicipio = 0;

  for (const l of linhas) {
    const mun = (l.municipio ?? "").trim();
    const bairro = (l.bairro ?? "").trim();
    // ── QUEM CONTA COMO PESSOA DA REDE ──────────────────────────────────
    //
    // Antes só `lead` contava. As lideranças ficavam de fora — coloriam o mapa
    // e sumiam de todos os números do painel.
    //
    // Apareceu de verdade: 191 pessoas da planilha de encaminhamentos entraram
    // no banco, o mapa passou a mostrá-las, e o cartão continuou dizendo 83.
    // Quem mensura pelo painel estava contando menos da metade.
    //
    // `contato` continua fora, e por um motivo diferente: são 1.702 linhas da
    // base antiga SEM TELEFONE NENHUM. Não são gente que a campanha alcança —
    // e misturá-las faria "100% com telefone" virar mentira.
    const ehLead = ["lead", "lideranca"].includes(l.tipo ?? "lead");

    if (mun) {
      const item = porMun.get(mun) ?? { qtd: 0, bairros: new Map<string, number>() };
      item.qtd++;
      if (bairro) item.bairros.set(bairro, (item.bairros.get(bairro) ?? 0) + 1);
      porMun.set(mun, item);
    } else {
      semMunicipio++;
    }

    if (!ehLead) continue;
    total++;
    if (l.telefone) comTelefone++;
    if (l.parent_id) vinculados++;
    if (l.created_at && new Date(l.created_at).getTime() >= limite) novosSemana++;
    if (mun) porMunicipio.set(mun, (porMunicipio.get(mun) ?? 0) + 1);
    const origem = (l.created_via ?? "").trim();
    if (origem) porOrigem.set(origem, (porOrigem.get(origem) ?? 0) + 1);
  }

  const ordenar = (m: Map<string, number>) =>
    [...m.entries()].map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd);

  // ── MESMA REGRA DO BANCO, NO CAMINHO RESERVA ───────────────────────────────
  //
  // Este caminho só roda quando a função do Postgres falha. Se ele contasse
  // diferente, o dia em que a função falhasse a tela mostraria 569 municípios
  // sem ninguém entender por quê — e "às vezes certo" é pior que sempre errado,
  // porque ninguém procura defeito num número que costuma bater.
  const oficiais = new Set(MUNICIPIOS_BA.map((n) => chave(n)));
  const vale = (nome: string) => oficiais.has(chave(nome));
  const soValidos = (m: Map<string, number>) =>
    new Map([...m.entries()].filter(([nome]) => vale(nome)));

  const aRevisar = ordenar(
    new Map([...porMunicipio.entries()].filter(([nome]) => !vale(nome))),
  );

  return {
    mapa: [...porMun.entries()]
      .filter(([municipio]) => vale(municipio))
      .map(([municipio, v]) => ({
        municipio,
        qtd: v.qtd,
        bairros: ordenar(v.bairros).slice(0, 12),
      }))
      .sort((a, b) => b.qtd - a.qtd),
    porMunicipio: ordenar(soValidos(porMunicipio)),
    aRevisar,
    municipiosAlcancados: soValidos(porMun as unknown as Map<string, number>).size,
    municipiosDaBahia: MUNICIPIOS_BA.length,
    pessoasARevisar: aRevisar.reduce((soma, m) => soma + m.qtd, 0),
    porOrigem: ordenar(porOrigem),
    total,
    comTelefone,
    vinculados,
    novosSemana,
    semMunicipio,
  };
}
