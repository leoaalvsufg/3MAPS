import type { SavedMap } from '@/types/mindmap';
import type MindElixir from 'mind-elixir';
import { getNodesBounds, getViewportForBounds, type ReactFlowInstance } from '@xyflow/react';

export type ExportFormat = 'png' | 'svg' | 'pdf' | 'markdown';

const IMAGE_WIDTH = 4096;
const IMAGE_HEIGHT = 3072;

/**
 * Capture the full ReactFlow diagram (nodes + edges) via html-to-image.
 * Falls back to html2canvas if viewport element is not available.
 */
async function captureReactFlowViewport(
  viewportEl: HTMLElement | null,
  flowInstance: ReactFlowInstance | null,
  fallbackEl: HTMLElement,
  scale: number,
): Promise<string> {
  if (viewportEl && flowInstance) {
    const { toPng } = await import('html-to-image');
    const nodes = flowInstance.getNodes();
    if (nodes.length > 0) {
      const bounds = getNodesBounds(nodes);
      const padding = 80;
      const padded = {
        x: bounds.x - padding,
        y: bounds.y - padding,
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2,
      };
      const viewport = getViewportForBounds(padded, IMAGE_WIDTH, IMAGE_HEIGHT, 0.5, 2, 0);

      return await toPng(viewportEl, {
        backgroundColor: '#ffffff',
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        style: {
          width: `${IMAGE_WIDTH}px`,
          height: `${IMAGE_HEIGHT}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
        pixelRatio: scale,
      });
    }
  }

  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(fallbackEl, {
    backgroundColor: '#ffffff',
    scale,
    useCORS: true,
    logging: false,
  });
  return canvas.toDataURL('image/png');
}

/**
 * Export ReactFlow mindmap as PNG (full diagram with edges).
 */
export async function exportElementAsPng(
  element: HTMLElement,
  filename: string,
  viewportEl?: HTMLElement | null,
  flowInstance?: ReactFlowInstance | null,
): Promise<void> {
  if (viewportEl && flowInstance) {
    const { toPng } = await import('html-to-image');
    const nodes = flowInstance.getNodes();
    if (nodes.length > 0) {
      const bounds = getNodesBounds(nodes);
      const padding = 80;
      const padded = {
        x: bounds.x - padding,
        y: bounds.y - padding,
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2,
      };
      const viewport = getViewportForBounds(padded, IMAGE_WIDTH, IMAGE_HEIGHT, 0.5, 2, 0);

      const dataUrl = await toPng(viewportEl, {
        backgroundColor: '#ffffff',
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        style: {
          width: `${IMAGE_WIDTH}px`,
          height: `${IMAGE_HEIGHT}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
        pixelRatio: 2,
      });

      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = dataUrl;
      link.click();
      return;
    }
  }

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
 * Export ReactFlow mindmap as PDF (full diagram with edges).
 */
export async function exportElementAsPdf(
  element: HTMLElement,
  map: SavedMap,
  viewportEl?: HTMLElement | null,
  flowInstance?: ReactFlowInstance | null,
): Promise<void> {
  const imgData = await captureReactFlowViewport(viewportEl, flowInstance, element, 1.5);

  const { default: jsPDF } = await import('jspdf');
  const img = new Image();
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.src = imgData;
  });

  const pdf = new jsPDF({
    orientation: img.width > img.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [img.width, img.height],
  });
  pdf.addImage(imgData, 'PNG', 0, 0, img.width, img.height);
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

