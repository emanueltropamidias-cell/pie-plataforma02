// Dados institucionais exibidos no site.
//
// Copiados do registro público do CNPJ na Receita Federal — é contra esse
// cadastro que a Meta compara o site na verificação do negócio. Não abrevie
// nem "melhore" a redação: razão social ou endereço diferentes do registro
// são motivo de recusa.

export const INSTITUTO = {
  nomeFantasia: "Instituto Rose",
  razaoSocial: "IR INSTITUTO ROSE",
  cnpj: "44.764.540/0001-17",

  endereco: {
    logradouro: "Alameda Praia de Guaratuba, 409",
    complemento: "Edifício Seper Clube, Casa 01, Pavimento 1",
    bairro: "Stella Maris",
    cidade: "Salvador",
    uf: "BA",
    cep: "41600-270",
  },

  // Telefone de atendimento. Precisa receber ligação ou SMS: a Meta manda
  // código na verificação. Use aqui o mesmo que você informar no formulário.
  telefone: "(71) 98235-6344",
  whatsapp: "5571992330000", // só dígitos, com 55 — usado no formulário
  email: "contato@institutorose.com",
} as const;

export function enderecoCompleto() {
  const e = INSTITUTO.endereco;
  const linha1 = [e.logradouro, e.complemento].filter(Boolean).join(" — ");
  return `${linha1} — ${e.bairro}, ${e.cidade}/${e.uf} — CEP ${e.cep}`;
}
