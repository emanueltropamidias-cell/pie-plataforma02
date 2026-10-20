"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  X,
  ChevronUp,
  ChevronDown,
  Package,
  Mic,
  ImageIcon,
  Film,
  FileText,
  Type,
  Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Montar os kits políticos.
//
// ── O QUE UM KIT RESOLVE ────────────────────────────────────────────────────
//
// O eleitor que já está com Neto não recebe o mesmo material de quem veio pedir
// consulta médica, e nenhum dos dois recebe o da chapa toda. Sem kit, isso vira
// a menina caçando na galeria do celular: manda o santinho errado, esquece o
// áudio, manda o de um palanque para quem é de outro.
//
// Com kit, ela escolhe UMA COISA e sai a sequência inteira, na ordem, sempre
// igual. E o kit é da campanha, não dela: quem monta é a coordenação, todas
// usam o mesmo.
//
// ── A ORDEM DENTRO DO KIT NÃO É DETALHE ─────────────────────────────────────
//
// Santinho, áudio, e só então a frase com o número. Invertido, a pessoa lê o
// número antes de saber quem está falando — e o número é justamente o que ela
// precisa lembrar depois.

export type Material = {
  id: number;
  titulo: string;
  tipo: string;
  quando: string | null;
  ativo: boolean;
};

export type Item = { id: number; material_id: number; ordem: number };

export type Kit = {
  id: number;
  nome: string;
  quando: string | null;
  cor: string;
  ordem: number;
  ativo: boolean;
  vezes: number;
  itens: Item[];
};

const ICONE: Record<string, typeof Mic> = {
  audio: Mic,
  imagem: ImageIcon,
  video: Film,
  documento: FileText,
  texto: Type,
};

const CORES = [
  "#0525f7",
  "#12703c",
  "#c02020",
  "#a35a00",
  "#5b34c9",
  "#c2185b",
  "#0d7a8a",
];

