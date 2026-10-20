// Código curto que identifica a liderança no link e no QR (/c/[code]).
//
// Era `Math.random().toString(36).slice(2, 10)`, repetido em dois arquivos.
// Dois problemas: `Math.random` não é imprevisível — quem coletar alguns
// códigos consegue estimar os próximos e adivinhar links de outras lideranças —
// e o `slice(2, 8)` às vezes devolvia menos de 8 caracteres, porque a conversão
// para base 36 encurta quando o número sorteado é pequeno. Código curto demais
// colide, e colisão aqui credita o lead à liderança errada.
//
// Agora vem do gerador criptográfico do sistema, com tamanho fixo.

// Sem vogais e sem 0/1/l/o: o código é ditado por telefone e escrito à mão em
// ficha de papel. Tirar o que se confunde vale mais do que os bits perdidos.
const ALFABETO = "23456789bcdfghjkmnpqrstvwxyz";

export function gerarLinkCode(tamanho = 10): string {
  const bytes = new Uint8Array(tamanho);
  crypto.getRandomValues(bytes);

  // O módulo simples enviesaria para o começo do alfabeto (256 não é múltiplo
  // de 28). Com 28 símbolos o desvio é pequeno, mas descartar o resto da faixa
  // alta custa nada e deixa a distribuição exata.
  const limite = Math.floor(256 / ALFABETO.length) * ALFABETO.length;

  let saida = "";
  for (let i = 0; i < bytes.length; i++) {
    let b = bytes[i];
    while (b >= limite) {
      const extra = new Uint8Array(1);
      crypto.getRandomValues(extra);
      b = extra[0];
    }
    saida += ALFABETO[b % ALFABETO.length];
  }
  return saida;
}
