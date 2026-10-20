"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import {
  Plus,
  Trash2,
  QrCode,
  Image as IconeArte,
  UserPlus,
  Eye,
} from "lucide-react";
import { montarCartao } from "@/components/links/cartao";
import { CANDIDATO } from "@/lib/candidato";

const SITE = CANDIDATO.site;

export type Lider = {
  id: number;
  nome: string;
  codigo: string;
  leituras: number;
};

export type LinhaLink = {
  id: number;
  slug: string;
  nome: string;
  destino: string | null;
  ativo: boolean;
  arte: string | null;
  categoria: string | null;
  criado_em: string;
  leituras: number;
  leiturasHoje: number;
  /**
   * Quantas PESSOAS, e não quantas aberturas.
   *
   * Aproximação por impressão de rede + navegador: quem escaneia no wifi e
   * depois no 4G aparece duas vezes; duas pessoas na mesma rede aparecem como
   * uma. Para material impresso erra bem menos que contar abertura — e o "~" na
   * tela existe para ninguém tratar isso como censo.
   */
  pessoas: number;
  lideres: Lider[];
  /**
   * Por qual botão a pessoa entrou, quando o link é de site e não de QR.
   *
   * Hoje só a /1022 preenche: `botao` (o bloco amarelo no meio) e `barra` (a
   * barra fixa que acende depois do voto na urna). Vazio nos QR impressos, que
   * têm um caminho só.
   */
  origens: Record<string, number>;
};

/** Como cada origem se chama na tela. O banco guarda a chave curta que o
 *  navegador manda; quem lê o cartão precisa da frase. */
const NOME_DA_ORIGEM: Record<string, string> = {
  botao: "pelo botão da página",
  barra: "pela barra depois do voto",
};

// ── PARA ONDE O QR LEVA: NÚMERO OU ENDEREÇO ─────────────────────────────────
//
// Quase sempre é NÚMERO: o QR do banner leva a pessoa para uma conversa no
// WhatsApp da campanha. Pedir que a coordenação monte à mão um
// `api.whatsapp.com/send?phone=...&text=...` seria pedir para errar.
//
// O banco guarda sempre uma URL — a rota de redirecionamento continua burra, e
// é isso que a mantém rápida. Quem traduz número em link é esta tela.