export function Kits({
  kits,
  materiais,
}: {
  kits: Kit[];
  materiais: Material[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [quando, setQuando] = useState("");
  const [aberto, setAberto] = useState<number | null>(null);
  // O upload acontece DE DENTRO DO KIT.
  //
  // Antes só existia na tela de Materiais: quem estava montando um kit tinha de
  // sair, subir, voltar e procurar na lista. Quatro passos para uma foto — e o
  // santinho é justamente o que se sobe uma vez por kit.
  //
  // Aqui é um gesto: escolhe o arquivo, ele entra na biblioteca E no kit, na
  // última posição. O nome sai do arquivo e se ajusta depois em Materiais, se
  // precisar — nome bom não vale sair do meio da montagem.
  const entrada = useRef<HTMLInputElement>(null);
  const [subindoEm, setSubindoEm] = useState<number | null>(null);
  const alvo = useRef<{ kit: number; ordem: number } | null>(null);

  const porId = new Map(materiais.map((m) => [m.id, m]));

  async function criar() {
    if (!nome.trim()) {
      setErro("Dê um nome ao kit.");
      return;
    }
    const { error } = await supabase.from("kits").insert({
      nome: nome.trim(),
      quando: quando.trim() || null,
      cor: CORES[kits.length % CORES.length],
      ordem: (kits.at(-1)?.ordem ?? 0) + 10,
    });
    if (error) {
      setErro(error.message);
      return;
    }
    setNome("");
    setQuando("");
    setNovo(false);
    setErro(null);
    router.refresh();
  }

  async function apagar(k: Kit) {
    // Os itens somem junto pelo `on delete cascade`; os materiais ficam, porque
    // o mesmo santinho pode estar em três kits.
    await supabase.from("kits").delete().eq("id", k.id);
    router.refresh();
  }

  async function alternar(k: Kit) {
    await supabase.from("kits").update({ ativo: !k.ativo }).eq("id", k.id);
    router.refresh();
  }

  async function adicionar(kitId: number, materialId: number, ordem: number) {
    const { error } = await supabase
      .from("kit_itens")
      .insert({ kit_id: kitId, material_id: materialId, ordem });
    if (error) {
      setErro(
        error.code === "23505"
          ? "Esse material já está no kit."
          : error.message,
      );
      return;
    }
    setErro(null);
    router.refresh();
  }

  function tipoDoArquivo(f: File) {
    const t = (f.type || "").toLowerCase();
    if (t.startsWith("audio/")) return "audio";
    if (t.startsWith("image/")) return "imagem";
    if (t.startsWith("video/")) return "video";
    return "documento";
  }

  async function subirEAdicionar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    const onde = alvo.current;
    if (!f || !onde) return;

    if (f.size > 25 * 1024 * 1024) {
      setErro(
        `O arquivo tem ${(f.size / 1024 / 1024).toFixed(1)} MB. O WhatsApp aceita até 25 MB.`,
      );
      if (entrada.current) entrada.current.value = "";
      return;
    }

    setSubindoEm(onde.kit);
    setErro(null);
    try {
      const ext = (f.name.split(".").pop() || "bin").toLowerCase();
      const caminho = `${crypto.randomUUID()}.${ext}`;

      const { error: erroSubida } = await supabase.storage
        .from("audios")
        .upload(caminho, f, {
          contentType: f.type || "application/octet-stream",
          upsert: false,
        });
      if (erroSubida) {
        setErro(`O arquivo não subiu: ${erroSubida.message}`);
        return;
      }

      const { data: criado, error: erroMaterial } = await supabase
        .from("materiais")
        .insert({
          titulo: f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
          tipo: tipoDoArquivo(f),
          arquivo: caminho,
          mime: f.type || null,
          bytes: f.size,
          ordem: 100,
        })
        .select("id")
        .single();

      if (erroMaterial || !criado) {
        setErro(erroMaterial?.message ?? "Não consegui guardar o material.");
        return;
      }

      await adicionar(onde.kit, criado.id, onde.ordem);
    } finally {
      setSubindoEm(null);
      alvo.current = null;
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function tirar(itemId: number) {
    await supabase.from("kit_itens").delete().eq("id", itemId);
    router.refresh();
  }

  /** Troca a ordem de dois itens. Duas escritas porque a ordem é o que decide
   *  o que a pessoa lê primeiro. */
  async function mover(itens: Item[], i: number, direcao: -1 | 1) {
    const j = i + direcao;
    if (j < 0 || j >= itens.length) return;
    await Promise.all([
      supabase
        .from("kit_itens")
        .update({ ordem: itens[j].ordem })
        .eq("id", itens[i].id),
      supabase
        .from("kit_itens")
        .update({ ordem: itens[i].ordem })
        .eq("id", itens[j].id),
    ]);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Um input só para todos os kits: qual deles recebe está em `alvo`. */}
      <input
        ref={entrada}
        type="file"
        accept="audio/*,image/*,video/*,application/pdf"
        onChange={subirEAdicionar}
        className="hidden"
      />

      {erro && (
        <p className="rounded-lg border border-[#f3d3d3] bg-[#fdf1f1] px-3 py-2 text-[12.5px] text-[#c02020]">
          {erro}
        </p>
      )}

      {materiais.length === 0 && (
        <p className="rounded-xl border border-[#d9e6fb] bg-[#f2f7ff] px-4 py-3 text-[12.5px] leading-relaxed text-[#2f6fd0]">
          <b>Comece criando um kit.</b> Dentro dele você sobe o santinho e o
          áudio direto, sem sair daqui. Para <b>frases prontas</b> — que não são
          arquivo — o caminho é{" "}
          <Link
            href="/atendimento/audios"
            className="font-semibold underline underline-offset-2"
          >
            Materiais da campanha
          </Link>
          .
        </p>
      )}

      {/* ── novo kit ────────────────────────────────────────────────────── */}
      {novo ? (
        <div className="rounded-xl border border-tema bg-white p-4">
          <h3 className="text-[14px] font-bold text-tinta-900">Novo kit</h3>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11.5px] font-semibold text-tinta-600">
                Nome
              </span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Talita e Neto"
                className="mt-1 h-9 w-full rounded-md border border-tinta-200 px-2.5 text-[16px] outline-none focus:border-tema sm:text-[13px]"
              />
            </label>
            <label className="block">
              <span className="text-[11.5px] font-semibold text-tinta-600">
                Para quem é
              </span>
              <input
                value={quando}
                onChange={(e) => setQuando(e.target.value)}
                placeholder="Quem já declarou apoio a Neto"
                className="mt-1 h-9 w-full rounded-md border border-tinta-200 px-2.5 text-[16px] outline-none focus:border-tema sm:text-[13px]"
              />
            </label>
          </div>
          <div className="mt-3.5 flex items-center gap-2">
            <button
              onClick={criar}
              className="h-9 rounded-lg bg-tema px-4 text-[13px] font-semibold text-white"
            >
              Criar kit
            </button>
            <button
              onClick={() => {
                setNovo(false);
                setErro(null);
              }}
              className="h-9 rounded-lg px-3 text-[13px] text-tinta-500 hover:text-tinta-900"
            >
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
          Criar um kit
        </button>
      )}

      {/* ── a lista ─────────────────────────────────────────────────────── */}
      {kits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-tinta-300 bg-white/60 p-8 text-center text-[12.5px] leading-relaxed text-tinta-500">
          Nenhum kit ainda. Crie um para cada perfil de eleitor — a chapa toda,
          Talita sozinha, cada combinação de palanque, cada demanda. Os
          santinhos você sobe de dentro do kit.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {kits.map((k) => {
            const itens = [...k.itens].sort((a, b) => a.ordem - b.ordem);
            const expandido = aberto === k.id;
            const dentro = new Set(itens.map((i) => i.material_id));
            const disponiveis = materiais.filter(
              (m) => m.ativo && !dentro.has(m.id),
            );

            return (
              <div
                key={k.id}
                className={`rounded-xl border bg-white ${
                  k.ativo ? "border-tinta-200" : "border-tinta-200 opacity-55"
                }`}
              >
                <div className="flex items-start gap-3 p-4">
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: k.cor }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-tinta-900">
                      {k.nome}
                    </p>
                    {k.quando && (
                      <p className="mt-0.5 text-[12px] leading-snug text-tinta-500">
                        {k.quando}
                      </p>
                    )}
                    <p className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[11px] text-tinta-400">
                      <span
                        className={
                          itens.length === 0
                            ? "font-semibold text-[#a35a00]"
                            : undefined
                        }
                      >
                        {itens.length === 0
                          ? "vazio — não aparece para a equipe"
                          : `${itens.length} ${itens.length === 1 ? "item" : "itens"}`}
                      </span>
                      <span>·</span>
                      <span
                        className={
                          k.vezes > 0
                            ? "font-semibold text-tinta-600"
                            : undefined
                        }
                      >
                        {k.vezes === 0
                          ? "nunca enviado"
                          : `${k.vezes} ${k.vezes === 1 ? "envio" : "envios"}`}
                      </span>
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => setAberto(expandido ? null : k.id)}
                      className="rounded-lg border border-tinta-200 px-2.5 py-1 text-[11.5px] font-semibold text-tinta-600 hover:border-tema hover:text-tema"
                    >
                      {expandido ? "Fechar" : "Montar"}
                    </button>
                    <button
                      onClick={() => alternar(k)}
                      className="rounded-lg border border-tinta-200 px-2 py-1 text-[11.5px] font-semibold text-tinta-600 hover:border-tinta-300"
                    >
                      {k.ativo ? "Esconder" : "Mostrar"}
                    </button>
                    <button
                      onClick={() => apagar(k)}
                      aria-label={`Apagar ${k.nome}`}
                      className="rounded-lg border border-tinta-200 p-1.5 text-tinta-400 transition-colors hover:border-[#f3d3d3] hover:text-[#c02020]"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* ── montar ──────────────────────────────────────────── */}
                {expandido && (
                  <div className="border-t border-tinta-100 p-4">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-tinta-400">
                      O que sai, nesta ordem
                    </p>

                    {itens.length === 0 ? (
                      <p className="mt-2 text-[12px] text-tinta-400">
                        Nada ainda. Escolha abaixo.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {itens.map((i, idx) => {
                          const m = porId.get(i.material_id);
                          const Icone = ICONE[m?.tipo ?? ""] ?? FileText;
                          return (
                            <div
                              key={i.id}
                              className="flex items-center gap-2.5 rounded-lg bg-tinta-50 px-2.5 py-2"
                            >
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white text-[10.5px] font-bold text-tinta-500">
                                {idx + 1}
                              </span>
                              <Icone
                                size={14}
                                className="shrink-0 text-tinta-400"
                              />
                              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-tinta-800">
                                {m?.titulo ?? "material apagado"}
                              </span>
                              <button
                                onClick={() => mover(itens, idx, -1)}
                                disabled={idx === 0}
                                aria-label="Subir"
                                className="text-tinta-400 hover:text-tinta-800 disabled:opacity-25"
                              >
                                <ChevronUp size={15} />
                              </button>
                              <button
                                onClick={() => mover(itens, idx, 1)}
                                disabled={idx === itens.length - 1}
                                aria-label="Descer"
                                className="text-tinta-400 hover:text-tinta-800 disabled:opacity-25"
                              >
                                <ChevronDown size={15} />
                              </button>
                              <button
                                onClick={() => tirar(i.id)}
                                aria-label="Tirar do kit"
                                className="text-tinta-300 hover:text-[#c02020]"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-tinta-400">
                        Adicionar da biblioteca
                      </p>
                      <button
                        onClick={() => {
                          alvo.current = {
                            kit: k.id,
                            ordem: (itens.at(-1)?.ordem ?? 0) + 10,
                          };
                          entrada.current?.click();
                        }}
                        disabled={subindoEm !== null}
                        className="flex items-center gap-1.5 rounded-lg border border-tema px-2.5 py-1.5 text-[12px] font-semibold text-tema transition-colors hover:bg-tema/5 disabled:opacity-40"
                      >
                        <Upload size={12} />
                        {subindoEm === k.id ? "Subindo…" : "Subir santinho ou áudio"}
                      </button>
                    </div>
                    {disponiveis.length === 0 ? (
                      <p className="mt-2 text-[12px] text-tinta-400">
                        Todos os materiais já estão neste kit.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {disponiveis.map((m) => {
                          const Icone = ICONE[m.tipo] ?? FileText;
                          return (
                            <button
                              key={m.id}
                              onClick={() =>
                                adicionar(
                                  k.id,
                                  m.id,
                                  (itens.at(-1)?.ordem ?? 0) + 10,
                                )
                              }
                              title={m.quando ?? undefined}
                              className="flex items-center gap-1.5 rounded-lg border border-tinta-200 px-2.5 py-1.5 text-[12px] font-semibold text-tinta-700 transition-colors hover:border-tema hover:text-tema"
                            >
                              <Icone size={12} />
                              {m.titulo}
                              <Plus size={12} className="opacity-50" />
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-tinta-400">
                      <Package size={12} className="mt-px shrink-0" />
                      A ordem é a ordem de envio. Santinho, áudio, e a frase com
                      o número por último — invertido, a pessoa lê o número
                      antes de saber quem fala.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
