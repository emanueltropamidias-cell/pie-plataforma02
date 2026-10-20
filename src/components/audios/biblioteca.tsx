"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ATALHOS_DISPONIVEIS, espiarAtalhos } from "@/lib/atalhos-do-texto";
import {
  Upload,
  Play,
  Pause,
  Trash2,
  Check,
  X,
  Mic,
  ImageIcon,
  Film,
  FileText,
  Type,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// A biblioteca de materiais da campanha.
//
// Áudio da Talita, santinho, vídeo, e a frase pronta com o número. Tudo no
// mesmo lugar porque o gesto é o mesmo: material pronto que a menina manda com
// um toque. Separar por tipo faria quatro telas e quatro listas para procurar
// com pressa no meio de uma conversa.
//
// ── O FORMATO DO ÁUDIO É O QUE MAIS QUEBRA ──────────────────────────────────
//
// Ele precisa chegar como MENSAGEM DE VOZ — a bolinha com a onda, que toca com
// um toque. Como arquivo anexado, a pessoa tem de baixar e abrir noutro
// aplicativo, e a maioria não abre.
//
// Para isso o arquivo tem de ser OGG/Opus, e há um atalho que dispensa
// conversor: ÁUDIO GRAVADO NO PRÓPRIO WHATSAPP JÁ É OGG/OPUS. Santinho e vídeo
// não têm esse problema — qualquer formato comum chega certo.

export type Item = {
  id: number;
  titulo: string;
  quando: string | null;
  tipo: string;
  arquivo: string | null;
  texto: string | null;
  mime: string | null;
  duracao_seg: number | null;
  bytes: number | null;
  ordem: number;
  ativo: boolean;
  vezes: number;
  ultimo_uso: string | null;
};

const BOM_AUDIO = ["audio/ogg", "audio/opus"];

const ICONE: Record<string, typeof Mic> = {
  audio: Mic,
  imagem: ImageIcon,
  video: Film,
  documento: FileText,
  texto: Type,
};

const ROTULO: Record<string, string> = {
  audio: "Áudio",
  imagem: "Santinho / foto",
  video: "Vídeo",
  documento: "Documento",
  texto: "Frase pronta",
};

function tipoDoArquivo(f: File): string {
  const t = (f.type || "").toLowerCase();
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("image/")) return "imagem";
  if (t.startsWith("video/")) return "video";
  return "documento";
}