/** DDI + DDD + número, só dígitos. Número brasileiro colado sem o 55 ganha. */
function soDigitosWA(v: string) {
  const d = (v || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

/**
 * O link direto da API do WhatsApp, e não o `wa.me`.
 *
 * O wa.me é um encurtador que redireciona para cá de qualquer jeito, e cada
 * salto a mais é um motivo a mais para o WhatsApp desconfiar da origem — coisa
 * que esta campanha não pode pagar, com três chips já banidos.
 */
function linkDeNumero(numero: string, mensagem: string) {
  const p = new URLSearchParams({
    phone: soDigitosWA(numero),
    text: mensagem.trim() || "Oii Talita, tudo bem? Vim pelo QR code.",
    type: "phone_number",
    app_absent: "0",
  });
  return `https://api.whatsapp.com/send?${p.toString()}`;
}

/** Devolve o número quando o destino guardado é um link de WhatsApp — é o que
 *  permite reabrir a edição no modo certo em vez de mostrar a URL crua. */
function numeroDoDestino(destino: string | null) {
  if (!destino) return null;
  try {
    const u = new URL(destino);
    if (!u.hostname.includes("whatsapp.com")) return null;
    return {
      numero: u.searchParams.get("phone") ?? "",
      mensagem: u.searchParams.get("text") ?? "",
    };
  } catch {
    return null;
  }
}

/** O slug entra na URL e é DITADO por telefone quando a câmera não pega. Por
 *  isso só letra, número e traço — sem acento, sem maiúscula, sem espaço. */
function paraSlug(v: string) {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function Links({ inicial }: { inicial: LinhaLink[] }) {
  // ── MODO APRESENTAÇÃO ─────────────────────────────────────────────────────
  //
  // Mostrar esta tela para um candidato numa reunião expõe a lista inteira —
  // ou seja, com quem mais a campanha está fazendo dobradinha. Isso não é
  // detalhe de privacidade: é informação de negociação, e ela vaza de graça
  // enquanto a apresentação abre.
  //
  // O modo isola UM material. Some a busca, somem os outros grupos, some o
  // botão de criar. Fica o cartão, o QR e as lideranças daquele — que é o que
  // se quer mostrar.
  //
  // Mora na URL, e não em estado local: apertar F5 no meio da reunião com o
  // projetor ligado voltaria a lista inteira, que é exatamente o momento em
  // que não pode.
  const params = useSearchParams();
  const router = useRouter();
  const so = params.get("so");
  const soLink = so ? (inicial.find((l) => l.slug === so) ?? null) : null;

  function apresentar(slug: string | null) {
    const p = new URLSearchParams(params.toString());
    if (slug) p.set("so", slug);
    else p.delete("so");
    router.replace(
      `/atendimento/links${p.toString() ? `?${p}` : ""}`,
      { scroll: false },
    );
  }

  const supabase = createClient();
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  // NÚMERO é o padrão, e não a URL: quase todo QR da campanha leva para uma
  // conversa no WhatsApp. O modo que a pessoa usa 9 em 10 vezes tem de ser o
  // que já está escolhido quando a tela abre.
  const [modo, setModo] = useState<"numero" | "url">("numero");
  const [numero, setNumero] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [destino, setDestino] = useState("");
  const [editando, setEditando] = useState<number | null>(null);
  const [novoModo, setNovoModo] = useState<"numero" | "url">("numero");
  const [novoNumero, setNovoNumero] = useState("");
  const [novaMensagem, setNovaMensagem] = useState("");
  const [novoDestino, setNovoDestino] = useState("");
  const [qr, setQr] = useState<LinhaLink | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [abertoLideres, setAbertoLideres] = useState<number | null>(null);
  const [nomeLider, setNomeLider] = useState<Record<number, string>>({});
  const [categoria, setCategoria] = useState("");
  const [busca, setBusca] = useState("");

  async function criar() {
    const s = paraSlug(slug || nome);
    if (!nome.trim() || !s) return;
    setErro(null);
    const { error } = await supabase.from("links").insert({
      nome: nome.trim(),
      slug: s,
      // VAZIO É VÁLIDO. É o ponto de tudo isto: imprime-se o QR antes de o
      // destino existir. Quem ler cai no site até você preencher.
      categoria: categoria.trim() || null,
      destino:
        modo === "numero"
          ? numero.trim()
            ? linkDeNumero(numero, mensagem)
            : null
          : destino.trim() || null,
    });
    if (error) {
      setErro(
        error.code === "23505"
          ? "Já existe um link com esse endereço."
          : error.message,
      );
      return;
    }
    setNome("");
    setSlug("");
    setDestino("");
    setNumero("");
    setMensagem("");
    setCategoria("");
    setCriando(false);
    router.refresh();
  }

  async function salvarDestino(l: LinhaLink) {
    setErro(null);
    const { error } = await supabase
      .from("links")
      .update({
        destino:
          novoModo === "numero"
            ? novoNumero.trim()
              ? linkDeNumero(novoNumero, novaMensagem)
              : null
            : novoDestino.trim() || null,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", l.id);
    if (error) return setErro(error.message);
    setEditando(null);
    router.refresh();
  }

  async function alternar(l: LinhaLink) {
    await supabase.from("links").update({ ativo: !l.ativo }).eq("id", l.id);
    router.refresh();
  }

  async function apagar(l: LinhaLink) {
    if (
      !confirm(
        `Apagar "${l.nome}"?\n\nO QR já impresso passa a levar para o site. As ${l.leituras} leituras registradas somem junto.`,
      )
    )
      return;
    await supabase.from("links").delete().eq("id", l.id);
    router.refresh();
  }

  // ── A ARTE ────────────────────────────────────────────────────────────────
  //
  // Sobe para o mesmo balde dos materiais (`audios`, nome herdado de quando só
  // havia áudio). Um balde só evita política de acesso duplicada, que é como se
  // esquece de proteger um deles.
  async function subirArte(l: LinhaLink, f: File) {
    setErro(null);
    setOcupado(l.id);
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
    const caminho = `arte-link/${crypto.randomUUID()}.${ext}`;
    const { error: erroUp } = await supabase.storage
      .from("audios")
      .upload(caminho, f, { contentType: f.type, upsert: false });
    if (erroUp) {
      setOcupado(null);
      return setErro(`A arte não subiu: ${erroUp.message}`);
    }
    const { error } = await supabase
      .from("links")
      .update({ arte: caminho })
      .eq("id", l.id);
    setOcupado(null);
    if (error) return setErro(error.message);
    router.refresh();
  }

  // ── O CARD PRONTO PARA COMPARTILHAR ───────────────────────────────────────
  //
  // A arte mora num balde PRIVADO, então o navegador precisa de um endereço
  // assinado para desenhá-la no canvas. Cinco minutos bastam: o card é montado
  // e baixado em segundos.
  async function baixarCartao(l: LinhaLink, lider?: Lider) {
    setErro(null);
    setOcupado(l.id);
    try {
      const alvo = lider ? `${l.slug}/${lider.codigo}` : l.slug;
      const cv = document.getElementById(
        lider ? `qr-lider-${lider.id}` : `qr-alta-${l.id}`,
      ) as HTMLCanvasElement | null;
      if (!cv) throw new Error("QR não encontrado");

      let arteUrl: string | null = null;
      if (l.arte) {
        const { data } = await supabase.storage
          .from("audios")
          .createSignedUrl(l.arte, 300);
        arteUrl = data?.signedUrl ?? null;
      }

      const card = await montarCartao(cv, arteUrl, `${SITE.replace("https://www.", "")}/l/${alvo}`);
      if (!card) throw new Error("não consegui montar");
      const a = document.createElement("a");
      a.href = card.toDataURL("image/png");
      a.download = `card-${alvo.replace("/", "-")}.png`;
      a.click();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao montar o card.");
    } finally {
      setOcupado(null);
    }
  }

  async function criarLider(l: LinhaLink) {
    const nome = (nomeLider[l.id] ?? "").trim();
    if (!nome) return;
    const codigo = paraSlug(nome).slice(0, 30);
    setErro(null);
    const { error } = await supabase
      .from("link_lideres")
      .insert({ link_id: l.id, nome, codigo });
    if (error) {
      return setErro(
        error.code === "23505"
          ? `Já existe uma liderança com o código "${codigo}" neste material.`
          : error.message,
      );
    }
    setNomeLider((m) => ({ ...m, [l.id]: "" }));
    router.refresh();
  }

  async function apagarLider(d: Lider) {
    if (!confirm(`Tirar ${d.nome}?\n\nO QR dela para de contar separado, e as ${d.leituras} leituras já registradas somem.`))
      return;
    await supabase.from("link_lideres").delete().eq("id", d.id);
    router.refresh();
  }

  function baixarQR(l: LinhaLink) {
    // O canvas escondido é 1024px: QR de banner precisa de resolução, e o SVG
    // da tela é de 160. Baixar o que está na tela daria um QR borrado no
    // impresso — e ninguém descobre isso antes da gráfica.
    const cv = document.getElementById(
      `qr-alta-${l.id}`,
    ) as HTMLCanvasElement | null;
    if (!cv) return;
    const a = document.createElement("a");
    a.href = cv.toDataURL("image/png");
    a.download = `qr-${l.slug}.png`;
    a.click();
  }

  // O cartão de um material. Extraído do `map` porque o modo apresentação
  // desenha UM item fora do agrupamento — e duas cópias do mesmo cartão
  // divergiriam no primeiro botão que alguém acrescentasse num só lado.
  function ItemLink({ l }: { l: LinhaLink }) {
    return (
            <div
              key={l.id}
              className="rounded-xl border border-tinta-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[14px] font-bold ${l.ativo ? "text-tinta-900" : "text-tinta-400 line-through"}`}
                  >
                    {l.nome}
                  </p>
                  <p className="mt-0.5 select-all font-mono text-[12px] text-tema">
                    {SITE}/l/{l.slug}
                  </p>
                  {l.categoria && (
                    <span className="mt-1 inline-block rounded-full bg-tinta-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-tinta-500">
                      {l.categoria}
                    </span>
                  )}

                  {editando === l.id ? (
                    <div className="mt-2">
                      <div className="flex gap-1.5">
                        {(["numero", "url"] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => setNovoModo(m)}
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                              novoModo === m
                                ? "bg-tinta-900 text-white"
                                : "bg-tinta-200 text-tinta-600"
                            }`}
                          >
                            {m === "numero" ? "Número de WhatsApp" : "Endereço na web"}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {novoModo === "numero" ? (
                          <>
                            <input
                              value={novoNumero}
                              onChange={(e) => setNovoNumero(e.target.value)}
                              placeholder="(71) 98317-1310"
                              className="h-[34px] w-[170px] rounded-lg border border-tinta-300 px-2.5 text-[16px] outline-none focus:border-tema sm:text-[12.5px]"
                            />
                            <input
                              value={novaMensagem}
                              onChange={(e) => setNovaMensagem(e.target.value)}
                              placeholder="Mensagem que já chega escrita (opcional)"
                              className="h-[34px] min-w-[200px] flex-1 rounded-lg border border-tinta-300 px-2.5 text-[16px] outline-none focus:border-tema sm:text-[12.5px]"
                            />
                          </>
                        ) : (
                          <input
                            value={novoDestino}
                            onChange={(e) => setNovoDestino(e.target.value)}
                            placeholder="https://…"
                            className="h-[34px] min-w-[240px] flex-1 rounded-lg border border-tinta-300 px-2.5 text-[16px] outline-none focus:border-tema sm:text-[12.5px]"
                          />
                        )}
                      <button
                        onClick={() => salvarDestino(l)}
                        className="h-[34px] rounded-lg bg-tema px-3 text-[12px] font-semibold text-white"
                      >
                        salvar
                      </button>
                      <button
                        onClick={() => setEditando(null)}
                        className="text-[12px] text-tinta-500"
                      >
                        cancelar
                      </button>
                      </div>
                      {novoModo === "numero" && novoNumero.trim() && (
                        <p className="mt-1.5 break-all font-mono text-[10.5px] text-tinta-400">
                          vai virar: {linkDeNumero(novoNumero, novaMensagem)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-tinta-600">
                      vai para:{" "}
                      {l.destino ? (
                        <span className="break-all">{l.destino}</span>
                      ) : (
                        <span className="font-semibold text-[#a35a00]">
                          ainda sem destino — quem ler cai no site
                        </span>
                      )}{" "}
                      <button
                        onClick={() => {
                          // Reabre no MODO em que foi criado. Sem isto, um link de
                          // WhatsApp voltaria como URL crua de 120 caracteres, e a
                          // coordenação editaria um texto que não devia tocar.
                          const wa = numeroDoDestino(l.destino);
                          setNovoModo(wa ? "numero" : "url");
                          setNovoNumero(wa?.numero ?? "");
                          setNovaMensagem(wa?.mensagem ?? "");
                          setNovoDestino(wa ? "" : (l.destino ?? ""));
                          setEditando(l.id);
                        }}
                        className="ml-1 font-semibold text-tema underline underline-offset-2"
                      >
                        trocar
                      </button>
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-[19px] font-bold text-tinta-900">
                    {l.pessoas.toLocaleString("pt-BR")}
                  </p>
                  <p className="text-[11px] text-tinta-500">
                    {l.pessoas === 1 ? "pessoa" : "pessoas"}
                    {l.leituras > l.pessoas ? ` · ${l.leituras} aberturas` : ""}
                    {l.leiturasHoje > 0 ? ` · ${l.leiturasHoje} hoje` : ""}
                  </p>

                  {/* ── POR ONDE ENTROU ──────────────────────────────────
                      Só aparece quando há mais de um caminho. Num QR
                      impresso, que tem um só, a linha seria sempre igual ao
                      total logo acima — e número repetido em dois lugares é
                      convite para alguém somar os dois. */}
                  {Object.keys(l.origens).length > 1 && (
                    <div className="mt-1.5 space-y-0.5">
                      {Object.entries(l.origens)
                        .sort((a, b) => b[1] - a[1])
                        .map(([chave, n]) => (
                          <p key={chave} className="text-[10.5px] text-tinta-400">
                            <b className="font-semibold text-tinta-600">{n}</b>{" "}
                            {NOME_DA_ORIGEM[chave] ?? chave}
                          </p>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setQr(qr?.id === l.id ? null : l)}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-tinta-200 px-2.5 text-[12px] font-semibold text-tinta-600 hover:bg-tinta-100"
                >
                  <QrCode size={14} />
                  {qr?.id === l.id ? "esconder QR" : "ver QR"}
                </button>
                <button
                  onClick={() => baixarQR(l)}
                  className="h-8 rounded-lg border border-tinta-200 px-2.5 text-[12px] font-semibold text-tinta-600 hover:bg-tinta-100"
                >
                  baixar QR
                </button>
                {/* APRESENTAR: some tudo menos este material. Serve para mostrar
                    uma dobradinha ao candidato dela sem que a lista revele com
                    quem mais a campanha está negociando. */}
                {!soLink && (
                  <button
                    onClick={() => apresentar(l.slug)}
                    title="Mostrar só este material, escondendo os outros"
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-tinta-200 px-2.5 text-[12px] font-semibold text-tinta-600 hover:bg-tinta-100"
                  >
                    <Eye size={14} />
                    apresentar
                  </button>
                )}
                <button
                  onClick={() => baixarCartao(l)}
                  disabled={ocupado === l.id}
                  className="h-8 rounded-lg border border-tema/30 bg-tema/5 px-2.5 text-[12px] font-semibold text-tema hover:bg-tema/10 disabled:opacity-40"
                >
                  {ocupado === l.id ? "montando…" : "baixar card"}
                </button>
                <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-tinta-200 px-2.5 text-[12px] font-semibold text-tinta-600 hover:bg-tinta-100">
                  <IconeArte size={14} />
                  {l.arte ? "trocar arte" : "subir arte"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) subirArte(l, f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                <button
                  onClick={() =>
                    setAbertoLideres(abertoLideres === l.id ? null : l.id)
                  }
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-tinta-200 px-2.5 text-[12px] font-semibold text-tinta-600 hover:bg-tinta-100"
                >
                  <UserPlus size={14} />
                  lideranças
                  {l.lideres.length > 0 ? ` · ${l.lideres.length}` : ""}
                </button>
                <button
                  onClick={() => alternar(l)}
                  className="h-8 rounded-lg border border-tinta-200 px-2.5 text-[12px] font-semibold text-tinta-600 hover:bg-tinta-100"
                >
                  {l.ativo ? "desativar" : "ativar"}
                </button>
                <button
                  onClick={() => apagar(l)}
                  aria-label="Apagar"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-tinta-300 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {qr?.id === l.id && (
                <div className="mt-3 flex items-center gap-4 rounded-lg bg-tinta-50 p-4">
                  <QRCodeSVG value={`${SITE}/l/${l.slug}`} size={160} />
                  <p className="text-[12px] leading-relaxed text-tinta-600">
                    Aponte a câmera para conferir antes de mandar para a gráfica.
                    <br />
                    <b>Imprima o endereço embaixo do QR</b> — quando a câmera não
                    pega, é ele que salva.
                  </p>
                </div>
              )}

              {abertoLideres === l.id && (
                <div className="mt-3 rounded-lg bg-tinta-50 p-3.5">
                  {/* ── QUEM ESPALHA ESTE MATERIAL ────────────────────────────
                      Cada uma ganha um endereço próprio — `/l/dobradinha/joao` —
                      que leva ao MESMO destino e conta separado. Sem isso, no fim
                      do mês há um número só e ninguém sabe quem trouxe o quê, que
                      é justamente o que decide onde a campanha põe esforço.

                      E o destino continua morando no LINK: quando a dobradinha
                      mudar de endereço, troca-se num lugar e os cinquenta QR já
                      impressos passam a apontar para o novo. */}
                  <p className="text-[12px] leading-relaxed text-tinta-600">
                    Cada liderança ganha o próprio QR, com o mesmo destino e
                    contagem separada.
                  </p>

                  {l.lideres.length > 0 && (
                    <div className="mt-2.5 flex flex-col gap-1.5">
                      {l.lideres.map((d) => (
                        <div
                          key={d.id}
                          className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-2"
                        >
                          <span className="text-[12.5px] font-semibold text-tinta-900">
                            {d.nome}
                          </span>
                          <span className="select-all font-mono text-[11px] text-tema">
                            /l/{l.slug}/{d.codigo}
                          </span>
                          <span className="ml-auto text-[11.5px] text-tinta-500">
                            {d.leituras}{" "}
                            {d.leituras === 1 ? "leitura" : "leituras"}
                          </span>
                          <button
                            onClick={() => baixarCartao(l, d)}
                            disabled={ocupado === l.id}
                            className="rounded-md border border-tema/30 px-2 py-0.5 text-[11px] font-semibold text-tema disabled:opacity-40"
                          >
                            card
                          </button>
                          <button
                            onClick={() => apagarLider(d)}
                            aria-label={`Tirar ${d.nome}`}
                            className="text-tinta-300 hover:text-red-600"
                          >
                            <Trash2 size={13} />
                          </button>
                          <div className="hidden">
                            <QRCodeCanvas
                              id={`qr-lider-${d.id}`}
                              value={`${SITE}/l/${l.slug}/${d.codigo}`}
                              size={1024}
                              level="M"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-2.5 flex gap-2">
                    <input
                      value={nomeLider[l.id] ?? ""}
                      onChange={(e) =>
                        setNomeLider((m) => ({ ...m, [l.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") criarLider(l);
                      }}
                      placeholder="Nome de quem vai espalhar"
                      className="h-[34px] min-w-0 flex-1 rounded-lg border border-tinta-300 px-2.5 text-[16px] outline-none focus:border-tema sm:text-[12.5px]"
                    />
                    <button
                      onClick={() => criarLider(l)}
                      disabled={!(nomeLider[l.id] ?? "").trim()}
                      className="h-[34px] rounded-lg bg-tema px-3 text-[12px] font-semibold text-white disabled:opacity-40"
                    >
                      adicionar
                    </button>
                  </div>
                </div>
              )}

              {/* Fora da vista, em 1024px: é este que o botão baixa. O QR da tela
                  tem 160 e sairia borrado num banner. */}
              <div className="hidden">
                <QRCodeCanvas
                  id={`qr-alta-${l.id}`}
                  value={`${SITE}/l/${l.slug}`}
                  size={1024}
                  level="M"
                />
              </div>
                </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {erro && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          {erro}
        </p>
      )}

      {/* ── A FAIXA DO MODO APRESENTAÇÃO ──────────────────────────────────
          Precisa ser visível para quem está apresentando e discreta para quem
          assiste: se a pessoa esquecer que está nele, acha que perdeu os
          outros materiais e cria tudo de novo. */}
      {soLink && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-tema/30 bg-tema/5 px-3 py-2">
          <span className="text-[12.5px] text-tinta-700">
            <b className="text-tema">Modo apresentação</b> — mostrando só{" "}
            <b>{soLink.nome}</b>. Os outros materiais estão escondidos.
          </span>
          <button
            onClick={() => apresentar(null)}
            className="h-7 rounded-lg border border-tinta-300 bg-white px-2.5 text-[12px] font-semibold text-tinta-700 hover:bg-tinta-50"
          >
            sair
          </button>
        </div>
      )}

      {/* ── BUSCA E AGRUPAMENTO ───────────────────────────────────────────
          Numa lista corrida, vinte QR viram uma parede: quem procura "o do
          banner" rola tudo, não acha, e cria outro — e aí existem dois QR para
          a mesma coisa, com a contagem partida em dois.

          A busca só aparece quando há material o bastante para justificar. Campo
          de busca numa lista de três é ruído. */}
      {inicial.length > 5 && !soLink && (
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, endereço ou categoria"
          className="h-[38px] w-full rounded-[10px] border border-tinta-300 px-3 text-[16px] outline-none placeholder:text-tinta-400 focus:border-tema sm:h-[34px] sm:text-[12.5px]"
        />
      )}

      {inicial.length === 0 && !criando && !soLink && (
        <p className="rounded-lg border border-tinta-200 bg-tinta-50 px-4 py-3 text-[13px] leading-relaxed text-tinta-600">
          Nenhum link ainda. Crie um, imprima o QR, e defina o destino quando
          quiser — inclusive depois do material já estar na rua.
        </p>
      )}

      {(() => {
        // No modo apresentação a lista é UM item — e o filtro acontece antes
        // de tudo, para nenhum outro nome chegar a ser desenhado na página.
        if (soLink) {
          return (
            <div className="flex flex-col gap-3">
              {[soLink].map((l) => (
                <ItemLink key={l.id} l={l} />
              ))}
            </div>
          );
        }

        const termo = busca.trim().toLowerCase();
        const filtrados = termo
          ? inicial.filter(
              (l) =>
                l.nome.toLowerCase().includes(termo) ||
                l.slug.includes(termo) ||
                (l.categoria ?? "").toLowerCase().includes(termo),
            )
          : inicial;

        // Agrupa por categoria e ordena os grupos pelo que MAIS circula. O
        // material morto vai para o fim sozinho, sem ninguém arquivar nada.
        const grupos = new Map<string, LinhaLink[]>();
        for (const l of filtrados) {
          const g = l.categoria?.trim() || "Sem categoria";
          grupos.set(g, [...(grupos.get(g) ?? []), l]);
        }
        const ordenados = [...grupos.entries()].sort(
          (a, b) =>
            b[1].reduce((n, x) => n + x.leituras, 0) -
            a[1].reduce((n, x) => n + x.leituras, 0),
        );

        if (termo && filtrados.length === 0)
          return (
            <p className="px-1 py-2 text-[12.5px] text-tinta-500">
              Nada encontrado para “{busca}”.
            </p>
          );

        return ordenados.map(([grupo, itens]) => (
          <div key={grupo} className="flex flex-col gap-3">
            {/* O título só aparece quando há mais de um grupo: com um só, ele
                seria um rótulo repetindo o que a tela inteira já diz. */}
            {ordenados.length > 1 && (
              <div className="flex items-baseline gap-2 pt-1">
                <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-tinta-500">
                  {grupo}
                </h2>
                <span className="text-[11.5px] text-tinta-400">
                  {itens.length}{" "}
                  {itens.length === 1 ? "material" : "materiais"} ·{" "}
                  {itens
                    .reduce((n, x) => n + x.leituras, 0)
                    .toLocaleString("pt-BR")}{" "}
                  leituras
                </span>
              </div>
            )}
            {itens.map((l) => (
              <ItemLink key={l.id} l={l} />
            ))}
          </div>
        ));
      })()}

      {/* No modo apresentação o botão de criar também some: ele abre um
          formulário com o campo de categoria, e a categoria sugere as que já
          existem — ou seja, revelaria os outros materiais pelo autocompletar. */}
      {soLink ? null : !criando ? (
        <button
          onClick={() => setCriando(true)}
          className="flex h-[38px] w-full items-center justify-center gap-2 rounded-[10px] border border-tema/25 bg-tema/5 text-[12.5px] font-bold text-tema hover:bg-tema/10"
        >
          <Plus size={15} strokeWidth={2.4} />
          Criar link
        </button>
      ) : (
        <div className="rounded-xl border border-tinta-200 bg-tinta-50 p-4">
          <input
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              if (!slug) setSlug(paraSlug(e.target.value));
            }}
            placeholder="Para que é? Ex.: Dobradinha Talita e Neto — banner do comício"
            className="h-[36px] w-full rounded-lg border border-tinta-300 px-3 text-[16px] outline-none focus:border-tema sm:text-[13px]"
          />
          {/* ── A CATEGORIA ───────────────────────────────────────────────
              Texto livre com sugestão das que já existem. Lista fechada
              obrigaria a mexer no código a cada material novo, e enquanto isso
              a pessoa jogaria tudo em "Outros" — que é como a categoria morre.
              Sugerindo, elas se padronizam sozinhas: quem digita "Panfleto" na
              segunda vez escolhe da lista. */}
          <input
            list="categorias-de-link"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder="Categoria — Dobradinha, Panfleto, Banner, Adesivo…"
            className="mt-2 h-[34px] w-full rounded-lg border border-tinta-300 px-2.5 text-[16px] outline-none focus:border-tema sm:text-[12.5px]"
          />
          <datalist id="categorias-de-link">
            {[...new Set(inicial.map((l) => l.categoria).filter(Boolean))].map(
              (c) => (
                <option key={c as string} value={c as string} />
              ),
            )}
          </datalist>

          <div className="mt-2 flex items-center gap-1.5">
            <span className="shrink-0 font-mono text-[12px] text-tinta-500">
              /l/
            </span>
            <input
              value={slug}
              onChange={(e) => setSlug(paraSlug(e.target.value))}
              placeholder="dobradinha-neto"
              className="h-[34px] min-w-0 flex-1 rounded-lg border border-tinta-300 px-2.5 font-mono text-[16px] outline-none focus:border-tema sm:text-[12.5px]"
            />
          </div>
          <div className="mt-3 flex gap-1.5">
            {(["numero", "url"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModo(m)}
                className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${
                  modo === m
                    ? "bg-tinta-900 text-white"
                    : "bg-tinta-200 text-tinta-600"
                }`}
              >
                {m === "numero" ? "Número de WhatsApp" : "Endereço na web"}
              </button>
            ))}
          </div>

          {modo === "numero" ? (
            <>
              <input
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="(71) 98317-1310 — o número que vai receber"
                className="mt-2 h-[34px] w-full rounded-lg border border-tinta-300 px-2.5 text-[16px] outline-none focus:border-tema sm:text-[12.5px]"
              />
              <input
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Mensagem que já chega escrita (opcional)"
                className="mt-2 h-[34px] w-full rounded-lg border border-tinta-300 px-2.5 text-[16px] outline-none focus:border-tema sm:text-[12.5px]"
              />
              {numero.trim() && (
                <p className="mt-1.5 break-all font-mono text-[10.5px] text-tinta-400">
                  vai virar: {linkDeNumero(numero, mensagem)}
                </p>
              )}
              {/* O AVISO DO NONO DÍGITO.
                  Celular no Brasil tem 9 dígitos depois do DDD. "8317-1310" tem
                  oito — falta o 9 na frente, e é o erro mais comum ao ditar
                  número. Aviso, e não conserto automático: acrescentar um dígito
                  sozinho mandaria o QR para outra pessoa, e ninguém descobriria
                  antes da gráfica. */}
              {(() => {
                const d = numero.replace(/\D/g, "");
                const semDDI = d.startsWith("55") ? d.slice(2) : d;
                return semDDI.length === 10 ? (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#a35a00]">
                    <b>Confira o nono dígito.</b> Celular tem 9 números depois do
                    DDD, e esse tem 8. Se for celular, provavelmente falta o{" "}
                    <b>9</b> na frente: {semDDI.slice(0, 2)} 9{semDDI.slice(2)}.
                  </p>
                ) : null;
              })()}
            </>
          ) : (
            <input
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              placeholder="https://… (pode deixar em branco e definir depois)"
              className="mt-2 h-[34px] w-full rounded-lg border border-tinta-300 px-2.5 text-[16px] outline-none focus:border-tema sm:text-[12.5px]"
            />
          )}

          <p className="mt-1.5 text-[11px] leading-relaxed text-tinta-500">
            Pode deixar em branco: quem ler cai no site até você preencher, e o
            QR impresso não muda.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={criar}
              disabled={!nome.trim()}
              className="h-9 flex-1 rounded-[10px] bg-tema text-[12.5px] font-semibold text-white disabled:opacity-40"
            >
              Criar
            </button>
            <button
              onClick={() => {
                setCriando(false);
                setErro(null);
              }}
              className="h-9 rounded-[10px] border border-tinta-300 px-4 text-[12.5px] font-semibold text-tinta-600"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
