import { createBrowserClient } from "@supabase/ssr";

// Cliente do Supabase para uso no NAVEGADOR (componentes "use client").
//
// ── UM SÓ, PARA SEMPRE ──────────────────────────────────────────────────────
//
// Antes esta função devolvia um cliente NOVO a cada chamada. Parece inofensivo
// e não é: componente que escreve
//
//     const supabase = createClient();
//     useEffect(() => { ... }, [supabase]);
//
// ganha um objeto diferente a cada render, e a lista de dependências nunca
// bate. O efeito roda de novo, grava estado, provoca outro render, que cria
// outro cliente, que roda o efeito de novo — MILHARES DE VEZES POR SEGUNDO, até
// o navegador matar a aba com "This page couldn't load".
//
// Aconteceu de verdade: a ficha de etiquetas e a supervisão caíram nisso, e o
// sintoma não parecia laço nenhum — parecia a página "pesada demais".
//
// Guardar um só resolve na raiz, e não depende de cada componente lembrar de
// envolver em useMemo. A conexão é a mesma; não há motivo para ter duas.

function abrir() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// O tipo sai da CHAMADA, e não de `ReturnType<typeof createBrowserClient>`.
// A segunda forma perde os genéricos que o supabase-js infere na chamada, e
// todo `data` da plataforma vira `any` — o build recusa e, pior, as consultas
// deixam de ser conferidas.
let cliente: ReturnType<typeof abrir> | null = null;

export function createClient() {
  if (!cliente) cliente = abrir();
  return cliente;
}
