// Os 27 estados: bancada na Câmara, eleitorado aproximado, número de
// municípios e capital. Morava dentro do mapa do Brasil; o painel precisava do
// número de municípios para a "Presença" e dividia por 100 fora da Bahia (São
// Paulo dava 600%). Uma lista só, importada pelos dois.

// Dados geopolíticos oficiais da Federação Brasileira (Câmara dos Deputados e TSE)
export const DADOS_ESTADOS: Record<
  string,
  { bancada: number; eleitorado: string; municipios: number; capital: string }
> = {
  SP: { bancada: 70, eleitorado: "34,6M", municipios: 645, capital: "São Paulo" },
  MG: { bancada: 53, eleitorado: "16,3M", municipios: 853, capital: "Belo Horizonte" },
  RJ: { bancada: 46, eleitorado: "12,8M", municipios: 92, capital: "Rio de Janeiro" },
  BA: { bancada: 39, eleitorado: "11,2M", municipios: 417, capital: "Salvador" },
  RS: { bancada: 31, eleitorado: "8,6M", municipios: 496, capital: "Porto Alegre" },
  PR: { bancada: 30, eleitorado: "8,4M", municipios: 399, capital: "Curitiba" },
  PE: { bancada: 25, eleitorado: "7,0M", municipios: 185, capital: "Recife" },
  CE: { bancada: 22, eleitorado: "6,8M", municipios: 184, capital: "Fortaleza" },
  MA: { bancada: 18, eleitorado: "5,0M", municipios: 217, capital: "São Luís" },
  GO: { bancada: 17, eleitorado: "4,8M", municipios: 246, capital: "Goiânia" },
  PA: { bancada: 17, eleitorado: "6,0M", municipios: 143, capital: "Belém" },
  SC: { bancada: 16, eleitorado: "5,5M", municipios: 293, capital: "Florianópolis" },
  PB: { bancada: 12, eleitorado: "3,0M", municipios: 223, capital: "João Pessoa" },
  ES: { bancada: 10, eleitorado: "2,9M", municipios: 78, capital: "Vitória" },
  PI: { bancada: 10, eleitorado: "2,5M", municipios: 223, capital: "Teresina" },
  AL: { bancada: 9, eleitorado: "2,4M", municipios: 102, capital: "Maceió" },
  RN: { bancada: 8, eleitorado: "2,5M", municipios: 167, capital: "Natal" },
  MT: { bancada: 8, eleitorado: "2,4M", municipios: 141, capital: "Cuiabá" },
  MS: { bancada: 8, eleitorado: "2,0M", municipios: 78, capital: "Campo Grande" },
  DF: { bancada: 8, eleitorado: "2,2M", municipios: 1, capital: "Brasília" },
  SE: { bancada: 8, eleitorado: "1,7M", municipios: 75, capital: "Aracaju" },
  AM: { bancada: 8, eleitorado: "2,6M", municipios: 62, capital: "Manaus" },
  RO: { bancada: 8, eleitorado: "1,2M", municipios: 52, capital: "Porto Velho" },
  TO: { bancada: 8, eleitorado: "1,1M", municipios: 139, capital: "Palmas" },
  AC: { bancada: 8, eleitorado: "580k", municipios: 22, capital: "Rio Branco" },
  AP: { bancada: 8, eleitorado: "550k", municipios: 16, capital: "Macapá" },
  RR: { bancada: 8, eleitorado: "360k", municipios: 15, capital: "Boa Vista" },
};

/** Quantos municípios a UF tem (0 se a sigla não for de estado). */
export function municipiosDaUf(uf: string) {
  return DADOS_ESTADOS[uf]?.municipios ?? 0;
}
