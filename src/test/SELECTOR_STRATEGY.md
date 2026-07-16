# Test Selector Strategy

## Guiding Principle
Prefer selectors that match how users interact with the app, not how the DOM is structured. This makes tests resilient to refactors and meaningful for debugging.

## Selector Priority (highest to lowest)

### 1. Role-based (`getByRole`, `locator('[role="..."]')`)
Used for semantic HTML elements and ARIA roles. Most resilient — survives class changes, text tweaks, and structural refactors.

```ts
// Preferred: semantic role
screen.getByRole('button', { name: 'Submit' })
page.getByRole('heading', { name: 'Dashboard' })
page.getByRole('link', { name: 'Settings' })
```

### 2. Label-based (`getByLabelText`, `getByPlaceholderText`)
For form inputs. Associates the label text with the input element.

```ts
screen.getByLabelText('Email address')
screen.getByPlaceholderText('Enter your username')
```

### 3. Text-based (`getByText`, `getByDisplayValue`)
For visible text content. Use exact or fuzzy matching.

```ts
screen.getByText('Profile not found')
page.getByText(/study streak/i)
```

### 4. Test ID (`getByTestId`, `page.locator('[data-testid="..."]')`)
**Only when all above fail.** Reserved for:
- Dynamically-generated lists (no stable text/role)
- Canvas/SVG elements
- Elements with ambiguous roles (e.g., multiple `<div>` click targets)

```ts
screen.getByTestId('mastery-ring')
page.locator('[data-testid="achievement-card"]')
```

## Proposed `data-testid` Additions

These would make critical E2E flows more robust. Added via `data-testid` props on the component — never on random wrapper divs.

| Component | Proposed testid | Reason |
|---|---|---|
| MasteryRing SVG | `data-testid="mastery-ring"` | SVG has no semantic role |
| Stat card value | `data-testid="stat-{label}"` | Dynamically rendered, no stable selector |
| Achievement card | `data-testid="achievement-{id}"` | Grid of similar cards, no unique text |
| Document card menu | `data-testid="doc-menu-{id}"` | Dropdown/overflow menu trigger |
| Toast notification | `data-testid="toast"` | Portal-rendered, unpredictable position |

*Proposed — ask before adding to app code.*

## Anti-patterns (AVOID)

- CSS class names: `card`, `p-4`, `bg-surface` — these change with design
- CSS selectors: `div > div > span` — brittle, breaks on any DOM change
- XPath: `//div[3]/span[2]` — fragile, meaningless
- Index-based: `page.locator('button').nth(2)` — order-dependent
- Snapshot matching full HTML — too brittle for components

## Testing Library Queries

| Query | When to use |
|---|---|
| `getByRole` | Semantic elements (buttons, headings, links) |
| `getByLabelText` | Form fields with labels |
| `getByPlaceholderText` | Inputs without labels |
| `getByText` | Visible text content |
| `getByTestId` | Last resort for non-semantic elements |
| `findBy*` | Async elements (use `await`) |
| `queryBy*` | Checking absence (returns null instead of throwing) |

## Playwright Locators

```ts
// Page-level
page.getByRole('button', { name: /submit/i })
page.getByText('Profile not found')
page.locator('[data-testid="mastery-ring"]')

// Within a component
page.locator('.card').first().getByRole('button')

// Chaining
page.locator('[data-testid="document-grid"]')
  .getByRole('link')
  .filter({ hasText: 'Data Structures' })
```
