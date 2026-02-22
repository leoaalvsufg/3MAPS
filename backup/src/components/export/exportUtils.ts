import type { SavedMap } from '@/types/mindmap';
import type MindElixir from 'mind-elixir';

export type ExportFormat = 'png' | 'svg' | 'pdf' | 'markdown';

/**
 * Export any HTMLElement as PNG using html2canvas.
 * Useful for ReactFlow-based mindmaps.
 */
export async function exportElementAsPng(element: HTMLElement, filename: string): Promise<void> {
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    logging: false,
  });

  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `${filename}.png`);
  }, 'image/png');
}

/**
 * Export any HTMLElement as PDF using html2canvas + jsPDF.
 */
export async function exportElementAsPdf(element: HTMLElement, map: SavedMap): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: html2canvas } = await import('html2canvas');

  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 1.5,
    useCORS: true,
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [canvas.width, canvas.height],
  });

  pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
  pdf.save(`${slugify(map.title)}.pdf`);
}

/**
 * Export mind map as PNG using mind-elixir's built-in export
 */
export async function exportAsPng(
  instance: InstanceType<typeof MindElixir>,
  filename: string
): Promise<void> {
  try {
    // mind-elixir v5 has exportPng method
    const blob = await (instance as any).exportPng?.();
    if (blob) {
      downloadBlob(blob, `${filename}.png`);
      return;
    }
  } catch {
    // fallback
  }

  // Fallback: use html2canvas on the container
  const { default: html2canvas } = await import('html2canvas');
  const container = (instance as any).container as HTMLElement;
  if (!container) throw new Error('Canvas container not found');

  const canvas = await html2canvas(container, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
  });

  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `${filename}.png`);
  }, 'image/png');
}

/**
 * Export mind map as SVG
 */
export async function exportAsSvg(
  instance: InstanceType<typeof MindElixir>,
  filename: string
): Promise<void> {
  try {
    const blob = await (instance as any).exportSvg?.();
    if (blob) {
      downloadBlob(blob, `${filename}.svg`);
      return;
    }
  } catch {
    // fallback
  }

  // Fallback: serialize SVG from DOM
  const container = (instance as any).container as HTMLElement;
  const svg = container?.querySelector('svg');
  if (!svg) throw new Error('SVG element not found');

  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svg);
  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  downloadBlob(blob, `${filename}.svg`);
}

/**
 * Export mind map as PDF
 */
export async function exportAsPdf(
  instance: InstanceType<typeof MindElixir>,
  map: SavedMap
): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: html2canvas } = await import('html2canvas');

  const container = (instance as any).container as HTMLElement;
  if (!container) throw new Error('Canvas container not found');

  const canvas = await html2canvas(container, {
    backgroundColor: '#ffffff',
    scale: 1.5,
    useCORS: true,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [canvas.width, canvas.height],
  });

  pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
  pdf.save(`${slugify(map.title)}.pdf`);
}

/**
 * Export mind map as Markdown
 */
export function exportAsMarkdown(map: SavedMap): void {
  const lines: string[] = [
    `# ${map.title}`,
    '',
    `> Gerado em: ${new Date(map.createdAt).toLocaleDateString('pt-BR')}`,
    `> Template: ${map.template}`,
    `> Tags: ${map.tags.join(', ') || 'Nenhuma'}`,
    '',
    '---',
    '',
    '## Mapa Mental',
    '',
  ];

  // Serialize mind map nodes to markdown
  function nodeToMarkdown(node: { topic: string; children?: typeof node[] }, depth = 0): void {
    const indent = '  '.repeat(depth);
    const prefix = depth === 0 ? '**' : depth === 1 ? '- **' : '  '.repeat(depth - 1) + '- ';
    const suffix = depth === 0 ? '**' : depth === 1 ? '**' : '';
    lines.push(`${indent}${prefix}${node.topic}${suffix}`);
    node.children?.forEach((child) => nodeToMarkdown(child, depth + 1));
  }

  nodeToMarkdown(map.mindElixirData.nodeData);

  lines.push('', '---', '', '## Artigo', '', map.article);

  const content = lines.join('\n');
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(blob, `${slugify(map.title)}.md`);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

