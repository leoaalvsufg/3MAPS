import type { AnalysisResult, MindElixirNode } from '@/types/mindmap';
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

/** Prompt para pré-análise de vídeo (upload) → JSON com tópicos, argumentos, contexto. Usado no servidor. */
export function getVideoPreAnalysisPrompt(userPrompt?: string): string {
  const extra = (userPrompt ?? '').trim();
  return `Você é um especialista em análise de conteúdo de vídeo.

TAREFA: Analise o vídeo e extraia:
1) Tema central do vídeo
2) Tópicos e subtópicos apresentados (em ordem)
3) Argumentos e evidências utilizados
4) Conclusões ou pontos-chave
5) Contexto (quem apresenta, estilo, público-alvo)

${extra ? `INSTRUÇÕES DO USUÁRIO:\n${extra}\n` : ''}

Retorne APENAS JSON válido:
{
  "central_theme": "string",
  "topics": [{ "title": "string", "arguments": ["string"], "timestamp_hint": "string" }],
  "key_points": ["string"],
  "context": "string",
  "suggested_query": "string"
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
  return `Você é um redator que escreve artigos completos em prosa, como um blog de qualidade.

TAREFA: Escreva o artigo completo em Markdown, baseado na análise do mapa abaixo. O artigo deve ser texto corrido, didático e envolvente.

ANÁLISE DO MAPA: ${JSON.stringify(analysis, null, 2)}

REGRAS:
- Escreva em prosa corrida, com parágrafos bem desenvolvidos
- Não use bullets, emojis ou notações de planejamento (📌, 🔹, 💡), a menos que tenha uma curiosidade (💡) ou dica (📌)
- Cada seção deve ter pelo menos 3 parágrafos
- Use transições naturais entre as seções
- Tom: didático, mas envolvente, como um artigo de blog de qualidade

FORMATAÇÃO MARKDOWN (obrigatório — use apenas esta sintaxe):
- Títulos: # para H1, ## para H2, ### para H3 (um espaço após o #)
- Ênfase: **negrito** e *itálico*
- Links: [texto](url)
- Citações: > no início da linha
- Não use tags HTML nem códigos de escape
- Linha em branco entre parágrafos e seções

ESTRUTURA:
- H1: # ${analysis.central_theme}
- Para CADA subtópico e conceito-chave da análise, crie uma seção ## ou ### com texto em prosa
- Resumo final em prosa
- NÃO inclua seção de Referências/Bibliografia — as fontes ficam na aba dedicada

Retorne APENAS Markdown puro, sem blocos de código ou wrappers. Idioma: português brasileiro.`;
}

/**
 * Coleta todos os nós do mapa em formato plano (tópico + caminho hierárquico).
 */
function collectNodesForArticle(root: MindElixirNode, path: string[] = []): Array<{ topic: string; path: string; depth: number }> {
  const out: Array<{ topic: string; path: string; depth: number }> = [];
  const topic = (root.topic ?? '').trim();
  if (topic && root.id !== 'root') {
    out.push({ topic, path: path.join(' › '), depth: path.length });
  }
  const nextPath = topic ? [...path, topic] : path;
  for (const ch of root.children ?? []) {
    out.push(...collectNodesForArticle(ch, nextPath));
  }
  return out;
}

/**
 * Prompt mestre para modo aprofundado: gera guia técnico completo.
 * Usado quando NÃO temos o mapa ainda (geração paralela).
 */
export function getDeepGuideArticlePrompt(topic: string, additionalContext?: string): string {
  const cleanTopic = topic.trim() || 'Tema técnico';
  const extra = (additionalContext ?? '').trim();

  return `Você é um redator que escreve artigos completos em prosa, como um blog técnico de qualidade.

TAREFA: Escreva o artigo completo em Markdown sobre o tema ${cleanTopic}. O artigo deve ser texto corrido, didático e envolvente.

REGRAS:
- Escreva em prosa corrida, com parágrafos bem desenvolvidos
- Não use bullets, emojis ou notações de planejamento (📌, 🔹, 💡), a menos que tenha uma curiosidade (💡) ou dica (📌)
- Cada seção deve ter pelo menos 3 parágrafos
- Use transições naturais entre as seções
- Tom: didático, mas envolvente, como um artigo de blog de qualidade

FORMATAÇÃO MARKDOWN (obrigatório): # H1, ## H2, ### H3 | **negrito** *itálico* | [link](url) | > citação | sem HTML nem escape.

ESTRUTURA:
- Use Markdown: ## para seções principais, ### para subseções (tópicos)
1. Título (H1) e Resumo Executivo — em prosa
2. Fundamentos e Analogia Didática — em prosa
3. Arquitetura e Fluxo de Dados — em prosa (indique onde diagramas seriam úteis, no texto)
4. Desenvolvimento Prático — em prosa
5. Minúcias e Otimização — em prosa
- NÃO inclua seção de Referências/Bibliografia — as fontes ficam na aba dedicada

${extra ? `Contexto adicional:\n${extra}\n` : ''}

Retorne APENAS Markdown puro. Idioma: português brasileiro.`;
}

/**
 * Prompt para modo aprofundado COM o mapa gerado: considera TODOS os nós.
 * Revisa e amplia o texto de forma didática, como professor 30+ anos.
 */
export function getDeepArticleWithNodesPrompt(params: {
  analysis: AnalysisResult;
  nodeData: MindElixirNode;
  additionalContext?: string;
}): string {
  const { analysis, nodeData, additionalContext } = params;
  const nodes = collectNodesForArticle(nodeData);
  const nodesText = nodes
    .map((n) => `- "${n.topic}" (caminho: ${n.path})`)
    .join('\n');
  const extra = (additionalContext ?? '').trim();

  return `PERSONA: Você é um redator que escreve artigos completos em prosa, como um blog didático de qualidade.

TAREFA: Escreva o artigo completo em Markdown, baseado em TODOS os nós do mapa abaixo. O artigo deve ser texto corrido, didático e envolvente.

REGRAS:
- Escreva em prosa corrida, com parágrafos bem desenvolvidos
- Não use bullets, emojis ou notações de planejamento (📌, 🔹, 💡), a menos que tenha uma curiosidade (💡) ou dica (📌)
- Cada seção deve ter pelo menos 3 parágrafos
- Use transições naturais entre as seções
- Tom: didático, mas envolvente, como um artigo de blog de qualidade

FORMATAÇÃO MARKDOWN (obrigatório): # H1, ## H2, ### H3 | **negrito** *itálico* | [link](url) | > citação | sem HTML nem escape.

ESTRUTURA:
- Use Markdown para tópicos: # título, ## seções, ### subseções
- H1: # ${analysis.central_theme}
- Para CADA nó do mapa, crie uma seção ## ou ### com texto em prosa que desenvolva o tópico
- Resumo final em prosa
- NÃO inclua seção de Referências/Bibliografia — as fontes ficam na aba dedicada

TEMA CENTRAL: ${analysis.central_theme}
SUBTÓPICOS: ${analysis.subtopics.join(', ')}
CONCEITOS-CHAVE: ${analysis.key_concepts.join(', ')}

TODOS OS NÓS DO MAPA (desenvolva cada um em prosa):
${nodesText}

${extra ? `Contexto adicional:\n${extra}\n` : ''}

Retorne APENAS Markdown. Idioma: português brasileiro. O artigo deve ser específico deste mapa, não genérico.`;
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

/**
 * Gera o referencial teórico: teorias principais, autores e teorias conectadas.
 * Usado quando template é pensamento_profundo ou modo aprofundado.
 */
export function getReferencialTeoricoPrompt(params: {
  topic: string;
  analysis: AnalysisResult;
  additionalContext?: string;
}): string {
  const { topic, analysis, additionalContext } = params;
  const extra = (additionalContext ?? '').trim();
  return `Você é um especialista em epistemologia e metodologia científica.

TAREFA: Crie um referencial teórico em Markdown para o tema abaixo. Apresente:
1) Teorias principais relevantes ao tema, com seus autores (nome do autor, ano quando aplicável)
2) Teorias conectadas ou relacionadas que complementam ou dialogam com as principais
3) Breve contextualização de como cada teoria se aplica ao tema

