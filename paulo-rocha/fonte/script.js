// Cadastro da campanha → WhatsApp.
//
// ── POR QUE NÃO TEM SERVIDOR ─────────────────────────────────────────────────
//
// Um formulário que grava em banco precisa de servidor, de alguém olhando a
// caixa e de um lugar guardando dado pessoal. Aqui o caminho é mais curto e
// mais honesto: o formulário MONTA a mensagem e abre o WhatsApp da campanha
// com ela pronta. A pessoa lê o que vai enviar antes de enviar, e o cadastro
// nasce já dentro da conversa — que é onde o atendimento acontece de verdade.
//
// Nada é gravado neste site. O dado só existe depois que a pessoa aperta
// enviar, no WhatsApp dela.

const NUMERO = "5571999983226";

const form = document.getElementById("form");
const botao = document.getElementById("enviar");
const sucesso = document.getElementById("sucesso");
const linkZap = document.getElementById("linkZap");

// ── O TELEFONE, ENQUANTO A PESSOA DIGITA ────────────────────────────────────
//
// Máscara (71) 99999-9999. Sem ela chega telefone de todo jeito — com ponto,
// com traço, com o 55 na frente — e depois alguém tem de limpar na mão.
const campoZap = document.getElementById("whatsapp");
campoZap?.addEventListener("input", (e) => {
  const d = e.target.value.replace(/\D/g, "").slice(0, 11);
  let saida = d;
  if (d.length > 2) saida = `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length > 7) saida = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  e.target.value = saida;
});

function podeEnviar() {
  const nome = document.getElementById("nome").value.trim();
  const zap = campoZap.value.replace(/\D/g, "");
  const cidade = document.getElementById("municipio").value.trim();
  // 11 dígitos e o terceiro é 9: é a regra do celular brasileiro. Aceitar
  // menos que isso é aceitar número que não existe.
  return nome.length >= 2 && zap.length === 11 && zap[2] === "9" && cidade.length >= 2;
}

function conferir() {
  if (botao) botao.disabled = !podeEnviar();
}
form?.addEventListener("input", conferir);
conferir();

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!podeEnviar()) return;

  const nome = document.getElementById("nome").value.trim();
  const zap = campoZap.value.trim();
  const cidade = document.getElementById("municipio").value.trim();
  const recado = document.getElementById("mensagem").value.trim();

  const texto =
    `Olá! Quero apoiar o Paulo Rocha 22762.\n\n` +
    `Nome: ${nome}\n` +
    `WhatsApp: ${zap}\n` +
    `Município: ${cidade}` +
    (recado ? `\n\n${recado}` : "");

  const url = `https://wa.me/${NUMERO}?text=${encodeURIComponent(texto)}`;
  if (linkZap) linkZap.href = url;
  if (sucesso) sucesso.hidden = false;
  window.open(url, "_blank", "noopener");
});
