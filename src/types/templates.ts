export type TemplateId =
  | 'padrao'
  | 'brainstorm'
  | 'analise'
  | 'projeto'
  | 'estudo'
  | 'problema'
  | 'comparacao'
  | 'timeline'
  | 'pensamento_profundo'
  | 'pesquisador_senior';

export interface Template {
  id: TemplateId;
  name: string;
  description: string;
  icon: string;
  promptModifier: string;
  color: string;
  structure: 'radial' | 'linear' | 'hierarchical' | 'timeline';
}

