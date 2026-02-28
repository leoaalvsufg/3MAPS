import type { AnalysisResult } from '@/types/mindmap';
import type { TemplateId } from '@/types/templates';
import { TEMPLATES } from '@/lib/constants';

/** Instrução global: avaliar e, se necessário, precisar a pergunta antes de responder. */
const EVALUATE_QUESTION_INSTRUCTION = `
Avalie a pergunta/tópico: se estiver vago, amplo ou ambíguo, interprete de forma mais precisa e estruturada antes de prosseguir.
Responda de forma direta, sem redundâncias, com estrutura clara. Evite tom jornalístico ou decorativo.`;

/**
 * Refina a pergunta do usuário para reanálise (pensamento profundo).
 * Retorna apenas o texto refinado, sem JSON.
 */
export function getQueryRefinementPrompt(rawQuery: string, contextFromPreflight?: string): string {
  const ctx = (contextFromPreflight ?? '').trim();
  return `Você é um especialista em formulação de problemas e tópicos de estudo.

TAREFA: Reformule o tópico abaixo em uma pergunta ou enunciado mais preciso, profundo e estruturado para análise.
- Elimine ambiguidades e escopo excessivamente amplo.
- Mantenha a intenção original; não invente temas novos.
- Resultado: uma única frase ou no máximo 2–3 frases curtas, diretas, sem redundância.

TÓPICO ORIGINAL: ${rawQuery}
${ctx ? `CONTEXTO (fontes/recomendações do pré-voo):\n${ctx}\n` : ''}

Retorne APENAS o texto refinado, sem prefixos como "Tópico refinado:" ou "Reformulação:".`;
}

export function getAnalysisPrompt(
	topic: string,
	templateId: TemplateId,
	extraContext?: string
): string {
  const template = TEMPLATES.find((t) => t.id === templateId);
  const modifier = template?.promptModifier ?? '';
	const ctx = (extraContext ?? '').trim();

  return `Você é um especialista em análise conceptual e criação de mapas mentais.
${EVALUATE_QUESTION_INSTRUCTION}

TÓPICO: ${topic}
ORIENTAÇÃO DO TEMPLATE: ${modifier}

${ctx ? `CONTEXTO ADICIONAL (referência; não copie literalmente):\n${ctx}\n` : ''}

Faça uma análise profunda e estruturada. Extraia conceitos, relações e hierarquia. Evite listas genéricas ou tom superficial.
Retorne APENAS o JSON válido, sem markdown, sem explicações, sem blocos de código:
{
  "central_theme": "string",
  "subtopics": ["string"],
  "key_concepts": ["string"],
  "relationships": [{"from": "string", "to": "string", "type": "string"}],
  "depth_level": 3,
  "suggested_node_count": 25,
  "suggested_tags": ["string"],
  "template_context": "${templateId}"
}`;
}

/** Prompt para análise de vídeo YouTube → JSON de análise */
export function getYouTubeAnalysisPrompt(videoUrl: string, additionalPrompt: string): string {
  const extra = additionalPrompt.trim();
  return `Você é um especialista em análise conceptual e criação de mapas mentais.

Assista/analise o vídeo do YouTube abaixo e extraia as principais ideias para um mapa mental.
${extra ? `\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${extra}\n` : ''}

VÍDEO: ${videoUrl}

Faça uma análise profunda e estruturada. Extraia conceitos, relações e hierarquia.
Retorne APENAS o JSON válido, sem markdown, sem explicações, sem blocos de código:
{
  "central_theme": "string",
  "subtopics": ["string"],
  "key_concepts": ["string"],
  "relationships": [{"from": "string", "to": "string", "type": "string"}],
  "depth_level": 3,
  "suggested_node_count": 25,
  "suggested_tags": ["string"],
  "template_context": "padrao"
}`;
}

