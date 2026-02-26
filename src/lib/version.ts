/**
 * Versionamento da aplicação 3Maps.
 * APP_VERSION: lido de package.json
 * RELEASE_ID: incrementar a cada release publicada
 *
 * IMPORTANTE: Ao atualizar package.json (version), adicione também
 * as entradas correspondentes em RELEASE_NOTES abaixo, ordenadas
 * da mais recente para a mais antiga.
 */
import pkg from '../../package.json';

export const APP_VERSION = pkg.version;
export const RELEASE_ID = 9;

export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  items: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.1.9',
    date: '2026-02-26',
    title: 'Créditos extras e estabilidade',
    items: [
      'Créditos extras: valor consistente no perfil, badge Aprofundado e painel admin',
      'Rate limit: desabilitado em dev, aumento de limite em produção (2000 req/min)',
      'Proxy Vite: rota /api/user adicionada para perfil e avatar',
      'Fallback extraCredits em auth (login, Firebase, register)',
    ],
  },
  {
    version: '0.1.8',
    date: '2026-02-26',
    title: 'Perfil unificado e gestão de usuários',
    items: [
      'Botão Configurações removido — Conta e Persistência integrados ao perfil',
      'Perfil: créditos extras, tipo de plano e foto do social (Google)',
      'Admin: e-mail de boas-vindas ao criar usuário — credenciais e login social',
      'Créditos extras: definir valor exato e padrão por plano (Premium/Enterprise)',
    ],
  },
  {
    version: '0.1.7',
    date: '2026-02-24',
    title: 'Melhorias e correções',
    items: [
      'Ajustes de performance e estabilidade',
      'Melhorias na experiência de uso',
    ],
  },
  {
    version: '0.1.6',
    date: '2026-02-24',
    title: 'Aprimoramentos gerais',
    items: [
      'Correções de bugs e refinamentos na interface',
    ],
  },
  {
    version: '0.1.5',
    date: '2026-02-23',
    title: 'R8 — Reorganizar + Drag manual',
    items: [
      'Reorganizar: recalcula layout com dagre + anti-sobreposição, fitView 300ms',
      'Drag manual: arrastar nós livremente, correção de sobreposição no drop',
      'Seleção múltipla: Shift+click, arrastar grupo mantém posições relativas',
    ],
  },
  {
    version: '0.1.5',
    date: '2026-02-23',
    title: 'R8.1 — Fix tela em branco',
    items: [
      'Correção: layoutNodes inexistente causava ReferenceError em MapPage',
      'Guards defensivos: dagre nodeWithPos, getColorsForLevel, formato',
    ],
  },
  {
    version: '0.1.5',
    date: '2026-02-23',
    title: 'R7 — MapaMental Visual Engine',
    items: [
      'Painel Formato: estilo dos nós, paleta de cores, tipo de conexão, layout',
      '10 temas de cores (Aurora, Floresta, Oceano, Vulcão, Lavanda, Sol, Neutro, Candy, Terra, Matrix)',
      '8 estilos de nó (Clássico, Cápsula, Vidro, Neon, Plano, Contorno, Card, Etiqueta)',
      '6 tipos de conexão (Bézier, Step, Reta, Orgânica, Angular, Elbow)',
      '10 combinações prontas (Deep Space, Jardim Zen, Corporate Clean, Neon City, etc.)',
    ],
  },
  {
    version: '0.1.4',
    date: '2026-02-22',
    title: 'Versão mobile e responsividade',
    items: [
      'Menu de ações colapsável em mobile — ícone para abrir/fechar',
      'Filtro por tags removido de Meus Mapas — usar /tags para filtrar',
      'Página Tags responsiva — barra horizontal de tags em mobile',
    ],
  },
  {
    version: '0.1.4',
    date: '2026-02-20',
    title: 'R6 — Diálogo de clarificação em mobile',
    items: [
      'Diálogo Pensamento Profundo / Pesquisador Sênior: scroll em mobile quando há muitas perguntas ou fontes',
      'Botões Cancelar e Continuar sempre visíveis no rodapé fixo',
    ],
  },
  {
    version: '0.1.3',
    date: '2026-02-22',
    title: 'Template Pesquisador Sênior',
    items: [
      'Novo template para pesquisa acadêmica com fontes reais (Semantic Scholar)',
      'Mapas estruturados para especialização, mestrado e doutorado',
      'Artigos no formato de revisão de literatura com citações ABNT',
      'Exportação PNG/PDF com nós e linhas de conexão',
      'Botão Reorganizar no menu de ações do mapa',
      'Normalização de model IDs entre OpenRouter e Gemini',
    ],
  },
  {
    version: '0.1.2',
    date: '2026-02-22',
    title: 'Persistência de configurações no Firebase',
    items: [
      'Chaves de API e configurações do admin armazenadas no Firestore (com criptografia)',
      'Banco SQLite unificado via DATA_DIR absoluto — mesmo banco independente do diretório de execução',
      'Sincronização automática: Firestore como backup e restauração em novo ambiente',
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
