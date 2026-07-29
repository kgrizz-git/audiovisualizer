export type ExportFormat = 'svg' | 'png' | 'plotter';

type ElementById = <T extends HTMLElement>(id: string) => T;

export function bindExportReview(element: ElementById, onExport: Record<ExportFormat, () => void>): void {
  const dialog = element<HTMLDialogElement>('export-review-dialog');
  let selected: ExportFormat = 'svg';
  const labels: Record<ExportFormat, [string, string]> = {
    svg: ['SVG', 'Included'], png: ['PNG image', 'Included'], plotter: ['Plotter SVG', 'Omitted for pen compatibility'],
  };
  const open = (format: ExportFormat) => {
    selected = format;
    const [formatLabel, legend] = labels[format];
    element<HTMLElement>('export-review-name').textContent = element<HTMLInputElement>('export-title-input').value.trim() || 'Score title';
    element<HTMLElement>('export-review-format').textContent = formatLabel;
    element<HTMLElement>('export-review-legend').textContent = legend;
    if (typeof dialog.showModal === 'function') dialog.showModal();
  };
  (['svg', 'png', 'plotter'] as ExportFormat[]).forEach((format) => element<HTMLButtonElement>(`btn-export-${format === 'plotter' ? 'plotter' : format}`).addEventListener('click', () => open(format)));
  element<HTMLButtonElement>('btn-export-review-confirm').addEventListener('click', () => { dialog.close(); onExport[selected](); });
  const close = () => dialog.close();
  element<HTMLButtonElement>('btn-export-review-close').addEventListener('click', close);
  element<HTMLButtonElement>('btn-export-review-cancel').addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
}