/** Prompt para análise de imagem → JSON de análise */
export function getImageAnalysisPrompt(additionalPrompt: string): string {
  const extra = additionalPrompt.trim();
  return `Você é um especialista em análise conceptual e criação de mapas mentais.

Analise a imagem anexada e extraia as principais ideias para um mapa mental.
Interprete de forma multimodal:
- Se houver texto legível (OCR), extraia e organize os pontos principais.
- Se houver diagrama/representação visual (ex.: pirâmides, fluxos, organogramas), descreva a estrutura e o significado de cada parte.
- Se houver mistura de texto e elementos visuais, combine ambos em uma análise única e coerente.
- Evite inventar conteúdo que não aparece na imagem; sinalize incerteza quando necessário.
${extra ? `\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${extra}\n` : ''}

Faça uma análise profunda e estruturada. Extraia conceitos, relações e hierarquia visíveis na imagem.
Retorne APENAS o JSON válido, sem markdown, sem explicações, sem blocos de código:
{
  "central_theme": "string",
  "subtopics": ["string"],
  "key_concepts": ["string"],
  "relationships": [{"from": "string", "to": "string", "type": "string"}],
  "depth_level": 3,
  "suggested_node_count": 25,
  "suggested_tags": ["string"],
  "template_context": "padrao"
}`;
}

export function getMindMapPrompt(analysis: AnalysisResult): string {
  return `Você é um especialista em mapas mentais hierárquicos e estruturação conceptual.
${EVALUATE_QUESTION_INSTRUCTION}

Com base na análise abaixo, crie um mapa mental: direto, sem redundância, com rótulos claros e conceituais.

TEMA CENTRAL: ${analysis.central_theme}
SUBTÓPICOS: ${analysis.subtopics.join(', ')}
CONCEITOS-CHAVE: ${analysis.key_concepts.join(', ')}
PROFUNDIDADE: ${analysis.depth_level} níveis
NÚMERO DE NÓS: aproximadamente ${analysis.suggested_node_count}

Retorne APENAS o JSON válido. Sem markdown, sem blocos de código, sem texto antes ou depois.

Formato EXATO:
{
  "nodeData": {
    "id": "root",
    "topic": "${analysis.central_theme}",
    "children": [
      {
        "id": "node_1",
        "topic": "Subtópico 1",
        "children": [
          {
            "id": "node_1_1",
            "topic": "Detalhe 1.1",
            "children": [
              {"id": "node_1_1_1", "topic": "Sub-detalhe"}
            ]
          },
          {"id": "node_1_2", "topic": "Detalhe 1.2"}
        ]
      },
      {
        "id": "node_2",
        "topic": "Subtópico 2",
        "children": [
          {"id": "node_2_1", "topic": "Detalhe 2.1"}
        ]
      }
    ]
  }
}

Regras:
1. Estrutura: um objeto com chave "nodeData" contendo a árvore.
2. Cada nó: "id" (único, formato "node_N" ou "node_N_N") e "topic" (curto, máx 50 caracteres, conceitual).
3. Raiz: id "root".
4. Nós folha: omita a chave "children".
5. ${analysis.subtopics.length} ramos principais (um por subtópico); 2–5 sub-nós por ramo com conteúdo relevante.
6. Português brasileiro. Nenhum campo extra (direction, theme, style, linkData, arrows).`;
}

export function getArticlePrompt(analysis: AnalysisResult): string {
  return `Você é um autor de conteúdo técnico e didático.
${EVALUATE_QUESTION_INSTRUCTION}

Com base na análise abaixo, escreva um artigo em português brasileiro: direto, estruturado, sem redundância e sem tom jornalístico.
Evite frases de efeito, introduções longas e conclusões genéricas. Priorize clareza e densidade de informação.

ANÁLISE: ${JSON.stringify(analysis, null, 2)}

Formatação (obrigatório):
1) Retorne APENAS Markdown. Sem blocos de código, sem JSON, sem texto meta.
2) Estrutura:
   - H1: # ${analysis.central_theme}
   - Introdução objetiva (1–2 parágrafos curtos; vá direto ao ponto)
   - Uma seção ## por subtópico; ### por conceito-chave quando fizer sentido
   - Listas em bullets onde ajudar (mínimo 1 por seção principal)
   - Resumo final em bullets (síntese, não repetição)
3) Marcadores opcionais (✅ ⚠️ 📌 🔹) de forma consistente.
4) NÃO inclua imagens nem URLs de imagem.

Conteúdo: informativo, preciso, mínimo ~800 palavras. Sem filler nem frases decorativas.`;
}

