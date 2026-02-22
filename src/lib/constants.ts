import type { Template } from '@/types/templates';

export const TEMPLATES: Template[] = [
  {
    id: 'padrao',
    name: 'Padrão',
    description: 'Mapa mental clássico com estrutura radial',
    icon: '🗺️',
    color: 'blue',
    structure: 'radial',
    promptModifier: 'Crie um mapa mental clássico com estrutura radial equilibrada.',
  },
  {
    id: 'brainstorm',
    name: 'Brainstorm',
    description: 'Exploração livre de ideias e conexões',
    icon: '💡',
    color: 'yellow',
    structure: 'radial',
    promptModifier: 'Crie um mapa de brainstorming com foco em geração criativa de ideias, conexões inesperadas e associações livres.',
  },
  {
    id: 'analise',
    name: 'Análise',
    description: 'Análise profunda com causas e efeitos',
    icon: '🔍',
    color: 'purple',
    structure: 'hierarchical',
    promptModifier: 'Crie um mapa analítico com foco em causas, efeitos, evidências e conclusões. Inclua análise crítica e perspectivas múltiplas.',
  },
  {
    id: 'projeto',
    name: 'Projeto',
    description: 'Planejamento de projetos e tarefas',
    icon: '📋',
    color: 'green',
    structure: 'hierarchical',
    promptModifier: 'Crie um mapa de planejamento de projeto com fases, tarefas, responsabilidades, recursos e marcos importantes.',
  },
  {
    id: 'estudo',
    name: 'Estudo',
    description: 'Organização de conteúdo para aprendizado',
    icon: '📚',
    color: 'teal',
    structure: 'hierarchical',
    promptModifier: 'Crie um mapa de estudo com conceitos-chave, definições, exemplos práticos e conexões entre tópicos para facilitar o aprendizado.',
  },
  {
    id: 'problema',
    name: 'Problema',
    description: 'Resolução estruturada de problemas',
    icon: '⚡',
    color: 'red',
    structure: 'hierarchical',
    promptModifier: 'Crie um mapa de resolução de problemas com definição do problema, causas raiz, soluções possíveis, prós e contras de cada solução.',
  },
  {
    id: 'comparacao',
    name: 'Comparação',
    description: 'Comparação entre conceitos ou opções',
    icon: '⚖️',
    color: 'orange',
    structure: 'radial',
    promptModifier: 'Crie um mapa comparativo com critérios de avaliação, pontos fortes e fracos de cada opção, e uma síntese final.',
  },
  {
    id: 'timeline',
    name: 'Linha do Tempo',
    description: 'Eventos e marcos em ordem cronológica',
    icon: '📅',
    color: 'indigo',
    structure: 'timeline',
    promptModifier: 'Crie um mapa cronológico com eventos em ordem temporal, contexto histórico, causas e consequências de cada evento.',
  },
	{
		id: 'pensamento_profundo',
		name: 'Pensamento Profundo',
		description: 'Fontes + perguntas de clarificação + melhor forma de apresentar',
		icon: '🧠',
		color: 'slate',
		structure: 'hierarchical',
		promptModifier:
			'Antes de gerar, priorize: fontes confiáveis, perguntas de clarificação quando necessário, e uma estrutura que maximize compreensão (pode sugerir diagrama/linha do tempo/fishbone quando fizer sentido).',
	},
	{
		id: 'pesquisador_senior',
		name: 'Pesquisador Sênior',
		description: 'Pesquisa acadêmica com fontes reais (Semantic Scholar) para especialização, mestrado e doutorado',
		icon: '🎓',
		color: 'emerald',
		structure: 'hierarchical',
		promptModifier:
			'Atue como pesquisador sênior acadêmico. Use EXCLUSIVAMENTE as fontes acadêmicas fornecidas como contexto. Estruture a análise com rigor metodológico: fundamentos teóricos, estado da arte, lacunas de pesquisa, metodologias e direções futuras. Nível: pós-graduação stricto sensu.',
	},
];

export const OPENROUTER_MODELS = [
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', description: 'Rápido e eficiente' },
  { id: 'google/gemini-2.0-flash-lite-001', name: 'Gemini 2.0 Flash Lite', description: 'Muito econômico' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'Equilibrado' },
  { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', description: 'Qualidade com custo moderado' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: 'Alta qualidade' },
  { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', description: 'Rápido e leve' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', description: 'Open source' },
  { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free)', description: 'Gratuito via OpenRouter' },
  { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B (Free)', description: 'Gratuito via OpenRouter' },
  { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (Free)', description: 'Gratuito via OpenRouter' },
];

export const OPENAI_MODELS = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Rápido e econômico' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: 'Econômico com melhor raciocínio' },
  { id: 'gpt-4o', name: 'GPT-4o', description: 'Alta qualidade' },
  { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Alta qualidade / contexto robusto' },
];

export const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Rápido e atual' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Rápido e eficiente' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', description: 'Muito econômico' },
  { id: 'gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash (latest)', description: 'Compatibilidade ampla' },
  { id: 'gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro (latest)', description: 'Alta qualidade' },
  { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B', description: 'Leve e rápido' },
];

export const SUGGESTIONS = [
  'Inteligência Artificial e o futuro do trabalho',
  'Como funciona o sistema imunológico humano',
  'Estratégias de marketing digital para 2025',
  'Mudanças climáticas: causas e soluções',
  'Fundamentos de programação funcional',
  'História da Revolução Industrial',
  'Técnicas de meditação e mindfulness',
  'Arquitetura de microsserviços',
  'Psicologia do comportamento do consumidor',
  'Energias renováveis no Brasil',
  'Filosofia estoica aplicada ao cotidiano',
  'Nutrição e saúde preventiva',
];

export const REPLICATE_IMAGE_MODEL = 'black-forest-labs/flux-schnell';

export const DEFAULT_SETTINGS = {
  username: 'local',
  provider: 'openrouter' as const,
  selectedModel: 'google/gemini-2.0-flash-lite-001',
  theme: 'system' as const,
  generateImages: false,
  language: 'pt-BR',
};

