"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { MARCA } from "@/lib/candidato";
import { LogoManuFlow } from "@/components/brand/logo-manuflow";

type Msg = { tipo: "erro" | "ok"; texto: string } | null;

const INPUT_CLS =
  "h-12 border-white/10 bg-white/[0.04] text-white placeholder:text-zinc-500 focus-visible:border-blue-500 focus-visible:ring-blue-500/20 rounded-lg";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [modo, setModo] = useState<"geral" | "lideranca" | "criar">("geral");
  const [primeiroAcesso, setPrimeiroAcesso] = useState(false);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [carregando, setCarregando] = useState(false);

  // O login social falha longe daqui, no Supabase, e volta com o motivo na URL.
  // Lido pelo window em vez de useSearchParams para não obrigar esta página a
  // viver dentro de um Suspense só por causa de um aviso.
  const [detalhe, setDetalhe] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const erro = p.get("erro");
    if (!erro) return;
    setMsg({ tipo: "erro", texto: erro });
    setDetalhe(p.get("det"));
    // Limpa a URL: recarregar a página não deve ressuscitar o aviso.
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  function trocarModo(novo: "geral" | "lideranca" | "criar") {
    setModo(novo);
    setPrimeiroAcesso(false);
    setMsg(null);
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) return setMsg({ tipo: "erro", texto: traduzErro(error.message) });
    router.push("/dashboard");
    router.refresh();
  }

  async function criarConta() {
    setMsg(null);
    if (!nome.trim() || !email || !senha)
      return setMsg({ tipo: "erro", texto: "Preencha nome, e-mail e senha." });
    if (senha.length < 6)
      return setMsg({ tipo: "erro", texto: "A senha deve ter no mínimo 6 caracteres." });
    setCarregando(true);
    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome: nome.trim() } },
    });
    setCarregando(false);
    if (error) return setMsg({ tipo: "erro", texto: traduzErro(error.message) });
    setMsg({ tipo: "ok", texto: "Conta criada! Um administrador vai liberar seu acesso para entrar." });
  }

  async function esqueciSenha() {
    setMsg(null);
    if (!email) return setMsg({ tipo: "erro", texto: "Digite seu e-mail primeiro." });
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
    });
    if (error) return setMsg({ tipo: "erro", texto: error.message });
    setMsg({ tipo: "ok", texto: "Enviamos um link de redefinição para o seu e-mail." });
  }

  async function entrarLideranca(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) return setMsg({ tipo: "erro", texto: traduzErro(error.message) });
    router.push("/portal");
    router.refresh();
  }

  async function criarAcessoLideranca() {
    setMsg(null);
    if (!nome.trim() || !email || !senha || !codigo.trim())
      return setMsg({ tipo: "erro", texto: "Preencha nome, e-mail, senha e código." });
    if (senha.length < 6)
      return setMsg({ tipo: "erro", texto: "A senha deve ter no mínimo 6 caracteres." });
    setCarregando(true);

    // 1) cria a conta; se o e-mail já existe, faz login (mesma pessoa pode ser admin e liderança)
    const { error: eSignUp } = await supabase.auth.signUp({ email, password: senha });
    if (eSignUp) {
      if (/already registered|already been registered|User already/i.test(eSignUp.message)) {
        const { error: eLogin } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (eLogin) {
          setCarregando(false);
          return setMsg({
            tipo: "erro",
            texto: "Esse e-mail já tem conta, mas a senha não confere. Digite a senha da sua conta.",
          });
        }
      } else {
        setCarregando(false);
        return setMsg({ tipo: "erro", texto: traduzErro(eSignUp.message) });
      }
    }

    // 2) valida o código e vincula (função no banco ativa o perfil como liderança)
    const { data: resultado, error: eRpc } = await supabase.rpc("vincular_lideranca", {
      p_codigo: codigo.trim(),
      p_nome: nome.trim(),
    });
    setCarregando(false);
    if (eRpc) return setMsg({ tipo: "erro", texto: eRpc.message });
    if (resultado === "codigo-invalido")
      return setMsg({ tipo: "erro", texto: "Código de vínculo inválido. Confira com a equipe." });
    if (resultado === "ja-vinculada")
      return setMsg({ tipo: "erro", texto: "Essa liderança já tem acesso criado por outra conta." });

    router.push("/portal");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-dvh w-full items-center justify-center p-4 sm:p-6 overflow-hidden bg-[#07090e]">
      {/* Luzes ambiente de fundo (Glow estilo Apple Dark / Liquid Glass) */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-cyan-500/15 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-amber-500/10 blur-[150px]" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-blue-600/8 blur-[160px]" />

      {/* Card Principal em Apple Glass mais quadrado */}
      <div className="relative z-10 w-full max-w-[420px] rounded-xl border border-white/[0.12] bg-[#0c101b]/80 p-8 text-center backdrop-blur-2xl shadow-[0_32px_80px_rgba(0,0,0,0.7)] sm:p-10">
        {/* Marca Manuflow com nova Logo */}
        <div className="mb-6 flex flex-col items-center">
          <LogoManuFlow size="lg" className="justify-center" />

          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-500/[0.08] px-3.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee] animate-pulse" />
            Acesso à Plataforma
          </div>

          <div className="mt-2 text-xs text-zinc-400 font-medium">
            {modo === "geral" ? "Entre com suas credenciais" : modo === "criar" ? "Criar novo acesso" : "Painel da Liderança"}
          </div>
        </div>

        {/* ══ GERAL ══ */}
        {modo === "geral" && (
          <form onSubmit={entrar} className="mt-6 flex flex-col gap-3.5 text-left">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              autoComplete="email"
              className="h-12 border-white/10 bg-white/[0.04] text-white placeholder:text-zinc-500 focus-visible:border-blue-500 focus-visible:ring-blue-500/20 rounded-xl"
            />
            <SenhaInput
              senha={senha}
              setSenha={setSenha}
              verSenha={verSenha}
              setVerSenha={setVerSenha}
            />

            <button
              type="button"
              onClick={esqueciSenha}
              className="-mt-1 self-end text-[12px] text-blue-400 hover:text-blue-300 transition-colors"
            >
              Esqueci minha senha
            </button>

            {msg && <Aviso msg={msg} detalhe={detalhe} />}

            <BotaoVerde type="submit" disabled={carregando}>
              {carregando ? "Acessando..." : "Entrar na plataforma →"}
            </BotaoVerde>

            <p className="mt-3 text-center text-[13px] text-zinc-400">
              Não tem conta?{" "}
              <button
                type="button"
                onClick={() => trocarModo("criar")}
                className="font-semibold text-blue-400 hover:text-blue-300 underline underline-offset-2"
              >
                Criar conta
              </button>
            </p>

            <div className="mt-4 border-t border-white/[0.08] pt-4">
              <button
                type="button"
                onClick={() => trocarModo("lideranca")}
                className="flex w-full items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3 text-left transition-all hover:border-emerald-500/40 hover:bg-emerald-500/[0.12]"
              >
                <span className="text-[18px] leading-none" aria-hidden>🔑</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-emerald-400">Sou liderança</span>
                  <span className="block text-[11px] text-zinc-400">Acessar com código de vínculo</span>
                </span>
                <span className="text-[15px] font-bold text-emerald-400" aria-hidden>→</span>
              </button>
            </div>
          </form>
        )}

        {/* ══ CRIAR CONTA ══ */}
        {modo === "criar" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              criarConta();
            }}
            className="mt-6 flex flex-col gap-3 text-left"
          >
            {/* Três campos e um botão. O parágrafo que abria a tela explicava a
                aprovação antes de a pessoa ter feito nada — agora ele desceu
                para depois do botão, onde é resposta em vez de obstáculo. */}
            <Input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo" autoComplete="name" className={INPUT_CLS} />
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail" autoComplete="email" className={INPUT_CLS} />
            <div>
              <SenhaInput senha={senha} setSenha={setSenha} verSenha={verSenha} setVerSenha={setVerSenha} />
              {/* A regra aparece antes de ser quebrada, não como erro depois */}
              <p className="mt-1.5 text-[11.5px] text-zinc-400">Crie uma senha de 6 ou mais caracteres.</p>
            </div>

            {msg && <Aviso msg={msg} detalhe={detalhe} />}

            <BotaoVerde type="submit" disabled={carregando}>
              {carregando ? "..." : "Criar conta →"}
            </BotaoVerde>

            <p className="text-center text-[11.5px] leading-relaxed text-zinc-400">
              Um administrador libera o seu acesso antes do primeiro login.
            </p>

            <div className="mt-3 space-y-2 border-t border-white/[0.08] pt-3 text-center">
              <button type="button" onClick={() => trocarModo("geral")} className="block w-full text-[12.5px] text-zinc-400 hover:text-white transition-colors">
                ← Já tenho conta (entrar)
              </button>
              <button type="button" onClick={() => trocarModo("lideranca")} className="block w-full text-[12.5px] font-semibold text-emerald-400 hover:underline">
                🔑 Sou liderança e tenho um código
              </button>
            </div>
          </form>
        )}

        {/* ══ LIDERANÇA ══ */}
        {modo === "lideranca" && (
          <form onSubmit={entrarLideranca} className="mt-6 flex flex-col gap-3 text-left">
            <p className="mb-1 text-[13px] leading-relaxed text-zinc-500">
              {primeiroAcesso
                ? "Crie seu acesso de liderança com o código de vínculo que a equipe te passou."
                : "Entre no seu painel com o e-mail e a senha que você cadastrou."}
            </p>

            {primeiroAcesso && (
              <Input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo" autoComplete="name" className={INPUT_CLS} />
            )}
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail" autoComplete="email" className={INPUT_CLS} />
            <SenhaInput senha={senha} setSenha={setSenha} verSenha={verSenha} setVerSenha={setVerSenha} />
            {primeiroAcesso && (
              <Input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código de vínculo (ex: a7k2m9)" className={`${INPUT_CLS} font-mono tracking-widest`} />
            )}

            {msg && <Aviso msg={msg} detalhe={detalhe} />}

            {primeiroAcesso ? (
              <BotaoVerde type="button" onClick={criarAcessoLideranca} disabled={carregando}>
                Criar acesso e entrar →
              </BotaoVerde>
            ) : (
              <BotaoVerde type="submit" disabled={carregando}>
                {carregando ? "..." : "Entrar no meu painel →"}
              </BotaoVerde>
            )}

            <button
              type="button"
              onClick={() => {
                setPrimeiroAcesso((v) => !v);
                setMsg(null);
              }}
              className="mt-1 text-center text-[13px] font-semibold text-blue-400 hover:text-blue-300 transition-colors"
            >
              {primeiroAcesso ? "← Já tenho acesso (entrar)" : "Primeiro acesso? Criar com código de vínculo →"}
            </button>

            <div className="mt-3 border-t border-white/[0.08] pt-3 text-center">
              <button type="button" onClick={() => trocarModo("geral")} className="text-[12px] text-zinc-400 hover:text-white transition-colors">
                ← Voltar para o login geral
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

function BotaoVerde({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="mt-2 h-12 w-full rounded-lg text-[15px] font-bold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:opacity-60 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 shadow-[0_0_24px_rgba(37,99,235,0.4)] border border-white/20"
    >
      {children}
    </button>
  );
}

function SenhaInput({
  senha,
  setSenha,
  verSenha,
  setVerSenha,
}: {
  senha: string;
  setSenha: (v: string) => void;
  verSenha: boolean;
  setVerSenha: (f: (v: boolean) => boolean) => void;
}) {
  return (
    <div className="relative">
      <Input
        type={verSenha ? "text" : "password"}
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        placeholder="Senha"
        autoComplete="current-password"
        className={`${INPUT_CLS} pr-11`}
      />
      <button
        type="button"
        onClick={() => setVerSenha((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
        aria-label="Mostrar senha"
      >
        {verSenha ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

function Aviso({ msg, detalhe }: { msg: NonNullable<Msg>; detalhe?: string | null }) {
  return (
    <div>
      <p className={`text-sm ${msg.tipo === "erro" ? "text-red-600" : "text-green-600"}`}>{msg.texto}</p>
      {/* O detalhe técnico fica discreto: não ajuda quem só quer entrar, e é a
          única coisa que ajuda quem vai consertar. */}
      {detalhe && msg.tipo === "erro" && (
        <p className="mt-1 break-words font-mono text-[10.5px] leading-snug text-zinc-400">{detalhe}</p>
      )}
    </div>
  );
}

function traduzErro(m: string) {
  if (m.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("Email not confirmed")) return "Confirme seu e-mail (ou desative a confirmação no Supabase).";
  if (m.includes("already registered")) return "Esse e-mail já tem conta. Clique em Entrar.";
  if (m.includes("Password should be")) return "A senha deve ter no mínimo 6 caracteres.";
  return m;
}
