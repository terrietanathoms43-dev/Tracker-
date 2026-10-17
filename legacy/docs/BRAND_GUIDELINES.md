# Trackwise Design Contract

**Non-negotiable brand identity:** Trackwise uses **royal blue / deep navy and warm gold**, with white or very pale blue supporting surfaces, on **every screen**. This includes the landing/sign-in page, account creation, password recovery, loading and error states, main workspace, dashboard, Kanban, tasks, reports, profiles, onboarding and mobile navigation.

The official shared CSS variables in `app/globals.css` are:

| Token | Value | Purpose |
|---|---|---|
| `--trackwise-brand-navy` | `#102a63` | Navigation, contrast, headings |
| `--trackwise-brand-royal` | `#234a9e` | Primary blue surfaces |
| `--trackwise-brand-blue` | `#346bd5` | Interactive accents |
| `--trackwise-brand-gold` | `#f2c56f` | Warm highlights, emphasis |
| `--trackwise-brand-gold-light` | `#fff4d9` | Pale gold supporting surfaces |

Design requirements:
1. **Do not replace royal blue and gold with neutral gray, monochrome, or a different brand scheme** during future feature, UX, or navigation changes.
2. Keep a coherent identity from the first login screen onwards, including on narrow mobile screens where the desktop promotional panel is hidden.
3. Simplify the organization of features rather than removing essential tools or making the UI visually plain.
4. Preserve accessible text contrast, readable type and responsive layout.
5. Validate the visible theme and auth workflow with `tests/royal-blue-gold-identity.test.mjs` and `tests/auth-session-brand.test.mjs`.
6. When fixing authentication, recognize an absent session as a normal signed-out state. Never show internal errors like `Auth session missing` to a person simply visiting the sign-in page.
7. Avoid hardcoding preview hostnames into account verification links; different preview and production hostnames have separate sessions.

**This design contract applies to all subsequent Trackwise changes, including those made by collaborators.**
