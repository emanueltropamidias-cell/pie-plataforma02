// Avisa o PIE que alguém tocou no botão do grupo.
//
// ── DUAS CONTAGENS, DE PROPÓSITO ────────────────────────────────────────────
//
// O Pixel da Meta já registra este clique como `Lead`. Esta função registra o
// MESMO clique no banco da campanha, e as duas não são redundantes:
//
//   o Pixel  ensina o anúncio. Só responde dentro do painel da Meta, e só
//            conta quem o deixa carregar — bloqueador, modo privado e as
//            travas do iPhone comem uma fatia que ninguém mede, justamente
//            porque ela não chega.
//   o PIE    é a fonte de verdade. Roda no servidor da campanha, aparece na
//            tela de Links junto do resto, e ninguém bloqueia.
//
// Quando os dois números discordarem, o do PIE é o certo — e a diferença entre
// eles é uma medida útil por si: é o tamanho da fatia que a Meta não enxerga.
//
// ── NADA AQUI PODE ATRASAR O BOTÃO ──────────────────────────────────────────
//
// A ordem de importância é: a pessoa entra no grupo > o clique é contado. Por
// isso `sendBeacon`, que o navegador entrega sozinho mesmo com a aba indo
// embora, e por isso o `try` envolvendo tudo. Contagem que quebra o botão é
// pior que contagem nenhuma.

export type OndeClicou = "barra" | "botao";

export function contarCliqueNoGrupo(onde: OndeClicou) {
  try {
    const corpo = JSON.stringify({ onde });
    const destino = "/api/1022/grupo";

    // `sendBeacon` é o caminho certo: o navegador o entrega fora do ciclo da
    // página, então abrir o WhatsApp na mesma hora não o cancela.
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const ok = navigator.sendBeacon(
        destino,
        new Blob([corpo], { type: "application/json" }),
      );
      if (ok) return;
    }

    // Safari antigo não tem beacon confiável. `keepalive` faz o mesmo papel:
    // segue depois que a página sai.
    void fetch(destino, {
      method: "POST",
      body: corpo,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  } catch {
    // A pessoa entra no grupo do mesmo jeito.
  }
}
