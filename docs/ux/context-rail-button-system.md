# Morro Digital — Context Rail Button System

## Objetivo

Padronizar o fluxo público **Categoria → Filtros → Locais → Ações** em um único sistema visual e de interação dentro do Unified Contextual Assistant Dock.

A implementação preserva as autoridades existentes de navegação, busca, commerce e Assistant. O trabalho é de apresentação e semântica de componente, não uma reimplementação do fluxo.

## Auditoria do estado anterior

O sistema já possuía uma boa base estrutural:

- um único `#assistant-category-rail` era reutilizado em menu, filtros, locais e ações;
- scroll horizontal, touch target, scroll snap, RTL e foco já eram contratos ativos;
- `explore-locations-control.ts` era a autoridade de troca entre `filters`, `places` e `detail`;
- as ações de local já chegavam ao rail por uma matriz canônica por categoria.

Os principais gaps encontrados eram:

- todos os estágios reutilizavam a classe visual de _category chip_, mesmo quando o item era local ou ação;
- categoria, local e ação não possuíam semântica visual explícita;
- cores eram alternadas pela posição do botão com `:nth-child`, sem significado de produto;
- CTA comercial principal era apenas uma variação parcial dentro de regras antigas;
- `back` não tinha variante visual própria;
- labels contextuais podiam quebrar em duas linhas, enquanto categorias usavam outra densidade;
- a geometria do rail não estava expressa em tokens próprios de botão contextual;
- não existia um contrato de teste dedicado para impedir regressão da taxonomia visual.

## Arquitetura implementada

### Componente base

Todos os itens utilizam:

`md-context-rail-button`

Tipos semânticos:

- `md-context-rail-button--category`
- `md-context-rail-button--filter`
- `md-context-rail-button--place`
- `md-context-rail-button--action`

### Variantes de ação

Itens dinâmicos recebem `data-rail-variant`:

- `primary` — CTA principal contextual/comercial;
- `secondary` — ação normal;
- `back` — retorno de fluxo.

Itens dinâmicos também recebem `data-rail-kind` para inspeção, testes e evolução futura.

Categorias continuam usando `aria-pressed` como autoridade de seleção. O estado selecionado é visualmente diferente de um CTA Primary.

## Tokens

A geometria reutilizável pertence a `public/design-system-v2.css`:

- `--md-context-rail-control-height`
- `--md-context-rail-control-radius`
- `--md-context-rail-control-gap`
- `--md-context-rail-control-padding-inline`
- `--md-context-rail-label-size`
- `--md-context-rail-icon-size`
- `--md-context-rail-category-min-width`
- `--md-context-rail-place-min-width`
- `--md-context-rail-action-min-width`

## Regras de design

- Uma única altura de controle.
- Uma única linguagem de raio, tipografia, padding e foco.
- Categoria selecionada comunica **estado de navegação**, não ação comercial.
- CTA Primary comunica **prioridade de ação**, não seleção.
- Secondary mantém superfície neutra.
- Back é neutro e reduzido visualmente.
- Nenhuma cor decorativa depende da posição do item.
- Labels ficam em uma linha com ellipsis quando necessário.
- Locais podem ser mais largos, mas não mudam a altura do componente.
- Scroll horizontal, scroll snap, RTL e touch target permanecem obrigatórios.
- Estados disabled continuam reservados para indisponibilidade real/temporária.

## Checklist de implementação

- [x] Auditar autoridade do rail e dos estágios.
- [x] Preservar o fluxo existente e não duplicar roteamento.
- [x] Criar tokens canônicos do Context Rail.
- [x] Criar classe base única.
- [x] Diferenciar category/filter/place/action.
- [x] Diferenciar primary/secondary/back.
- [x] Preservar `aria-pressed` para seleção de categoria.
- [x] Remover significado visual de `:nth-child`.
- [x] Unificar altura, raio, padding, label e focus ring.
- [x] Preservar touch target, scroll horizontal, snap e RTL.
- [x] Adicionar contrato automatizado para o novo sistema.
- [x] Documentar a autoridade visual.

## Fixed back navigation

The back action is structural navigation, not scrollable contextual content.

- `.md-context-rail-back` is a direct child of `#assistant-category-rail`, before `.md-assistant-category-scroll`.
- It is hidden at the `menu` stage.
- At `filters`, it routes to the category menu.
- At `places`, it routes to the previous filters, or to the menu for search results.
- At `detail`, it routes to the previous places result set.
- Legacy synthetic values such as `voltar_menu`, `voltar_filtros` and `__back_to_places__` remain internal compatibility commands, but are no longer rendered inside the horizontal scrolling options container.
- The visible control is icon-only on mobile, with localized `aria-label` and `title`.
- RTL mirrors the chevron while preserving the same DOM order and navigation semantics.

The fixed back control remains visually outside the horizontal option list.
