# Frontend, Design, UX & UI

Last reviewed: 2026-07-11

Design tools, component libraries, frontend tooling, and UX patterns for projects with
a user interface. Use this as a menu — choose based on platform, audience, and stack.

---

## AI-assisted design tools

### Claude Design
https://claude.ai/design

Claude's built-in visual design feature. Use it when you need to prototype a UI layout,
generate component ideas, or get AI-assisted visual direction without leaving Claude.

**When to use:**
- Rapid UI/UX ideation and wireframing
- Generating component mockups from a text description
- Reviewing and annotating design concepts with an AI collaborator
- Bridging from a design brief to a Figma file or code scaffold

**When not to use:**
- Production-fidelity design (use Figma with a proper design system instead)
- Design systems with strict token governance (tokens need Figma/Penpot or code)

Getting started: https://support.claude.com/en/articles/14604416-get-started-with-claude-design

### Google Stitch
https://stitch.withgoogle.com

Google's AI-assisted UI prototyping tool. Generate screens and flows from natural
language descriptions; export to code or Figma. Good for early-stage exploration when
you want AI-generated visual options before committing to a framework.

### Figma
https://figma.com

Industry-standard collaborative design tool. Source of truth for component specifications,
design tokens, and handoff to engineering. The Figma MCP server (`mcp__figma__*`) enables
direct design-to-code workflows in Claude Code and Cursor.

---

## Open design tools

### Open Design
https://github.com/BrowserCat/open-design

Local-first open-source vibe-design workspace. Use as a self-hostable design exploration
alternative when you want AI-assisted UI ideation without committing to a hosted product
or production design-system source of truth.

### Penpot
https://penpot.design

Open-source, self-hostable alternative to Figma. SVG-native; supports design tokens
and CSS variables natively. Good choice when you want design tooling without a vendor
dependency or when running on-prem.

---

## Component libraries & design systems

Choose based on framework, product tone, and accessibility requirements. Do not default
to a library before understanding the audience.

### React ecosystems

| Library | What it provides | When to use |
|---|---|---|
| **shadcn/ui** https://ui.shadcn.com | Copy-paste components (Radix UI + Tailwind); not a dependency, you own the code | When you want full control over component source |
| **Radix UI** https://radix-ui.com | Unstyled, accessible primitives (dialogs, menus, tooltips, etc.) | When you need accessibility without imposed styles |
| **Headless UI** https://headlessui.com | Unstyled accessible components from Tailwind Labs | Tailwind CSS projects needing accessibility |
| **MUI / Material UI** https://mui.com | Full Material Design 3 implementation for React | Enterprise dashboards; Google-ecosystem products |

### CSS / design tokens

| Tool | What it provides |
|---|---|
| **Open Props** https://open-props.style | CSS custom property system; comprehensive design tokens (spacing, color, type, animation) with zero framework dependency |
| **Tailwind CSS** https://tailwindcss.com | Utility-first CSS; pairs with shadcn/ui and Headless UI |
| **Vanilla Extract** https://vanilla-extract.style | Type-safe CSS-in-TypeScript; good for design systems with strict token governance |

### Established design systems (reference, not defaults)

| System | Platform | Notes |
|---|---|---|
| Material Design 3 | Cross-platform | https://m3.material.io/ |
| Carbon Design System | Web / enterprise | https://carbondesignsystem.com/ |
| Shopify Polaris | Shopify / e-commerce | https://polaris.shopify.com — strong accessibility; good model for admin UIs |
| Apple HIG | iOS / macOS | https://developer.apple.com/design/ |

---

## Frontend tooling

| Tool | Purpose |
|---|---|
| **Playwright** | End-to-end flows, screenshots, visual regression, accessibility checks |
| **Storybook** | Component development and catalog; test runner for component-level tests |
| **Axe / axe-core** | Automated accessibility audit; integrate in Playwright or CI |
| **Lighthouse** | Web quality: performance, accessibility, SEO, best practices |
| **Chromatic** | Visual regression CI service that pairs with Storybook |

---

## UX review checklist

When reviewing a UI with an agent, cover:

- Primary user workflows (happy path and common errors)
- Empty, loading, error, and success states
- Accessibility (keyboard nav, screen reader, contrast, focus management)
- Responsiveness (mobile, tablet, desktop breakpoints)
- Copy clarity (labels, error messages, empty states)
- Navigation and information architecture
- Visual consistency with the product domain and brand

---

## Selection guidance

Operational / admin tools → dense, calm, scannable → Carbon or Polaris as reference.
Consumer / marketing → expressive → consider Open Props + custom system.
Rapid prototype → shadcn/ui + Tailwind → own the code from day one.
Accessibility-critical → Radix UI or Headless UI as the primitive layer.
Open-source / self-hosted design tool → Penpot for structured design systems; Open Design
for AI-assisted local exploration.
