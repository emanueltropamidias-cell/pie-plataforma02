"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Smartphone,
  AlertTriangle,
  Check,
  X,
  Power,
  DownloadCloud,
  FileSpreadsheet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Parear } from "@/components/numeros/parear";

// Os números da campanha.
//
// ── POR QUE VÁRIOS ──────────────────────────────────────────────────────────
//
// Um número só, recebendo o tráfego inteiro, é o que foi banido em 26/08:
// 34.855 mensagens e 5.141 contatos em dez horas. O WhatsApp corta número que
// se comporta como robô.
//
// Dividir o tráfego reduz o risco por número — não elimina. O que de fato
// segura é o VOLUME POR NÚMERO ficar perto do humano. Por isso esta tela mostra
// `leads 24h` em destaque: é o número que a coordenação precisa olhar todo dia,
// e acima de ~300 por número o risco sobe rápido.
//
// ── O QUE É "INSTÂNCIA" ─────────────────────────────────────────────────────
//
// É o apelido técnico do número dentro da Evolution — o mesmo texto que aparece
// no painel dela. É por ele que o webhook reconhece de quem é a mensagem, e é
// por ele que a resposta sai pelo número certo.
//
// Errar esse texto é o erro caro: a mensagem chega e é gravada num número que
// não existe, ou a resposta sai pelo número errado. Por isso ele não se edita
// depois de criado.

export type Linha = {
  id: number;
  apelido: string;
  telefone: string | null;
  instancia: string;
  provedor: string;
  cor: string;
  ativo: boolean;
  ordem: number;
  atendente_id: string | null;
  atendente: string | null;
  abertas: number;
  aguardando: number;
  leads_24h: number;
  leads_hoje: number;
  ultima_atividade: string | null;
  /** O que a Evolution diz agora: open, connecting, close — ou nada. */
  estado: string | null;
  motivo: number | null;
};

export type Pessoa = { id: string; nome: string };

const CORES = [
  "#0525f7",
  "#12703c",
  "#c02020",
  "#a35a00",
  "#5b34c9",
  "#c2185b",
  "#0d7a8a",
];

/** Acima disto, o número está em faixa de risco. Ver o comentário do topo. */
const LIMITE_SEGURO = 300;

function quando(iso: string | null) {
  if (!iso) return "nunca";
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(min)) return "nunca";
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

