const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** Formata centavos como moeda brasileira. */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/** Converte o texto digitado (apenas dígitos considerados) em centavos. */
export function digitsToCents(text: string): number {
  const digits = text.replace(/\D/g, '');
  return digits ? Math.min(Number(digits), 999_999_999_99) : 0;
}