/**
 * Prompt mestre para modo aprofundado: gera guia técnico completo com estrutura fixa.
 */
export function getDeepGuideArticlePrompt(topic: string, additionalContext?: string): string {
  const cleanTopic = topic.trim() || 'Tema técnico';
  const extra = (additionalContext ?? '').trim();

  return `Contexto e Persona:
Atue como um Engenheiro de Software Sênior e Tech Lead especializado na criação de arquiteturas de ponta. Sua tarefa é escrever um relatório técnico ou "Guia Completo" sobre ${cleanTopic}.

Tom e Estilo:
O tom deve ser técnico, pragmático, direto e voltado para desenvolvedores e arquitetos de software.
Evite jargões vazios; prefira explicar a engenharia por trás da tecnologia.
Formate a saída em Markdown com hierarquia clara de títulos, bullet points e textos em negrito para destacar termos técnicos.

Estrutura Obrigatória do Documento:

1. Título e Resumo Executivo:
Crie um título profissional.
Explique o que é a tecnologia de forma pragmática e descreva os principais problemas de engenharia ou de negócio que ela resolve.

2. Fundamentos e Analogia Didática:
Explique o funcionamento central da tecnologia utilizando uma analogia simples e de fácil compreensão do mundo real.

3. Arquitetura e Fluxo de Dados:
Detalhe os estágios críticos do pipeline ou da arquitetura da tecnologia.
Crie um fluxo lógico de 4 a 5 etapas sequenciais, explicando rapidamente o que ocorre em cada fase.
Crie uma estrutura em texto que simule um mapa mental ou um diagrama de blocos.

4. Desenvolvimento Prático (Implementação Hands-on):
Apresente um guia prático de implementação usando a stack tecnológica padrão de mercado atual para essa área.
Liste as ferramentas sugeridas e mencione alternativas open-source.
Estruture um passo a passo conceitual de como o código ou o fluxo de desenvolvimento seria montado em um ambiente como Python.

5. Minúcias e Otimização para Produção (Tópicos Avançados):
Esta é a seção mais importante.
Vá além do código básico e explique as técnicas avançadas necessárias para levar essa tecnologia de uma Prova de Conceito (PoC) para um ambiente de produção escalável e seguro.
Discuta gargalos comuns e estratégias modernas de otimização.
Cite 3 ou 4 conceitos avançados específicos da área.

6. Referências Bibliográficas:
Forneça uma lista de 10 a 15 referências técnicas no formato de links de documentações oficiais, artigos acadêmicos (ex: arXiv), publicações de grandes empresas de tecnologia e tutoriais relevantes.

${extra ? `Contexto adicional disponível (use para melhorar precisão):\n${extra}\n` : ''}

Regras de saída (obrigatórias):
- Retorne APENAS Markdown (sem JSON, sem blocos de código com instruções meta).
- Use cabeçalhos no formato:
  - # Título profissional
  - ## 1. Título e Resumo Executivo
  - ## 2. Fundamentos e Analogia Didática
  - ## 3. Arquitetura e Fluxo de Dados
  - ## 4. Desenvolvimento Prático (Implementação Hands-on)
  - ## 5. Minúcias e Otimização para Produção (Tópicos Avançados)
  - ## 6. Referências Bibliográficas
- Na seção 6, inclua 10 a 15 referências com links HTTP/HTTPS válidos.
- Idioma: português brasileiro.`;
}

