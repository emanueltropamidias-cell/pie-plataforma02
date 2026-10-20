"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Briefcase,
  ChevronLeft,
  Compass,
  LayoutDashboard,
  UserPlus,
  MessageSquare,
  Menu,
  Settings,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { SeletorTema } from "@/components/seletor-tema";
import { moduloAtivo, moduloDoCaminho } from "@/lib/modulos";
import { LogoManuFlow } from "@/components/brand/logo-manuflow";

// Cada item tem ícone porque menu se varre, não se lê: o símbolo é reconhecido
// antes da palavra, e é ele que sustenta o menu recolhido.
// `abrange` são as telas que pertencem à área mas moram numa rota de raiz
// própria — /leads, /trafego e companhia. Sem essa lista o menu ficaria apagado
// justamente nas telas onde a pessoa mais passa tempo, e não haveria nada
// dizendo de onde ela veio nem para onde volta.
type Item = {
  href: string;
  label: string;
  icone: LucideIcon;
  abrange?: string[];
  pesado?: boolean;
};

// Um item de menu por ÁREA, não por tela.
//
// O menu tinha onze entradas e ganhava mais uma a cada funcionalidade — e menu
// que cresce por funcionalidade deixa de ser navegação e vira lista de
// arquivos. Agora são cinco: cada uma abre a central da sua área, e é lá que
// ficam os atalhos, agrupados por intenção e com o estado à vista.
//
// Nada sumiu. Caixa de entrada, Placar, Tráfego e o resto continuam nas mesmas
// telas — só deixaram de disputar a mesma coluna.
const GRUPOS: { titulo: string; itens: Item[] }[] = [
  {
    titulo: "Principal",
    itens: [
      // ── POR SETOR, E NÃO POR TIPO DE TELA ──────────────────────────────────
      //
      // Até 15/09 eram Atendimento, Rede e Análise — e o Tráfego, que é de onde
      // vêm os leads que a caixa recebe, morava em Análise, ao lado das
      // demandas de saúde. O Emanuel pediu a divisão por setor: cada tela onde
      // o trabalho dela acontece.
      //
      //   Atendimento   do anúncio à conversa
      //   Base          as pessoas
      //   Estratégia    território, eleição e o cadastro de lideranças
      //   Gabinete      demandas e o arquivo do que veio antes
      { href: "/dashboard", label: "Dashboard", icone: LayoutDashboard },
      {
        href: "/atendimento",
        label: "Atendimento",
        icone: MessageSquare,
        abrange: [
          "/trafego",
          "/atendimento/caixa",
          "/atendimento/cadastro",
          "/atendimento/painel",
          "/atendimento/metricas",
          "/atendimento/supervisao",
          "/atendimento/etiquetas",
          "/atendimento/numeros",
          "/atendimento/fluxo",
          "/atendimento/conexao",
          "/atendimento/kits",
          "/atendimento/mensagens",
          "/atendimento/audios",
          "/atendimento/departamentos",
        ],
      },
      {
        href: "/base",
        label: "Base",
        icone: UsersRound,
        abrange: ["/rede", "/leads", "/mapa", "/municipios", "/base/agenda", "/base/externas"],
      },
      {
        href: "/estrategia",
        label: "Estratégia",
        icone: Compass,
        abrange: ["/crm", "/ranking", "/metas", "/dobradinha", "/estrategia/votos"],
      },
      {
        href: "/gabinete",
        label: "Gabinete",
        icone: Briefcase,
        abrange: ["/demandas", "/conversas"],
      },
    ],
  },
  {
    titulo: "Sistema",
    itens: [{ href: "/config", label: "Configurações", icone: Settings }],
  },
];

// O cargo embaixo do nome dizia "Administrador" para todo mundo. Com supervisor
// no time isso deixou de ser detalhe: é a linha que diz até onde a conta vai.
const CARGO: Record<string, string> = {
  admin: "Administrador",
  supervisor: "Supervisão",
  atendente: "Atendimento",
};

const CHAVE_RECOLHIDO = "pie_menu_recolhido";

