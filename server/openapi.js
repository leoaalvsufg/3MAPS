/**
 * server/openapi.js
 *
 * OpenAPI 3.0 specification for 3Maps API.
 * Served at GET /api/docs/openapi.json
 */

export function getOpenApiSpec(baseUrl = '') {
  const serverUrl = baseUrl || 'http://localhost:8787';
  return {
    openapi: '3.0.3',
    info: {
      title: '3Maps API',
      description: 'API do 3Maps — Gerador de mapas mentais com IA. Use JWT (login) ou token de API para autenticação.',
      version: '0.1.1',
    },
    servers: [{ url: serverUrl }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT / API Token',
          description: 'Token JWT (obtido via POST /api/auth/login) ou Token de API (gerado pelo admin)',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
        Map: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            data: { type: 'object' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    paths: {
      '/api/auth/login': {
        post: {
          summary: 'Login com usuário e senha',
          tags: ['Autenticação'],
          description: 'Retorna JWT para uso em requisições autenticadas.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password'],
                  properties: {
                    username: { type: 'string', description: 'E-mail ou nome de usuário' },
                    password: { type: 'string', format: 'password' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Login realizado',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      token: { type: 'string' },
                      user: { type: 'object', properties: { userId: { type: 'string' }, username: { type: 'string' } } },
                    },
                  },
                },
              },
            },
            401: { description: 'Credenciais inválidas', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
          security: [],
        },
      },
      '/api/users/{user}/maps': {
        get: {
          summary: 'Listar mapas do usuário',
          tags: ['Mapas'],
          parameters: [{ name: 'user', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: {
              description: 'Lista de mapas',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/Map' } },
                },
              },
            },
            401: { description: 'Não autenticado' },
          },
        },
      },
      '/api/users/{user}/maps/{id}': {
        get: {
          summary: 'Obter mapa',
          tags: ['Mapas'],
          parameters: [
            { name: 'user', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Mapa', content: { 'application/json': { schema: { $ref: '#/components/schemas/Map' } } } },
            404: { description: 'Mapa não encontrado' },
          },
        },
        put: {
          summary: 'Criar ou atualizar mapa',
          tags: ['Mapas'],
          parameters: [
            { name: 'user', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'data'],
                  properties: {
                    title: { type: 'string' },
                    data: { type: 'object', description: 'Estrutura do mapa mental (MindElixir format)' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Mapa salvo', content: { 'application/json': { schema: { $ref: '#/components/schemas/Map' } } } },
            401: { description: 'Não autenticado' },
          },
        },
        delete: {
          summary: 'Excluir mapa',
          tags: ['Mapas'],
          parameters: [
            { name: 'user', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Mapa excluído' },
            404: { description: 'Mapa não encontrado' },
          },
        },
      },
      '/api/llm/complete': {
        post: {
          summary: 'Completar texto via LLM',
          tags: ['LLM'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['provider', 'model', 'messages'],
                  properties: {
                    provider: { type: 'string', example: 'openrouter' },
                    model: { type: 'string', example: 'openai/gpt-4o-mini' },
                    messages: { type: 'array', items: { type: 'object', properties: { role: { type: 'string' }, content: { type: 'string' } } } },
                    temperature: { type: 'number' },
                    maxTokens: { type: 'integer' },
                    stream: { type: 'boolean', description: 'Se true, retorna SSE' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Resposta (JSON ou SSE)',
              content: {
                'application/json': { schema: { type: 'object', properties: { content: { type: 'string' } } } },
                'text/event-stream': { schema: { type: 'string', description: 'Server-Sent Events stream' } },
              },
            },
            401: { description: 'Não autenticado' },
          },
        },
      },
      '/api/image/generate': {
        post: {
          summary: 'Gerar imagem via Replicate',
          tags: ['Imagem'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { theme: { type: 'string', description: 'Tema da imagem' } },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'URL da imagem gerada',
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { imageUrl: { type: 'string', format: 'uri' } } },
                },
              },
            },
            401: { description: 'Não autenticado' },
          },
        },
      },
      '/api/usage': {
        get: {
          summary: 'Consultar uso do usuário autenticado',
          tags: ['Uso'],
          responses: {
            200: {
              description: 'Uso mensal',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      mapsCreatedThisMonth: { type: 'integer' },
                      monthKey: { type: 'string' },
                      chatMessagesSent: { type: 'object' },
                    },
                  },
                },
              },
            },
            401: { description: 'Não autenticado' },
          },
        },
      },
      '/api/llm/options': {
        get: {
          summary: 'Listar opções de LLM disponíveis',
          tags: ['LLM'],
          responses: {
            200: {
              description: 'Lista de provedor/modelo',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      options: {
                        type: 'array',
                        items: { type: 'object', properties: { provider: { type: 'string' }, model: { type: 'string' } } },
                      },
                    },
                  },
                },
              },
            },
          },
          security: [],
        },
      },
    },
  };
}