export function Numeros({
  linhas,
  equipe,
}: {
  linhas: Linha[];
  equipe: Pessoa[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [erroDona, setErroDona] = useState<string | null>(null);
  // ── TRAZER O QUE ACONTECEU FORA DO PIE ────────────────────────────────────
  //
  // Quando a sessão cai e a equipe atende pelo aplicativo, a Evolution guarda a
  // conversa mas o PIE não recebe o webhook. Foi assim que apareceram 165
  // conversas nela contra 128 aqui.
  const [importando, setImportando] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);

  async function importar(l: Linha) {
    setImportando(l.instancia);
    setRecado(null);
    try {
      const r = await fetch("/api/atendimento/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Dois dias cobre "a sessão caiu ontem e voltou hoje", que é o caso
        // real. Mais que isso começa a trazer contato antigo do WhatsApp
        // pessoal, que não é lead.
        body: JSON.stringify({ instancia: l.instancia, dias: 2 }),
      });
      const j = await r.json();
      setRecado(
        r.ok
          ? j.achadas === 0
            ? j.aviso ?? "Nada novo para trazer."
            : `${j.achadas} conversas encontradas em ${l.apelido}. Estão sendo gravadas — recarregue em um minuto.`
          : (j?.erro ?? "Não consegui importar."),
      );
    } catch {
      setRecado("Falha de rede.");
    } finally {
      setImportando(null);
    }
  }

  // ── A DONA DO NÚMERO ──────────────────────────────────────────────────────
  //
  // O lead que entra por este número nasce com ela. Trocar a dona NÃO mexe no
  // que já está em andamento: quem está no meio de um atendimento termina o
  // atendimento. Só o que chegar depois muda de mão.
  async function darDona(numeroId: number, atendenteId: string | null) {
    setErroDona(null);

    // ── ESCOLHER ALGUÉM QUE JÁ TEM NÚMERO É MUDAR ELA DE NÚMERO ─────────────
    //
    // Antes isto recusava com "essa atendente já é dona de outro número", por
    // causa do índice de uma-dona-por-número. Parecia proteção e era um beco:
    //
    //   Para trocar Boneca e Maiana de lugar, qualquer ordem passa por um
    //   estado onde alguém é dona de dois. As duas tentativas batem no índice,
    //   e a troca fica IMPOSSÍVEL pela tela.
    //
    // Ninguém que escolhe um nome aqui quer ser recusado — quer dizer "este
    // número é dela agora". Então solta ela de onde estava e traz para cá.
    if (atendenteId) {
      const { error: erroSolta } = await supabase
        .from("numeros")
        .update({ atendente_id: null })
        .eq("atendente_id", atendenteId)
        .neq("id", numeroId);
      if (erroSolta) {
        setErroDona(erroSolta.message);
        return;
      }
    }

    const { error } = await supabase
      .from("numeros")
      .update({ atendente_id: atendenteId })
      .eq("id", numeroId);

    if (error) {
      setErroDona(error.message);
      return;
    }

    // ── ESCOLHER A DONA ADOTA O QUE ESTAVA SEM DONO ────────────────────────
    //
    // `conversa_nasce_com_dona` só roda no INSERT: ela dá dona à conversa NOVA.
    // O lead que entrou entre o pareamento e este clique ficava órfão para
    // sempre — e é justamente a janela de todo chip novo, porque o número
    // pareado nasce sem dona e os leads chegam antes de alguém vir aqui.
    //
    // SÓ O QUE NÃO É DE NINGUÉM. Conversa que já está com uma atendente não
    // muda de mão: quem está no meio de um atendimento termina o atendimento,
    // que é a regra desta tela desde sempre. Trocar a dona do número não pode
    // arrancar conversa da mão de quem está falando.
    //
    // `atribuido_em = agora` e não a hora da conversa: é quando ela passou a ter
    // dona de verdade. Datar para trás mentiria no relatório de SLA.
    if (atendenteId) {
      const { error: erroAdota } = await supabase
        .from("conversas")
        .update({
          atendente_id: atendenteId,
          atribuido_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        })
        .eq("numero_id", numeroId)
        .is("atendente_id", null)
        .is("encerrada_em", null);

      if (erroAdota) {
        setErroDona(
          `O número passou a ser dela, mas não consegui passar os leads que estavam sem dono: ${erroAdota.message}`,
        );
        return;
      }
    }

    router.refresh();
  }
  const [novo, setNovo] = useState(false);
  const [apelido, setApelido] = useState("");
  const [instancia, setInstancia] = useState("");
  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function criar() {
    const nome = apelido.trim();
    const inst = instancia.trim();
    if (!nome || !inst) {
      setErro("Preencha o apelido e a instância.");
      return;
    }
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(inst)) {
      setErro("A instância só aceita letras, números, hífen e sublinhado.");
      return;
    }

    setSalvando(true);
    setErro(null);
    const { error } = await supabase.from("numeros").insert({
      apelido: nome,
      instancia: inst,
      telefone: telefone.replace(/\D/g, "") || null,
      cor: CORES[linhas.length % CORES.length],
      ordem: (linhas.at(-1)?.ordem ?? 0) + 10,
    });
    setSalvando(false);

    if (error) {
      setErro(
        error.code === "23505"
          ? "Já existe um número com essa instância."
          : error.message,
      );
      return;
    }
    setApelido("");
    setInstancia("");
    setTelefone("");
    setNovo(false);
    router.refresh();
  }

  async function alternar(l: Linha) {
    await supabase
      .from("numeros")
      .update({ ativo: !l.ativo })
      .eq("id", l.id);
    router.refresh();
  }

  const total24h = linhas
    .filter((l) => l.ativo)
    .reduce((s, l) => s + l.leads_24h, 0);
  const noAr = linhas.filter((l) => l.estado === "open").length;

  return (
    <div className="flex flex-col gap-4">
      {/* ── o resumo que decide o dia ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Cartao rotulo="Números no ar" valor={`${noAr} de ${linhas.filter((l) => l.ativo).length}`} ruim={noAr === 0} />
        <Cartao rotulo="Leads em 24h" valor={total24h} />
        <Cartao
          rotulo="Aguardando"
          valor={linhas.reduce((s, l) => s + l.aguardando, 0)}
          atencao={linhas.reduce((s, l) => s + l.aguardando, 0) > 0}
        />
      </div>

      {recado && (
        <p className="rounded-lg border border-[#d9e6fb] bg-[#f2f7ff] px-3 py-2 text-[12.5px] leading-relaxed text-[#2f6fd0]">
          {recado}
        </p>
      )}

      {erroDona && (
        <p className="rounded-lg border border-[#f3d3d3] bg-[#fdf1f1] px-3 py-2 text-[12.5px] text-[#c02020]">
          {erroDona}
        </p>
      )}

      {/* ── a lista ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        {linhas.map((l) => {
          const arriscado = l.leads_24h > LIMITE_SEGURO;
          const caiu = l.ativo && l.estado !== null && l.estado !== "open";
          return (
            <div
              key={l.id}
              className={`rounded-xl border bg-white p-4 ${
                caiu ? "border-[#f3d3d3]" : "border-tinta-200"
              } ${l.ativo ? "" : "opacity-55"}`}
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: l.cor }}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-bold text-tinta-900">
                    {l.apelido}
                    <Selo estado={l.estado} ativo={l.ativo} />
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-tinta-400">
                    <code>{l.instancia}</code>
                    {l.telefone && <> · {l.telefone}</>}
                    {" · "}
                    {quando(l.ultima_atividade)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {/* TODO NÚMERO PAREIA, sem exceção.
                      Houve um bloqueio aqui para a linha `__historico__`, de
                      quando ela era só o arquivo das conversas antigas. Ela
                      virou o número de uma atendente de verdade, e o bloqueio
                      deixou justamente ela sem como reconectar — a sessão caiu
                      e não havia botão para levantar. Trava que sobrevive ao
                      motivo que a criou vira o próximo defeito. */}
                  <Parear
                    instancia={l.instancia}
                    apelido={l.apelido}
                    conectado={l.estado === "open"}
                  />
                  {/* A AGENDA INTEIRA, em planilha.
                      Exporta e não importa: são milhares de contatos antigos
                      do aparelho, e jogá-los na caixa destruiria a fila — que
                      é a ferramenta de trabalho da atendente. */}
                  <a
                    href={`/api/atendimento/contatos?i=${encodeURIComponent(l.instancia)}`}
                    title="Baixar a agenda deste número em planilha"
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-tinta-200 px-2.5 text-[12px] font-semibold text-tinta-600 transition-colors hover:border-tema hover:text-tema"
                  >
                    <FileSpreadsheet size={13} />
                    Contatos
                  </a>
                  <button
                    onClick={() => importar(l)}
                    disabled={importando !== null}
                    title="Trazer para o PIE as conversas que a equipe atendeu pelo aplicativo"
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-tinta-200 px-2.5 text-[12px] font-semibold text-tinta-600 transition-colors hover:border-tema hover:text-tema disabled:opacity-40"
                  >
                    <DownloadCloud size={13} />
                    {importando === l.instancia ? "Buscando…" : "Importar"}
                  </button>
                  <button
                    onClick={() => alternar(l)}
                    title={l.ativo ? "Desativar" : "Ativar"}
                    className="rounded-lg border border-tinta-200 p-1.5 text-tinta-400 transition-colors hover:border-tinta-300 hover:text-tinta-900"
                  >
                    <Power size={14} />
                  </button>
                </div>
              </div>

              {/* ── de quem é ─────────────────────────────────────────────
                  Logo abaixo do nome, e não escondido num menu: é a coisa que
                  muda o comportamento do número, e quem abre esta tela abre
                  justamente para conferir isso. */}
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-tinta-50 px-2.5 py-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-tinta-400">
                  Atende
                </span>
                <select
                  value={l.atendente_id ?? ""}
                  onChange={(e) => darDona(l.id, e.target.value || null)}
                  className="h-7 min-w-0 flex-1 rounded-md border border-tinta-200 bg-white px-1.5 text-[12.5px] font-semibold text-tinta-800 outline-none focus:border-tema"
                >
                  <option value="">— ninguém ainda —</option>
                  {equipe.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>

              {/* NÃO EXISTE MONTE, E NINGUÉM PUXA NADA.
                  Dizia que o lead "espera alguém puxar". Não espera: com um
                  chip por atendente o lead que chega no chip é dela, e pronto.
                  Número sem dona não é lead de todo mundo — é lead de ninguém,
                  invisível para a equipe até esta linha ter um nome. É o estado
                  de todo chip recém-pareado, então é o que a coordenação lê
                  primeiro. */}
              {!l.atendente_id && l.ativo && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-[#8a4a10]">
                  Sem dona, o lead deste número <b>não aparece para ninguém</b> —
                  só para a coordenação. Escolha uma acima: os leads que já
                  entraram passam para ela na hora, e os próximos já nascem
                  dela.
                </p>
              )}

              <div className="mt-3 grid grid-cols-3 gap-2">
                {/* 24h corridas, e não "hoje": o risco de banimento é uma
                    janela deslizante. Mil contatos entre 22h e 6h contam
                    igual, e um contador que zera à meia-noite esconderia
                    exatamente a madrugada em que o número queima. */}
                <Mini rotulo="Leads 24h" valor={l.leads_24h} ruim={arriscado} />
                <Mini rotulo="Abertas" valor={l.abertas} />
                <Mini
                  rotulo="Aguardando"
                  valor={l.aguardando}
                  atencao={l.aguardando > 0}
                />
              </div>

              {caiu && (
                <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-[#fdf1f1] px-2.5 py-2 text-[11.5px] leading-relaxed text-[#c02020]">
                  <AlertTriangle size={13} className="mt-px shrink-0" />
                  <span>
                    <b>Fora do ar.</b>{" "}
                    {l.motivo === 401
                      ? "Código 401 — o WhatsApp derrubou o aparelho conectado. Não é banimento: se o WhatsApp abre normal no celular, o número está bem. Leia o QR de novo."
                      : "Precisa ler o QR de novo na Evolution."}
                  </span>
                </p>
              )}

              {arriscado && !caiu && (
                <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-[#fdf6ea] px-2.5 py-2 text-[11.5px] leading-relaxed text-[#a35a00]">
                  <AlertTriangle size={13} className="mt-px shrink-0" />
                  <span>
                    <b>{l.leads_24h} contatos novos em 24h.</b> Acima de{" "}
                    {LIMITE_SEGURO} o risco de banimento sobe rápido — tire
                    tráfego deste número.
                  </span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── novo número ─────────────────────────────────────────────────── */}
      {novo ? (
        <div className="rounded-xl border border-tema bg-white p-4">
          <h3 className="text-[14px] font-bold text-tinta-900">Novo número</h3>
          <p className="mt-0.5 text-[12px] leading-relaxed text-tinta-500">
            {/* ESTE TEXTO ESTAVA INVERTIDO e mandava a pessoa para o painel da
                Evolution — de quando ler o QR só era possível lá. Instrução
                velha é pior que instrução nenhuma: ela é seguida. */}
            Cadastre aqui e depois clique em <b>Ler o QR</b>. O PIE cria a
            instância na Evolution e já aponta o webhook — você não precisa
            abrir o painel dela.
          </p>

          {erro && (
            <p className="mt-2.5 rounded-md bg-[#fdf1f1] px-3 py-2 text-[12px] text-[#c02020]">
              {erro}
            </p>
          )}

          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            <Campo
              rotulo="Apelido"
              dica="Quem atende este número"
              valor={apelido}
              aoMudar={setApelido}
              exemplo="Thami"
            />
            <Campo
              // NÃO MUDA DEPOIS. É a chave que liga a conversa ao número: o
              // webhook chega com este nome e é por ele que se acha de quem é.
              // Trocar desliga o histórico inteiro daquele número.
              rotulo="Instância"
              dica="Sem espaço nem acento — não muda depois"
              valor={instancia}
              aoMudar={setInstancia}
              exemplo="talita2"
            />
            <Campo
              rotulo="Telefone"
              dica="Só para conferência"
              valor={telefone}
              aoMudar={setTelefone}
              exemplo="5571988887777"
            />
          </div>

          <div className="mt-3.5 flex items-center gap-2">
            <button
              onClick={criar}
              disabled={salvando}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-tema px-4 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              <Check size={14} />
              {salvando ? "Salvando…" : "Cadastrar"}
            </button>
            <button
              onClick={() => {
                setNovo(false);
                setErro(null);
              }}
              className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] text-tinta-500 hover:text-tinta-900"
            >
              <X size={14} />
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setNovo(true)}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-tinta-300 text-[13px] font-semibold text-tinta-500 transition-colors hover:border-tema hover:text-tema"
        >
          <Plus size={15} />
          {/* "mais um" sendo o primeiro faz a pessoa achar que está no lugar
              errado — e numa instalação nova esta é a primeira coisa que ela
              faz no PIE. */}
          {linhas.length === 0 ? "Cadastrar o primeiro chip" : "Cadastrar mais um número"}
        </button>
      )}
    </div>
  );
}

function Selo({ estado, ativo }: { estado: string | null; ativo: boolean }) {
  if (!ativo)
    return (
      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-tinta-400">
        desativado
      </span>
    );
  const mapa: Record<string, { t: string; f: string; c: string }> = {
    open: { t: "no ar", f: "#e9f3ec", c: "#12703c" },
    // ── "lendo QR" fazia o Emanuel perder tempo em 23/09 ────────────────────
    //
    // `connecting` NÃO é "está conectando, já vai". É a instância PARADA,
    // esperando alguém apontar um celular para o QR — e enquanto está assim,
    // nada entra e nada sai. O chip da Maiana ficou nesse estado desde 22/09
    // 17:54 segurando 2.532 conversas, e ele leu o selo como sinal de que
    // estava tudo certo: "não gera o qrcode, mostra como se já estivesse
    // conectado".
    //
    // O selo agora diz o que FALTA FAZER, não o que a máquina está fazendo.
    connecting: { t: "precisa ler o QR", f: "#fdf6ea", c: "#a35a00" },
    close: { t: "fora do ar", f: "#fdf1f1", c: "#c02020" },
    // Recusado pelo WhatsApp. Caía no "sem resposta" cinza, que a tela usa para
    // ausência de informação — e este é o contrário: é informação, e é ruim.
    refused: { t: "recusado", f: "#fdf1f1", c: "#c02020" },
  };
  const s = mapa[estado ?? ""] ?? {
    t: "sem resposta",
    f: "#f1f1f3",
    c: "#52535c",
  };
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ background: s.f, color: s.c }}
    >
      {s.t}
    </span>
  );
}

