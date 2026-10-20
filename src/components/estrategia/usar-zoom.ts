"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as EventoMouse,
  type PointerEvent as EventoPonteiro,
} from "react";

// Zoom e arrasto num SVG.
//
// Mapa de cidade inteira não cabe em uma leitura só: a Pituba precisa aparecer
// junto com Paripe para comparar, e depois precisa ser puxada de perto para
// achar o bairro pequeno colado nela. Então o desenho anda e aproxima.
//
// Quatro decisões que a primeira versão errava:
//
//  1. A RODA NÃO SEQUESTRA A PÁGINA. Mapa que come o scroll prende quem só
//     queria passar por ele. Aqui a roda só aproxima quando o mapa já está
//     aproximado — ou seja, quando a pessoa disse que quer mexer nele — ou com
//     Ctrl/⌘ segurado. Afastado e sem tecla, a página rola normal.
//  2. PINÇA NO CELULAR. Dois dedos aproximam, que é como se aproxima um mapa
//     num telefone. Antes só havia botão, e ninguém procura botão para isso.
//  3. DUPLO CLIQUE aproxima no ponto clicado, e com Alt afasta.
//  4. BOTÃO E DUPLO CLIQUE ANIMAM. Salto de escala perde a referência de onde
//     se estava; 180 ms de transição preservam. Arrasto, roda e pinça continuam
//     instantâneos — ali a mão é o relógio.
//
// Trabalha em unidades do viewBox, não em pixel: o mesmo componente serve o
// mapa em qualquer largura de tela sem recalcular nada.

export type Vista = { k: number; x: number; y: number };

type Dedos = Map<number, { x: number; y: number }>;

