import type { AnalysisResult } from '@/types/mindmap';
import type { TemplateId } from '@/types/templates';
import { TEMPLATES } from '@/lib/constants';

export function getAnalysisPrompt(
	topic: string,
	templateId: TemplateId,
	extraContext?: string
): string {
  const template = TEMPLATES.find((t) => t.id === templateId);
  const modifier = template?.promptModifier ?? '';
	const ctx = (extraContext ?? '').trim();

  return `Você é um especialista em análise de conteúdo e criação de mapas mentais.
Analise o seguinte tópico e retorne um JSON estruturado.

TÓPICO: ${topic}
TEMPLATE: ${modifier}

${ctx ? `CONTEXTO ADICIONAL (use como referência, sem copiar literalmente):\n${ctx}\n` : ''}

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

export function getMindMapPrompt(analysis: AnalysisResult): string {
  return `Você é um especialista em criação de mapas mentais hierárquicos.
Com base na análise abaixo, crie um mapa mental estruturado.

TEMA CENTRAL: ${analysis.central_theme}
SUBTÓPICOS: ${analysis.subtopics.join(', ')}
CONCEITOS-CHAVE: ${analysis.key_concepts.join(', ')}
PROFUNDIDADE: ${analysis.depth_level} níveis
NÚMERO DE NÓS: aproximadamente ${analysis.suggested_node_count}

IMPORTANTE: Retorne APENAS o JSON válido abaixo. Sem markdown, sem blocos de código (\`\`\`), sem texto antes ou depois do JSON.

O formato EXATO deve ser:
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

Regras obrigatórias:
1. O JSON deve ter EXATAMENTE a estrutura acima: um objeto com chave "nodeData" contendo a árvore
2. Cada nó DEVE ter "id" (string única, formato "node_N" ou "node_N_N") e "topic" (string curta, máx 50 caracteres)
3. O nó raiz DEVE ter id "root"
4. Nós folha NÃO precisam de "children" (omita a chave)
5. Crie ${analysis.subtopics.length} ramos principais, um para cada subtópico
6. Cada ramo deve ter 2-5 sub-nós com detalhes relevantes
7. Use texto em português brasileiro
8. NÃO inclua campos extras como "direction", "theme", "style", "linkData", "arrows"`;
}

export function getArticlePrompt(analysis: AnalysisResult): string {
  return `Você é um escritor especialista. Com base na análise abaixo, escreva um artigo detalhado em português brasileiro sobre o tema.

ANÁLISE: ${JSON.stringify(analysis, null, 2)}

Regras obrigatórias (formatação):
1) Retorne APENAS Markdown (sem blocos de código \`\`\`, sem JSON, sem explicações fora do artigo).
2) Use uma estrutura bem escaneável (evite parede de texto):
   - Título principal como H1: # ${analysis.central_theme}
   - Introdução curta (1-3 parágrafos curtos)
   - Uma seção por subtópico (## ...)
   - Subseções por conceito-chave (### ...), quando fizer sentido
   - Listas com bullets SEMPRE que possível (mínimo 1 lista por seção)
3) Use marcadores/ícones de forma consistente nas listas (ex.: "✅", "⚠️", "📌", "🔹") para destacar pontos.
4) Inclua exemplos práticos e um bloco de "Resumo" no final com bullets.
5) NÃO inclua imagens nem links de imagem. (A aplicação pode inserir uma capa automaticamente.)

Conteúdo:
- Seja informativo e didático, com linguagem natural.
- Mínimo 800 palavras.
`;
}

export function getChatSystemPrompt(
  title: string,
  analysis: AnalysisResult,
  articleContent: string
): string {
  return `Você é um assistente especialista analisando o seguinte mapa mental.
Responda em português brasileiro. Seja conciso, direto e útil.

TEMA: ${title}
SUBTÓPICOS: ${analysis.subtopics.join(', ')}
CONCEITOS-CHAVE: ${analysis.key_concepts.join(', ')}

ARTIGO DE REFERÊNCIA:
${articleContent.slice(0, 3000)}

Responda perguntas sobre este conteúdo, aprofunde tópicos específicos e ajude o usuário a entender melhor o tema.`;
}

export function getSuggestionsPrompt(title: string, subtopics: string[]): string {
  return `Com base no mapa mental sobre "${title}" (subtópicos: ${subtopics.slice(0, 5).join(', ')}), gere 3 perguntas interessantes que o usuário poderia fazer para aprofundar seu entendimento.

Retorne APENAS um array JSON válido, sem markdown:
["pergunta 1", "pergunta 2", "pergunta 3"]`;
}

export function getPostGenPrompt(
  action: 'conciso' | 'detalhado' | 'traduzir' | 'regenerar',
  analysis: AnalysisResult
): string {
  const actionInstructions = {
    conciso: `Recrie o mapa mental de forma mais CONCISA, com no máximo 15 nós, focando apenas nos conceitos mais importantes.`,
    detalhado: `Recrie o mapa mental com MAIS DETALHES e profundidade, expandindo cada subtópico com exemplos e subconceitos. Mínimo 30 nós.`,
    traduzir: `Recrie o mapa mental TRADUZINDO todos os textos para inglês, mantendo a mesma estrutura e hierarquia.`,
    regenerar: `Recrie o mapa mental com uma PERSPECTIVA DIFERENTE e nova organização, explorando ângulos alternativos.`,
  };

  return `Você é um especialista em criação de mapas mentais.
TEMA: ${analysis.central_theme}
SUBTÓPICOS: ${analysis.subtopics.join(', ')}

INSTRUÇÃO: ${actionInstructions[action]}

Retorne APENAS o JSON válido no formato abaixo, sem markdown, sem blocos de código, sem explicações:
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

Regras:
- Cada nó deve ter "id" único (use formato "node_N") e "topic" (string curta, máx 60 chars)
- O nó raiz deve ter id "root"
- Mantenha a hierarquia lógica entre os nós`;
}

export function getDeepThoughtPreflightPrompt(topic: string): string {
	return `Você é um assistente de “pensamento profundo”. Antes de gerar qualquer mapa, faça um pré-voo:
1) Levante fontes/referências confiáveis (sem navegar de verdade; sugira fontes que um humano consultaria).
2) Avalie se o pedido está amplo/ambíguo. Se estiver, faça perguntas de clarificação (curtas e objetivas).
3) Recomende o melhor modo de apresentação visual (mindmap, orgchart, tree, timeline, fishbone, ou mermaid) e justifique em 1 frase.

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
	return `Você é um editor e arquiteto de informação. Seu trabalho é melhorar um mapa mental existente nó a nó.

TEMA CENTRAL: ${input.centralTheme}

NÓS (cada item inclui id, texto atual e contexto/caminho):
${JSON.stringify(input.nodes, null, 2)}

Para CADA nó, decida uma ação (mentalmente, nó a nó) e retorne APENAS as mudanças necessárias.

Você pode:
- melhorar o texto do nó (mais claro e específico, sem ficar longo)
- adicionar um novo nível (2-4 filhos) se o nó estiver superficial
	- adicionar/ajustar uma DEFINIÇÃO curta (estilo glossário) para o conceito do nó
	- sugerir algumas FONTES/REFERÊNCIAS gerais do tema (no máximo 6 no total)

Restrições:
1) NÃO remova nós existentes.
2) NÃO altere ids.
3) Tópicos devem ser curtos (<= 55 caracteres), em pt-BR.
	4) Definições: 1–2 frases (<= 240 caracteres), pt-BR, explique “o que é” e (quando útil) “pra que serve”.
	5) Se não houver mudança, não inclua o nó no output.
	6) Não invente URLs. Se não souber a URL, deixe "url" vazio/omitido.

	Heurística: para nós de depth 0–2 (principais), quase sempre inclua "definition".

Retorne APENAS JSON válido no formato:
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

