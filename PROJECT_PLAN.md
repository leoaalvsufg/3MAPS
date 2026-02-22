# 🧠 MindMap Generator — Planejamento Completo do Projeto

> **Versão:** 3.0
> **Data:** 2026-02-19
> **Status:** Planejamento concluído — Pronto para implementação
> **Idioma da Interface:** Português Brasileiro (pt-BR)

---

## Índice

1. [Visão Geral do Projeto](#1-visão-geral-do-projeto)
2. [Stack Tecnológica](#2-stack-tecnológica)
3. [Arquitetura de Layout](#3-arquitetura-de-layout)
4. [Rotas da Aplicação](#4-rotas-da-aplicação)
5. [Pipeline LLM (4 Etapas)](#5-pipeline-llm-4-etapas)
6. [Sistema de Templates](#6-sistema-de-templates-8-templates)
7. [Sistema de Tags](#7-sistema-de-tags)
8. [Sistema de Chat Contextual](#8-sistema-de-chat-contextual)
9. [Ações Pós-Geração](#9-ações-pós-geração)
10. [Sistema de Exportação](#10-sistema-de-exportação)
11. [Estrutura de Pastas](#11-estrutura-de-pastas)
12. [Tipos TypeScript](#12-tipos-typescript)
13. [Stores (Zustand)](#13-stores-zustand)
14. [Prompts LLM](#14-prompts-llm)
15. [Wireframes](#15-wireframes)
16. [Constantes e Configurações](#16-constantes-e-configurações)
17. [Dependências](#17-dependências)
18. [Fases de Implementação](#18-fases-de-implementação)
19. [Decisões de Design](#19-decisões-de-design)

---

## 1. Visão Geral do Projeto

### O que é

O **MindMap Generator** é uma aplicação web SPA que gera mapas mentais interativos a partir de qualquer tópico ou texto usando Inteligência Artificial. Inspirado no [Mapify](https://mapify.so), o app oferece:

- **Geração inteligente** de mapas mentais via LLM (OpenRouter/OpenAI)
- **Artigo detalhado** (cadeia de pensamentos) gerado automaticamente
- **Chat contextual** para explorar e aprofundar o conteúdo do mapa
- **8 templates** especializados para diferentes tipos de análise
- **Geração de imagens** ilustrativas via Replicate (opcional)
- **Exportação** em PNG, SVG, PDF e Markdown
- **Galeria de mapas** salvos com sistema de tags
- **Interface 100% em português brasileiro**

### Público-alvo

Estudantes, profissionais, pesquisadores e qualquer pessoa que queira organizar ideias, estudar tópicos complexos ou planejar projetos de forma visual.

### Princípios de Design

- **Mobile-first** com responsividade completa
- **Interface limpa** inspirada no Mapify
- **Layout 3 colunas** (sidebar + conteúdo + detalhes)
- **Sidebar colapsável** (drawer no mobile)
- **Tudo em pt-BR** (interface, prompts, conteúdo gerado)

---

## 2. Stack Tecnológica

| Tecnologia | Versão | Uso |
|---|---|---|
| **React** | ^19.0 | Framework UI |
| **TypeScript** | ^5.7 | Tipagem estática |
| **Vite** | ^6.x | Build tool + dev server |
| **Tailwind CSS** | ^4.x | Estilização utility-first |
| **shadcn/ui** | latest | Componentes UI (Radix + Tailwind) |
| **mind-elixir** | ^5.x | Renderização de mapas mentais |
| **Zustand** | ^5.x | Gerenciamento de estado |
| **React Router** | ^7.x | Roteamento SPA |
| **Lucide React** | ^0.x | Ícones |
| **react-markdown** | ^10.x | Renderização de markdown |
| **jsPDF** | ^3.x | Geração de PDF |
| **html2canvas** | ^1.x | Captura de canvas para PDF |
| **date-fns** | ^4.x | Formatação de datas (pt-BR) |
| **uuid** | ^11.x | Geração de IDs únicos |

### APIs Externas

| API | Uso | Configuração |
|---|---|---|
| **OpenRouter** | LLM principal (análise, mapa, artigo, chat) | API key do usuário |
| **OpenAI** | LLM alternativo | API key do usuário |
| **Replicate** | Geração de imagens (Flux Schnell) | API key do usuário |

### Armazenamento

- **localStorage** para persistência de mapas, configurações e histórico de chat
- Sem backend — tudo roda no cliente
- API keys armazenadas localmente (criptografia básica opcional)


---

## 3. Arquitetura de Layout

### Layout Principal — 3 Colunas

```
┌──────────────────────────────────────────────────────────────────┐
│  ☰ 🧠 MindMap Generator                              [👤 Config] │
├──────────┬───────────────────────────────────┬───────────────────┤
│ SIDEBAR  │         ÁREA PRINCIPAL            │  PAINEL DETALHES  │
│ (240px)  │         (flex-1)                  │  (320px)          │
│          │                                   │                   │
│ 💬 Per-  │  Varia por rota:                  │  Varia por rota:  │
│   guntar │                                   │                   │
│ 🗂️ Meus  │  HomePage: input + templates      │  HomePage: —      │
│   Mapas  │  MapPage: mind-elixir canvas      │  MapPage: artigo  │
│          │  AllMapsPage: galeria grid         │  AllMapsPage: —   │
│ ─────── │  SettingsPage: formulários         │  SettingsPage: —  │
│ Recentes │                                   │                   │
│  • Mapa1 │                                   │                   │
│  • Mapa2 │                                   │                   │
│          │                                   │                   │
│ ─────── │                                   │                   │
│ Tags     │                                   │                   │
│  ○ tag1  │                                   │                   │
│  ○ tag2  │                                   │                   │
│          │                                   │                   │
│ ─────── │                                   │                   │
│ ⚙️ Config│                                   │                   │
└──────────┴───────────────────────────────────┴───────────────────┘
```

### Sidebar — Conteúdo

| Seção | Conteúdo |
|---|---|
| **Logo** | 🧠 + "MindMap Generator" (colapsado: apenas 🧠) |
| **Navegação** | "Perguntar" (→ `/`), "Meus Mapas" (→ `/maps`) |
| **Recentes** | Últimos 5-10 mapas (título + ícone template) |
| **Tags** | Tags únicas com contagem, clicáveis para filtrar |
| **Config** | Link para `/settings` |

### Sidebar — Estados

| Estado | Largura | Conteúdo |
|---|---|---|
| **Expandida** | 240px | Texto completo + ícones |
| **Colapsada** | 60px | Apenas ícones (tooltip no hover) |
| **Drawer (mobile)** | 280px overlay | Overlay com backdrop escuro |

### Details Panel — Conteúdo por Rota

| Rota | Conteúdo do Details Panel |
|---|---|
| `/` (HomePage) | **Oculto** |
| `/map/:id` (MapPage) | Artigo (markdown), Tags editáveis, Exportação, Nó selecionado |
| `/maps` (AllMapsPage) | **Oculto** |
| `/settings` | **Oculto** |

### Responsividade

| Breakpoint | Layout |
|---|---|
| **Desktop** (≥1280px) | 3 colunas: sidebar + main + details |
| **Tablet** (768px-1279px) | 2 colunas: sidebar colapsada (60px) + main. Details como bottom sheet |
| **Mobile** (<768px) | 1 coluna: sidebar como drawer. Details como tabs abaixo do conteúdo |

#### Mobile — Tabs no MapPage

```
┌──────────────────────────────────────┐
│ ☰ 🧠 MindMap Generator        [💬]  │
├──────────────────────────────────────┤
│                                      │
│  (conteúdo principal - full width)   │
│                                      │
│  ┌──────────────────────────────┐    │
│  │ [🗺️ Mapa] [📋 Artigo] [🏷️]  │    │
│  └──────────────────────────────┘    │
│                                      │
└──────────────────────────────────────┘
```

---

## 4. Rotas da Aplicação

| Rota | Página | Componente | Descrição |
|---|---|---|---|
| `/` | HomePage | `HomePage.tsx` | Tela inicial — input + templates + sugestões |
| `/map/:id` | MapPage | `MapPage.tsx` | Visualização do mapa (canvas + artigo + chat) |
| `/maps` | AllMapsPage | `AllMapsPage.tsx` | Galeria de todos os mapas salvos |
| `/settings` | SettingsPage | `SettingsPage.tsx` | Configurações de API keys e preferências |

### Fluxo de Navegação

```
HomePage (/)
  ├── [Gerar Mapa] → MapPage (/map/:newId)
  ├── [Template click] → Preenche input + seleciona template
  ├── [Sugestão click] → Preenche input + gera
  └── [Meus Mapas] → AllMapsPage (/maps)

MapPage (/map/:id)
  ├── [Sidebar: Perguntar] → HomePage (/)
  ├── [Sidebar: Meus Mapas] → AllMapsPage (/maps)
  ├── [Sidebar: Mapa recente] → MapPage (/map/:otherId)
  ├── [Exportar] → ExportDialog (modal)
  ├── [Chat] → ChatPanel (drawer/floating)
  └── [Regenerar] → Re-executa pipeline no mesmo ID

AllMapsPage (/maps)
  ├── [Card click] → MapPage (/map/:id)
  ├── [Tag click] → Filtra por tag
  ├── [Busca] → Filtra por texto
  └── [Novo Mapa] → HomePage (/)

SettingsPage (/settings)
  └── [Salvar] → Persiste no localStorage
```

---

## 5. Pipeline LLM (4 Etapas)

### Visão Geral

O pipeline de geração possui **4 etapas**, sendo as etapas 2 e 3 executadas **em paralelo** após a etapa 1:

```
                    ┌──→ Etapa 2: Mapa Mental (MindElixir JSON) ──┐
Input + Template    │                                              │
       │            │                                              ▼
       ▼            │                                         ┌─────────┐
  Etapa 1: Análise ─┤                                         │ Salvar  │
  (JSON)            │                                         │  Mapa   │
                    │                                         └─────────┘
                    ├──→ Etapa 3: Artigo (Markdown) ──────────────┘
                    │
                    └──→ Etapa 4: Imagem (Replicate) ─── opcional
```

### Etapa 1 — Análise do Conteúdo

| Campo | Valor |
|---|---|
| **Input** | Tópico/texto do usuário + template selecionado |
| **Output** | `AnalysisResult` JSON |
| **LLM** | OpenRouter ou OpenAI (configurável) |
| **Obrigatória** | ✅ Sim |

**Output esperado:**

```json
{
  "central_theme": "Inteligência Artificial",
  "subtopics": ["Machine Learning", "Deep Learning", "NLP", "Visão Computacional"],
  "key_concepts": ["Redes Neurais", "Transformers", "GPT", "Dados de Treinamento"],
  "relationships": [
    { "from": "Machine Learning", "to": "Deep Learning", "type": "contém" },
    { "from": "Transformers", "to": "NLP", "type": "usado em" }
  ],
  "depth_level": 3,
  "suggested_node_count": 25,
  "suggested_tags": ["tecnologia", "ia", "machine-learning"],
  "template_context": "analysis"
}
```

### Etapa 2 — Geração do Mapa Mental

| Campo | Valor |
|---|---|
| **Input** | `AnalysisResult` da Etapa 1 |
| **Output** | `MindElixirData` JSON (formato mind-elixir) |
| **LLM** | OpenRouter ou OpenAI |
| **Obrigatória** | ✅ Sim |
| **Paralela com** | Etapa 3 |

### Etapa 3 — Geração do Artigo (Cadeia de Pensamentos)

| Campo | Valor |
|---|---|
| **Input** | `AnalysisResult` da Etapa 1 |
| **Output** | Artigo em Markdown (1000-2000 palavras) |
| **LLM** | OpenRouter ou OpenAI |
| **Obrigatória** | ✅ Sim |
| **Paralela com** | Etapa 2 |

O artigo é exibido no **Details Panel** (painel direito) e contém:
- Título (= tema central)
- Introdução com visão geral
- Seções para cada subtópico principal (## headers)
- Subseções para conceitos (### headers)
- Parágrafos explicativos com insights e exemplos
- Conclusão

### Etapa 4 — Geração de Imagem (Opcional)

| Campo | Valor |
|---|---|
| **Input** | Tema central + conceitos-chave |
| **Output** | URL da imagem gerada |
| **API** | Replicate (Flux Schnell) |
| **Obrigatória** | ❌ Não (checkbox na HomePage) |

### Indicadores de Progresso

| Estado | Mensagem (pt-BR) | Ícone |
|---|---|---|
| `analyzing` | "Analisando conteúdo..." | ⚙️ spinner |
| `generating` | "Gerando mapa mental..." | 🧠 spinner |
| `article` | "Escrevendo artigo..." | 📝 spinner |
| `image` | "Gerando imagem ilustrativa..." | 🖼️ spinner |
| `done` | "Mapa mental gerado com sucesso!" | ✅ |
| `error` | "Erro ao gerar: {mensagem}" | ❌ |

---

## 6. Sistema de Templates (8 Templates)

### Tipo TypeScript

```typescript
export type TemplateType =
  | 'brainstorm'
  | 'outline'
  | 'project'
  | 'strategy'
  | 'concept'
  | 'analysis'
  | 'timeline'
  | 'reading';

export interface Template {
  id: TemplateType;
  icon: string;
  name: string;           // pt-BR
  description: string;    // pt-BR
  promptModifier: string; // Instrução adicional para Etapa 1
  structureHint: string;  // Dica de estrutura para Etapa 2
}
```

### Tabela Completa de Templates

| # | ID | Ícone | Nome (pt-BR) | Descrição (pt-BR) |
|---|---|---|---|---|
| 1 | `brainstorm` | 💡 | Brainstorm de Ideias | Gere ideias e soluções criativas para qualquer tópico |
| 2 | `outline` | 📋 | Estruturar Conteúdo | Crie estruturas claras para ensaios, projetos ou páginas web |
| 3 | `project` | 📅 | Planejar Projetos | Defina etapas e marcos para projetos pessoais ou profissionais |
| 4 | `strategy` | 🎯 | Desenvolver Estratégias | Elabore estratégias abrangentes para negócios ou marketing |
| 5 | `concept` | 🔍 | Explicar Conceitos | Decomponha e esclareça conceitos ou processos complexos |
| 6 | `analysis` | 📊 | Analisar Tópicos | Aprofunde-se em assuntos para insights e compreensão |
| 7 | `timeline` | ⏳ | Criar Linhas do Tempo | Visualize sequências de eventos históricos ou fases de projetos |
| 8 | `reading` | 📖 | Notas de Leitura | Organize e resuma suas notas de leitura |

### Modificadores de Prompt por Template

#### 💡 Brainstorm de Ideias (`brainstorm`)

```
Analise o tópico com foco em geração de ideias criativas. Identifique problemas,
oportunidades, soluções inovadoras e abordagens alternativas. Organize em categorias
como: Ideias Principais, Variações, Combinações, Abordagens Não-Convencionais.
```

#### 📋 Estruturar Conteúdo (`outline`)

```
Analise o tópico com foco em criar uma estrutura hierárquica clara. Identifique
seções principais, subseções, pontos-chave e detalhes de suporte. Organize como
um outline profissional.
```

#### 📅 Planejar Projetos (`project`)

```
Analise o tópico como um projeto. Identifique fases, marcos (milestones), tarefas,
dependências, recursos necessários e riscos. Organize cronologicamente.
```

#### 🎯 Desenvolver Estratégias (`strategy`)

```
Analise o tópico com foco estratégico. Identifique objetivos, análise SWOT, táticas,
métricas de sucesso, stakeholders e plano de ação. Organize por prioridade.
```

#### 🔍 Explicar Conceitos (`concept`)

```
Analise o tópico com foco didático. Decomponha em conceitos fundamentais, definições,
exemplos, analogias, relações causa-efeito e aplicações práticas.
```

#### 📊 Analisar Tópicos (`analysis`)

```
Analise o tópico em profundidade. Identifique aspectos-chave, perspectivas diferentes,
dados relevantes, tendências, implicações e conclusões.
```

#### ⏳ Criar Linhas do Tempo (`timeline`)

```
Analise o tópico cronologicamente. Identifique eventos-chave, períodos, marcos
históricos, causas e consequências. Organize em ordem temporal.
```

#### 📖 Notas de Leitura (`reading`)

```
Analise o texto como notas de leitura. Identifique temas principais, argumentos do
autor, citações importantes, insights pessoais e conexões com outros conhecimentos.
```

### Comportamento na UI

1. **HomePage**: Grid de 8 cards (4×2 desktop, 2×4 mobile)
2. **Clique no template**: Seleciona o template (destaque visual) + preenche placeholder do input
3. **Template padrão**: `analysis` (Analisar Tópicos) se nenhum for selecionado
4. **Indicador visual**: Badge do template aparece no MapCard na galeria

---

## 7. Sistema de Tags

### Geração Automática via LLM

- Na **Etapa 1** (análise), o LLM retorna `suggested_tags` baseado no contexto
- Tags são strings curtas em português (ex: "tecnologia", "negócios", "história")
- Máximo de **5 tags sugeridas** por mapa

### Gerenciamento pelo Usuário

- ✅ Adicionar tags manualmente (input com autocomplete das tags existentes)
- ✅ Remover tags de um mapa
- ✅ Renomear tags (propaga para todos os mapas que usam a tag)
- ✅ Sidebar mostra todas as tags únicas com contagem
- ✅ Clicar em tag na sidebar filtra mapas na galeria

### Paleta de Cores (12 cores fixas)

As cores são **auto-atribuídas** usando hash do nome da tag:

```typescript
export const TAG_COLORS = [
  { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },  // Vermelho
  { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },  // Amarelo
  { bg: '#D1FAE5', text: '#065F46', border: '#A7F3D0' },  // Verde
  { bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE' },  // Azul
  { bg: '#E0E7FF', text: '#3730A3', border: '#C7D2FE' },  // Índigo
  { bg: '#EDE9FE', text: '#5B21B6', border: '#DDD6FE' },  // Violeta
  { bg: '#FCE7F3', text: '#9D174D', border: '#FBCFE8' },  // Rosa
  { bg: '#FFF7ED', text: '#9A3412', border: '#FED7AA' },  // Laranja
  { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },  // Verde claro
  { bg: '#ECFEFF', text: '#155E75', border: '#A5F3FC' },  // Ciano
  { bg: '#FDF4FF', text: '#86198F', border: '#F5D0FE' },  // Fúcsia
  { bg: '#F8FAFC', text: '#334155', border: '#E2E8F0' },  // Cinza
] as const;

// Atribuição determinística: hash do nome % 12
export function getTagColor(tagName: string): TagColor {
  const hash = tagName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return TAG_COLORS[hash % TAG_COLORS.length];
}
```

### Componente TagBadge

```tsx
// Renderiza: pill colorida com texto + botão X (se editável)
<TagBadge name="tecnologia" removable onRemove={() => {}} />
// → [🟢 tecnologia ✕]
```

---

## 8. Sistema de Chat Contextual

### Visão Geral

O chat permite ao usuário **conversar com a IA sobre o conteúdo do mapa mental**. Funciona como um assistente contextual que conhece toda a análise, estrutura do mapa e artigo gerado.

### Funcionalidades

- 💬 Perguntas e respostas sobre o conteúdo do mapa
- 🔍 Aprofundamento em subtópicos específicos
- 💡 Sugestões de perguntas geradas automaticamente (2-3)
- 📝 Respostas em markdown (formatadas)
- 🧹 Limpar histórico do chat
- 💾 Histórico persistido por mapa (localStorage)

### UI — Painel Flutuante

```
                                    ┌──────────────────────┐
                                    │ Chat           🧹 ↗ ✕│
                                    │                      │
                                    │ Experimente:         │
                                    │ ┌──────────────────┐ │
                                    │ │💬 Quais nichos   │ │
                                    │ │brasileiros têm   │ │
                                    │ │maior demanda?    │ │
                                    │ └──────────────────┘ │
                                    │ ┌──────────────────┐ │
                                    │ │💬 Como validar   │ │
                                    │ │o produto         │ │
                                    │ │rapidamente?      │ │
                                    │ └──────────────────┘ │
                                    │                      │
                                    │ ┌────────────────┐↑│ │
                                    │ │ Mensagem...    │  │ │
                                    │ └────────────────┘  │ │
                                    └──────────────────────┘
```

### Comportamento

1. **Botão flutuante** (💬) no canto inferior direito do MapPage
2. **Clique** abre o painel de chat (300px largura, 500px altura)
3. **Primeira abertura**: mostra 2-3 perguntas sugeridas
4. **Enviar mensagem**: envia para LLM com contexto do mapa
5. **Respostas**: renderizadas em markdown
6. **Histórico**: salvo no `SavedMap.chatMessages`
7. **Mobile**: abre como bottom sheet (full width)

### Tipos TypeScript

```typescript
// src/types/chat.ts

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;  // ISO 8601
}

export interface ChatSession {
  mapId: string;
  messages: ChatMessage[];
  suggestedQuestions: string[];
}
```

---

## 9. Ações Pós-Geração

### Wireframe do Banner

Após a geração do mapa, um banner flutuante aparece na parte inferior do canvas:

```
┌──────────────────────────────────────────────────────────────┐
│ ✅ Seu mapa mental está pronto!                           ✕  │
│ Deseja fazer algum ajuste?                                   │
│                                                              │
│ [≡ Mais conciso] [+ Detalhes] [🌐 Traduzir ▼] [🔄 Regenerar]│
└──────────────────────────────────────────────────────────────┘
```

### Tabela de Ações

| Ação | Ícone | Label (pt-BR) | Comportamento | Prompt Modifier |
|---|---|---|---|---|
| **Mais conciso** | ≡ | Mais conciso | Re-executa Etapas 1→2→3 | "Simplifique a análise. Use no máximo 15 nós. Foque apenas nos conceitos essenciais." |
| **Adicionar detalhes** | + | Adicionar detalhes | Re-executa Etapas 1→2→3 | "Aprofunde a análise. Use 40-60 nós. Adicione exemplos, dados e subconceitos." |
| **Traduzir para** | 🌐 | Traduzir para ▼ | Re-executa Etapas 2+3 | "Traduza todo o conteúdo para {idioma}. Mantenha a estrutura." |
| **Regenerar** | 🔄 | Regenerar | Re-executa todas as etapas | Mesmo prompt original |

### Idiomas do Dropdown "Traduzir para"

| Idioma | Código |
|---|---|
| Inglês | `en` |
| Espanhol | `es` |
| Francês | `fr` |
| Alemão | `de` |
| Italiano | `it` |
| Japonês | `ja` |
| Chinês (Simplificado) | `zh` |
| Coreano | `ko` |

### Comportamento do Banner

1. Aparece automaticamente após geração bem-sucedida
2. Pode ser fechado com o botão ✕
3. Reaparece ao clicar em "Ajustes" na toolbar
4. Desaparece durante regeneração (mostra loading)
5. Posição: fixo na parte inferior do canvas, centralizado

---

## 10. Sistema de Exportação

### Formatos Suportados

| Formato | Extensão | Método | Inclui Artigo |
|---|---|---|---|
| **PNG** | `.png` | `canvas.toDataURL('image/png')` | ❌ Não |
| **SVG** | `.svg` | Serialização DOM do mind-elixir | ❌ Não |
| **PDF** | `.pdf` | jsPDF + canvas image | ✅ Opcional |
| **Markdown** | `.md` | Traversal da árvore → outline | ✅ Opcional |

### Wireframe do Diálogo de Exportação

```
┌──────────────────────────────────────┐
│ 📤 Exportar Mapa Mental          ✕  │
│                                      │
│  ┌────────┬────────┬────────┬──────┐ │
│  │  PNG   │  SVG   │  PDF   │  MD  │ │
│  └────────┴────────┴────────┴──────┘ │
│                                      │
│  Preview:                            │
│  ┌──────────────────────────────┐    │
│  │                              │    │
│  │    [preview do mapa]         │    │
│  │                              │    │
│  └──────────────────────────────┘    │
│                                      │
│  Opções:                             │
│  ☑️ Incluir artigo (apenas PDF/MD)   │
│  ☑️ Incluir tags                     │
│  Qualidade: [Alta ▼]                 │
│                                      │
│         [Cancelar]  [⬇️ Exportar]    │
└──────────────────────────────────────┘
```

### Implementação por Formato

```typescript
// src/components/export/exportUtils.ts

/** Exporta o mapa como PNG */
export async function exportToPNG(mindElixirInstance: MindElixir): Promise<Blob> {
  const dataUrl = await mindElixirInstance.exportPng();
  return dataUrlToBlob(dataUrl);
}

/** Exporta o mapa como SVG */
export async function exportToSVG(mindElixirInstance: MindElixir): Promise<string> {
  return mindElixirInstance.exportSvg();
}

/** Exporta o mapa como PDF (com artigo opcional) */
export async function exportToPDF(
  mindElixirInstance: MindElixir,
  options: { includeArticle?: boolean; articleContent?: string; title?: string }
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'landscape' });
  // 1. Adiciona título
  // 2. Captura PNG do mapa e adiciona como imagem
  // 3. Se includeArticle, adiciona nova página com artigo formatado
  return doc.output('blob');
}

/** Exporta o mapa como Markdown (outline + artigo opcional) */
export function exportToMarkdown(
  mapData: MindElixirData,
  options: { includeArticle?: boolean; articleContent?: string; tags?: string[] }
): string {
  // Converte árvore do mapa em outline markdown:
  // # Tema Central
  // ## Subtópico 1
  // ### Conceito 1.1
  // ### Conceito 1.2
  // ## Subtópico 2
  // ...
  // ---
  // ## Artigo Detalhado
  // {articleContent}
}
```

### Nome do Arquivo Exportado

Formato: `{titulo-do-mapa}-{data}.{extensão}`

Exemplo: `inteligencia-artificial-2026-02-19.pdf`

---

## 11. Estrutura de Pastas

```
mindmap/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx              ← Layout 3 colunas + responsivo
│   │   │   ├── Sidebar.tsx               ← Colapsável (240px↔60px) / Drawer mobile
│   │   │   ├── DetailsPanel.tsx          ← Artigo + Tags + Export (painel direito)
│   │   │   └── Header.tsx                ← Header mobile com hamburger
│   │   ├── generation/
│   │   │   ├── InputPanel.tsx            ← Input + opções + checkbox imagem
│   │   │   ├── TemplateSelector.tsx      ← Grid de 8 templates
│   │   │   ├── ShuffleSuggestions.tsx     ← Sugestões aleatórias clicáveis
│   │   │   ├── MindMapCanvas.tsx         ← Wrapper do mind-elixir
│   │   │   ├── ImagePanel.tsx            ← Exibição da imagem gerada
│   │   │   └── PostGenActions.tsx        ← Banner pós-geração (4 ações)
│   │   ├── chat/
│   │   │   ├── ChatPanel.tsx             ← Painel flutuante / bottom sheet mobile
│   │   │   ├── ChatMessage.tsx           ← Bolha de mensagem (user/assistant)
│   │   │   ├── ChatInput.tsx             ← Input com botão enviar
│   │   │   └── SuggestedQuestions.tsx     ← Cards de perguntas sugeridas
│   │   ├── export/
│   │   │   ├── ExportDialog.tsx          ← Modal com tabs (PNG/SVG/PDF/MD)
│   │   │   └── exportUtils.ts            ← Lógica de exportação (4 formatos)
│   │   ├── maps/
│   │   │   ├── MapCard.tsx               ← Card individual na galeria
│   │   │   ├── MapGrid.tsx               ← Grid/lista de cards
│   │   │   ├── MapListItem.tsx           ← Item na visualização lista
│   │   │   └── TagBadge.tsx              ← Badge de tag colorida
│   │   └── ui/                           ← shadcn/ui (Button, Input, Dialog, etc.)
│   ├── pages/
│   │   ├── HomePage.tsx                  ← Input + templates + sugestões
│   │   ├── MapPage.tsx                   ← Canvas + artigo + chat + export
│   │   ├── AllMapsPage.tsx               ← Galeria de mapas com busca e filtros
│   │   └── SettingsPage.tsx              ← Configurações de API keys
│   ├── stores/
│   │   ├── settings-store.ts             ← API keys + preferências (persistido)
│   │   ├── maps-store.ts                 ← Coleção de mapas + tags + geração
│   │   ├── ui-store.ts                   ← Estado da UI (sidebar, view mode)
│   │   └── chat-store.ts                 ← Chat contextual por mapa
│   ├── services/
│   │   ├── llm/
│   │   │   ├── openrouter.ts             ← Cliente API OpenRouter
│   │   │   ├── openai.ts                 ← Cliente API OpenAI
│   │   │   └── prompts.ts               ← Todos os prompts (4 etapas + chat)
│   │   └── image/
│   │       └── replicate.ts              ← Cliente API Replicate
│   ├── types/
│   │   ├── mindmap.ts                    ← SavedMap + AnalysisResult
│   │   ├── settings.ts                   ← SettingsState
│   │   ├── templates.ts                  ← Template + TemplateType
│   │   ├── chat.ts                       ← ChatMessage + ChatSession
│   │   └── replicate.ts                  ← Replicate API types
│   ├── lib/
│   │   ├── constants.ts                  ← Templates, modelos, paleta tags, idiomas
│   │   └── utils.ts                      ← Helpers (slugify, formatDate, etc.)
│   ├── App.tsx                           ← Router + AppShell
│   ├── main.tsx                          ← Entry point
│   └── index.css                         ← Tailwind + custom styles
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts                        ← Proxy para Replicate (CORS)
├── tailwind.config.ts
└── components.json                       ← shadcn/ui config
```

### Contagem de Arquivos

| Categoria | Novos | Modificados | Total |
|---|---|---|---|
| Layout | 4 | 0 | 4 |
| Geração | 5 | 1 | 6 |
| Chat | 4 | 0 | 4 |
| Exportação | 2 | 0 | 2 |
| Galeria | 4 | 0 | 4 |
| Páginas | 2 | 2 | 4 |
| Stores | 2 | 2 | 4 |
| Serviços | 1 | 1 | 2 |
| Tipos | 3 | 2 | 5 |
| Config | 0 | 3 | 3 |
| **TOTAL** | **27** | **11** | **38** |

---

## 12. Tipos TypeScript

### `src/types/mindmap.ts`

```typescript
import type { MindElixirData } from 'mind-elixir';
import type { TemplateType } from './templates';
import type { ChatMessage } from './chat';

/** Mapa mental salvo no localStorage */
export interface SavedMap {
  id: string;                      // UUID v4
  title: string;                   // = central_theme da análise
  topic: string;                   // Input original do usuário
  template: TemplateType;          // Template utilizado
  mindMapData: MindElixirData;     // Dados do mind-elixir
  analysisData: AnalysisResult;    // Resultado da Etapa 1
  articleContent: string;          // Artigo markdown (Etapa 3)
  tags: string[];                  // Tags (auto-sugeridas + manuais)
  imageUrl?: string;               // URL da imagem (Replicate, opcional)
  chatMessages: ChatMessage[];     // Histórico do chat
  createdAt: string;               // ISO 8601
  updatedAt: string;               // ISO 8601
  thumbnail?: string;              // Data URL (canvas.toDataURL) para galeria
}

/** Resultado da Etapa 1 — Análise do Conteúdo */
export interface AnalysisResult {
  central_theme: string;
  subtopics: string[];
  key_concepts: string[];
  relationships: Array<{
    from: string;
    to: string;
    type: string;
  }>;
  depth_level: number;             // 2-4
  suggested_node_count: number;    // 15-60
  suggested_tags: string[];        // 2-5 tags sugeridas
  template_context: TemplateType;  // Template que gerou esta análise
}
```

### `src/types/templates.ts`

```typescript
export type TemplateType =
  | 'brainstorm'
  | 'outline'
  | 'project'
  | 'strategy'
  | 'concept'
  | 'analysis'
  | 'timeline'
  | 'reading';

export interface Template {
  id: TemplateType;
  icon: string;
  name: string;
  description: string;
  promptModifier: string;
  structureHint: string;
}
```

### `src/types/chat.ts`

```typescript
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatSession {
  mapId: string;
  messages: ChatMessage[];
  suggestedQuestions: string[];
}
```

### `src/types/settings.ts`

```typescript
export type LLMProvider = 'openrouter' | 'openai';

export interface SettingsState {
  // LLM
  llmProvider: LLMProvider;
  openrouterApiKey: string;
  openrouterModel: string;
  openaiApiKey: string;
  openaiModel: string;

  // Replicate (imagens)
  replicateApiKey: string;
  replicateModel: string;          // ex: 'black-forest-labs/flux-schnell'

  // Preferências
  defaultTemplate: TemplateType;
  generateImageByDefault: boolean;
  language: string;                // 'pt-BR' padrão

  // Actions
  setOpenRouterKey: (key: string) => void;
  setOpenAIKey: (key: string) => void;
  setReplicateKey: (key: string) => void;
  setLLMProvider: (provider: LLMProvider) => void;
  setModel: (model: string) => void;
  setReplicateModel: (model: string) => void;
}
```

### `src/types/replicate.ts`

```typescript
export interface ReplicateInput {
  prompt: string;
  width?: number;
  height?: number;
  num_outputs?: number;
  output_format?: 'webp' | 'jpg' | 'png';
}

export interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string[];
  error?: string;
}
```

---

## 13. Stores Zustand

### `src/stores/maps-store.ts`

```typescript
interface MapsStore {
  // Estado
  maps: SavedMap[];
  currentMapId: string | null;
  generationStatus: GenerationStatus;  // 'idle' | 'analyzing' | 'generating' | 'article' | 'image' | 'done' | 'error'
  generationError: string | null;

  // Getters
  currentMap: SavedMap | null;
  allTags: string[];                   // Tags únicas de todos os mapas

  // CRUD
  addMap: (map: SavedMap) => void;
  updateMap: (id: string, updates: Partial<SavedMap>) => void;
  deleteMap: (id: string) => void;
  setCurrentMap: (id: string | null) => void;

  // Tags
  addTagToMap: (mapId: string, tag: string) => void;
  removeTagFromMap: (mapId: string, tag: string) => void;

  // Geração
  setGenerationStatus: (status: GenerationStatus) => void;
  setGenerationError: (error: string | null) => void;
  generateMap: (topic: string, template: TemplateType, generateImage: boolean) => Promise<string>;
}
```

### `src/stores/settings-store.ts`

```typescript
// Persiste no localStorage via zustand/middleware persist
interface SettingsStore extends SettingsState {
  // Todas as actions definidas em SettingsState
}
```

### `src/stores/ui-store.ts`

```typescript
interface UIStore {
  // Sidebar
  sidebarOpen: boolean;            // Mobile: drawer aberto/fechado
  sidebarCollapsed: boolean;       // Desktop: 240px vs 60px
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;

  // Galeria
  viewMode: 'grid' | 'list';
  sortBy: 'date' | 'title' | 'template';
  filterTag: string | null;
  searchQuery: string;
  setViewMode: (mode: 'grid' | 'list') => void;
  setSortBy: (sort: 'date' | 'title' | 'template') => void;
  setFilterTag: (tag: string | null) => void;
  setSearchQuery: (q: string) => void;

  // Post-gen banner
  showPostGenBanner: boolean;
  setShowPostGenBanner: (v: boolean) => void;

  // Export dialog
  exportDialogOpen: boolean;
  setExportDialogOpen: (v: boolean) => void;
}
```

### `src/stores/chat-store.ts`

```typescript
interface ChatStore {
  // Estado
  sessions: Record<string, ChatSession>;  // keyed by mapId
  chatOpen: boolean;
  activeMapId: string | null;

  // Getters
  currentSession: ChatSession | null;

  // Actions
  openChat: (mapId: string) => void;
  closeChat: () => void;
  sendMessage: (mapId: string, content: string, mapContext: MapContext) => Promise<void>;
  clearSession: (mapId: string) => void;
  setSuggestedQuestions: (mapId: string, questions: string[]) => void;
  generateSuggestions: (mapId: string, mapContext: MapContext) => Promise<void>;
}

interface MapContext {
  title: string;
  central_theme: string;
  subtopics: string[];
  key_concepts: string[];
  articleContent: string;
}
```

---

## 14. Prompts LLM

### Etapa 1 — Análise

```
Você é um especialista em análise de conteúdo e criação de mapas mentais.
Analise o seguinte tópico e retorne um JSON estruturado.

TÓPICO: {topic}
TEMPLATE: {templateModifier}

Retorne APENAS o JSON, sem markdown, sem explicações:
{
  "central_theme": "string",
  "subtopics": ["string"],
  "key_concepts": ["string"],
  "relationships": [{"from": "string", "to": "string", "type": "string"}],
  "depth_level": number,
  "suggested_node_count": number,
  "suggested_tags": ["string"],
  "template_context": "string"
}
```

### Etapa 2 — Mapa Mental (MindElixir JSON)

```
Você é um especialista em criação de mapas mentais.
Com base na análise abaixo, crie um mapa mental no formato mind-elixir.

ANÁLISE: {analysisJSON}

Retorne APENAS o JSON no formato MindElixirData, sem markdown:
{
  "nodeData": {
    "id": "root",
    "topic": "{central_theme}",
    "children": [...]
  }
}
```

### Etapa 3 — Artigo (Cadeia de Pensamentos)

```
Você é um escritor especialista. Com base na análise abaixo, escreva um artigo
detalhado em português brasileiro (1000-2000 palavras) sobre o tema.

ANÁLISE: {analysisJSON}

O artigo deve ter:
- Título (# {central_theme})
- Introdução envolvente
- Seções para cada subtópico (## headers)
- Subseções para conceitos (### headers)
- Exemplos práticos e insights
- Conclusão

Escreva em markdown.
```

### Chat — System Prompt

```
Você é um assistente especialista analisando o seguinte mapa mental.
Responda em português brasileiro. Seja conciso e direto.

TEMA: {title}
SUBTÓPICOS: {subtopics}
CONCEITOS-CHAVE: {key_concepts}

ARTIGO DE REFERÊNCIA:
{articleContent}

Responda perguntas sobre este conteúdo, aprofunde tópicos específicos
e ajude o usuário a entender melhor o tema.
```

### Sugestões de Perguntas

```
Com base no mapa mental sobre "{title}", gere 3 perguntas interessantes
que o usuário poderia fazer para aprofundar seu entendimento.

Retorne APENAS um array JSON:
["pergunta 1", "pergunta 2", "pergunta 3"]
```

---

## 15. Wireframes Detalhados

### HomePage (`/`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ SIDEBAR (240px)          │ MAIN CONTENT                                  │
│                          │                                               │
│ 🧠 MindMap Generator     │  ┌─────────────────────────────────────────┐  │
│                          │  │                                         │  │
│ [+ Perguntar]            │  │   Pergunte Qualquer Coisa               │  │
│                          │  │   Pesquise sobre qualquer tópico...     │  │
│ ─────────────────        │  │                                         │  │
│ Recentes                 │  │  ┌───────────────────────────────────┐  │  │
│  📄 Inteligência...      │  │  │ 🔍 Digite sua pergunta ou tópico  │  │  │
│  📄 Marketing Dig...     │  │  │                                   │  │  │
│  📄 Python Básico        │  │  └───────────────────────────────────┘  │  │
│                          │  │  ☐ Gerar imagem ilustrativa             │  │
│ ─────────────────        │  │  [🧠 Gerar Mapa Mental]                 │  │
│ Tags                     │  │                                         │  │
│  🟢 tecnologia (5)       │  │  Templates:                             │  │
│  🔵 negócios (3)         │  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │  │
│  🟡 história (2)         │  │  │  💡  │ │  📋  │ │  📅  │ │  🎯  │  │  │
│                          │  │  │Brain │ │Estru │ │Proje │ │Estra │  │  │
│ ─────────────────        │  │  └──────┘ └──────┘ └──────┘ └──────┘  │  │
│ [⚙️ Configurações]       │  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │  │
│                          │  │  │  🔍  │ │  📊  │ │  ⏳  │ │  📖  │  │  │
│                          │  │  │Expli │ │Anali │ │Linha │ │Notas │  │  │
│                          │  │  └──────┘ └──────┘ └──────┘ └──────┘  │  │
│                          │  │                                         │  │
│                          │  │  Sugestões: [🔀]                        │  │
│                          │  │  ┌──────────────────────────────────┐  │  │
│                          │  │  │ 💡 Como funciona a IA generativa? │  │  │
│                          │  │  │ 💡 Estratégias de marketing 2026  │  │  │
│                          │  │  │ 💡 Fundamentos de Python          │  │  │
│                          │  │  └──────────────────────────────────┘  │  │
│                          │  └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### MapPage (`/map/:id`)

```
┌──────────────┬──────────────────────────────────┬──────────────────────┐
│ SIDEBAR      │ CANVAS (flex-1)                   │ DETAILS (320px)      │
│ (240px)      │                                   │                      │
│              │ [← Voltar] [Exportar] [Ajustes]   │ Detalhes             │
│ 🧠 MindMap   │                                   │ ─────────────────    │
│              │ ┌─────────────────────────────┐   │ Tags:                │
│ [+ Perguntar]│ │                             │   │ [🟢 tecnologia ✕]    │
│              │ │                             │   │ [🔵 ia ✕]            │
│ Recentes     │ │    [MIND MAP CANVAS]        │   │ [+ Adicionar tag]    │
│  📄 atual ←  │ │                             │   │                      │
│  📄 outro    │ │                             │   │ ─────────────────    │
│              │ │                             │   │ Artigo:              │
│ Tags         │ └─────────────────────────────┘   │                      │
│  🟢 tecno(5) │                                   │ # Inteligência...    │
│              │ ┌─────────────────────────────┐   │                      │
│              │ │ ✅ Mapa pronto! Ajustar?    │   │ ## Machine Learning  │
│              │ │ [≡Conciso][+Det][🌐Trad][🔄]│   │ O machine learning   │
│              │ └─────────────────────────────┘   │ é uma subárea...     │
│              │                                   │                      │
│              │                          [💬]     │ ## Deep Learning     │
│              │                                   │ ...                  │
└──────────────┴──────────────────────────────────┴──────────────────────┘
```

### AllMapsPage (`/maps`)

```
┌──────────────┬──────────────────────────────────────────────────────────┐
│ SIDEBAR      │ TODOS OS MAPAS                                            │
│              │                                                           │
│              │ [🔍 Buscar mapas...]  [⊞ Grid] [☰ Lista]  [Ordenar ▼]   │
│              │                                                           │
│              │ Filtrar: [Todos] [🟢 tecnologia] [🔵 negócios] [🟡 hist] │
│              │                                                           │
│              │ Hoje                                                      │
│              │ ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│              │ │[thumbnail]│ │[thumbnail]│ │[thumbnail]│                 │
│              │ │           │ │           │ │           │                 │
│              │ │IA Generati│ │Marketing  │ │Python     │                 │
│              │ │[📊][🟢ia] │ │[🎯][🔵neg]│ │[🔍][🟢tec]│                │
│              │ │14:32      │ │13:15      │ │11:00      │                 │
│              │ └──────────┘ └──────────┘ └──────────┘                  │
│              │                                                           │
│              │ Ontem                                                     │
│              │ ┌──────────┐ ┌──────────┐                                │
│              │ │[thumbnail]│ │[thumbnail]│                               │
│              │ │...        │ │...        │                               │
│              │ └──────────┘ └──────────┘                                │
└──────────────┴──────────────────────────────────────────────────────────┘
```

---

## 16. Constantes e Configurações

### `src/lib/constants.ts`

```typescript
// Modelos LLM disponíveis
export const OPENROUTER_MODELS = [
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
] as const;

export const OPENAI_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'o1-mini', name: 'o1 Mini' },
] as const;

export const REPLICATE_MODELS = [
  { id: 'black-forest-labs/flux-schnell', name: 'Flux Schnell (Rápido)' },
  { id: 'black-forest-labs/flux-dev', name: 'Flux Dev (Qualidade)' },
  { id: 'stability-ai/sdxl', name: 'SDXL' },
] as const;

// Sugestões aleatórias (embaralhadas a cada visita)
export const SUGGESTIONS = [
  'Como funciona a inteligência artificial generativa?',
  'Estratégias de marketing digital para 2026',
  'Fundamentos de programação em Python',
  'História da Revolução Industrial',
  'Como criar um plano de negócios',
  'Conceitos de física quântica',
  'Técnicas de meditação e mindfulness',
  'Desenvolvimento sustentável e ESG',
  'Psicologia cognitiva e comportamental',
  'Blockchain e criptomoedas',
  'Nutrição e alimentação saudável',
  'Gestão de projetos ágeis (Scrum/Kanban)',
] as const;

// Configurações do Replicate
export const REPLICATE_POLL_INTERVAL_MS = 2000;
export const REPLICATE_TIMEOUT_MS = 120000;
export const REPLICATE_IMAGE_WIDTH = 1280;
export const REPLICATE_IMAGE_HEIGHT = 720;
```

---

## 17. Dependências (package.json)

### Dependências de Produção

| Pacote | Versão | Finalidade |
|---|---|---|
| `react` | ^19.0 | Framework UI |
| `react-dom` | ^19.0 | Renderização DOM |
| `react-router-dom` | ^7.x | Roteamento SPA |
| `mind-elixir` | ^5.x | Renderização de mapas mentais |
| `zustand` | ^5.x | Gerenciamento de estado |
| `lucide-react` | ^0.x | Ícones |
| `uuid` | ^11.x | Geração de IDs únicos |
| `date-fns` | ^4.x | Formatação de datas (pt-BR) |
| `react-markdown` | ^9.x | Renderização do artigo markdown |
| `jspdf` | ^2.x | Exportação PDF |
| `html2canvas` | ^1.x | Captura de canvas para PDF |
| `@radix-ui/react-dialog` | latest | Modal (via shadcn/ui) |
| `@radix-ui/react-dropdown-menu` | latest | Dropdown (via shadcn/ui) |
| `@radix-ui/react-tabs` | latest | Tabs (via shadcn/ui) |
| `@radix-ui/react-tooltip` | latest | Tooltips (via shadcn/ui) |
| `class-variance-authority` | ^0.x | Variantes de classes (shadcn/ui) |
| `clsx` | ^2.x | Merge de classes CSS |
| `tailwind-merge` | ^2.x | Merge inteligente de Tailwind |

### Dependências de Desenvolvimento

| Pacote | Versão | Finalidade |
|---|---|---|
| `vite` | ^6.x | Build tool + dev server |
| `@vitejs/plugin-react` | ^4.x | Plugin React para Vite |
| `typescript` | ^5.x | Tipagem estática |
| `tailwindcss` | ^4.x | CSS utility-first |
| `@tailwindcss/vite` | ^4.x | Plugin Tailwind para Vite |
| `@types/react` | ^19.x | Tipos React |
| `@types/react-dom` | ^19.x | Tipos React DOM |
| `@types/uuid` | ^10.x | Tipos UUID |

### Comando de Instalação

```bash
# Inicializar projeto
npm create vite@latest mindmap -- --template react-ts
cd mindmap

# Instalar dependências principais
npm install react-router-dom mind-elixir zustand uuid date-fns react-markdown jspdf html2canvas lucide-react

# Instalar Tailwind CSS v4
npm install tailwindcss @tailwindcss/vite

# Instalar shadcn/ui (interativo)
npx shadcn@latest init

# Adicionar componentes shadcn/ui necessários
npx shadcn@latest add button input dialog tabs tooltip dropdown-menu badge scroll-area separator
```

---

## 18. Fases de Implementação

### Fase 1 — Infraestrutura (Dia 1)

**Objetivo**: Projeto rodando com layout base e navegação

- [ ] Inicializar projeto Vite + React + TypeScript
- [ ] Configurar Tailwind CSS v4
- [ ] Inicializar shadcn/ui
- [ ] Criar tipos TypeScript (`mindmap.ts`, `templates.ts`, `chat.ts`, `settings.ts`, `replicate.ts`)
- [ ] Criar stores Zustand (`maps-store`, `settings-store`, `ui-store`, `chat-store`)
- [ ] Criar `AppShell.tsx` (layout 3 colunas)
- [ ] Criar `Sidebar.tsx` (colapsável + drawer mobile)
- [ ] Criar `Header.tsx` (mobile)
- [ ] Configurar React Router (4 rotas)
- [ ] Criar `constants.ts` e `utils.ts`

### Fase 2 — HomePage (Dia 2)

**Objetivo**: Tela inicial funcional com templates e sugestões

- [ ] Criar `InputPanel.tsx` (textarea + checkbox imagem + botão gerar)
- [ ] Criar `TemplateSelector.tsx` (grid 8 templates)
- [ ] Criar `ShuffleSuggestions.tsx` (3 sugestões aleatórias)
- [ ] Criar `HomePage.tsx` (composição dos componentes)
- [ ] Integrar com `ui-store` (template selecionado)

### Fase 3 — Pipeline LLM (Dia 3)

**Objetivo**: Geração completa de mapas funcionando

- [ ] Criar `src/services/llm/prompts.ts` (todos os prompts)
- [ ] Criar `src/services/llm/openrouter.ts` (cliente API)
- [ ] Criar `src/services/llm/openai.ts` (cliente API)
- [ ] Criar `src/services/image/replicate.ts` (cliente + polling)
- [ ] Implementar `generateMap()` no `maps-store`
- [ ] Configurar proxy Vite para Replicate (`vite.config.ts`)
- [ ] Criar `SettingsPage.tsx` (3 campos de API key)

### Fase 4 — MapPage (Dia 4)

**Objetivo**: Visualização completa do mapa gerado

- [ ] Criar `MindMapCanvas.tsx` (wrapper mind-elixir)
- [ ] Criar `DetailsPanel.tsx` (artigo + tags)
- [ ] Criar `TagBadge.tsx` (badge colorida)
- [ ] Criar `ImagePanel.tsx` (exibição imagem Replicate)
- [ ] Criar `PostGenActions.tsx` (banner 4 ações)
- [ ] Criar `MapPage.tsx` (composição)
- [ ] Implementar geração de thumbnail (`canvas.toDataURL`)

### Fase 5 — Chat Contextual (Dia 5)

**Objetivo**: Chat funcional com contexto do mapa

- [ ] Criar `ChatPanel.tsx` (painel flutuante)
- [ ] Criar `ChatMessage.tsx` (bolha de mensagem)
- [ ] Criar `ChatInput.tsx` (input + enviar)
- [ ] Criar `SuggestedQuestions.tsx` (cards de sugestões)
- [ ] Implementar `sendMessage()` e `generateSuggestions()` no `chat-store`
- [ ] Integrar com `MapPage.tsx`

### Fase 6 — Exportação (Dia 6)

**Objetivo**: Exportação em 4 formatos funcionando

- [ ] Criar `exportUtils.ts` (PNG, SVG, PDF, Markdown)
- [ ] Criar `ExportDialog.tsx` (modal com tabs)
- [ ] Integrar com `MapPage.tsx`
- [ ] Testar todos os formatos

### Fase 7 — AllMapsPage (Dia 7)

**Objetivo**: Galeria de mapas com busca e filtros

- [ ] Criar `MapCard.tsx` (card com thumbnail)
- [ ] Criar `MapGrid.tsx` (grid responsivo)
- [ ] Criar `MapListItem.tsx` (item lista)
- [ ] Criar `AllMapsPage.tsx` (busca + filtros + ordenação)
- [ ] Implementar filtro por tag
- [ ] Implementar busca por texto

### Fase 8 — Responsividade + Polish (Dia 8)

**Objetivo**: App polido e responsivo em mobile

- [ ] Sidebar como drawer no mobile (Sheet do shadcn/ui)
- [ ] MapPage com tabs no mobile (Canvas / Artigo / Chat)
- [ ] Testar em viewport 375px (iPhone SE)
- [ ] Testar em viewport 768px (iPad)
- [ ] Ajustar tipografia e espaçamentos
- [ ] Adicionar animações de transição (Tailwind)
- [ ] Revisar acessibilidade (aria-labels, focus)
- [ ] Testar fluxo completo end-to-end

---

## 19. Decisões de Design

| Decisão | Escolha | Justificativa |
|---|---|---|
| **Sidebar colapsável** | ✅ Sim (240px ↔ 60px) | Mais espaço para o canvas |
| **Thumbnails** | `canvas.toDataURL()` | Sem dependência externa |
| **Cores das tags** | Auto-atribuídas (hash % 12) | Consistência + sem configuração |
| **Responsividade** | Mobile-first + sidebar drawer | Melhor UX em mobile |
| **Persistência** | localStorage (Zustand persist) | Sem backend necessário |
| **LLM Provider** | OpenRouter (padrão) + OpenAI | Flexibilidade de modelos |
| **Imagens** | Replicate Flux Schnell | Rápido + qualidade |
| **Exportação PDF** | jsPDF + canvas | Sem servidor necessário |
| **Artigo** | react-markdown | Renderização segura de MD |
| **Idioma** | pt-BR em toda a interface | Público-alvo brasileiro |
| **Etapas 2+3** | Paralelas (Promise.all) | Reduz tempo de geração |
| **Chat** | Painel flutuante | Não obstrui o canvas |
| **Tags** | Geradas por LLM + editáveis | Facilidade + controle |
| **Templates** | 8 opções pré-definidas | Cobre casos de uso principais |
| **Proxy CORS** | Vite dev proxy | Simples para desenvolvimento |

---

## 20. Referências e Inspirações

- **Mapify** (https://mapify.so) — Inspiração principal de UX/UI
- **mind-elixir** (https://github.com/ssshooter/mind-elixir-core) — Biblioteca de mapas mentais
- **shadcn/ui** (https://ui.shadcn.com) — Componentes UI
- **Replicate** (https://replicate.com) — API de geração de imagens
- **OpenRouter** (https://openrouter.ai) — Agregador de LLMs
- **Zustand** (https://zustand-demo.pmnd.rs) — Gerenciamento de estado

---

*Documento gerado em: 2026-02-19*
*Versão: 1.0.0*
*Status: Planejamento completo — pronto para implementação*