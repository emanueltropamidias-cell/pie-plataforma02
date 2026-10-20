// Os gráficos da Central de atendimento. SVG à mão, sem biblioteca — é a
// convenção que o resto da plataforma já usa (ver trafego/dashboard-trafego).
//
// UMA DECISÃO ATRAVESSA TODOS ELES: gráfico aqui não codifica categoria por
// cor. As sete categorias de status não conseguem ser sete matizes distinguíveis
// — testado no validador de daltonismo, "tem candidato" e "não atendido" ficam a
// ΔE 0,6 sob deutan, ou seja, a mesma cor. Em vez de fingir que dá, as barras
// usam uma tinta só e a identidade vem do NOME escrito ao lado. Cor fica
// reservada para o que precisa saltar: a barra crítica.
//
// Todo mark tem <title>, que o navegador mostra como dica ao passar o mouse —
// custa nada e evita que o número dependa de caber na tela.

const TINTA = "#4d596d"; // tinta-600: a tinta padrão das barras
const RECESSIVO = "#e0e5ee"; // tinta-200: grade e trilhos, sempre atrás

/** Rampa sequencial da espera: uma matiz só, clara → escura. Passos validados
 *  com ΔL ≥ 0,072 e o passo mais claro em 2,02:1 contra o branco. */
export const RAMPA_ESPERA = ["#eda868", "#e08b40", "#c96d1c", "#a34f0f", "#763405"];

export type Fatia = { rotulo: string; valor: number; cor?: string; nota?: string };

/**
 * Barras horizontais ordenadas. É a forma certa para "magnitude por categoria"
 * com nome comprido — barra deitada deixa o rótulo legível sem girar texto.
 */
export function BarrasNomeadas({
  dados,
  total,
  destaque,
  vazio = "Sem dados ainda.",
}: {
  dados: Fatia[];
  total: number;
  destaque?: string;
  vazio?: string;
}) {
  const maior = Math.max(1, ...dados.map((d) => d.valor));
  if (!dados.some((d) => d.valor > 0)) {
    return <p className="py-8 text-center text-[12.5px] text-tinta-400">{vazio}</p>;
  }
  return (
    <ul className="space-y-2.5">
      {dados.map((d) => {
        const ehDestaque = d.rotulo === destaque;
        return (
          <li key={d.rotulo} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-3">
            <span
              className={`truncate text-[12.5px] ${
                ehDestaque ? "font-semibold text-tinta-900" : "text-tinta-600"
              }`}
              title={d.nota}
            >
              {d.rotulo}
            </span>
            <span className="h-[18px] w-full overflow-hidden rounded-[4px] bg-tinta-50">
              <span
                className="block h-full rounded-[4px]"
                style={{
                  width: `${Math.max(1.5, (d.valor / maior) * 100)}%`,
                  background: d.cor ?? (ehDestaque ? "#e2620a" : TINTA),
                }}
                title={`${d.rotulo}: ${d.valor}`}
              />
            </span>
            <span className="tabular w-[5.5rem] text-right text-[12.5px] text-tinta-500">
              <b className="text-tinta-900">{d.valor}</b>
              {total > 0 && <span className="ml-1.5">{((d.valor / total) * 100).toFixed(0)}%</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Volume por dia. Barra vertical, uma série, uma tinta — legenda seria ruído,
 * porque o título já diz o que é.
 *
 * Rotula só o maior e o último. Número em cima de toda barra vira parede de
 * dígitos e ninguém lê nenhum.
 */
export function BarrasPorDia({ dados, cor = TINTA }: { dados: Fatia[]; cor?: string }) {
  const W = 720;
  const H = 150;
  const BASE = H - 22;
  const TOPO = 10;

  if (dados.length === 0) {
    return <p className="py-8 text-center text-[12.5px] text-tinta-400">Sem dados ainda.</p>;
  }

  const maior = Math.max(1, ...dados.map((d) => d.valor));
  const passo = W / dados.length;
  const larg = Math.max(3, Math.min(26, passo - 4)); // o vão de 4px é o respiro entre barras
  const y = (v: number) => BASE - (v / maior) * (BASE - TOPO);
  const iMaior = dados.reduce((m, d, i) => (d.valor > dados[m].valor ? i : m), 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[150px] w-full" role="img">
      {/* grade recessiva: três linhas bastam para dar escala sem virar gaiola */}
      {[0, 0.5, 1].map((f) => (
        <line
          key={f}
          x1={0}
          x2={W}
          y1={BASE - f * (BASE - TOPO)}
          y2={BASE - f * (BASE - TOPO)}
          stroke={RECESSIVO}
          strokeWidth={1}
        />
      ))}
      {dados.map((d, i) => {
        const cx = i * passo + passo / 2;
        const alt = Math.max(d.valor > 0 ? 2 : 0, BASE - y(d.valor));
        const ultimo = i === dados.length - 1;
        return (
          <g key={d.rotulo}>
            <rect
              x={cx - larg / 2}
              y={BASE - alt}
              width={larg}
              height={alt}
              rx={3}
              fill={ultimo ? "#e2620a" : cor}
              opacity={ultimo ? 1 : 0.85}
            >
              <title>{`${d.rotulo}: ${d.valor}`}</title>
            </rect>
            {(i === iMaior || ultimo) && d.valor > 0 && (
              <text
                x={cx}
                y={BASE - alt - 4}
                textAnchor="middle"
                fontSize={10.5}
                fontWeight={700}
                fill="#253040"
              >
                {d.valor}
              </text>
            )}
            {(i === 0 || ultimo || i === iMaior) && (
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={9.5} fill="#93a0b6">
                {d.rotulo}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Espera até a primeira resposta, em faixas. Aqui a cor SIGNIFICA algo — é
 * rampa sequencial de gravidade, não identidade — então usá-la é correto.
 */
export function FaixasDeEspera({ dados, total }: { dados: Fatia[]; total: number }) {
  if (total === 0) {
    return <p className="py-8 text-center text-[12.5px] text-tinta-400">Sem dados ainda.</p>;
  }
  return (
    <div>
      <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-[4px]">
        {dados.map((d, i) => (
          <span
            key={d.rotulo}
            className="block h-full first:rounded-l-[4px] last:rounded-r-[4px]"
            style={{
              width: `${Math.max(d.valor > 0 ? 1.5 : 0, (d.valor / total) * 100)}%`,
              background: RAMPA_ESPERA[i] ?? RAMPA_ESPERA[RAMPA_ESPERA.length - 1],
            }}
            title={`${d.rotulo}: ${d.valor}`}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {dados.map((d, i) => (
          <li key={d.rotulo} className="flex items-center gap-1.5 text-[11.5px]">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{ background: RAMPA_ESPERA[i] ?? RAMPA_ESPERA[RAMPA_ESPERA.length - 1] }}
            />
            <span className="text-tinta-500">{d.rotulo}</span>
            <b className="tabular text-tinta-900">{d.valor}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