export function getChatSystemPrompt(
  title: string,
  analysis: AnalysisResult,
  articleContent: string
): string {
  return `Você é um assistente especialista no conteúdo do mapa mental abaixo.
${EVALUATE_QUESTION_INSTRUCTION}

Responda em português brasileiro: conciso, direto, estruturado. Sem rodeios nem repetição do que o usuário disse.

TEMA: ${title}
SUBTÓPICOS: ${analysis.subtopics.join(', ')}
CONCEITOS-CHAVE: ${analysis.key_concepts.join(', ')}

REFERÊNCIA (artigo):
${articleContent.slice(0, 3000)}

Responda às perguntas com precisão; aprofunde quando pedido. Priorize clareza e utilidade.`;
}

export function getSuggestionsPrompt(title: string, subtopics: string[]): string {
  return `Com base no mapa mental "${title}" (subtópicos: ${subtopics.slice(0, 5).join(', ')}), gere 3 perguntas que levem a respostas profundas e úteis.
As perguntas devem ser específicas, conceituais e evitar obviedades. Objetivo: aprofundar o entendimento do tema.

Retorne APENAS um array JSON válido, sem markdown:
["pergunta 1", "pergunta 2", "pergunta 3"]`;
}

export const TRANSLATE_TARGET_LANGUAGES: Array<{ id: string; name: string }> = [
  { id: 'en', name: 'Inglês' },
  { id: 'es', name: 'Espanhol' },
  { id: 'fr', name: 'Francês' },
  { id: 'de', name: 'Alemão' },
  { id: 'it', name: 'Italiano' },
  { id: 'pt', name: 'Português' },
  { id: 'ja', name: 'Japonês' },
  { id: 'zh', name: 'Chinês' },
];

export function getPostGenPrompt(
  action: 'conciso' | 'detalhado' | 'traduzir' | 'regenerar',
  analysis: AnalysisResult,
  targetLang?: string
): string {
  const langName = (targetLang && TRANSLATE_TARGET_LANGUAGES.find((l) => l.id === targetLang)?.name) ?? 'inglês';
  const actionInstructions = {
    conciso: `Recrie o mapa de forma CONCISA: no máximo 15 nós, apenas conceitos essenciais. Texto direto, sem redundância.`,
    detalhado: `Recrie o mapa com MAIS PROFUNDIDADE: mínimo 30 nós, expandir subtópicos com subconceitos e exemplos relevantes. Estruturado e direto.`,
    traduzir: `Recrie o mapa TRADUZINDO todos os textos para ${langName}. Mesma estrutura e hierarquia; rótulos claros.`,
    regenerar: `Recrie o mapa com PERSPECTIVA DIFERENTE: nova organização e ângulos alternativos. Mantenha rigor conceptual.`,
  };

  return `Você é um especialista em mapas mentais.
${EVALUATE_QUESTION_INSTRUCTION}

TEMA: ${analysis.central_theme}
SUBTÓPICOS: ${analysis.subtopics.join(', ')}

INSTRUÇÃO: ${actionInstructions[action]}

Retorne APENAS o JSON válido, sem markdown, sem blocos de código, sem explicações:
{
  "nodeData": {
    "id": "root",
    "topic": "Tema Central",
    "children": [
      {
        "id": "sub1",
        "topic": "Subtópico 1",
        "children": [
          {"id": "sub1_1", "topic": "Detalhe 1.1"},
          {"id": "sub1_2", "topic": "Detalhe 1.2"}
        ]
      }
    ]
  }
}

Regras: "id" único (formato "node_N"), "topic" curto (máx 60 caracteres), raiz id "root", hierarquia lógica.`;
}