function tempo(s: number | null) {
  if (!s || s < 1) return "";
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function Biblioteca({ itens }: { itens: Item[] }) {
  const router = useRouter();
  const supabase = createClient();
  const entrada = useRef<HTMLInputElement>(null);
  const tocador = useRef<HTMLAudioElement | null>(null);

  const [tocando, setTocando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [subindo, setSubindo] = useState(false);

  const [novo, setNovo] = useState<{
    arquivo: File;
    tipo: string;
    duracao: number | null;
    ehOgg: boolean;
    espiada: string | null;
  } | null>(null);
  // A frase pronta não tem arquivo: é digitada aqui mesmo.
  const [fraseAberta, setFraseAberta] = useState(false);
  const campoFrase = useRef<HTMLTextAreaElement>(null);

  const [titulo, setTitulo] = useState("");
  const [quando, setQuando] = useState("");
  const [texto, setTexto] = useState("");

  /**
   * Enfia o atalho onde o cursor está — e não no fim do texto.
   *
   * Quem está escrevendo "encaminha para seus amigos: " quer o link ALI, não
   * depois do ponto final. Colar no fim obriga a pessoa a recortar e colar na
   * mão, e aí ela quebra as chaves.
   */
  function inserirAtalho(chave: string) {
    const el = campoFrase.current;
    if (!el) return setTexto((t) => t + chave);
    const i = el.selectionStart ?? texto.length;
    const f = el.selectionEnd ?? i;
    const novo = texto.slice(0, i) + chave + texto.slice(f);
    setTexto(novo);
    // O cursor volta para depois do atalho no próximo quadro, quando o React já
    // pintou o texto novo. Sem isso ele salta para o fim e a pessoa perde o
    // lugar onde estava escrevendo.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(i + chave.length, i + chave.length);
    });
  }

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErro(null);

    if (f.size > 25 * 1024 * 1024) {
      setErro(
        `O arquivo tem ${(f.size / 1024 / 1024).toFixed(1)} MB. O WhatsApp aceita até 25 MB.`,
      );
      if (entrada.current) entrada.current.value = "";
      return;
    }

    const tipo = tipoDoArquivo(f);

    // A duração sai do próprio arquivo. Pedir para digitar seria mais um campo
    // para errar — e o número serve para a menina saber se cabe na conversa.
    let duracao: number | null = null;
    if (tipo === "audio" || tipo === "video") {
      duracao = await new Promise<number | null>((ok) => {
        const el = document.createElement(tipo === "audio" ? "audio" : "video");
        el.preload = "metadata";
        el.onloadedmetadata = () => {
          ok(Number.isFinite(el.duration) ? Math.round(el.duration) : null);
          URL.revokeObjectURL(el.src);
        };
        el.onerror = () => ok(null);
        el.src = URL.createObjectURL(f);
      });
    }

    const mime = (f.type || "").split(";")[0].toLowerCase();
    setNovo({
      arquivo: f,
      tipo,
      duracao,
      ehOgg: BOM_AUDIO.includes(mime) || f.name.toLowerCase().endsWith(".ogg"),
      espiada: tipo === "imagem" ? URL.createObjectURL(f) : null,
    });
    setTitulo(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  }

  async function subir() {
    if (!titulo.trim()) {
      setErro("Dê um nome ao material.");
      return;
    }
    setSubindo(true);
    setErro(null);

    try {
      // ── frase pronta: nada sobe ao balde ────────────────────────────────
      if (fraseAberta) {
        if (!texto.trim()) {
          setErro("Escreva a frase.");
          return;
        }
        const { error } = await supabase.from("materiais").insert({
          titulo: titulo.trim(),
          quando: quando.trim() || null,
          tipo: "texto",
          texto: texto.trim(),
          ordem: (itens.at(-1)?.ordem ?? 0) + 10,
        });
        if (error) {
          setErro(error.message);
          return;
        }
      } else {
        if (!novo) return;
        const ext =
          novo.tipo === "audio" && novo.ehOgg
            ? "ogg"
            : (novo.arquivo.name.split(".").pop() || "bin").toLowerCase();
        const caminho = `${crypto.randomUUID()}.${ext}`;

        // O balde continua se chamando `audios` — o nome ficou de quando só
        // havia áudio. Renomear balde obriga a mover arquivo por arquivo, e o
        // nome dele não aparece para ninguém.
        const { error: erroSubida } = await supabase.storage
          .from("audios")
          .upload(caminho, novo.arquivo, {
            contentType: novo.arquivo.type || "application/octet-stream",
            upsert: false,
          });
        if (erroSubida) {
          setErro(`O arquivo não subiu: ${erroSubida.message}`);
          return;
        }

        const { error } = await supabase.from("materiais").insert({
          titulo: titulo.trim(),
          quando: quando.trim() || null,
          tipo: novo.tipo,
          arquivo: caminho,
          mime: novo.arquivo.type || null,
          duracao_seg: novo.duracao,
          bytes: novo.arquivo.size,
          ordem: (itens.at(-1)?.ordem ?? 0) + 10,
        });
        if (error) {
          setErro(error.message);
          return;
        }
      }

      limpar();
      router.refresh();
    } finally {
      setSubindo(false);
    }
  }

  function limpar() {
    if (novo?.espiada) URL.revokeObjectURL(novo.espiada);
    setNovo(null);
    setFraseAberta(false);
    setTitulo("");
    setQuando("");
    setTexto("");
    if (entrada.current) entrada.current.value = "";
    setErro(null);
  }

  async function ouvir(item: Item) {
    if (tocando === item.id) {
      tocador.current?.pause();
      setTocando(null);
      return;
    }
    tocador.current?.pause();
    const r = await fetch(`/api/atendimento/audio/ouvir?a=${item.id}`);
    const j = await r.json();
    if (!r.ok || !j?.url) {
      setErro(j?.erro ?? "Não consegui carregar.");
      return;
    }
    const a = new window.Audio(j.url);
    a.onended = () => setTocando(null);
    tocador.current = a;
    setTocando(item.id);
    void a.play();
  }

  async function apagar(item: Item) {
    // O arquivo sai junto. Linha apagada com arquivo órfão no balde é o tipo de
    // lixo que ninguém encontra depois.
    if (item.arquivo)
      await supabase.storage.from("audios").remove([item.arquivo]);
    const { error } = await supabase
      .from("materiais")
      .delete()
      .eq("id", item.id);
    if (error) {
      // Material dentro de um kit não some sozinho: apagar deixaria o kit com
      // um buraco que só apareceria na hora do envio, na frente do eleitor.
      setErro(
        error.code === "23503"
          ? "Esse material está dentro de um kit. Tire ele do kit primeiro."
          : error.message,
      );
      return;
    }
    router.refresh();
  }

  async function alternar(item: Item) {
    await supabase
      .from("materiais")
      .update({ ativo: !item.ativo })
      .eq("id", item.id);
    router.refresh();
  }

  const preparando = !!novo || fraseAberta;

  return (
    <div className="flex flex-col gap-4">
      {/* ── como gravar o áudio ─────────────────────────────────────────── */}
      <details className="rounded-xl border border-[#d9e6fb] bg-[#f2f7ff] p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-[13.5px] font-bold text-[#2f6fd0]">
          <Mic size={15} strokeWidth={2.3} />
          Como gravar o áudio para chegar como mensagem de voz
        </summary>
        <ol className="mt-2.5 flex flex-col gap-1 text-[12.5px] leading-relaxed text-[#2f6fd0]">
          <li>
            <b>1.</b> A Talita grava <b>no WhatsApp dela</b>, segurando o
            microfone.
          </li>
          <li>
            <b>2.</b> Encaminha para você.
          </li>
          <li>
            <b>3.</b> Toque no áudio → <b>Compartilhar</b> →{" "}
            <b>Salvar em Arquivos</b>.
          </li>
          <li>
            <b>4.</b> Suba o arquivo aqui.
          </li>
        </ol>
        {/* ── MP3 E M4A FUNCIONAM ────────────────────────────────────────
            Aqui dizia que eles "chegam como arquivo para baixar". Era falso, e
            espantava quem tinha o áudio pronto em outro formato.
            Testado em 31/08/2026, mandando WAV e M4A pelo chip de verdade: os
            dois chegaram como `audioMessage` — mensagem de voz — com
            DELIVERY_ACK. A Evolution tem ffmpeg dentro e converte no envio.
            O caminho pelo WhatsApp continua sendo o melhor por outro motivo:
            evita reconversão e o áudio sai igual ao que a Talita gravou. */}
        <p className="mt-2 text-[11.5px] leading-relaxed text-[#2f6fd0] opacity-80">
          MP3, M4A e WAV também funcionam — o sistema converte no envio. Gravar
          no WhatsApp é só o caminho mais fiel, porque não reconverte.
        </p>
      </details>

      {erro && (
        <p className="rounded-lg border border-[#f3d3d3] bg-[#fdf1f1] px-3 py-2 text-[12.5px] text-[#c02020]">
          {erro}
        </p>
      )}

      <input
        ref={entrada}
        type="file"
        accept="audio/*,image/*,video/*,application/pdf"
        onChange={escolher}
        className="hidden"
      />

      {/* ── preparando o novo ───────────────────────────────────────────── */}
      {preparando ? (
        <div className="rounded-xl border border-tema bg-white p-4">
          <div className="flex items-start gap-3">
            {novo?.espiada && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={novo.espiada}
                alt="O santinho escolhido"
                className="h-16 w-16 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold text-tinta-900">
                {fraseAberta ? "Frase pronta" : novo?.arquivo.name}
              </p>
              <p className="mt-0.5 text-[12px] text-tinta-500">
                {fraseAberta
                  ? "Aceita {{nome}} — trocado pelo primeiro nome da pessoa."
                  : `${ROTULO[novo!.tipo]} · ${(novo!.arquivo.size / 1024).toFixed(0)} KB${
                      novo!.duracao ? ` · ${tempo(novo!.duracao)}` : ""
                    }`}
              </p>
            </div>
          </div>

          {/* O AVISO SAIU.
              Ele dizia que áudio fora de .ogg "pode chegar como arquivo para
              baixar". Testado e falso: WAV e M4A chegaram como mensagem de voz.
              Aviso que assusta sem motivo faz a pessoa desistir de subir o
              material — e o material que não sobe é o que nunca é usado. */}

          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11.5px] font-semibold text-tinta-600">
                Nome
              </span>
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Santinho Talita e Neto"
                className="mt-1 h-9 w-full rounded-md border border-tinta-200 px-2.5 text-[16px] outline-none focus:border-tema sm:text-[13px]"
              />
            </label>
            <label className="block">
              <span className="text-[11.5px] font-semibold text-tinta-600">
                Quando usar
              </span>
              <input
                value={quando}
                onChange={(e) => setQuando(e.target.value)}
                placeholder="Para quem já está com Neto"
                className="mt-1 h-9 w-full rounded-md border border-tinta-200 px-2.5 text-[16px] outline-none focus:border-tema sm:text-[13px]"
              />
            </label>
          </div>

          {fraseAberta && (
            <>
              <textarea
                ref={campoFrase}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={4}
                placeholder={`Obrigada, {{nome}}! Talita Oliveira é {{numero}}. Se puder, encaminha nosso WhatsApp para quem você conhece: {{whatsapp}} 💙`}
                className="mt-2.5 w-full resize-y rounded-lg border border-tinta-200 px-3 py-2.5 text-[16px] leading-relaxed outline-none focus:border-tema sm:text-[13.5px]"
              />

              {/* ── OS ATALHOS ────────────────────────────────────────────
                  Botão, e não instrução escrita. Pedir para a pessoa digitar
                  `{{whatsapp}}` com as quatro chaves certas é pedir erro de
                  digitação — e erro aqui chega no eleitor como `{{whatsap}}`
                  escrito no meio da frase. */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11.5px] font-semibold text-tinta-500">
                  Inserir:
                </span>
                {ATALHOS_DISPONIVEIS.map((a) => (
                  <button
                    key={a.chave}
                    type="button"
                    title={a.ajuda}
                    onClick={() => inserirAtalho(a.chave)}
                    className="rounded-md border border-tinta-200 bg-white px-2 py-1 text-[11.5px] font-semibold text-tinta-600 transition-colors hover:border-tema hover:text-tema"
                  >
                    {a.rotulo}
                  </button>
                ))}
              </div>

              {/* ── A PRÉVIA ──────────────────────────────────────────────
                  O atalho só vira endereço de verdade na hora do envio, então
                  sem prévia a pessoa guarda a frase sem nunca ter visto como
                  ela chega — e o primeiro a ver é o eleitor. */}
              {texto.trim() && (
                <div className="mt-2.5 rounded-lg border border-tinta-200 bg-tinta-50 px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-400">
                    Como chega para Maria Silva
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-tinta-800">
                    {espiarAtalhos(texto)}
                  </p>
                </div>
              )}
            </>
          )}

          <div className="mt-3.5 flex items-center gap-2">
            <button
              onClick={subir}
              disabled={subindo}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-tema px-4 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              <Check size={14} />
              {subindo ? "Guardando…" : "Guardar na biblioteca"}
            </button>
            <button
              onClick={limpar}
              className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] text-tinta-500 hover:text-tinta-900"
            >
              <X size={14} />
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            onClick={() => entrada.current?.click()}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-tinta-300 text-[13px] font-semibold text-tinta-500 transition-colors hover:border-tema hover:text-tema"
          >
            <Upload size={15} />
            Subir arquivo
          </button>
          <button
            onClick={() => setFraseAberta(true)}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-tinta-300 text-[13px] font-semibold text-tinta-500 transition-colors hover:border-tema hover:text-tema"
          >
            <Type size={15} />
            Escrever uma frase
          </button>
        </div>
      )}

      {/* ── a lista ─────────────────────────────────────────────────────── */}
      {itens.length === 0 ? (
        <p className="rounded-xl border border-dashed border-tinta-300 bg-white/60 p-8 text-center text-[12.5px] leading-relaxed text-tinta-500">
          Nada aqui ainda. Suba os santinhos, os áudios da Talita e as frases —
          depois monte os kits.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {itens.map((i) => {
            const Icone = ICONE[i.tipo] ?? FileText;
            return (
              <div
                key={i.id}
                className={`flex items-start gap-3 rounded-xl border border-tinta-200 bg-white p-3.5 ${
                  i.ativo ? "" : "opacity-55"
                }`}
              >
                {i.tipo === "audio" ? (
                  <button
                    onClick={() => ouvir(i)}
                    aria-label={tocando === i.id ? "Parar" : `Ouvir ${i.titulo}`}
                    className="mt-px flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tema/10 text-tema hover:bg-tema/20"
                  >
                    {tocando === i.id ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                ) : (
                  <span className="mt-px flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tinta-100 text-tinta-500">
                    <Icone size={15} />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-bold leading-snug text-tinta-900">
                    {i.titulo}
                  </p>
                  {i.quando && (
                    <p className="mt-0.5 text-[12px] leading-snug text-tinta-500">
                      {i.quando}
                    </p>
                  )}
                  {i.tipo === "texto" && i.texto && (
                    <p className="mt-1 line-clamp-2 rounded-md bg-tinta-50 px-2 py-1 text-[11.5px] leading-snug text-tinta-600">
                      {i.texto}
                    </p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-tinta-400">
                    <span>{ROTULO[i.tipo] ?? i.tipo}</span>
                    {i.duracao_seg ? (
                      <>
                        <span>·</span>
                        <span>{tempo(i.duracao_seg)}</span>
                      </>
                    ) : null}
                    <span>·</span>
                    {/* O contador diz qual material trabalha e qual só ocupa
                        lugar — sem ele, a Talita regrava os errados. */}
                    <span
                      className={
                        i.vezes > 0 ? "font-semibold text-tinta-600" : undefined
                      }
                    >
                      {i.vezes === 0
                        ? "nunca usado"
                        : `${i.vezes} ${i.vezes === 1 ? "envio" : "envios"}`}
                    </span>
                    {/* O selo "não é .ogg" saiu junto: era a mesma informação
                        errada, repetida na lista. */}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => alternar(i)}
                    className="rounded-lg border border-tinta-200 px-2 py-1 text-[11.5px] font-semibold text-tinta-600 hover:border-tinta-300"
                  >
                    {i.ativo ? "Esconder" : "Mostrar"}
                  </button>
                  <button
                    onClick={() => apagar(i)}
                    aria-label={`Apagar ${i.titulo}`}
                    className="rounded-lg border border-tinta-200 p-1.5 text-tinta-400 transition-colors hover:border-[#f3d3d3] hover:text-[#c02020]"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
