/**
 * Versionamento da aplicação 3Maps.
 * APP_VERSION: lido diretamente de package.json
 * RELEASE_ID: incrementar a cada release publicada
 */
import pkg from '../../package.json';

export const APP_VERSION = pkg.version;
export const RELEASE_ID = 7;

export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  items: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
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
