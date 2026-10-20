"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { LogoManuFlow } from "@/components/marca/logo-manuflow";

type Msg = { tipo: "erro" | "ok"; texto: string } | null;

const INPUT_CLS =
  "h-12 border-tinta-200 bg-tinta-50 focus-visible:border-tema focus-visible:ring-tema/15";

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
    // Login com a cara do PRODUTO (ManuFlow, 20/10/2026): a capa e a cor da
    // campanha saíram — a plataforma atende mais de uma candidatura, e a marca
    // de cada uma entra lá dentro, não na porta.
    <main className="area-app fundo-app relative flex min-h-dvh w-full items-center justify-center p-4 sm:p-6">
      <div className="relative z-10 w-full max-w-[420px] rounded-[22px] border border-tinta-200 bg-white p-8 text-center text-tinta-900 shadow-[0_24px_64px_rgba(0,0,0,0.35)] backdrop-blur sm:p-10">
        <LogoManuFlow tamanho={46} className="mx-auto mb-4 justify-center" />
        <div className="mx-auto inline-block rounded-full border border-tema/25 bg-tema/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-tema">
          Inteligência eleitoral
        </div>
        <div className="mt-2 text-sm text-zinc-500">
          {modo === "geral" ? "Entre na sua conta" : modo === "criar" ? "Criar sua conta" : "Painel da Liderança"}
        </div>

        {/* ══ GERAL ══ */}
        {modo === "geral" && (
          <form onSubmit={entrar} className="mt-7 flex flex-col gap-3 text-left">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" autoComplete="email" className={INPUT_CLS} />
            <SenhaInput senha={senha} setSenha={setSenha} verSenha={verSenha} setVerSenha={setVerSenha} />

            <button type="button" onClick={esqueciSenha} className="-mt-1 self-end text-[12px] text-tema hover:underline">
              Esqueci minha senha
            </button>

            {msg && <Aviso msg={msg} detalhe={detalhe} />}

            <BotaoPrincipal type="submit" disabled={carregando}>
              {carregando ? "..." : "Entrar na plataforma →"}
            </BotaoPrincipal>

            <p className="mt-3 text-center text-[13px] text-zinc-500">
              Não tem conta?{" "}
              <button type="button" onClick={() => trocarModo("criar")} className="font-semibold text-tema underline underline-offset-2">
                Criar conta
              </button>
            </p>

            {/* As lideranças são a maior parte de quem chega nesta tela, e
                entravam por um link de rodapé que parecia aviso legal. Agora é
                um caminho do mesmo tamanho do outro — muda o peso, não o lugar,
                para quem já decorou a posição não se perder. */}
            <div className="mt-4 border-t border-zinc-200 pt-4">
              <button
                type="button"
                onClick={() => trocarModo("lideranca")}
                className="flex w-full items-center gap-3 rounded-md border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-100"
              >
                <span className="text-[18px] leading-none" aria-hidden>🔑</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-emerald-700">Sou liderança</span>
                  <span className="block text-[12px] text-zinc-500">Acessar o meu painel</span>
                </span>
                <span className="text-[16px] font-bold text-emerald-600" aria-hidden>→</span>
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

            <BotaoPrincipal type="submit" disabled={carregando}>
              {carregando ? "..." : "Criar conta →"}
            </BotaoPrincipal>

            <p className="text-center text-[11.5px] leading-relaxed text-zinc-400">
              Um administrador libera o seu acesso antes do primeiro login.
            </p>

            <div className="mt-2 space-y-2 border-t border-zinc-200 pt-3 text-center">
              <button type="button" onClick={() => trocarModo("geral")} className="block w-full text-[12.5px] text-zinc-500 hover:text-zinc-800">
                ← Já tenho conta (entrar)
              </button>
              {/* A maioria de quem chega aqui é liderança e tem código próprio.
                  Sem esta linha, elas criam a conta errada e não conseguem
                  vincular depois. */}
              <button type="button" onClick={() => trocarModo("lideranca")} className="block w-full text-[12.5px] font-semibold text-emerald-700 hover:underline">
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
              <BotaoPrincipal type="button" onClick={criarAcessoLideranca} disabled={carregando}>
                Criar acesso e entrar →
              </BotaoPrincipal>
            ) : (
              <BotaoPrincipal type="submit" disabled={carregando}>
                {carregando ? "..." : "Entrar no meu painel →"}
              </BotaoPrincipal>
            )}

            <button
              type="button"
              onClick={() => {
                setPrimeiroAcesso((v) => !v);
                setMsg(null);
              }}
              className="mt-1 text-center text-[13px] font-semibold text-tema hover:underline"
            >
              {primeiroAcesso ? "← Já tenho acesso (entrar)" : "Primeiro acesso? Criar com código de vínculo →"}
            </button>

            <div className="mt-3 border-t border-zinc-200 pt-3 text-center">
              <button type="button" onClick={() => trocarModo("geral")} className="text-[12px] text-zinc-500 hover:text-zinc-800">
                ← Voltar para o login geral
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

function BotaoPrincipal({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="mt-2 h-12 w-full rounded-[10px] text-[15px] font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
      style={{
        background: "linear-gradient(135deg,#3b6cff 0%,#5b4fe0 100%)",
        boxShadow: "0 8px 24px rgba(59,108,255,0.38)",
      }}
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