export function getDeepThoughtPreflightPrompt(topic: string): string {
	return `Você é um assistente de "pensamento profundo". Avalie o tópico e prepare o terreno para uma análise profunda.

TAREFAS:
1) Avalie a qualidade da pergunta/tópico: se estiver vago, amplo ou superficial, formule 1–5 perguntas de clarificação (curtas e objetivas) para precisar o escopo.
2) Sugira fontes/referências confiáveis que um humano consultaria (livros, normas, artigos, cursos). Sem inventar URLs; use "" em url se não souber.
3) Recomende o melhor modo de apresentação visual (mindmap, orgchart, tree, timeline, fishbone, mermaid) e justifique em uma frase direta.

TÓPICO: ${topic}

Retorne APENAS JSON válido, sem markdown, sem blocos de código:
{
  "needs_clarification": true,
  "clarifying_questions": ["string"],
  "assumptions_if_no_answer": ["string"],
  "sources": [
    {
      "title": "string",
      "author": "string",
      "year": "string",
      "type": "book|paper|standard|doc|article|video|course|other",
      "url": "string",
      "why": "string"
    }
  ],
  "recommended_presentation": {
    "mode": "mindmap|orgchart|tree|timeline|fishbone|mermaid",
    "graphType": "mindmap|orgchart|tree|timeline|fishbone",
    "mermaid": {
      "kind": "flowchart|mindmap|timeline|sequence|other",
      "code": "string"
    },
    "reason": "string"
  }
}`;
}

export function getNodeByNodeDetailedRefinementPrompt(input: {
	centralTheme: string;
		nodes: Array<{ id: string; topic: string; definition?: string; path: string; depth: number; childCount: number }>;
}): string {
	return `Você é um editor e arquiteto de informação. Melhore o mapa mental nó a nó: direto, sem redundância, estilo glossário quando for definição.

TEMA CENTRAL: ${input.centralTheme}

NÓS (id, texto atual, contexto/caminho):
${JSON.stringify(input.nodes, null, 2)}

Para cada nó, aplique apenas mudanças necessárias. Você pode:
- reescrever o tópico (mais claro e específico, curto)
- adicionar 2–4 filhos se o nó estiver superficial
- adicionar/ajustar DEFINIÇÃO curta (glossário: o que é; quando útil, para que serve)
- sugerir até 6 FONTES/REFERÊNCIAS gerais do tema

Restrições:
1) NÃO remover nós nem alterar ids.
2) Tópicos: máx 55 caracteres, pt-BR.
3) Definições: 1–2 frases, máx 240 caracteres, pt-BR, diretas.
4) Sem mudança → não inclua o nó no output.
5) Não invente URLs; use "" ou omita url se não souber.
6) Nós de depth 0–2: inclua "definition" na maioria dos casos.

Retorne APENAS JSON válido:
{
  "edits": [
    {
      "id": "node_1",
      "rewrite_topic": "string",
      "definition": "string",
      "add_children": [{"topic": "string", "definition": "string"}]
    }
  ],
  "sources_added": [
    {
      "title": "string",
      "author": "string",
      "year": "string",
      "type": "book|paper|standard|doc|article|video|course|other",
      "url": "string",
      "why": "string"
    }
  ]
}`;
}

/**
 * Prompt para gerar definição/explicação de um termo no contexto do mapa.
 * Usado quando o usuário clica em um nó sem definição.
 */
export function getNodeDefinitionPrompt(params: {
  topic: string;
  mapTitle: string;
  pathFromRoot: string;
  centralTheme?: string;
}): string {
  const { topic, mapTitle, pathFromRoot, centralTheme } = params;
  const themeCtx = centralTheme ? `\nTEMA CENTRAL DO MAPA: ${centralTheme}` : '';
  return `Você é um especialista em glossários e explicações conceituais.

TAREFA: Escreva uma definição ou explicação curta (1–3 frases, máx 240 caracteres) do termo abaixo, no contexto do mapa mental em que ele aparece.

TERMO: ${topic}
MAPA: ${mapTitle}
CONTEXTO NO MAPA (caminho hierárquico): ${pathFromRoot}
${themeCtx}

Regras:
- Direto, sem redundância, em português.
- Explique o que é e como se relaciona ao tema do mapa.
- Máximo 240 caracteres.

Retorne APENAS o texto da definição, sem aspas, sem prefixos como "Definição:" ou "Explicação:".`;
}

