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
	extraContext?: string,
	deepMode?: boolean
): string {
  const template = TEMPLATES.find((t) => t.id === templateId);
  const modifier = template?.promptModifier ?? '';
	const ctx = (extraContext ?? '').trim();

  const depth = deepMode ? 5 : 3;
  const nodeCount = deepMode ? 50 : 25;
  const subtopicCount = deepMode ? '10–15' : '5–8';
  const deepInstructions = deepMode
    ? `\nMODO APROFUNDADO ativado. Você DEVE:
- Extrair ${subtopicCount} subtópicos principais (não menos que 10)
- Identificar 15–25 conceitos-chave com inter-relações
- Mapear pelo menos 10 relações significativas entre conceitos
- Buscar profundidade real: causas, efeitos, evidências, contra-argumentos, nuances
- Incluir perspectivas múltiplas e análise crítica
- Nível de profundidade: acadêmico/profissional\n`
    : '';

  return `Você é um especialista em análise conceptual e criação de mapas mentais.
${EVALUATE_QUESTION_INSTRUCTION}

TÓPICO: ${topic}
ORIENTAÇÃO DO TEMPLATE: ${modifier}
${deepInstructions}
${ctx ? `CONTEXTO ADICIONAL (referência; não copie literalmente):\n${ctx}\n` : ''}

Faça uma análise profunda e estruturada. Extraia conceitos, relações e hierarquia. Evite listas genéricas ou tom superficial.
Retorne APENAS o JSON válido, sem markdown, sem explicações, sem blocos de código:
{
  "central_theme": "string",
  "subtopics": ["string"],
  "key_concepts": ["string"],
  "relationships": [{"from": "string", "to": "string", "type": "string"}],
  "depth_level": ${depth},
  "suggested_node_count": ${nodeCount},
  "suggested_tags": ["string"],
  "template_context": "${templateId}"
}`;
}

export function getMindMapPrompt(analysis: AnalysisResult, deepMode?: boolean): string {
  const nodeCount = deepMode ? Math.max(analysis.suggested_node_count, 50) : analysis.suggested_node_count;
  const depthLevel = deepMode ? Math.max(analysis.depth_level, 5) : analysis.depth_level;
  const subNodesPerBranch = deepMode ? '4–8' : '2–5';
  const deepRules = deepMode
    ? `\n7. MODO APROFUNDADO: cada ramo principal DEVE ter no mínimo 4 sub-nós, e sub-nós importantes devem ter filhos próprios.
8. Inclua exemplos concretos, autores/referências e dados quando relevante.
9. Explore nuances, controvérsias e perspectivas alternativas em sub-nós dedicados.`
    : '';

  return `Você é um especialista em mapas mentais hierárquicos e estruturação conceptual.
${EVALUATE_QUESTION_INSTRUCTION}

Com base na análise abaixo, crie um mapa mental: direto, sem redundância, com rótulos claros e conceituais.

TEMA CENTRAL: ${analysis.central_theme}
SUBTÓPICOS: ${analysis.subtopics.join(', ')}
CONCEITOS-CHAVE: ${analysis.key_concepts.join(', ')}
PROFUNDIDADE: ${depthLevel} níveis
NÚMERO DE NÓS: aproximadamente ${nodeCount}

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
5. ${analysis.subtopics.length} ramos principais (um por subtópico); ${subNodesPerBranch} sub-nós por ramo com conteúdo relevante.
6. Português brasileiro. Nenhum campo extra (direction, theme, style, linkData, arrows).${deepRules}`;
}

