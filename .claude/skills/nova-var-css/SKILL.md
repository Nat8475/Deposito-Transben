---
name: nova-var-css
description: Checklist para adicionar/alterar variável CSS ou cor no design system v12. Usar sempre que criar nova var, nova cor de status, ou corrigir contraste dark mode.
---

# Nova variável CSS / cor (v12)

## Checklist

1. **Definir só em `Styles.html`** — bloco `:root` (valor light) E bloco `body.dark` (override). Nunca nos forms: blocos locais são legado sobrescrito pela injeção v12.
2. **Index.html é exceção**: shell não recebe injeção. Se a var for usada no menu principal, duplicar nos tokens do Index.html.
3. **Contraste dark**: texto sobre `var(--*-bg)` com cor escura hardcoded (#065F46, #92400E, #991B1B, #1E40AF...) precisa de override `body.dark .classe{color:...}`. Verificar ratio ≥ 4.5:1 (já houve texto invisível com ratio 1.04).
4. **Nunca**: `::before`/`::after` em `<tr>`; `transform` com `fill: forwards/both` em animação de body/modal.
5. **Cache**: mudança só aparece no Web App após deploy completo + cache tratado — seguir skill `deploy-teste`.
6. Testar visual nos dois temas (toggle dark) nas telas que usam a var.
