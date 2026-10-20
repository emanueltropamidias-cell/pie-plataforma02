"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Download, Search, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { gerarLinkCode } from "@/lib/link-code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MUNICIPIOS_BA } from "@/lib/municipios-ba";
import { PainelLeads, type ResumoLeads } from "./painel-leads";
import { Cabecalho } from "@/components/ui/pagina";
import { MapaSobDemanda, aquecerMapa } from "./mapa-sob-demanda";
import type { DadosFicha } from "@/components/camera-ficha";
import { formatarTelefone, problemaNoTelefone, EXEMPLO_TELEFONE } from "@/lib/telefone";

// Importação e câmera só chegam ao navegador quando alguém abre cada uma.
const ImportarClient = dynamic(
  () =>
    import("@/components/importar/importar-client").then(
      (m) => m.ImportarClient,
    ),
  { ssr: false },
);

const CameraFicha = dynamic(
  () => import("@/components/camera-ficha").then((m) => m.CameraFicha),
  { ssr: false },
);

export type Lead = {
  id: string;
  nome: string;
  telefone: string | null;
  municipio: string | null;
  bairro: string | null;
  parent_id: string | null;
};
export type LiderOpcao = { id: string; nome: string };

export function LeadsClient({
  leads,
  lideres,
  municipios,
  total,
  totalGeral,
  pagina,
  porPagina,
  filtros,
  resumo,
  leituraFalhou,
}: {
  leads: Lead[];
  lideres: LiderOpcao[];
  municipios: string[];
  total: number;
  totalGeral: number;
  pagina: number;
  porPagina: number;
  filtros: { q: string; municipio: string; vinculo: string };
  resumo: ResumoLeads;
  /**
   * A leitura do território falhou — o total não vale nada.
   *
   * Zero é resposta legítima ("não tem ninguém") e também o que sobra quando a
   * consulta morre. Sem separar os dois, um tropeço de um segundo no banco
   * mostra "0 munícipes na rede" e parece base apagada.
   */
  leituraFalhou?: boolean;
}) {
  const router = useRouter();
  const nomeLider = new Map(lideres.map((l) => [l.id, l.nome]));
  const [busca, setBusca] = useState(filtros.q);
  const [aberto, setAberto] = useState(false);
  const [importando, setImportando] = useState(false);
  const [aba, setAba] = useState<"painel" | "lista" | "mapa">("painel");

  // Aquece o mapa em segundo plano assim que a tela abre: quem clicar na aba
  // Mapa não espera download nenhum.
  useEffect(() => {
    aquecerMapa();
  }, []);

  // Filtro vira endereço: a busca acontece no banco, não na memória.
  function aplicar(
    mudanca: Partial<{
      q: string;
      municipio: string;
      vinculo: string;
      p: string;
    }>,
  ) {
    const p = new URLSearchParams();
    const atual = {
      q: busca,
      municipio: filtros.municipio,
      vinculo: filtros.vinculo,
      ...mudanca,
    };
    if (atual.q) p.set("q", atual.q);
    if (atual.municipio) p.set("municipio", atual.municipio);
    if (atual.vinculo) p.set("vinculo", atual.vinculo);
    if (mudanca.p) p.set("p", mudanca.p);
    router.push(`/leads${p.toString() ? `?${p}` : ""}`);
  }

  const filtrando = !!(filtros.q || filtros.municipio || filtros.vinculo);
  const primeiro = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const ultimo = Math.min(pagina * porPagina, total);
  const ultimaPagina = Math.max(1, Math.ceil(total / porPagina));

  async function excluir(l: Lead) {
    if (!confirm(`Excluir "${l.nome}"?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("liderancas").delete().eq("id", l.id);
    if (error) return alert("Erro: " + error.message);
    router.refresh();
  }

  return (
    <>
      <Cabecalho
        voltar="/base"
        sobretitulo="Rede"
        titulo="Leads / Munícipes"
        descricao={
          <>
            {leituraFalhou ? (
              <span className="font-semibold text-red-600">
                não consegui ler a base agora — recarregue em instantes
              </span>
            ) : (
              <>{totalGeral.toLocaleString("pt-BR")} munícipes na rede</>
            )}
            {filtrando && (
              <>
                {" · "}
                <b className="text-tinta-700">
                  {total.toLocaleString("pt-BR")}
                </b>{" "}
                no filtro
              </>
            )}
          </>
        }
        acoes={
          <>
            {/* A rota `/api/leads/exportar` existia desde sempre e nenhuma tela
                chamava ela: dava para importar a base e não dava para tirá-la
                de volta. LEVA O MESMO RECORTE QUE ESTÁ NA TELA — exportar
                ignorando o filtro entrega a base inteira para quem pediu
                Juazeiro, e ela só descobre depois de abrir o arquivo. */}
            <a
              href={`/api/leads/exportar${
                filtrando
                  ? `?${new URLSearchParams(
                      Object.entries({
                        q: filtros.q,
                        municipio: filtros.municipio,
                        vinculo: filtros.vinculo,
                      }).filter(([, v]) => v) as [string, string][],
                    ).toString()}`
                  : ""
              }`}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-tinta-200 bg-white px-3.5 text-[13px] font-semibold text-tinta-700 transition-colors hover:border-tinta-300 hover:text-tinta-900"
            >
              <Download size={14} strokeWidth={2.2} />
              {filtrando ? "Exportar o filtro" : "Exportar base"}
            </a>
            {/* Só a contagem e o telefone com DDI, sem repetidos. LEVA O MESMO
                RECORTE, e aqui isso importa mais: uma lista sem nome e sem
                cidade não deixa ninguém perceber que veio a base inteira
                quando pediu Juazeiro. */}
            <a
              href={`/api/leads/exportar?${new URLSearchParams(
                Object.entries({
                  formato: "numeros",
                  ...(filtrando
                    ? {
                        q: filtros.q,
                        municipio: filtros.municipio,
                        vinculo: filtros.vinculo,
                      }
                    : {}),
                }).filter(([, v]) => v) as [string, string][],
              ).toString()}`}
              title="Uma coluna com a contagem e outra com DDI + DDD + telefone, sem repetidos"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-tinta-200 bg-white px-3.5 text-[13px] font-semibold text-tinta-700 transition-colors hover:border-tinta-300 hover:text-tinta-900"
            >
              <Download size={14} strokeWidth={2.2} />
              Só os números
            </a>
            <Button variant="outline" onClick={() => setImportando((v) => !v)}>
              <Upload size={15} />{" "}
              {importando ? "Fechar importação" : "Importar"}
            </Button>
            <Button onClick={() => setAberto(true)}>+ Novo lead</Button>
          </>
        }
      />

      {/* Importação em massa mora aqui dentro: planilha e fotos de ficha são
          formas de cadastrar lead, não um módulo à parte. */}
      {importando && <ImportarClient lideres={lideres} />}

      {totalGeral > 0 && (
        <div className="mt-6 inline-flex rounded-lg border border-tinta-200 bg-white p-0.5">
          {(
            [
              ["painel", "Painel"],
              ["lista", "Lista"],
              ["mapa", "Mapa"],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={valor}
              onClick={() => setAba(valor)}
              className={`rounded-[6px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                aba === valor
                  ? "bg-tema text-white"
                  : "text-tinta-600 hover:bg-tinta-50 hover:text-tinta-900"
              }`}
            >
              {texto}
            </button>
          ))}
        </div>
      )}

      {totalGeral > 0 && aba === "painel" && <PainelLeads r={resumo} />}

      {totalGeral > 0 && aba === "mapa" && <MapaSobDemanda />}

      {aba === "lista" && (
        <form
          className="mt-6 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            aplicar({ p: "" });
          }}
        >
          <div className="relative min-w-[220px] flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-400"
            />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone ou bairro…"
              className="h-11 pl-9"
            />
          </div>
          <select
            value={filtros.municipio}
            onChange={(e) => aplicar({ municipio: e.target.value, p: "" })}
            className="h-11 rounded-md border border-input bg-white px-3 text-[13px] outline-none"
          >
            <option value="">Todos os municípios</option>
            {municipios.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={filtros.vinculo}
            onChange={(e) => aplicar({ vinculo: e.target.value, p: "" })}
            className="h-11 rounded-md border border-input bg-white px-3 text-[13px] outline-none"
          >
            <option value="">Com e sem liderança</option>
            <option value="com">Vinculados</option>
            <option value="sem">Sem liderança</option>
          </select>
          <Button type="submit" variant="outline" className="h-11">
            Buscar
          </Button>
          {filtrando && (
            <button
              type="button"
              onClick={() => {
                setBusca("");
                router.push("/leads");
              }}
              className="text-[12.5px] text-tinta-400 underline underline-offset-2 hover:text-tinta-600"
            >
              limpar
            </button>
          )}
        </form>
      )}

      {aba === "lista" &&
        (totalGeral === 0 ? (
          <div className="mt-8 flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-tinta-300 bg-white/60 text-center">
            <p className="text-4xl">🧑‍🤝‍🧑</p>
            <p className="mt-3 text-sm font-semibold text-tinta-700">
              Nenhum lead ainda.
            </p>
            <p className="mt-1 text-[13px] text-tinta-500">
              Use <b>Importar</b> para subir uma planilha ou <b>+ Novo lead</b>{" "}
              para cadastrar um.
            </p>
          </div>
        ) : leads.length === 0 ? (
          <p className="mt-10 text-center text-sm text-tinta-500">
            Nenhum munícipe neste filtro.
          </p>
        ) : (
          <>
            {/* Linha compacta em vez de cartão: com dezenas de milhares, densidade
              é o que permite achar alguém sem rolar a tela sem fim. */}
            <div className="mt-4 overflow-hidden rounded-xl border border-tinta-200 bg-white shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
              {leads.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center gap-3 border-b border-tinta-100 px-4 py-2.5 last:border-0 hover:bg-tinta-50"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[13px] font-bold text-emerald-700">
                    {(l.nome || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-tinta-900">
                      {l.nome}
                    </p>
                    <p className="truncate text-[12.5px] text-tinta-500">
                      {l.telefone ?? "sem telefone"}
                      {[l.municipio, l.bairro].filter(Boolean).length
                        ? ` · ${[l.municipio, l.bairro].filter(Boolean).join(" · ")}`
                        : ""}
                    </p>
                  </div>
                  <span className="hidden shrink-0 rounded-md bg-tinta-100 px-2.5 py-1 text-[11.5px] text-tinta-600 sm:inline">
                    {l.parent_id
                      ? `↳ ${nomeLider.get(l.parent_id) ?? "vinculado"}`
                      : "solto"}
                  </span>
                  <button
                    onClick={() => excluir(l)}
                    className="shrink-0 rounded-md p-2 text-tinta-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    title="Excluir"
                    aria-label="Excluir"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-tinta-500">
                {primeiro.toLocaleString("pt-BR")}–
                {ultimo.toLocaleString("pt-BR")} de{" "}
                {total.toLocaleString("pt-BR")}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="h-9"
                  disabled={pagina <= 1}
                  onClick={() => aplicar({ p: String(pagina - 1) })}
                >
                  Anterior
                </Button>
                <span className="text-[13px] text-tinta-500">
                  {pagina} / {ultimaPagina}
                </span>
                <Button
                  variant="outline"
                  className="h-9"
                  disabled={pagina >= ultimaPagina}
                  onClick={() => aplicar({ p: String(pagina + 1) })}
                >
                  Próxima
                </Button>
              </div>
            </div>
          </>
        ))}

      <NovoLeadDialog
        aberto={aberto}
        onOpenChange={setAberto}
        lideres={lideres}
      />
    </>
  );
}

function NovoLeadDialog({
  aberto,
  onOpenChange,
  lideres,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  lideres: LiderOpcao[];
}) {
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        {aberto && (
          <FormLead lideres={lideres} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormLead({
  lideres,
  onDone,
}: {
  lideres: LiderOpcao[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [bairro, setBairro] = useState("");
  const [parentId, setParentId] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [lendoFoto, setLendoFoto] = useState(false);
  const [avisoFoto, setAvisoFoto] = useState("");
  const [camera, setCamera] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);

  // A câmera devolve os campos já lidos; a imagem não é guardada.
  function aplicarFicha(d: DadosFicha) {
    if (d.nome) setNome(d.nome);
    if (d.telefone) setTelefone(d.telefone);
    if (d.municipio) setMunicipio(d.municipio);
    if (d.bairro) setBairro(d.bairro);
    const partes = [];
    if (d.confianca !== "alta")
      partes.push(`leitura de confiança ${d.confianca}`);
    if (d.observacao) partes.push(d.observacao);
    setAvisoFoto(
      partes.length
        ? `Confira antes de salvar — ${partes.join("; ")}.`
        : "Campos preenchidos pela câmera. Confira antes de salvar.",
    );
  }

  // A foto é reduzida antes de subir: ficha fotografada de celular passa de 5 MB,
  // e 1600px já é mais resolução do que a leitura precisa.
  function encolher(arquivo: File) {
    return new Promise<{ base64: string; tipo: string }>((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onerror = () =>
        reject(new Error("Não foi possível abrir a foto."));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () =>
          reject(new Error("Arquivo não é uma imagem válida."));
        img.onload = () => {
          const MAX = 1600;
          const escala = Math.min(1, MAX / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * escala);
          canvas.height = Math.round(img.height * escala);
          const ctx = canvas.getContext("2d");
          if (!ctx)
            return reject(
              new Error("Navegador não suporta o redimensionamento."),
            );
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          resolve({ base64: dataUrl.split(",")[1] ?? "", tipo: "image/jpeg" });
        };
        img.src = String(leitor.result);
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  async function lerFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro("");
    setAvisoFoto("");
    setLendoFoto(true);
    try {
      const { base64, tipo } = await encolher(arquivo);
      const resp = await fetch("/api/leads/ler-foto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imagem: base64, tipo }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setErro(json?.erro ?? "Não foi possível ler a foto.");
      } else {
        // Só preenche o que veio; não apaga o que a pessoa já digitou.
        if (json.nome) setNome(json.nome);
        if (json.telefone) setTelefone(json.telefone);
        if (json.municipio) setMunicipio(json.municipio);
        if (json.bairro) setBairro(json.bairro);
        const partes = [];
        if (json.confianca !== "alta")
          partes.push(`leitura de confiança ${json.confianca}`);
        if (json.observacao) partes.push(json.observacao);
        setAvisoFoto(
          partes.length
            ? `Confira antes de salvar — ${partes.join("; ")}.`
            : "Campos preenchidos pela foto. Confira antes de salvar.",
        );
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao processar a foto.");
    }
    setLendoFoto(false);
    if (fotoRef.current) fotoRef.current.value = ""; // permite reenviar a mesma foto
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!nome.trim()) return setErro("Informe o nome.");
    // Mesma regra do cadastro manual e da ficha da liderança — as três escrevem
    // na mesma tabela. Opcional aqui, mas se preenchido tem de estar certo.
    if (telefone.trim()) {
      const problema = problemaNoTelefone(telefone);
      if (problema) return setErro(problema);
    }
    setSalvando(true);
    const supabase = createClient();
    const { error } = await supabase.from("liderancas").insert({
      nome: nome.trim(),
      telefone: telefone.trim() || null,
      municipio: municipio.trim() || null,
      bairro: bairro.trim() || null,
      parent_id: parentId || null,
      tipo: "lead",
      created_via: "manual",
      link_code: gerarLinkCode(),
    });
    setSalvando(false);
    if (error) return setErro(error.message);
    onDone();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Novo lead / munícipe</DialogTitle>
      </DialogHeader>
      <form onSubmit={salvar} className="flex flex-col gap-4">
        {/* Câmera ao vivo: aponta para a ficha, a IA lê e preenche.
            A imagem não é guardada — vira texto e é descartada. */}
        <div className="rounded-xl border border-dashed border-tinta-300 bg-tinta-50/60 p-3">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setCamera(true)}
          >
            <Camera size={16} /> Ler ficha com a câmera
          </Button>
          <input
            ref={fotoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => lerFoto(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={lendoFoto}
            onClick={() => fotoRef.current?.click()}
            className="mt-2 w-full text-center text-[11.5px] text-tinta-500 underline underline-offset-2 disabled:opacity-60"
          >
            {lendoFoto ? "Lendo…" : "ou escolher uma foto salva"}
          </button>
          <p className="mt-2 text-center text-[11px] text-tinta-500">
            A IA preenche os campos. Sempre confira antes de salvar.
          </p>
        </div>

        {avisoFoto && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
            {avisoFoto}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="ld-nome">Nome *</Label>
          <Input
            id="ld-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome completo"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ld-tel">Telefone / WhatsApp</Label>
          <Input
            id="ld-tel"
            value={telefone}
            onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
            placeholder={EXEMPLO_TELEFONE}
            inputMode="tel"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ld-mun">Município</Label>
            <Input
              id="ld-mun"
              list="municipios-ba"
              value={municipio}
              onChange={(e) => setMunicipio(e.target.value)}
              placeholder="Comece a digitar…"
              autoComplete="off"
            />
            <datalist id="municipios-ba">
              {MUNICIPIOS_BA.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ld-bairro">Bairro</Label>
            <Input
              id="ld-bairro"
              value={bairro}
              onChange={(e) => setBairro(e.target.value)}
              placeholder="Bairro"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ld-parent">Vincular a uma liderança</Label>
          <select
            id="ld-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring"
          >
            <option value="">— Sem vínculo (solto) —</option>
            {lideres.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <DialogFooter>
          <Button type="submit" disabled={salvando}>
            {salvando ? "Salvando..." : "Cadastrar lead"}
          </Button>
        </DialogFooter>
      </form>

      <CameraFicha
        aberto={camera}
        onFechar={() => setCamera(false)}
        onLido={aplicarFicha}
      />
    </>
  );
}