TEMA: ${topic}
ANÁLISE DO MAPA: central_theme="${analysis.central_theme}", subtopics=[${analysis.subtopics.join(', ')}], key_concepts=[${analysis.key_concepts.join(', ')}]

${extra ? `CONTEXTO ADICIONAL:\n${extra}\n` : ''}

Formato:
- Use ## para cada teoria principal
- Liste autor(es) e ano quando relevante
- Indique teorias conectadas com subitens ou parágrafo curto
- Português brasileiro
- Retorne APENAS Markdown, sem JSON, sem blocos de código`;
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

/** Emojis disponíveis para o LLM sugerir como ícone do nó (tema/conceito). */
export const NODE_ICON_EMOJIS = [
  '📌', '🎯', '✅', '❌', '💡', '⭐', '📝', '🔗', '📎', '📁', '🗂️', '💼', '📊', '🔒', '⚡', '🔥', '💬', '🧩', '🎨', '🌟',
  '🌐', '🔬', '📐', '💻', '🖥️', '📱', '🧬', '⚛️', '🔋', '🔧', '🛠️', '📦', '📚', '🎓', '🏆', '💰', '💎', '🌱', '🌳', '🚀',
  '🏛️', '⚖️', '📜', '🔮', '🔭', '🧪', '📈', '🎭', '🏗️', '🔑', '🛡️', '⚙️', '🧠', '💡', '🎪', '🌍', '🔄', '📋', '🗃️',
];

/**
 * Prompt para gerar definição/explicação de um termo no contexto do mapa,
 * e sugerir um ícone (emoji) que represente o tema.
 */
export function getNodeDefinitionPrompt(params: {
  topic: string;
  mapTitle: string;
  pathFromRoot: string;
  centralTheme?: string;
}): string {
  const { topic, mapTitle, pathFromRoot, centralTheme } = params;
  const themeCtx = centralTheme ? `\nTEMA CENTRAL DO MAPA: ${centralTheme}` : '';
  const emojiList = NODE_ICON_EMOJIS.join(' ');
  return `Você é um especialista em glossários e explicações conceituais.

TAREFA:
1) Escreva uma definição ou explicação curta (1–3 frases, máx 240 caracteres) do termo abaixo, no contexto do mapa mental.
2) Escolha 3 emojis da lista abaixo que melhor representem o termo/tema visualmente (em ordem de preferência).

TERMO: ${topic}
MAPA: ${mapTitle}
CONTEXTO NO MAPA (caminho hierárquico): ${pathFromRoot}
${themeCtx}

EMOJIS DISPONÍVEIS (escolha exatamente um): ${emojiList}

Regras:
- Definição: direto, sem redundância, em português. Explique o que é e como se relaciona ao tema do mapa. Máx 240 caracteres.
- Ícones: escolha 3 emojis da lista acima, os mais apropriados para o conceito (em ordem de preferência).

Retorne APENAS um JSON válido, sem markdown, sem texto antes ou depois:
{"definition":"sua definição aqui","icons":["emoji1","emoji2","emoji3"]}`;
}

