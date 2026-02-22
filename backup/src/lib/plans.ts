// ---------------------------------------------------------------------------
// Plan types and limits for 3Maps monetization
// ---------------------------------------------------------------------------

export type PlanId = 'free' | 'premium';

export interface PlanLimits {
  id: PlanId;
  name: string;
  /** Monthly map creation limit. -1 = unlimited */
  mapsPerMonth: number;
  /** Template IDs allowed for this plan */
  templatesAllowed: string[];
  /** Export formats allowed for this plan */
  exportFormats: string[];
  /** Whether image generation (Replicate) is allowed */
  imageGeneration: boolean;
  /** Whether chat is enabled */
  chatEnabled: boolean;
  /** Max chat messages per map. -1 = unlimited */
  chatMessagesPerMap: number;
  /** Max maps stored. -1 = unlimited */
  maxMapsStored: number;
}

/** All available template IDs */
const ALL_TEMPLATES = [
  'padrao',
  'brainstorm',
  'analise',
  'pensamento_profundo',
  'academico',
  'negocio',
  'tecnico',
  'criativo',
];

/** All available export formats */
const ALL_EXPORT_FORMATS = ['png', 'svg', 'pdf', 'markdown'];

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    id: 'free',
    name: 'Gratuito',
    mapsPerMonth: 5,
    templatesAllowed: ['padrao', 'brainstorm', 'analise'],
    exportFormats: ['png'],
    imageGeneration: false,
    chatEnabled: true,
    chatMessagesPerMap: 5,
    maxMapsStored: 20,
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    mapsPerMonth: -1,
    templatesAllowed: ALL_TEMPLATES,
    exportFormats: ALL_EXPORT_FORMATS,
    imageGeneration: true,
    chatEnabled: true,
    chatMessagesPerMap: -1,
    maxMapsStored: -1,
  },
};

/**
 * Returns the plan limits for the given plan ID.
 * Falls back to 'free' if the plan ID is unknown.
 */
export function getPlanLimits(planId: PlanId): PlanLimits {
  return PLANS[planId] ?? PLANS.free;
}

/**
 * Check whether a specific feature is allowed for the given plan.
 * Supported feature keys:
 *   - 'image_generation'
 *   - 'chat'
 *   - 'export_svg'
 *   - 'export_pdf'
 *   - 'export_markdown'
 *   - 'export_png'
 *   - 'template_<id>'
 */
export function isFeatureAllowed(planId: PlanId, feature: string): boolean {
  const limits = getPlanLimits(planId);

  if (feature === 'image_generation') return limits.imageGeneration;
  if (feature === 'chat') return limits.chatEnabled;

  if (feature.startsWith('export_')) {
    const fmt = feature.slice('export_'.length);
    return limits.exportFormats.includes(fmt);
  }

  if (feature.startsWith('template_')) {
    const tpl = feature.slice('template_'.length);
    return limits.templatesAllowed.includes(tpl);
  }

  // Unknown feature — deny by default
  return false;
}
