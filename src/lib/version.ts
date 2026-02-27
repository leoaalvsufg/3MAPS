/**
 * Versionamento da aplicação 3Maps.
 * APP_VERSION: sincronizado com package.json via Vite
 * RELEASE_ID: incrementar a cada release publicada
 */
declare const __APP_VERSION__: string;

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.2';
export const RELEASE_ID = 3;

export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  items: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.1.2',
    date: '2026-02-27',
    title: 'Correções de billing e fluxo pós-pagamento',
    items: [
      'Correção do decremento de créditos: chat agora consome corretamente o limite de mensagens',
      'Webhook Stripe: plano do usuário é atualizado automaticamente após pagamento',
      'Tela de agradecimento após pagamento (/thank-you) com parabéns pelo upgrade',
      'Validação de Price ID vs Product ID no Stripe para evitar erros de configuração',
    ],
  },
  {
    version: '0.1.0',
    date: '2025-02-22',
    title: 'Uso automático de chaves alternativas',
    items: [
      'A aplicação usa outras chaves de API (OpenRouter, OpenAI, Gemini) quando a chave do provedor selecionado não está configurada',
      'Mensagem para configurar chave só aparece quando nenhuma chave funcional está disponível',
    ],
  },
  {
    version: '0.0.0',
    date: '2025-02-20',
    title: 'Lançamento inicial',
    items: [
      'Geração de mapas mentais com IA',
      'Suporte a múltiplos templates (Padrão, Brainstorm, Análise, Projeto, etc.)',
      'Integração OpenRouter, OpenAI e Gemini',
      'Autenticação e planos (Free, Pro, Enterprise)',
      'Sistema de tags e organização de mapas',
      'Exportação para PDF e PNG',
    ],
  },
];