const distancia = (d: Dedos) => {
  const [a, b] = [...d.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
};
const meio = (d: Dedos) => {
  const [a, b] = [...d.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};

const MIN = 1;
const MAX = 14;
const PARADO: Vista = { k: 1, x: 0, y: 0 };
const DURACAO = 180;

export function usarZoom(largura: number, altura: number) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [vista, setVista] = useState<Vista>(PARADO);
  const [arrastando, setArrastando] = useState(false);

  // Espelho do estado para os listeners nativos e para a animação, que precisam
  // do valor atual sem virar dependência e reassinar o evento a cada quadro.
  const atual = useRef(vista);
  atual.current = vista;

  const ponteiros = useRef<Dedos>(new Map());
  const pinca = useRef<{ dist: number } | null>(null);
  const quadro = useRef<number | null>(null);
  // Arrastar o mapa não pode contar como clique no bairro que estava embaixo do
  // dedo. Guarda o quanto andou desde que pegou.
  const andou = useRef(0);

  const limitar = useCallback(
    (v: Vista): Vista => {
      const k = Math.min(MAX, Math.max(MIN, v.k));
      return {
        k,
        // O desenho nunca sai de vista: a translação fica presa à folga que a
        // escala criou. Sem isso um arrasto forte joga a cidade para fora e a
        // única saída é o botão de voltar.
        x: Math.min(0, Math.max(-largura * (k - 1), v.x)),
        y: Math.min(0, Math.max(-altura * (k - 1), v.y)),
      };
    },
    [largura, altura],
  );

  const parar = useCallback(() => {
    if (quadro.current !== null) cancelAnimationFrame(quadro.current);
    quadro.current = null;
  }, []);

  const animar = useCallback(
    (destino: Vista) => {
      parar();
      const de = atual.current;
      const inicio = performance.now();
      const passo = (agora: number) => {
        const t = Math.min(1, (agora - inicio) / DURACAO);
        const e = 1 - Math.pow(1 - t, 3);
        setVista({
          k: de.k + (destino.k - de.k) * e,
          x: de.x + (destino.x - de.x) * e,
          y: de.y + (destino.y - de.y) * e,
        });
        quadro.current = t < 1 ? requestAnimationFrame(passo) : null;
      };
      quadro.current = requestAnimationFrame(passo);
    },
    [parar],
  );

  useEffect(() => parar, [parar]);

  /** Ponto da tela em unidades do viewBox. */
  const emViewBox = useCallback(
    (clientX: number, clientY: number) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r || !r.width || !r.height) return null;
      return {
        px: ((clientX - r.left) / r.width) * largura,
        py: ((clientY - r.top) / r.height) * altura,
      };
    },
    [largura, altura],
  );

  /** Aproxima mantendo parado o ponto sob o dedo/cursor. */
  const aproximar = useCallback(
    (fator: number, clientX?: number, clientY?: number, suave = false) => {
      const v = atual.current;
      const k = Math.min(MAX, Math.max(MIN, v.k * fator));
      if (k === v.k) return;
      const p =
        clientX !== undefined && clientY !== undefined
          ? emViewBox(clientX, clientY)
          : { px: largura / 2, py: altura / 2 };
      if (!p) return;
      const razao = k / v.k;
      const destino = limitar({ k, x: p.px - (p.px - v.x) * razao, y: p.py - (p.py - v.y) * razao });
      if (suave) animar(destino);
      else {
        parar();
        setVista(destino);
      }
    },
    [limitar, emViewBox, largura, animar, parar],
  );

  // A roda precisa de listener nativo: o React registra wheel como passivo, e
  // listener passivo não pode impedir a página de rolar junto. Só impede quando
  // vai de fato aproximar — senão o mapa engoliria a rolagem de quem passa.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const naRoda = (e: WheelEvent) => {
      const comTecla = e.ctrlKey || e.metaKey;
      if (!comTecla && atual.current.k <= MIN) return; // deixa a página rolar
      e.preventDefault();
      aproximar(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", naRoda, { passive: false });
    return () => el.removeEventListener("wheel", naRoda);
  }, [aproximar]);

  const aoPegar = useCallback((e: EventoPonteiro<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    andou.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (ponteiros.current.size === 2) {
      pinca.current = { dist: distancia(ponteiros.current) };
      setArrastando(false);
    } else if (ponteiros.current.size === 1) {
      setArrastando(true);
    }
  }, []);

  const aoMover = useCallback(
    (e: EventoPonteiro<SVGSVGElement>) => {
      if (!ponteiros.current.has(e.pointerId)) return;
      const antes = ponteiros.current.get(e.pointerId)!;
      ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (ponteiros.current.size >= 2 && pinca.current) {
        const nova = distancia(ponteiros.current);
        if (pinca.current.dist > 0) {
          const c = meio(ponteiros.current);
          aproximar(nova / pinca.current.dist, c.x, c.y);
        }
        pinca.current = { dist: nova };
        return;
      }

      const r = ref.current?.getBoundingClientRect();
      if (!r || !r.width || !r.height) return;
      andou.current += Math.hypot(e.clientX - antes.x, e.clientY - antes.y);
      const dx = ((e.clientX - antes.x) / r.width) * largura;
      const dy = ((e.clientY - antes.y) / r.height) * altura;
      parar();
      setVista((v) => limitar({ ...v, x: v.x + dx, y: v.y + dy }));
    },
    [limitar, aproximar, largura, altura, parar],
  );

  const aoSoltar = useCallback((e: EventoPonteiro<SVGSVGElement>) => {
    ponteiros.current.delete(e.pointerId);
    if (ponteiros.current.size < 2) pinca.current = null;
    if (ponteiros.current.size === 0) setArrastando(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const aoDuplo = useCallback(
    (e: EventoMouse<SVGSVGElement>) => {
      aproximar(e.altKey ? 1 / 2 : 2, e.clientX, e.clientY, true);
    },
    [aproximar],
  );

  const voltar = useCallback(() => animar(PARADO), [animar]);

  return {
    ref,
    vista,
    arrastando,
    afastado: vista.k <= MIN + 0.001,
    transform: `translate(${vista.x} ${vista.y}) scale(${vista.k})`,
    /** Traço e texto ficam finos quando aproxima, senão engordam junto. */
    escala: (v: number) => v / vista.k,
    /** Verdadeiro quando o gesto foi arrasto, não clique. */
    arrastou: () => andou.current > 5,
    aproximar,
    voltar,
    /** Handlers prontos para espalhar no <svg>. */
    arrastar: {
      onPointerDown: aoPegar,
      onPointerMove: aoMover,
      onPointerUp: aoSoltar,
      onPointerCancel: aoSoltar,
      onDoubleClick: aoDuplo,
    },
  };
}
