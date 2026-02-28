/**
 * Versionamento da aplicação 3Maps.
 * APP_VERSION: sincronizado com package.json via Vite
 * RELEASE_ID: incrementar a cada release publicada
 */
declare const __APP_VERSION__: string;

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.16';
export const RELEASE_ID = 16;

export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  items: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.1.16',
    date: '2026-02-28',
    title: 'Release 16 — Fase 2: Vídeo, Markdown e perfis',
    items: [
      'YouTube: análise real do vídeo via fileData (Gemini assiste o vídeo)',
      'Artigo: formatação Markdown rica com remark-gfm',
      'Badge Vídeo removido — YouTube detectado automaticamente',
      'Perfis de cores no mapa (Formato no menu de ações)',
      'Painel lateral redimensionável pelo usuário',
    ],
  },
  {
    version: '0.1.15',
    date: '2026-02-28',
    title: 'Release 15 — Compra de créditos extras',
    items: [
      'Cobrança de créditos extras via Stripe (pagamento único)',
      'Painel de compra de créditos no Perfil (pacote de 5 créditos)',
      'Admin: campo stripe_price_credits_5 para configurar preço de créditos',
      'Webhook Stripe trata targetCredits e adiciona créditos ao usuário',
    ],
  },
  {
    version: '0.1.14',
    date: '2026-02-28',
    title: 'Release 14 — Créditos, tradução e admin',
    items: [
      'Correção da rota "Adicionar crédito" no painel admin (Admin route not found)',
      'Persistência de modelos LLM por provedor e botão X para remover modelos',
      'Crédito inicial de 2 para novos usuários (registro e login social)',
      'Traduzir mapa: escolha do idioma alvo (inglês, espanhol, francês, etc.)',
      'Perfil acessível pelo clique no nome/avatar (item Perfil removido do menu)',
    ],
  },
  {
    version: '0.1.13',
    date: '2026-02-27',
    title: 'Release 13 — Consolidação e verificação',
    items: [
      'Versão atual com todas as funcionalidades validadas e documentadas',
      'Sincronização Stripe no login, admin billing sync, colunas Pago Stripe e Expira em',
      'CORS same-origin, loading inicial, Service Worker v3',
      'Rate limit (300/min) com arquivos estáticos isentos',
      'Modo Pensamento Profundo para Premium, login social e magic link',
      'Layout responsivo, drag manual de nós, Visual Engine (@xyflow)',
      'Billing, webhook Stripe, tela de agradecimento, decremento de créditos do chat',
    ],
  },
  {
    version: '0.1.12',
    date: '2026-02-27',
    title: 'Stripe sync, CORS e correções de produção',
    items: [
      'Sincronização Stripe no login: cliente que já pagou é reconhecido automaticamente',
      'Admin: botão "Sincronizar com Stripe" para ajustar planos de todos os usuários',
      'Admin: colunas "Pago Stripe" e "Expira em" na tabela de usuários',
      'Correção CORS: requisições same-origin (assets, API) não retornam mais 403',
      'Loading inicial visível no carregamento da página',
      'Service Worker atualizado (v3) para evitar cache desatualizado',
    ],
  },
  {
    version: '0.1.10',
    date: '2026-02-26',
    title: 'Rate limit e arquivos estáticos',
    items: [
      'Arquivos estáticos (JS, CSS) isentos do rate limit para não bloquear carregamento',
      'API com limite de 300 requisições/minuto por IP',
    ],
  },
  {
    version: '0.1.9',
    date: '2026-02-25',
    title: 'Créditos extras e estabilidade',
    items: [
      'Sistema de créditos extras para planos',
      'Rate limit e proteções contra abuso',
      'Melhorias de estabilidade gerais',
    ],
  },
  {
    version: '0.1.7',
    date: '2026-02-24',
    title: 'Modo aprofundado e login social',
    items: [
      'Modo aprofundado (Pensamento Profundo) disponível para plano Premium',
      'Correção do login social (Google) e magic link',
      'Ajuste no path do Firebase para autenticação',
    ],
  },
  {
    version: '0.1.6',
    date: '2026-02-23',
    title: 'UX e feedback de erros',
    items: [
      'Mensagem amigável para erro 401 do LLM',
      'Fallback em múltiplos provedores quando um falha',
      'Diálogo de clarificação com scroll em mobile',
    ],
  },
  {
    version: '0.1.5',
    date: '2026-02-22',
    title: 'URL no campo de busca e correções',
    items: [
      'Colar URL diretamente no campo de busca',
      'Correção do botão Detalhado',
      'Feedback de erro mais claro para o usuário',
    ],
  },
  {
    version: '0.1.4',
    date: '2026-02-21',
    title: 'Versão mobile e responsividade',
    items: [
      'Layout responsivo para dispositivos móveis',
      'Correção da tela em branco ao acessar mapa',
      'Reorganizar nós e drag manual no canvas',
      'MapaMental Visual Engine (R7)',
    ],
  },
  {
    version: '0.1.2',
    date: '2026-02-20',
    title: 'Correções de billing e fluxo pós-pagamento',
    items: [
      'Correção do decremento de créditos: chat consome corretamente o limite de mensagens',
      'Webhook Stripe: plano do usuário atualizado automaticamente após pagamento',
      'Tela de agradecimento após pagamento (/thank-you)',
      'Validação de Price ID vs Product ID no Stripe',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-02-19',
    title: 'Uso automático de chaves alternativas',
    items: [
      'A aplicação usa outras chaves de API (OpenRouter, OpenAI, Gemini) quando a chave do provedor selecionado não está configurada',
      'Mensagem para configurar chave só aparece quando nenhuma chave funcional está disponível',
    ],
  },
  {
    version: '0.0.9',
    date: '2026-02-18',
    title: 'Admin e recuperação de senha',
    items: [
      'Painel admin completo',
      'Recuperação de senha por e-mail',
      'Plano admin com acesso total',
    ],
  },
  {
    version: '0.0.0',
    date: '2026-02-17',
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