export function getArticlePrompt(analysis: AnalysisResult, deepMode?: boolean): string {
  const wordMin = deepMode ? 1500 : 800;
  const deepInstructions = deepMode
    ? `\nMODO APROFUNDADO: exija de si mesmo profundidade real:
- Mínimo ${wordMin} palavras
- Cada subtópico deve ter pelo menos 2–3 parágrafos substanciais
- Inclua exemplos concretos, dados, referências e contra-argumentos
- Explore nuances e perspectivas múltiplas
- Adicione uma seção "Análise Crítica" antes do resumo final
- Use subseções ### para conceitos-chave dentro de cada ## subtópico\n`
    : '';

  return `Você é um autor de conteúdo técnico e didático.
${EVALUATE_QUESTION_INSTRUCTION}

Com base na análise abaixo, escreva um artigo em português brasileiro: direto, estruturado, sem redundância e sem tom jornalístico.
Evite frases de efeito, introduções longas e conclusões genéricas. Priorize clareza e densidade de informação.
${deepInstructions}
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

Conteúdo: informativo, preciso, mínimo ~${wordMin} palavras. Sem filler nem frases decorativas.`;
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

export function getPostGenPrompt(
  action: 'conciso' | 'detalhado' | 'traduzir' | 'regenerar',
  analysis: AnalysisResult
): string {
  const actionInstructions = {
    conciso: `Recrie o mapa de forma CONCISA: no máximo 15 nós, apenas conceitos essenciais. Texto direto, sem redundância.`,
    detalhado: `Recrie o mapa com MAIS PROFUNDIDADE: mínimo 30 nós, expandir subtópicos com subconceitos e exemplos relevantes. Estruturado e direto.`,
    traduzir: `Recrie o mapa TRADUZINDO todos os textos para inglês. Mesma estrutura e hierarquia; rótulos claros.`,
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

// ---------------------------------------------------------------------------
// Pesquisador Sênior — prompts acadêmicos
// ---------------------------------------------------------------------------

/**
 * Extrai termos de busca acadêmica a partir do tópico do usuário.
 * Retorna JSON com termos em inglês (Semantic Scholar opera em inglês).
 */
export function getAcademicSearchTermsPrompt(topic: string): string {
  return `Você é um bibliotecário acadêmico especialista em bases de dados científicas.

TAREFA: Extraia 3–5 termos de busca em INGLÊS para pesquisar artigos acadêmicos sobre o tópico abaixo.
- Termos devem ser precisos, técnicos e adequados para bases como Semantic Scholar, Scopus, Web of Science.
- Inclua sinônimos e variações terminológicas relevantes.
- Primeiro termo: o mais abrangente. Últimos: mais específicos.

TÓPICO: ${topic}

Retorne APENAS JSON válido, sem markdown:
{
  "search_queries": ["string"],
  "field_of_study": "string",
  "suggested_year_from": 2018
}`;
}

/**
 * Pré-voo acadêmico: com papers reais do Semantic Scholar como contexto,
 * gera perguntas de clarificação e estrutura a pesquisa.
 */
export function getAcademicPreflightPrompt(topic: string, papersContext: string): string {
  return `Você é um orientador de pós-graduação (nível doutorado) com expertise em revisão sistemática de literatura.

TAREFA: Avalie o tópico de pesquisa e prepare uma análise acadêmica rigorosa.

1) AVALIAÇÃO DO TÓPICO: Se vago ou amplo demais para uma pesquisa acadêmica, formule 1–4 perguntas de delimitação (escopo temporal, geográfico, metodológico, teórico).

2) ENQUADRAMENTO TEÓRICO: Identifique:
   - Área de conhecimento e subárea
   - Principais correntes teóricas relevantes
   - Conceitos-chave e seus inter-relacionamentos
   - Lacunas de pesquisa evidentes na literatura fornecida

3) ANÁLISE DAS FONTES: Com base nos papers acadêmicos abaixo, classifique:
   - Quais são seminais (alto impacto, amplamente citados)
   - Quais representam o estado da arte (recentes e relevantes)
   - Quais apresentam revisões sistemáticas ou meta-análises

4) ESTRUTURA SUGERIDA: Recomende a melhor organização para um mapa de pesquisa acadêmica.

TÓPICO: ${topic}

PAPERS ACADÊMICOS (fontes reais do Semantic Scholar):
${papersContext}

Retorne APENAS JSON válido:
{
  "needs_clarification": false,
  "clarifying_questions": ["string"],
  "assumptions_if_no_answer": ["string"],
  "field_of_study": "string",
  "subfield": "string",
  "theoretical_frameworks": ["string"],
  "research_gaps": ["string"],
  "seminal_papers_indices": [0],
  "state_of_art_indices": [0],
  "sources": [
    {
      "title": "string",
      "author": "string",
      "year": "string",
      "type": "paper",
      "url": "string",
      "why": "string"
    }
  ],
  "recommended_presentation": {
    "mode": "mindmap",
    "graphType": "mindmap",
    "reason": "string"
  }
}`;
}

/**
 * Prompt de análise acadêmica aprimorado — usa papers reais como base.
 */
export function getAcademicAnalysisPrompt(
  topic: string,
  papersContext: string,
  preflightContext: string,
): string {
  return `Você é um pesquisador sênior com publicações em periódicos Qualis A1/A2 e experiência em orientação de mestrado e doutorado.
${EVALUATE_QUESTION_INSTRUCTION}

TAREFA: Realize uma análise acadêmica profunda e estruturada do tópico, com base EXCLUSIVAMENTE nas fontes acadêmicas reais fornecidas.

DIRETRIZES:
- Rigor metodológico: cite papers específicos ao fundamentar cada subtópico
- Estrutura de revisão de literatura: fundamentos → estado da arte → lacunas → direções
- Profundidade: nível de dissertação de mestrado / tese de doutorado
- Terminologia técnica precisa da área
- Identifique controvérsias e debates abertos na literatura
- Aponte metodologias predominantes e emergentes

TÓPICO: ${topic}

CONTEXTO DO PRÉ-VOO:
${preflightContext}

PAPERS ACADÊMICOS (fontes reais — cite por número [N]):
${papersContext}

Retorne APENAS JSON válido:
{
  "central_theme": "string",
  "subtopics": ["string"],
  "key_concepts": ["string"],
  "relationships": [{"from": "string", "to": "string", "type": "string"}],
  "depth_level": 4,
  "suggested_node_count": 35,
  "suggested_tags": ["string"],
  "template_context": "pesquisador_senior"
}`;
}

/**
 * Prompt de mapa mental acadêmico — estrutura de revisão de literatura.
 */
export function getAcademicMindMapPrompt(analysis: AnalysisResult, papersContext: string): string {
  return `Você é um pesquisador sênior criando um mapa mental de revisão de literatura acadêmica.
${EVALUATE_QUESTION_INSTRUCTION}

TAREFA: Crie um mapa mental hierárquico com estrutura acadêmica rigorosa.

ESTRUTURA OBRIGATÓRIA dos ramos principais:
1. Fundamentos Teóricos — conceitos-base, definições, autores seminais
2. Estado da Arte — pesquisas recentes, avanços, tendências
3. Metodologias — abordagens de pesquisa, instrumentos, técnicas
4. Resultados e Evidências — achados empíricos, dados, métricas
5. Lacunas e Direções Futuras — questões em aberto, oportunidades de pesquisa
6. Referências-Chave — papers mais relevantes organizados por subtema

DIRETRIZES:
- Cada nó folha deve ser específico e verificável
- Inclua autores/anos entre parênteses nos nós quando relevante: "Conceito X (Silva, 2023)"
- Mínimo 35 nós, profundidade 4 níveis
- Terminologia técnica precisa

TEMA: ${analysis.central_theme}
SUBTÓPICOS: ${analysis.subtopics.join(', ')}
CONCEITOS-CHAVE: ${analysis.key_concepts.join(', ')}

PAPERS ACADÊMICOS (referência):
${papersContext}

Retorne APENAS JSON válido:
{
  "nodeData": {
    "id": "root",
    "topic": "${analysis.central_theme}",
    "children": [
      {
        "id": "node_1",
        "topic": "Fundamentos Teóricos",
        "children": [
          {"id": "node_1_1", "topic": "Conceito-base (Autor, Ano)"}
        ]
      }
    ]
  }
}

Regras: "id" único, "topic" máx 60 caracteres, raiz id "root", pt-BR.`;
}

/**
 * Prompt de artigo acadêmico — formato de revisão de literatura.
 */
export function getAcademicArticlePrompt(analysis: AnalysisResult, papersContext: string): string {
  return `Você é um pesquisador sênior redigindo uma revisão de literatura para periódico acadêmico Qualis A1.
${EVALUATE_QUESTION_INSTRUCTION}

TAREFA: Escreva um artigo de revisão acadêmica em português brasileiro.

ESTRUTURA (obrigatória):
1. **Introdução** — contextualização, justificativa, objetivo da revisão (2–3 parágrafos)
2. **Fundamentação Teórica** — conceitos-base, marcos teóricos, definições operacionais
3. **Estado da Arte** — pesquisas recentes, avanços metodológicos, resultados empíricos
4. **Análise Crítica** — convergências, divergências, controvérsias na literatura
5. **Lacunas e Direções Futuras** — questões não respondidas, oportunidades de pesquisa
6. **Considerações Finais** — síntese, contribuições, limitações da revisão
7. **Referências** — listar TODAS as fontes citadas no formato ABNT

DIRETRIZES DE QUALIDADE:
- Cite papers específicos: "(Sobrenome, Ano)" ao longo do texto
- Use terminologia técnica da área
- Tom acadêmico: impessoal, objetivo, fundamentado
- Mínimo 1200 palavras
- Evite generalizações sem fonte
- Cada afirmação substantiva deve ter referência

ANÁLISE: ${JSON.stringify(analysis, null, 2)}

PAPERS ACADÊMICOS (cite-os no texto):
${papersContext}

Retorne APENAS Markdown. Sem blocos de código, sem JSON.
Formato: # Título, ## seções, ### subseções, listas quando pertinente.`;
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

