"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileSpreadsheet, MessageSquareText, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { adivinharColuna, lerCSV, nomeProprio, normalizarTelefone, type LinhaCSV } from "@/lib/csv";
import { gerarLinkCode } from "@/lib/link-code";
import { MUNICIPIOS_BA } from "@/lib/municipios-ba";
import { CameraFicha, type DadosFicha } from "@/components/camera-ficha";

export type LiderOpcao = { id: string; nome: string };

type Registro = {
  nome: string;
  telefone: string;
  municipio: string;
  bairro: string;
  origem: "csv" | "foto";
  problema?: string;
};

const CAMPOS = [
  { chave: "nome" as const, rotulo: "Nome", alvos: ["nome", "nome completo", "razao social", "nome / razão social"] },
  { chave: "telefone" as const, rotulo: "Telefone", alvos: ["whatsapp", "celular", "telefone", "fone"] },
  { chave: "municipio" as const, rotulo: "Município", alvos: ["municipio", "cidade"] },
  { chave: "bairro" as const, rotulo: "Bairro", alvos: ["bairro", "distrito"] },
];


// Casa o município escrito com a lista oficial; devolve vazio se não reconhecer.
const MAPA_MUN = new Map(
  MUNICIPIOS_BA.map((m) => [
    m
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase(),
    m,
  ]),
);
function municipioOficial(v: string) {
  const k = (v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  return MAPA_MUN.get(k) ?? "";
}

export function ImportarClient({ lideres }: { lideres: LiderOpcao[] }) {
  const router = useRouter();
  const csvRef = useRef<HTMLInputElement>(null);
  const fotoRef = useRef<HTMLInputElement>(null);

  const [colunas, setColunas] = useState<string[]>([]);
  const [linhasCsv, setLinhasCsv] = useState<LinhaCSV[]>([]);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [doFoto, setDoFoto] = useState<Registro[]>([]);
  const [lendoFoto, setLendoFoto] = useState(0);
  const [camera, setCamera] = useState(false);
  const [conversa, setConversa] = useState("");
  const [lendoConversa, setLendoConversa] = useState(false);

  const [parentId, setParentId] = useState("");
  const [tipo, setTipo] = useState("lead");
  const [somenteComTelefone, setSomenteComTelefone] = useState(true);

  const [salvando, setSalvando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [resultado, setResultado] = useState<string>("");
  const [erro, setErro] = useState("");

  function abrirCSV(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro("");
    setResultado("");
    const leitor = new FileReader();
    leitor.onload = () => {
      const { colunas: cols, linhas } = lerCSV(String(leitor.result ?? ""));
      if (!cols.length) return setErro("Não consegui ler esse arquivo. Ele é um CSV?");
      setColunas(cols);
      setLinhasCsv(linhas);
      const auto: Record<string, string> = {};
      for (const c of CAMPOS) auto[c.chave] = adivinharColuna(cols, c.alvos);
      setMapa(auto);
    };
    leitor.onerror = () => setErro("Não foi possível abrir o arquivo.");
    // O Excel brasileiro costuma salvar em Windows-1252; latin1 lê os acentos.
    leitor.readAsText(arquivo, "utf-8");
  }

  async function lerFotos(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setErro("");
    setLendoFoto(arquivos.length);
    const novos: Registro[] = [];
    for (const arquivo of Array.from(arquivos)) {
      try {
        const base64 = await encolher(arquivo);
        const resp = await fetch("/api/leads/ler-foto", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imagem: base64, tipo: "image/jpeg" }),
        });
        const j = await resp.json();
        if (resp.ok) {
          novos.push({
            nome: j.nome ?? "",
            telefone: j.telefone ?? "",
            municipio: j.municipio ?? "",
            bairro: j.bairro ?? "",
            origem: "foto",
            problema: j.confianca !== "alta" ? `leitura ${j.confianca}` : undefined,
          });
        } else {
          setErro(j?.erro ?? "Falha ao ler uma das fotos.");
        }
      } catch {
        setErro("Falha ao processar uma das fotos.");
      }
      setLendoFoto((n) => n - 1);
    }
    setDoFoto((a) => [...a, ...novos]);
    if (fotoRef.current) fotoRef.current.value = "";
  }

  // Atendimento pelo aplicativo comum não emite webhook: o jeito de trazer
  // o que a pessoa escreveu é colar a conversa e deixar a IA separar.
  async function lerConversa() {
    if (!conversa.trim()) return;
    setErro("");
    setLendoConversa(true);
    try {
      const resp = await fetch("/api/leads/ler-conversa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto: conversa }),
      });
      const j = await resp.json();
      if (!resp.ok) {
        setErro(j?.erro ?? "Não foi possível ler a conversa.");
      } else if (!j.pessoas?.length) {
        setErro("Não encontrei nenhum cadastro nesse texto.");
      } else {
        setDoFoto((a) => [
          ...a,
          ...j.pessoas.map((p: Record<string, string>) => ({
            nome: p.nome ?? "",
            telefone: p.telefone ?? "",
            municipio: p.municipio ?? "",
            bairro: p.bairro ?? "",
            origem: "foto" as const,
            problema: p.observacao || undefined,
          })),
        ]);
        setConversa("");
      }
    } catch {
      setErro("Falha de rede ao ler a conversa.");
    }
    setLendoConversa(false);
  }

  function encolher(arquivo: File) {
    return new Promise<string>((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error("falha"));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("falha"));
        img.onload = () => {
          const MAX = 1600;
          const escala = Math.min(1, MAX / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * escala);
          canvas.height = Math.round(img.height * escala);
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("falha"));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "");
        };
        img.src = String(leitor.result);
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  // Junta CSV + fotos e valida tudo com a mesma régua
  const registros = useMemo<Registro[]>(() => {
    const doCsv = linhasCsv.map((l) => {
      const nome = nomeProprio(l[mapa.nome] ?? "");
      const telefone = normalizarTelefone(l[mapa.telefone] ?? "");
      const municipioBruto = l[mapa.municipio] ?? "";
      return {
        nome,
        telefone,
        municipio: municipioOficial(municipioBruto) || nomeProprio(municipioBruto),
        bairro: nomeProprio(l[mapa.bairro] ?? ""),
        origem: "csv" as const,
        problema: !nome ? "sem nome" : !telefone && (l[mapa.telefone] ?? "").trim() ? "telefone inválido" : undefined,
      };
    });
    return [...doCsv, ...doFoto];
  }, [linhasCsv, mapa, doFoto]);

  const validos = registros.filter((r) => r.nome && (!somenteComTelefone || r.telefone));
  const descartados = registros.length - validos.length;

  async function importar() {
    setErro("");
    setResultado("");
    if (!validos.length) return setErro("Nada para importar.");
    setSalvando(true);
    setProgresso(0);

    const supabase = createClient();

    // Telefones que já existem, para não duplicar ninguém
    const existentes = new Set<string>();
    for (let p = 0; p < 100; p++) {
      const { data } = await supabase
        .from("liderancas")
        .select("telefone")
        .not("telefone", "is", null)
        .range(p * 1000, p * 1000 + 999);
      const lote = data ?? [];
      for (const r of lote as { telefone: string | null }[]) {
        const d = (r.telefone ?? "").replace(/\D/g, "");
        if (d) existentes.add(d);
      }
      if (lote.length < 1000) break;
    }

    const novos: Record<string, unknown>[] = [];
    let repetidos = 0;
    for (const r of validos) {
      const d = r.telefone.replace(/\D/g, "");
      if (d && existentes.has(d)) {
        repetidos++;
        continue;
      }
      if (d) existentes.add(d);
      novos.push({
        nome: r.nome,
        telefone: r.telefone || null,
        municipio: r.municipio || null,
        bairro: r.bairro || null,
        parent_id: parentId || null,
        tipo,
        created_via: r.origem === "foto" ? "foto_ia" : "importacao",
        link_code: gerarLinkCode(),
      });
    }

    let gravados = 0;
    const LOTE = 400;
    for (let i = 0; i < novos.length; i += LOTE) {
      const { error } = await supabase.from("liderancas").insert(novos.slice(i, i + LOTE));
      if (error) {
        setSalvando(false);
        return setErro(`Parou em ${gravados} cadastros: ${error.message}`);
      }
      gravados += Math.min(LOTE, novos.length - i);
      setProgresso(Math.round((gravados / Math.max(1, novos.length)) * 100));
    }

    setSalvando(false);
    setResultado(
      `${gravados} cadastrado(s). ${repetidos} já existiam (telefone repetido) e ${descartados} ficaram de fora por falta de nome ou telefone.`,
    );
    setLinhasCsv([]);
    setColunas([]);
    setDoFoto([]);
    if (csvRef.current) csvRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      {/* Entradas */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-dashed border-tinta-300 bg-white p-5 text-center">
          <FileSpreadsheet size={22} className="mx-auto text-tinta-400" />
          <p className="mt-2 text-sm font-semibold text-tinta-800">Planilha CSV</p>
          <p className="mt-1 text-[12px] text-tinta-500">
            Exporte do Excel como CSV. Aceita ponto e vírgula ou vírgula.
          </p>
          <input
            ref={csvRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => abrirCSV(e.target.files?.[0])}
          />
          <Button variant="outline" className="mt-3" onClick={() => csvRef.current?.click()}>
            <Upload size={15} /> Escolher arquivo
          </Button>
        </div>

        <div className="rounded-xl border border-dashed border-tinta-300 bg-white p-5 text-center">
          <Camera size={22} className="mx-auto text-tinta-400" />
          <p className="mt-2 text-sm font-semibold text-tinta-800">Fotos de fichas</p>
          <p className="mt-1 text-[12px] text-tinta-500">
            Aponte a câmera para cada ficha. A IA lê e vai enchendo a lista.
          </p>
          <input
            ref={fotoRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => lerFotos(e.target.files)}
          />
          <Button variant="outline" className="mt-3" onClick={() => setCamera(true)}>
            <Camera size={15} /> Ler fichas com a câmera
          </Button>
          <button
            type="button"
            disabled={lendoFoto > 0}
            onClick={() => fotoRef.current?.click()}
            className="mt-2 block w-full text-[11.5px] text-tinta-500 underline underline-offset-2 disabled:opacity-60"
          >
            {lendoFoto > 0 ? `Lendo ${lendoFoto}…` : "ou escolher fotos salvas"}
          </button>
        </div>
      </div>

      {/* Colar conversa do WhatsApp */}
      <div className="rounded-xl border border-dashed border-tinta-300 bg-white p-5">
        <div className="flex items-center gap-2">
          <MessageSquareText size={18} className="text-tinta-400" />
          <p className="text-sm font-semibold text-tinta-800">Colar conversa do WhatsApp</p>
        </div>
        <p className="mt-1 text-[12px] text-tinta-500">
          Copie a conversa no WhatsApp e cole aqui. A IA separa nome, telefone, município e bairro —
          inclusive de várias pessoas de uma vez.
        </p>
        <textarea
          value={conversa}
          onChange={(e) => setConversa(e.target.value)}
          rows={5}
          placeholder={"Cole aqui. Exemplo:\n\n+55 71 99999-8888\nOii Talita! Vim pela indicação de Maria Souza\nMe chamo João Pereira, sou de Feira de Santana, bairro Tomba"}
          className="mt-3 w-full rounded-lg border border-input bg-white px-3 py-2 text-[13px] outline-none"
        />
        <Button
          variant="outline"
          className="mt-2"
          disabled={lendoConversa || !conversa.trim()}
          onClick={lerConversa}
        >
          <MessageSquareText size={15} /> {lendoConversa ? "Lendo…" : "Extrair cadastros"}
        </Button>
      </div>

      {/* De→Para das colunas do CSV */}
      {colunas.length > 0 && (
        <div className="rounded-xl border border-tinta-200 bg-white p-5 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
          <p className="text-sm font-semibold text-tinta-700">Colunas do arquivo</p>
          <p className="mt-1 text-[12px] text-tinta-500">
            Confira se cada campo aponta para a coluna certa. Adivinhei pelo nome do cabeçalho.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CAMPOS.map((c) => (
              <div key={c.chave} className="flex flex-col gap-1.5">
                <Label className="text-[12px]">{c.rotulo}</Label>
                <select
                  value={mapa[c.chave] ?? ""}
                  onChange={(e) => setMapa((m) => ({ ...m, [c.chave]: e.target.value }))}
                  className="h-10 rounded-md border border-input bg-white px-2 text-[13px] outline-none"
                >
                  <option value="">— não importar —</option>
                  {colunas.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Destino e conferência */}
      {registros.length > 0 && (
        <>
          <div className="rounded-xl border border-tinta-200 bg-white p-5 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[12px]">Vincular à liderança</Label>
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="h-10 rounded-md border border-input bg-white px-2 text-[13px] outline-none"
                >
                  <option value="">— sem vínculo —</option>
                  {lideres.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[12px]">Cadastrar como</Label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  className="h-10 rounded-md border border-input bg-white px-2 text-[13px] outline-none"
                >
                  <option value="lead">Lead / Munícipe</option>
                  <option value="lideranca">Liderança</option>
                </select>
              </div>
              <label className="flex items-end gap-2 pb-2 text-[13px] text-tinta-700">
                <input
                  type="checkbox"
                  checked={somenteComTelefone}
                  onChange={(e) => setSomenteComTelefone(e.target.checked)}
                  className="h-4 w-4"
                />
                Só quem tem telefone
              </label>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-tinta-200 bg-white shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tinta-100 px-4 py-3">
              <p className="text-sm text-tinta-600">
                <b className="text-tinta-900">{validos.length}</b> prontos para importar
                {descartados > 0 && <span className="text-tinta-400"> · {descartados} fora do critério</span>}
              </p>
              <Button onClick={importar} disabled={salvando || !validos.length}>
                {salvando ? `Importando… ${progresso}%` : `Importar ${validos.length}`}
              </Button>
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead className="sticky top-0 bg-tinta-50">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-tinta-500">
                    <th className="px-4 py-2">Nome</th>
                    <th className="px-4 py-2">Telefone</th>
                    <th className="px-4 py-2">Município</th>
                    <th className="px-4 py-2">Bairro</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {registros.slice(0, 300).map((r, i) => {
                    const fora = !r.nome || (somenteComTelefone && !r.telefone);
                    return (
                      <tr key={i} className={`border-b border-tinta-100 ${fora ? "bg-tinta-50 text-tinta-400" : ""}`}>
                        <td className="px-4 py-2 font-medium">{r.nome || "—"}</td>
                        <td className="px-4 py-2">{r.telefone || "—"}</td>
                        <td className="px-4 py-2">{r.municipio || "—"}</td>
                        <td className="px-4 py-2">{r.bairro || "—"}</td>
                        <td className="px-4 py-2 text-right">
                          {r.origem === "foto" && <span className="text-[10.5px] text-tema">foto</span>}
                          {r.problema && <span className="ml-2 text-[10.5px] text-amber-600">{r.problema}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {registros.length > 300 && (
                <p className="px-4 py-2 text-[12px] text-tinta-400">
                  Mostrando as 300 primeiras de {registros.length}. A importação leva todas.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {registros.length > 0 && (
        <button
          onClick={() => {
            setLinhasCsv([]);
            setColunas([]);
            setDoFoto([]);
            if (csvRef.current) csvRef.current.value = "";
          }}
          className="self-start text-[12.5px] text-tinta-400 underline underline-offset-2 hover:text-tinta-600"
        >
          <Trash2 size={13} className="mr-1 inline" /> Limpar tudo
        </button>
      )}

      {/* continuar: a câmera segue aberta para ler uma ficha atrás da outra */}
      <CameraFicha
        aberto={camera}
        continuar
        onFechar={() => setCamera(false)}
        onLido={(d: DadosFicha) =>
          setDoFoto((a) => [
            ...a,
            {
              nome: d.nome ?? "",
              telefone: d.telefone ?? "",
              municipio: d.municipio ?? "",
              bairro: d.bairro ?? "",
              origem: "foto",
              problema: d.confianca !== "alta" ? `leitura ${d.confianca}` : undefined,
            },
          ])
        }
      />

      {erro && <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{erro}</div>}
      {resultado && <div className="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{resultado}</div>}
    </div>
  );
}
