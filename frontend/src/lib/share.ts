/** Compartilha o link do comprovante (menu nativo quando disponível, senão copia). Retorna true se copiou. */
export async function shareReceipt(code: string): Promise<boolean> {
  const url = `${window.location.origin}/comprovante/${code}`;
  if (navigator.share) {
    await navigator.share({ title: 'Comprovante de arremate', url }).catch(() => {});
    return false;
  }
  await navigator.clipboard.writeText(url);
  return true;
}
