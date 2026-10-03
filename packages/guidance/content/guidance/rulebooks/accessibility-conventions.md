---
slug: accessibility-conventions
description: 'Accessibility of interfaces: usability before style, and contrast and size floors for text. Consult before writing an artifact page, a prototype, or a mockup, before defining or changing colour tokens, and before writing CSS or a UI component.'
delivery: [ambient, skill]
version: '1'
---

# Accessibility conventions

Accessibility and usability are requirements, not a finishing touch. Make an interface usable before making it look refined, and when a style choice conflicts with readability or usability, choose usability whatever the aesthetic: "Subtle" and "refined" never justify small or faint text. These conventions apply to a prototype or a mockup exactly as they apply to a shipped interface.

The standard is WCAG 2.2 AA. This rulebook restates only the values that an agent checks while authoring and the rules that WCAG does not set; for everything else, follow WCAG.

## Text legibility

- **Contrast.** Every text colour meets SC 1.4.3 against each surface on which it is set, in each theme that the page defines: 4.5:1, or 3:1 for large text (at least 24px, or at least 18.7px bold).
- **Size.** Body text is at least 14px, and secondary text (captions, counts, states, hints) at least 12px. WCAG does not set either floor.
- **Tiers.** Use two text colours, primary and secondary. Add a third only if it meets the same contrast floor; a third tier that passes sits within a few shades of the second and adds little.

Check contrast whenever colour tokens are defined or changed. Compute the WCAG contrast ratio of each text token against each surface token on which it is used, in each theme, compositing any translucent colour or `opacity` over its surface first. Report every failing pair with its ratio, and fix it before presenting the page.
