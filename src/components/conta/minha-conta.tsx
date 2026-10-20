"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, KeyRound, Check, X, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// A conta de quem está atendendo.
//
// ── POR QUE ISTO MORA AQUI, E NÃO EM CONFIGURAÇÕES ──────────────────────────
//
// Trocar senha e sair já existiam em /config. Só que a atendente NUNCA CHEGA
// LÁ: o layout a manda de volta para a caixa em qualquer outro endereço. Na
// prática ela entrava com uma senha que o coordenador digitou, que passou pelo
// WhatsApp de duas pessoas, e não tinha como trocar nem como sair.
//
// A caixa é a única tela dela. Então é aqui.
//
// ── SAIR IMPORTA MAIS DO QUE PARECE ─────────────────────────────────────────
//
// Metade da equipe vai atender do celular, e celular de campanha passa de mão.
// Sem "Sair", a única forma de encerrar a sessão é limpar os dados do
// navegador — ou seja, ninguém encerra. O nome no topo do painel existe pela
// mesma razão: responde "esta conta é a minha?" antes de a pessoa começar a
// responder lead no login da colega.

export function MinhaConta({
  nome,
  email,
}: {
  nome: string;
  email: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const caixa = useRef<HTMLDivElement>(null);

  const [aberto, setAberto] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [vendo, setVendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node))
        setAberto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  async function trocar() {
    setErro(null);

    // Oito, e não os seis que o Supabase aceita. A senha que ela troca substitui
    // uma de vinte e um caracteres — descer para seis seria piorar o acesso no
    // gesto que existe para melhorá-lo.
    if (senha.length < 8) {
      setErro("A senha precisa de pelo menos 8 letras ou números.");
      return;
    }
    if (senha !== senha2) {
      setErro("As duas senhas estão diferentes.");
      return;
    }

    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);

    if (error) {
      // A mensagem do Supabase vem em inglês. As duas que de fato acontecem
      // ganham tradução; o resto passa cru, que é melhor do que "algo deu
      // errado" — pelo menos dá para mandar print.
      const m = error.message.toLowerCase();
      setErro(
        m.includes("different")
          ? "Essa já é a sua senha atual. Escolha outra."
          : m.includes("weak") || m.includes("password")
            ? "O sistema recusou essa senha. Tente uma um pouco maior."
            : error.message,
      );
      return;
    }

    setSenha("");
    setSenha2("");
    setPronto(true);
    setTrocando(false);
    // A sessão continua valendo depois da troca — ela NÃO é deslogada. Some
    // sozinho para o painel não ficar com um aviso velho na próxima abertura.
    setTimeout(() => setPronto(false), 6000);
  }

  async function sair() {
    setSaindo(true);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const inicial = (nome || email || "?").trim().charAt(0).toUpperCase();
  const primeiro = (nome || email.split("@")[0]).split(" ")[0];

  return (
    <div ref={caixa} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label="Minha conta"
        title={`${nome || email} — trocar senha ou sair`}
        className={`flex h-[30px] w-[30px] items-center justify-center rounded-full text-[12px] font-bold transition-colors ${
          aberto
            ? "bg-tema text-white"
            : "bg-tinta-100 text-tinta-600 hover:bg-tinta-200"
        }`}
      >
        {inicial}
      </button>

      {aberto && (
        <div className="absolute right-0 top-[38px] z-40 w-[min(17.5rem,calc(100vw-1.5rem))] rounded-xl border border-tinta-200 bg-white p-1.5 shadow-xl">
          {/* Quem está logada. Primeira coisa do painel de propósito. */}
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="truncate text-[13.5px] font-bold text-tinta-900">
              {nome || primeiro}
            </p>
            <p className="truncate text-[11.5px] text-tinta-400">{email}</p>
          </div>

          {pronto && (
            <p className="mx-1 mb-1.5 flex items-center gap-1.5 rounded-md bg-[#f1f8f3] px-2.5 py-2 text-[12px] font-semibold text-[#12703c]">
              <Check size={13} strokeWidth={2.6} />
              Senha trocada. Use a nova da próxima vez.
            </p>
          )}

          {!trocando ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setTrocando(true);
                  setErro(null);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[13px] font-semibold text-tinta-700 transition-colors hover:bg-tinta-50"
              >
                <KeyRound size={15} className="shrink-0 text-tinta-400" />
                Trocar minha senha
              </button>

              <div className="my-1 border-t border-tinta-100" />

              <button
                type="button"
                onClick={sair}
                disabled={saindo}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[13px] font-semibold text-[#c02020] transition-colors hover:bg-[#fdf1f1] disabled:opacity-50"
              >
                <LogOut size={15} className="shrink-0" />
                {saindo ? "Saindo…" : "Sair da conta"}
              </button>
            </>
          ) : (
            <div className="px-1 pb-1">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-tinta-400">
                  Nova senha
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTrocando(false);
                    setErro(null);
                    setSenha("");
                    setSenha2("");
                  }}
                  aria-label="Cancelar"
                  className="text-tinta-300 hover:text-tinta-600"
                >
                  <X size={15} />
                </button>
              </div>

              {erro && (
                <p className="mb-1.5 rounded-md bg-[#fdf1f1] px-2.5 py-1.5 text-[11.5px] leading-snug text-[#c02020]">
                  {erro}
                </p>
              )}

              {/* O olhinho não é enfeite no celular: sem ele a pessoa digita
                  onze caracteres às cegas, erra, e não descobre onde errou —
                  descobre só que "as duas estão diferentes". */}
              <div className="relative">
                <input
                  type={vendo ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Pelo menos 8 letras"
                  autoComplete="new-password"
                  className="h-[38px] w-full rounded-lg border border-tinta-300 pl-2.5 pr-9 text-[16px] outline-none focus:border-tema"
                />
                <button
                  type="button"
                  onClick={() => setVendo((v) => !v)}
                  aria-label={vendo ? "Esconder a senha" : "Mostrar a senha"}
                  className="absolute right-1 top-1 flex h-[30px] w-[30px] items-center justify-center rounded-md text-tinta-400 hover:text-tinta-700"
                >
                  {vendo ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              <input
                type={vendo ? "text" : "password"}
                value={senha2}
                onChange={(e) => setSenha2(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") trocar();
                }}
                placeholder="Repita a senha"
                autoComplete="new-password"
                className="mt-1.5 h-[38px] w-full rounded-lg border border-tinta-300 px-2.5 text-[16px] outline-none focus:border-tema"
              />

              <button
                type="button"
                onClick={trocar}
                disabled={salvando || !senha || !senha2}
                className="mt-2 h-[38px] w-full rounded-lg bg-tema text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {salvando ? "Trocando…" : "Trocar senha"}
              </button>

              <p className="mt-1.5 px-0.5 text-[11px] leading-snug text-tinta-400">
                Você continua logada depois de trocar.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
