"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CATEGORIAS, PRIORIDADES, STATUS, type Demanda } from "./constantes";
import { MUNICIPIOS_BA } from "@/lib/municipios-ba";

export type Pessoa = { id: string; nome: string; municipio: string | null; bairro: string | null };

export function DemandaDialog({
  demanda,
  meuId,
  aberto,
  onOpenChange,
}: {
  demanda: Demanda | null;
  meuId: string;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [municipeId, setMunicipeId] = useState("");
  const [nomeLivre, setNomeLivre] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [bairro, setBairro] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("outros");
  const [prioridade, setPrioridade] = useState("normal");
  const [status, setStatus] = useState("aberta");
  const [prazo, setPrazo] = useState("");
  const [resposta, setResposta] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mostrarLista, setMostrarLista] = useState(false);

  // A busca é no banco, não na memória: a base tem dezenas de milhares de
  // pessoas e carregá-la só para filtrar oito travava a abertura da tela.
  const [sugestoes, setSugestoes] = useState<Pessoa[]>([]);
  const [escolhida, setEscolhida] = useState<Pessoa | null>(null);

  useEffect(() => {
    const q = nomeLivre.trim();
    if (q.length < 2 || municipeId) {
      setSugestoes([]);
      return;
    }
    // Espera a digitação parar antes de perguntar ao banco.
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/pessoas/buscar?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        setSugestoes(j.pessoas ?? []);
      } catch {
        setSugestoes([]);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [nomeLivre, municipeId]);

  useEffect(() => {
    if (!aberto) return;
    setErro("");
    setMunicipeId(demanda?.municipe_id ?? "");
    setEscolhida(null);
    setNomeLivre(demanda?.municipe_nome ?? "");
    setMunicipio(demanda?.municipio ?? "");
    setBairro(demanda?.bairro ?? "");
    setMostrarLista(false);
    setTitulo(demanda?.titulo ?? "");
    setDescricao(demanda?.descricao ?? "");
    setCategoria(demanda?.categoria ?? "outros");
    setPrioridade(demanda?.prioridade ?? "normal");
    setStatus(demanda?.status ?? "aberta");
    setPrazo(demanda?.prazo ?? "");
    setResposta(demanda?.resposta ?? "");
  }, [aberto, demanda]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!titulo.trim()) return setErro("Escreva o que a pessoa pediu.");

    const nome = escolhida?.nome ?? nomeLivre.trim();
    if (!nome) return setErro("Informe de quem é a demanda.");

    setSalvando(true);
    const supabase = createClient();
    const dados = {
      municipe_id: municipeId || null,
      municipe_nome: nome,
      municipio: municipio.trim() || escolhida?.municipio || null,
      bairro: bairro.trim() || null,
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      categoria,
      prioridade,
      status,
      prazo: prazo || null,
      resposta: resposta.trim() || null,
    };

    const { error } = demanda
      ? await supabase.from("demandas").update(dados).eq("id", demanda.id)
      : await supabase.from("demandas").insert({ ...dados, criado_por: meuId });

    setSalvando(false);
    if (error) return setErro(error.message);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{demanda ? "Editar demanda" : "Nova demanda"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={salvar} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="dm-pessoa">De quem é a demanda *</Label>
            {/* Busca em vez de lista: a base tem dezenas de milhares de pessoas,
                e nenhum seletor comum dá conta disso. Quem não está cadastrado
                entra pelo nome digitado, sem vínculo. */}
            <div className="relative">
              <Input
                id="dm-pessoa"
                value={nomeLivre}
                onChange={(e) => {
                  setNomeLivre(e.target.value);
                  setMunicipeId("");
                  setMostrarLista(true);
                }}
                onFocus={() => setMostrarLista(true)}
                placeholder="Digite o nome para buscar…"
                autoComplete="off"
              />
              {mostrarLista && sugestoes.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-tinta-200 bg-white shadow-lg">
                  {sugestoes.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setMunicipeId(p.id);
                        setEscolhida(p);
                        setNomeLivre(p.nome);
                        // Traz o município do cadastro, mas segue editável:
                        // a pessoa pode ter mudado de cidade.
                        if (p.municipio) setMunicipio(p.municipio);
                        if (p.bairro) setBairro(p.bairro);
                        setMostrarLista(false);
                      }}
                      className="block w-full px-3 py-2 text-left text-[13px] hover:bg-tinta-50"
                    >
                      <span className="font-medium text-tinta-900">{p.nome}</span>
                      {p.municipio && <span className="text-tinta-400"> · {p.municipio}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11.5px] text-tinta-400">
              {municipeId
                ? "Vinculado ao cadastro desta pessoa."
                : "Sem vínculo: a demanda fica registrada só com o nome digitado."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dm-mun">Município</Label>
              <Input
                id="dm-mun"
                list="municipios-ba-demanda"
                value={municipio}
                onChange={(e) => setMunicipio(e.target.value)}
                placeholder="Comece a digitar…"
                autoComplete="off"
              />
              <datalist id="municipios-ba-demanda">
                {MUNICIPIOS_BA.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dm-bairro">Bairro</Label>
              <Input
                id="dm-bairro"
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                placeholder="Bairro ou localidade"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="dm-titulo">O que foi pedido *</Label>
            <Input
              id="dm-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Consulta com cardiologista"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dm-cat">Área</Label>
              <select
                id="dm-cat"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="h-10 rounded-md border border-input bg-white px-2 text-[13px] outline-none"
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dm-prio">Prioridade</Label>
              <select
                id="dm-prio"
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value)}
                className="h-10 rounded-md border border-input bg-white px-2 text-[13px] outline-none"
              >
                {PRIORIDADES.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dm-status">Situação</Label>
              <select
                id="dm-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-10 rounded-md border border-input bg-white px-2 text-[13px] outline-none"
              >
                {STATUS.map((s) => (
                  <option key={s.valor} value={s.valor}>
                    {s.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dm-prazo">Prazo</Label>
              <Input id="dm-prazo" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="dm-desc">Detalhes</Label>
            <textarea
              id="dm-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              placeholder="Contexto, telefone de contato, endereço…"
              className="rounded-md border border-input bg-white px-3 py-2 text-[13px] outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="dm-resp">O que foi feito</Label>
            <textarea
              id="dm-resp"
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
              rows={2}
              placeholder="Encaminhamento, protocolo, resultado…"
              className="rounded-md border border-input bg-white px-3 py-2 text-[13px] outline-none"
            />
          </div>

          {erro && <p className="text-[13px] font-medium text-red-600">{erro}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
