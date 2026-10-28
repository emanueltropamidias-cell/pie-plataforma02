"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Copy, Check, X } from "lucide-react";
import { CANDIDATO } from "@/lib/candidato";
import { ABAS, moduloAtivo, type Modulo } from "@/lib/modulos";
import { SeletorAbas } from "@/components/config/seletor-abas";

// Criar a conta da equipe e entregar a senha na mão.
//
// O caminho normal do Supabase é mandar um link para o e-mail da pessoa. Numa
// campanha isso trava: a atendente informa um e-mail que ela quase não abre, o
// link cai em spam, expira, e alguém perde a manhã do primeiro dia resolvendo
// isso por telefone. Aqui o coordenador cria, copia e manda pelo WhatsApp —
// que é onde a equipe já está.
//
// A SENHA APARECE UMA VEZ. Ela não fica guardada em lugar nenhum: senha
// recuperável em texto é senha que vaza no dia em que o banco vazar. Se a tela
// fechar sem copiar, o caminho é criar outra — e o botão de copiar o recado
// pronto existe para esse "sem copiar" quase não acontecer.

const PAPEIS = [
  { v: "atendente", label: "Atendente", nota: "Só a caixa de entrada" },
  { v: "supervisor", label: "Supervisor", nota: "Toda a área de atendimento" },
  { v: "usuario", label: "Usuário", nota: "As abas que você marcar" },
];

type Criada = { email: string; senha: string; nome: string; papel: string };

