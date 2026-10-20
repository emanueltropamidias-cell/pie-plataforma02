"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { formatarTelefone, problemaNoTelefone, EXEMPLO_TELEFONE } from "@/lib/telefone";

export type Lideranca = {
  id: string;
  nome: string;
  telefone: string | null;
  municipio: string | null;
  bairro: string | null;
  link_code: string | null;
  cod_acesso: string | null;
  votos_comprometidos: number | null;
  /** A frase própria do QR desta liderança. Vazio = a frase padrão. */
  mensagem_qr?: string | null;
};


export function LiderancaDialog({
  lideranca,
  aberto,
  onOpenChange,
}: {
  lideranca?: Lideranca | null;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        {aberto && (
          <FormLideranca
            key={lideranca?.id ?? "novo"}
            lideranca={lideranca ?? null}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormLideranca({
  lideranca,
  onDone,
}: {
  lideranca: Lideranca | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const editando = !!lideranca;

  const [nome, setNome] = useState(lideranca?.nome ?? "");
  const [telefone, setTelefone] = useState(lideranca?.telefone ?? "");
  const [municipio, setMunicipio] = useState(lideranca?.municipio ?? "");
  const [bairro, setBairro] = useState(lideranca?.bairro ?? "");
  const [votos, setVotos] = useState(
    lideranca?.votos_comprometidos != null ? String(lideranca.votos_comprometidos) : "",
  );
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!nome.trim()) return setErro("Informe o nome.");
    // Telefone é opcional AQUI — liderança pode existir sem número. Mas se for
    // preenchido, tem de estar certo: telefone torto não dá erro, cria uma
    // segunda pessoa. A regra mora em `lib/telefone.ts`, a mesma do cadastro
    // manual e da tela de leads.
    if (telefone.trim()) {
      const problema = problemaNoTelefone(telefone);
      if (problema) return setErro(problema);
    }
    setSalvando(true);
    const supabase = createClient();
    const dados = {
      nome: nome.trim(),
      telefone: telefone.trim() || null,
      municipio: municipio.trim() || null,
      bairro: bairro.trim() || null,
      votos_comprometidos: votos ? parseInt(votos, 10) || 0 : 0,
    };

    let error;
    if (editando && lideranca) {
      ({ error } = await supabase
        .from("liderancas")
        .update({ ...dados, updated_at: new Date().toISOString() })
        .eq("id", lideranca.id));
    } else {
      ({ error } = await supabase.from("liderancas").insert({
        ...dados,
        tipo: "lideranca",
        created_via: "manual",
        link_code: gerarLinkCode(),
      }));
    }

    setSalvando(false);
    if (error) return setErro(error.message);
    onDone();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editando ? "Editar liderança" : "Nova liderança"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ld-nome">Nome *</Label>
          <Input id="ld-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ld-tel">Telefone / WhatsApp</Label>
          <Input id="ld-tel" value={telefone} onChange={(e) => setTelefone(formatarTelefone(e.target.value))} placeholder={EXEMPLO_TELEFONE} inputMode="tel" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ld-mun">Município</Label>
            <Input id="ld-mun" list="municipios-ba" value={municipio} onChange={(e) => setMunicipio(e.target.value)} placeholder="Comece a digitar…" autoComplete="off" />
            <datalist id="municipios-ba">
              {MUNICIPIOS_BA.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ld-bairro">Bairro</Label>
            <Input id="ld-bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Bairro" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ld-votos">Votos comprometidos</Label>
          <Input id="ld-votos" type="number" min={0} value={votos} onChange={(e) => setVotos(e.target.value)} placeholder="0" />
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <DialogFooter>
          <Button type="submit" disabled={salvando}>
            {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar liderança"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