function iniciais(texto: string) {
  const partes = (texto || "")
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2);
  return partes.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function Conteudo({
  pathname,
  nome,
  userEmail,
  papel,
  recolhido,
  onNav,
  onRecolher,
}: {
  pathname: string;
  nome: string;
  userEmail?: string;
  papel?: string;
  recolhido: boolean;
  onNav?: () => void;
  onRecolher?: () => void;
}) {
  const router = useRouter();
  // Qual item foi clicado. Serve para o destaque mudar no clique, e não quando
  // o servidor responde: quem clica precisa ver que o clique valeu.
  const [indo, setIndo] = useState<string | null>(null);

  // O supervisor só tem uma área. Mostrar Rede e Análise para quem a RLS vai
  // negar não é transparência — é oferecer uma porta trancada.
  const soAtendimento = papel === "supervisor";

  // ── A ATENDENTE GANHOU MENU, COM DUAS PORTAS ──────────────────────────────
  //
  // Antes ela não tinha nenhum, e a razão era boa: ela não escolhe para onde
  // ir, ela atende. Uma porta só dispensa menu.
  //
  // Passaram a ser duas — os chips caem, então o atendimento é pelo WhatsApp no
  // aparelho e o cadastro é aqui. Com duas portas e nenhum menu, a segunda só
  // existe para quem souber o endereço de cor.
  //
  // O menu é DELA e não o da equipe: Dashboard, Rede, Análise e Configurações
  // ficam de fora. Não é só arrumação — é a base de 29 mil, e a regra da
  // campanha é que ela fica em off. A RLS já nega (`perfil_equipe()` é falso
  // para atendente), mas negar o dado e mostrar o caminho é o pior dos dois
  // mundos: ela clica, vê tela vazia, e não sabe se quebrou ou se é proibido.
  const ehAtendente = papel === "atendente";

  const visiveis = ehAtendente
    ? [
        {
          titulo: "Atendimento",
          itens: [
            { href: "/atendimento/caixa", label: "Fila", icone: MessageSquare },
            { href: "/atendimento/cadastro", label: "Cadastrar pessoa", icone: UserPlus },
          ] as Item[],
        },
      ]
    : soAtendimento
      ? [
          {
            titulo: "Principal",
            itens: GRUPOS[0].itens.filter((i) => i.href === "/atendimento"),
          },
        ]
      // Sem as áreas que esta instalação não usa (src/lib/modulos.ts).
      : GRUPOS.map((g) => ({
          ...g,
          itens: g.itens.filter((i) => {
            const m = moduloDoCaminho(i.href);
            return m === null || moduloAtivo(m);
          }),
        }));

  useEffect(() => {
    setIndo(null);
  }, [pathname]);

  return (
    <>
      <div
        className={`flex items-center gap-2 ${recolhido ? "justify-center" : "justify-between"}`}
      >
        <Link href="/dashboard" className="transition-transform duration-200 hover:scale-[1.02]">
          {recolhido ? (
            <LogoManuFlow iconOnly size="md" />
          ) : (
            <LogoManuFlow size="md" />
          )}
        </Link>
        {onRecolher && (
          <button
            type="button"
            onClick={onRecolher}
            aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
            className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-white/5 bg-white/[0.04] text-zinc-400 transition-all hover:border-white/15 hover:bg-white/10 hover:text-white md:flex"
          >
            <ChevronLeft
              size={15}
              className={`transition-transform duration-200 ${recolhido ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      {/* Usuário logado */}
      <div
        className={`mt-5 flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md ${
          recolhido ? "justify-center px-0 py-2.5" : "px-3 py-2.5"
        }`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 text-[11.5px] font-bold text-white shadow-[0_0_12px_rgba(37,99,235,0.35)]">
          {iniciais(nome)}
        </span>
        {!recolhido && (
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-semibold text-white">
              {nome}
            </span>
            <span className="block truncate text-[10.5px] text-zinc-400">
              {CARGO[papel ?? ""] ?? "Equipe"}
            </span>
          </span>
        )}
      </div>

      <nav className="mt-5 flex flex-1 flex-col gap-5 overflow-y-auto pr-0.5">
        {visiveis.map((grupo) => (
          <div key={grupo.titulo} className="flex flex-col gap-0.5">
            {!recolhido && (
              <span className="mb-1 px-2 text-[9.5px] font-bold uppercase tracking-[0.16em] text-barra-fraca">
                {grupo.titulo}
              </span>
            )}
            {grupo.itens.map((item) => {
              // Prefixo, e não igualdade: quem está na caixa de entrada continua
              // dentro de Atendimento, e o menu precisa dizer isso. A barra no
              // fim evita que /rede acenda estando em /redefinir-senha.
              const dentro = (base: string) =>
                pathname === base || pathname.startsWith(`${base}/`);
              const ativo =
                dentro(item.href) || (item.abrange ?? []).some(dentro);
              const indoPara = indo === item.href;
              const Icone = item.icone;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={recolhido ? item.label : undefined}
                  // Busca a página inteira antes do clique, não só o esqueleto.
                  // O padrão do Next traz apenas o esqueleto em tela que depende
                  // de sessão — que é justamente o branco que aparecia antes.
                  prefetch={item.pesado ? undefined : true}
                  // E de novo ao passar o mouse: aí o conteúdo já chegou quando
                  // o dedo desce, e a tela troca sem espera.
                  onMouseEnter={() => router.prefetch(item.href)}
                  onFocus={() => router.prefetch(item.href)}
                  onTouchStart={() => router.prefetch(item.href)}
                  onClick={() => {
                    setIndo(item.href);
                    onNav?.();
                  }}
                  className={`group relative flex items-center gap-3 rounded-xl py-2.5 text-[13px] transition-all duration-200 ${
                    recolhido ? "justify-center px-0" : "px-3"
                  } ${
                    ativo || indoPara
                      ? "bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 text-white font-semibold shadow-[0_0_20px_rgba(37,99,235,0.35)] border border-white/20"
                      : "font-medium text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <Icone
                    size={17}
                    className={`shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                      ativo || indoPara ? "text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.5)]" : "text-zinc-400 group-hover:text-cyan-400"
                    }`}
                    strokeWidth={ativo || indoPara ? 2.4 : 1.9}
                  />
                  {!recolhido && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-4 border-t border-white/[0.08] pt-3">
        <SeletorTema recolhido={recolhido} />
        <div className="mt-2">
          {!recolhido && userEmail && (
            <p className="mb-1.5 truncate px-2 text-[10.5px] text-zinc-400">
              {userEmail}
            </p>
          )}
          <LogoutButton />
        </div>
      </div>
    </>
  );
}

export function AppSidebar({
  userEmail,
  papel,
}: {
  userEmail?: string;
  papel?: string;
}) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [recolhido, setRecolhido] = useState(false);
  const nome = (userEmail || "").split("@")[0];

  useEffect(() => {
    try {
      setRecolhido(localStorage.getItem(CHAVE_RECOLHIDO) === "1");
    } catch {
      /* sem armazenamento: começa expandido */
    }
  }, []);

  function alternarRecolhido() {
    setRecolhido((v) => {
      const novo = !v;
      try {
        localStorage.setItem(CHAVE_RECOLHIDO, novo ? "1" : "0");
      } catch {}
      return novo;
    });
  }

  return (
    <>
      {/* Barra superior (só no celular) */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-white/[0.08] bg-[#090d16]/90 backdrop-blur-xl px-4 md:hidden">
        <LogoManuFlow size="sm" />
        <button
          onClick={() => setAberto(true)}
          className="text-white hover:text-cyan-400 transition-colors"
          aria-label="Abrir menu"
        >
          <Menu size={24} />
        </button>
      </div>

      {/* Gaveta (só no celular, quando aberta) */}
      {aberto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setAberto(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-white/[0.08] bg-[#090d16]/95 backdrop-blur-2xl px-4 py-5 text-white">
            <button
              onClick={() => setAberto(false)}
              className="mb-2 self-end text-zinc-400 hover:text-white"
              aria-label="Fechar menu"
            >
              <X size={22} />
            </button>
            <Conteudo
              pathname={pathname}
              nome={nome}
              userEmail={userEmail}
              papel={papel}
              recolhido={false}
              onNav={() => setAberto(false)}
            />
          </aside>
        </div>
      )}

      {/* Barra fixa (computador) */}
      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-white/[0.08] bg-[#090d16]/85 backdrop-blur-2xl px-3.5 py-5 text-white transition-[width] duration-300 md:flex ${
          recolhido ? "w-[76px]" : "w-64"
        }`}
      >
        <Conteudo
          pathname={pathname}
          nome={nome}
          userEmail={userEmail}
          papel={papel}
          recolhido={recolhido}
          onRecolher={alternarRecolhido}
        />
      </aside>
    </>
  );
}