export function CriarConta() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState("atendente");
  // Começa com tudo marcado: desmarcar é o gesto de restringir.
  const [abas, setAbas] = useState<Modulo[]>(ABAS.filter((a) => moduloAtivo(a.modulo)).map((a) => a.modulo));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criada, setCriada] = useState<Criada | null>(null);
  const [copiado, setCopiado] = useState<"senha" | "recado" | null>(null);

  async function criar() {
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/equipe/criar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, email, papel, modulos: papel === "usuario" ? abas : undefined }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErro(j?.erro ?? "Não consegui criar.");
        return;
      }
      setCriada({
        email: j.email,
        senha: j.senha,
        nome: j.nome,
        papel: j.papel,
      });
      setNome("");
      setEmail("");
      router.refresh();
    } catch {
      setErro("Falha de rede.");
    } finally {
      setEnviando(false);
    }
  }

  // O recado pronto para colar no WhatsApp. Sem isto o coordenador digita à mão
  // cinco vezes e erra o endereço numa delas.
  const recado = criada
    ? `Oi, ${criada.nome.split(" ")[0]}! Seu acesso ao ManuFlow:\n\n` +
      `Endereço: ${CANDIDATO.app}\n` +
      `E-mail: ${criada.email}\n` +
      `Senha: ${criada.senha}\n\n` +
      `Troque a senha assim que entrar.`
    : "";

  async function copiar(qual: "senha" | "recado") {
    try {
      await navigator.clipboard.writeText(
        qual === "senha" ? criada!.senha : recado,
      );
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setErro(
        "O navegador não deixou copiar. Selecione o texto e copie à mão.",
      );
    }
  }

  // ── depois de criar ───────────────────────────────────────────────────────
  if (criada) {
    return (
      <div className="rounded-lg border border-[#cbe3d4] bg-[#f1f8f3] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-bold text-[#12703c]">
              Conta de {criada.nome} criada
            </h3>
            <p className="mt-0.5 text-[12.5px] text-[#12703c]">
              A senha aparece só agora. Copie antes de fechar.
            </p>
          </div>
          <button
            onClick={() => setCriada(null)}
            aria-label="Fechar"
            className="text-[#12703c] opacity-60 hover:opacity-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-[#cbe3d4] bg-white px-3 py-2.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-tinta-400">
            Senha
          </span>
          <code className="flex-1 text-[16px] font-bold tracking-[0.06em] text-tinta-900">
            {criada.senha}
          </code>
          <button
            onClick={() => copiar("senha")}
            className="flex items-center gap-1.5 rounded-md border border-tinta-200 px-2.5 py-1 text-[12px] font-semibold text-tinta-600 hover:border-tinta-300"
          >
            {copiado === "senha" ? <Check size={13} /> : <Copy size={13} />}
            {copiado === "senha" ? "copiado" : "copiar"}
          </button>
        </div>

        <button
          onClick={() => copiar("recado")}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-[#12703c] px-4 py-2.5 text-[13px] font-semibold text-white"
        >
          {copiado === "recado" ? <Check size={15} /> : <Copy size={15} />}
          {copiado === "recado"
            ? "Recado copiado"
            : "Copiar o recado pronto para o WhatsApp"}
        </button>

        <pre className="mt-2 whitespace-pre-wrap rounded-md border border-[#cbe3d4] bg-white px-3 py-2 text-[11.5px] leading-relaxed text-tinta-600">
          {recado}
        </pre>

        {criada.papel === "atendente" && (
          <p className="mt-2.5 text-[12px] leading-relaxed text-[#12703c]">
            <b>Ela já pode puxar lead.</b> A conta entrou no departamento Geral
            — é só ela entrar, abrir Aguardando e clicar em Atender.
          </p>
        )}

        <button
          onClick={() => setCriada(null)}
          className="mt-3 text-[12.5px] font-semibold text-[#12703c] underline-offset-2 hover:underline"
        >
          Criar mais uma
        </button>
      </div>
    );
  }

  // ── o formulário ──────────────────────────────────────────────────────────
  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="flex h-9 items-center gap-1.5 rounded-lg bg-tema px-3.5 text-[13px] font-semibold text-white"
      >
        <UserPlus size={15} strokeWidth={2.3} />
        Criar conta
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-tema bg-white p-4">
      <h3 className="text-[14px] font-bold text-tinta-900">
        Criar conta da equipe
      </h3>
      <p className="mt-0.5 text-[12.5px] text-tinta-500">
        A senha é gerada aqui e mostrada uma vez, para você mandar à pessoa.
      </p>

      {erro && (
        <p className="mt-3 rounded-md border border-[#f3d3d3] bg-[#fdf1f1] px-3 py-2 text-[12.5px] text-[#c02020]">
          {erro}
        </p>
      )}

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11.5px] font-semibold text-tinta-600">
            Nome
          </span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Altineia Boneca"
            className="mt-1 h-9 w-full rounded-md border border-tinta-200 px-2.5 text-[13px] outline-none focus:border-tema"
          />
        </label>
        <label className="block">
          <span className="text-[11.5px] font-semibold text-tinta-600">
            E-mail
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="altineia@equipe.com.br"
            className="mt-1 h-9 w-full rounded-md border border-tinta-200 px-2.5 text-[13px] outline-none focus:border-tema"
          />
        </label>
      </div>

      <div className="mt-3">
        <span className="text-[11.5px] font-semibold text-tinta-600">
          Papel
        </span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {PAPEIS.map((p) => (
            <button
              key={p.v}
              onClick={() => setPapel(p.v)}
              title={p.nota}
              className={`rounded-md border px-2.5 py-1.5 text-left transition-colors ${
                papel === p.v
                  ? "border-tema bg-tema/10"
                  : "border-tinta-200 hover:border-tinta-300"
              }`}
            >
              <span
                className={`block text-[12.5px] font-semibold ${
                  papel === p.v ? "text-tema" : "text-tinta-700"
                }`}
              >
                {p.label}
              </span>
              <span className="block text-[11px] text-tinta-400">{p.nota}</span>
            </button>
          ))}
        </div>
        {papel === "usuario" && (
          <div className="mt-3">
            <SeletorAbas marcadas={abas} onMudar={setAbas} />
          </div>
        )}
        {/* Admin não sai daqui de propósito: criar login já é a porta mais
            larga da plataforma, e promover alguém a admin merece ser um gesto
            separado, na lista abaixo, onde a mudança fica visível. */}
        <p className="mt-1.5 text-[11px] text-tinta-400">
          Para criar outro administrador, crie como Usuário e promova na lista
          abaixo.
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={criar}
          disabled={enviando || !nome.trim() || !email.trim() || (papel === "usuario" && abas.length === 0)}
          className="h-9 rounded-lg bg-tema px-4 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          {enviando ? "Criando…" : "Criar e mostrar a senha"}
        </button>
        <button
          onClick={() => {
            setAberto(false);
            setErro(null);
          }}
          className="h-9 rounded-lg px-3 text-[13px] text-tinta-500 hover:text-tinta-900"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