function Cartao({
  rotulo,
  valor,
  ruim,
  atencao,
}: {
  rotulo: string;
  valor: string | number;
  ruim?: boolean;
  atencao?: boolean;
}) {
  const cor = ruim ? "#c02020" : atencao ? "#a35a00" : "#101114";
  return (
    <div className="rounded-lg border border-tinta-200 bg-white px-4 py-3">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-tinta-400">
        {rotulo}
      </span>
      <div
        className="mt-1 text-[22px] font-extrabold leading-none tracking-[-0.02em]"
        style={{ color: cor }}
      >
        {valor}
      </div>
    </div>
  );
}

function Mini({
  rotulo,
  valor,
  ruim,
  atencao,
}: {
  rotulo: string;
  valor: number;
  ruim?: boolean;
  atencao?: boolean;
}) {
  return (
    <div className="rounded-lg bg-tinta-50 px-2.5 py-2">
      <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-tinta-400">
        {rotulo}
      </span>
      <div
        className="text-[16px] font-bold leading-tight"
        style={{ color: ruim ? "#c02020" : atencao ? "#a35a00" : "#101114" }}
      >
        {valor}
      </div>
    </div>
  );
}

function Campo({
  rotulo,
  dica,
  valor,
  aoMudar,
  exemplo,
}: {
  rotulo: string;
  dica: string;
  valor: string;
  aoMudar: (v: string) => void;
  exemplo: string;
}) {
  return (
    <label className="block">
      <span className="text-[11.5px] font-semibold text-tinta-600">
        {rotulo}
      </span>
      <span className="ml-1.5 text-[11px] text-tinta-400">{dica}</span>
      <input
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={exemplo}
        className="mt-1 h-9 w-full rounded-md border border-tinta-200 px-2.5 text-[16px] outline-none focus:border-tema sm:text-[13px]"
      />
    </label>
  );
}

export function Vazio() {
  return (
    <div className="rounded-xl border border-dashed border-tinta-300 bg-white/60 p-8 text-center">
      <Smartphone size={22} className="mx-auto text-tinta-300" />
      <p className="mt-2 text-[13.5px] font-semibold text-tinta-700">
        Nenhum número cadastrado
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-tinta-500">
        A tabela de números não existe neste banco — esta instalação está
        incompleta.
      </p>
    </div>
  );
}
