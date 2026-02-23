# Plano — 3Maps MapaMental Visual Engine

> Especificação: PROMPT DE SISTEMA — 3Maps MapaMental Visual Engine

## Backup criado

- `C:\Users\dellg\.cursor\worktrees\mindmap\backup_3maps_2026-02-23_14-04.zip` (~294 KB)

---

## Estado atual

- **MindMapCanvas**: React Flow, nós com `label` + `definition`, layout horizontal (LEFT/RIGHT)
- **PostGenActions**: Tipo (mindmap, orgchart, tree, timeline, fishbone), detailsEnabled
- **MindElixirNode**: topic, definition, children
- **SavedMap**: graphType, detailsEnabled — **sem** formato

---

## Fases de implementação

### Fase 1 — Tipos e constantes

- [ ] `FormatoConfig`: nodeShape, colorTheme, edgeType, layout
- [ ] `NodeShape`, `ColorTheme`, `EdgeType`, `LayoutType`
- [ ] Paletas de cores (10 temas)
- [ ] `COMBINACOES_PRONTAS`, `FORMATO_PADRAO`, `MODO_PADRAO`
- [ ] `DISPLAY_MODE_CONFIG`

### Fase 2 — Barra de ações

- [ ] Renomear Modo: "Compacto" | "Detalhado" (já existe como detailsEnabled)
- [ ] Novo `FormatoDropdown` — 4 subseções + combinações prontas
- [ ] Visibilidade: Formato só quando tipo === "MapaMental"
- [ ] Integrar em `PostGenActions`

### Fase 3 — Persistência

- [ ] Adicionar `formato?: FormatoConfig` em `SavedMap`
- [ ] Server: salvar/carregar `formato` em storage
- [ ] Padrão: `FORMATO_PADRAO` quando ausente

### Fase 4 — MindMapCanvas: estilos visuais

- [ ] Aplicar `nodeShape` (8 estilos) via CSS/data-* ou classes
- [ ] Aplicar `colorTheme` (10 paletas) — cores por nível
- [ ] Aplicar `edgeType` (6 tipos) — bezier, smoothstep, straight, etc.
- [ ] Transição animada (300ms) ao mudar formato

### Fase 5 — Layout engine

- [ ] Instalar `dagre`
- [ ] Layouts: radial, tree-horizontal, tree-vertical, org-chart
- [ ] `estimateNodeDimensions(node, displayMode)`
- [ ] `resolveOverlaps()` pós-layout
- [ ] Recálculo ao mudar modo ou formato

### Fase 6 — Anatomia do nó

- [ ] Garantir `title` + `description` (mapear topic → title, definition → description)
- [ ] displayMode: compact vs detailed com dimensões corretas
- [ ] Tipografia por nível (0, 1, 2+)

---

## Ordem de execução

1. Fase 1 (tipos)
2. Fase 3 (persistência) — para que formato seja salvo
3. Fase 2 (FormatoDropdown) — UI
4. Fase 4 (estilos no canvas)
5. Fase 5 (layouts com dagre)
6. Fase 6 (ajustes de nó)

---

## Arquivos a criar/modificar

| Arquivo | Ação |
|---------|------|
| `src/types/formato.ts` | CRIAR — tipos e constantes |
| `src/lib/formatoThemes.ts` | CRIAR — paletas de cores |
| `src/components/generation/FormatoDropdown.tsx` | CRIAR |
| `src/components/generation/PostGenActions.tsx` | MODIFICAR |
| `src/types/mindmap.ts` | MODIFICAR — SavedMap.formato |
| `server/storage.js` | MODIFICAR — persistir formato |
| `src/components/generation/MindMapCanvas.tsx` | MODIFICAR |
| `src/components/generation/mindmapFlow.css` | MODIFICAR |
| `src/pages/MapPage.tsx` | MODIFICAR — passar formato |
| `src/stores/maps-store.ts` | MODIFICAR |
