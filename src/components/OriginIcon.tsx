import {
  ArrowLeftRight,
  Banknote,
  Barcode,
  CalendarSync,
  CreditCard,
  QrCode,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ORIGIN_COLORS, ORIGIN_ICONS } from '../types';
import type { OriginColorKey, OriginIconKey } from '../types';

/**
 * Desenho de cada chave de ícone da origem. A chave gravada no Firestore é
 * estável; trocar o desenho aqui não exige migrar dado nenhum.
 */
const ORIGIN_GLYPHS: Record<OriginIconKey, LucideIcon> = {
  pix: QrCode,
  transfer: ArrowLeftRight,
  card: CreditCard,
  cash: Banknote,
  investment: TrendingUp,
  autodebit: CalendarSync,
  boleto: Barcode,
};

export const ORIGIN_ICON_LABELS: Record<OriginIconKey, string> = {
  pix: 'Pix',
  transfer: 'Transferência',
  card: 'Cartão',
  cash: 'Dinheiro',
  investment: 'Investimento',
  autodebit: 'Débito automático',
  boleto: 'Boleto',
};

export const ORIGIN_COLOR_LABELS: Record<OriginColorKey, string> = {
  gold: 'Ouro',
  silver: 'Prata',
  graphite: 'Grafite',
  copper: 'Cobre',
  violet: 'Violeta',
  teal: 'Turquesa',
  terracota: 'Terracota',
};

/** Ordem em que os ícones aparecem na grade de escolha. */
export const ORIGIN_ICON_OPTIONS = ORIGIN_ICONS;

/** Ordem em que os tons aparecem na fileira de escolha. */
export const ORIGIN_COLOR_OPTIONS = ORIGIN_COLORS;

/**
 * Glifo da origem no tom escolhido. Sem ícone conhecido (origem removida do
 * cadastro, mas ainda citada em lançamentos antigos), cai na carteira em ouro.
 */
export function OriginIcon(props: {
  icon?: OriginIconKey | null;
  color?: OriginColorKey | null;
  size?: number;
}) {
  const Glyph = (props.icon && ORIGIN_GLYPHS[props.icon]) || Wallet;
  return (
    <Glyph size={props.size ?? 14} className={`origin-icon oc-${props.color ?? 'gold'}`} aria-hidden />
  );
}
