// Impressão de documentos por HTML + CSS de impressão (sem biblioteca extra).
// Funciona com impressora térmica (80 mm) e comum (A4); "Salvar como PDF" sai pelo
// próprio diálogo de impressão do navegador.

export type PaperFormat = 'thermal80' | 'a4';

/** Escapa texto vindo de clientes/cadastros antes de entrar no HTML do documento. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
  h1, h2, h3, p { margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  .muted { color: #444; }
  .right { text-align: right; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .doc-header { display: flex; align-items: center; gap: 10px; }
  .doc-header img { max-height: 48px; max-width: 120px; object-fit: contain; }
  .sign { margin-top: 28px; border-top: 1px solid #000; padding-top: 4px; text-align: center; font-size: 11px; }
`;

const FORMAT_CSS: Record<PaperFormat, string> = {
  thermal80: `
    @page { size: 80mm auto; margin: 3mm; }
    body { width: 74mm; font-size: 12px; }
    .doc { padding: 0; }
    .doc-header { flex-direction: column; text-align: center; gap: 4px; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    td, th { padding: 2px 0; vertical-align: top; font-size: 12px; }
    .big { font-size: 18px; font-weight: 700; }
    .huge { font-size: 26px; font-weight: 800; }
  `,
  a4: `
    @page { size: A4; margin: 14mm; }
    body { font-size: 12px; }
    hr { border: 0; border-top: 1px solid #999; margin: 10px 0; }
    th { text-align: left; border-bottom: 1px solid #000; padding: 6px 4px; font-size: 11px; text-transform: uppercase; }
    td { padding: 5px 4px; border-bottom: 1px solid #ddd; vertical-align: top; }
    .big { font-size: 16px; font-weight: 700; }
    .huge { font-size: 22px; font-weight: 800; }
    .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
    .card { border: 1px solid #ccc; border-radius: 6px; padding: 8px; }
    .card span { display: block; font-size: 10px; text-transform: uppercase; color: #555; }
    .card b { font-size: 15px; }
    h2 { font-size: 14px; margin: 14px 0 6px; }
    .note { font-size: 10px; color: #555; margin-top: 12px; }
  `,
};

/**
 * Abre o diálogo de impressão com o documento num iframe invisível (a tela do painel
 * não é impressa junto). Resolve depois que o diálogo fecha.
 */
export function printDocument(title: string, bodyHtml: string, format: PaperFormat): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>${BASE_CSS}${FORMAT_CSS[format]}</style></head><body><div class="doc">${bodyHtml}</div></body></html>`);
    doc.close();

    const done = () => {
      setTimeout(() => {
        frame.remove();
        resolve();
      }, 500);
    };
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      const win = frame.contentWindow!;
      win.addEventListener('afterprint', done, { once: true });
      win.focus();
      win.print();
      // Navegadores que não disparam afterprint (alguns celulares)
      setTimeout(done, 60_000);
    };
    // Espera o logotipo carregar (sem travar se a imagem falhar)
    const images = Array.from(doc.images);
    if (images.length === 0) return go();
    let pending = images.length;
    const tick = () => {
      if (--pending <= 0) go();
    };
    images.forEach((img) => {
      if (img.complete) tick();
      else {
        img.addEventListener('load', tick);
        img.addEventListener('error', tick);
      }
    });
    setTimeout(go, 3000);
  });
}
