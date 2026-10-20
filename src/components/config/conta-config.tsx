"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Feedback = { tipo: "ok" | "erro"; texto: string } | null;

function Aviso({ fb }: { fb: NonNullable<Feedback> }) {
  return (
    <p
      className={`text-sm ${fb.tipo === "erro" ? "text-red-600" : "text-green-600"}`}
    >
      {fb.texto}
    </p>
  );
}

export function ContaConfig({
  email,
  nomeInicial,
}: {
  email: string;
  nomeInicial: string;
}) {
  const router = useRouter();

  const [nome, setNome] = useState(nomeInicial);
  const [fbPerfil, setFbPerfil] = useState<Feedback>(null);
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);

  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [fbSenha, setFbSenha] = useState<Feedback>(null);
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  async function salvarPerfil(e: React.FormEvent) {
    e.preventDefault();
    setFbPerfil(null);
    if (!nome.trim())
      return setFbPerfil({ tipo: "erro", texto: "Informe seu nome." });
    setSalvandoPerfil(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      data: { nome: nome.trim() },
    });
    setSalvandoPerfil(false);
    if (error) return setFbPerfil({ tipo: "erro", texto: error.message });
    setFbPerfil({ tipo: "ok", texto: "✅ Perfil atualizado!" });
    router.refresh();
  }

  async function alterarSenha(e: React.FormEvent) {
    e.preventDefault();
    setFbSenha(null);
    if (senha.length < 6)
      return setFbSenha({
        tipo: "erro",
        texto: "A senha deve ter no mínimo 6 caracteres.",
      });
    if (senha !== senha2)
      return setFbSenha({ tipo: "erro", texto: "As senhas não conferem." });
    setSalvandoSenha(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvandoSenha(false);
    if (error) return setFbSenha({ tipo: "erro", texto: error.message });
    setSenha("");
    setSenha2("");
    setFbSenha({ tipo: "ok", texto: "✅ Senha alterada com sucesso!" });
  }

  return (
    <div className="mt-8 grid max-w-2xl gap-6">
      {/* Meu perfil */}
      <form
        onSubmit={salvarPerfil}
        className="rounded-xl border border-tinta-200 bg-white p-6 shadow-[0_1px_2px_rgba(22,32,46,0.04)]"
      >
        <h2 className="text-sm font-semibold text-tinta-800">👤 Meu perfil</h2>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cfg-nome">Nome</Label>
            <Input
              id="cfg-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cfg-email">E-mail</Label>
            <Input
              id="cfg-email"
              value={email}
              disabled
              className="bg-tinta-50 text-tinta-500"
            />
          </div>
          {fbPerfil && <Aviso fb={fbPerfil} />}
          <div>
            <Button type="submit" disabled={salvandoPerfil}>
              {salvandoPerfil ? "Salvando..." : "Salvar perfil"}
            </Button>
          </div>
        </div>
      </form>

      {/* Alterar senha */}
      <form
        onSubmit={alterarSenha}
        className="rounded-xl border border-tinta-200 bg-white p-6 shadow-[0_1px_2px_rgba(22,32,46,0.04)]"
      >
        <h2 className="text-sm font-semibold text-tinta-800">
          🔒 Alterar senha
        </h2>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cfg-senha">Nova senha</Label>
            <Input
              id="cfg-senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cfg-senha2">Confirmar nova senha</Label>
            <Input
              id="cfg-senha2"
              type="password"
              value={senha2}
              onChange={(e) => setSenha2(e.target.value)}
              placeholder="Repita a senha"
              autoComplete="new-password"
            />
          </div>
          {fbSenha && <Aviso fb={fbSenha} />}
          <div>
            <Button type="submit" disabled={salvandoSenha}>
              {salvandoSenha ? "Alterando..." : "Alterar senha"}
            </Button>
          </div>
        </div>
      </form>

      {/* Em breve */}
      <div className="rounded-xl border border-dashed border-tinta-300 bg-white/60 p-6">
        <h2 className="text-sm font-semibold text-tinta-700">
          🖼️ Foto de capa do login
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-tinta-500">
          Em breve: personalizar a imagem de fundo da tela de entrada (precisa
          do armazenamento de imagens do Supabase).
        </p>
      </div>
    </div>
  );
}
