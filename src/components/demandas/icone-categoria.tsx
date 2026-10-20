import {
  Briefcase,
  GraduationCap,
  HandHeart,
  HeartPulse,
  Pin,
  ShieldCheck,
  TrafficCone,
  type LucideIcon,
} from "lucide-react";
import { categoria } from "./constantes";

const ICONES: Record<string, LucideIcon> = {
  HeartPulse,
  GraduationCap,
  TrafficCone,
  Briefcase,
  HandHeart,
  ShieldCheck,
  Pin,
};

/** Selo da área do pedido: o ícone identifica, a cor agrupa na varredura. */
export function IconeCategoria({ valor, tamanho = 36 }: { valor: string; tamanho?: number }) {
  const c = categoria(valor);
  const Icone = ICONES[c.icone] ?? Pin;
  return (
    <span
      title={c.rotulo}
      className="flex shrink-0 items-center justify-center rounded-lg"
      style={{
        width: tamanho,
        height: tamanho,
        background: `color-mix(in srgb, ${c.cor} 12%, white)`,
        color: c.cor,
      }}
    >
      <Icone size={Math.round(tamanho * 0.48)} strokeWidth={2} />
    </span>
  );
}
