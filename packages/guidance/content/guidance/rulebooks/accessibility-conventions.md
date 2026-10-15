---
slug: accessibility-conventions
description: 'Accessibility of interfaces: usability before style, contrast and size floors for text, the states that show an element is interactive, and the browser check of a visible change. Consult before writing an artifact page, a prototype, or a mockup, before defining or changing colour tokens, before writing CSS or a UI component, and before finishing or reviewing a change to a visible component.'
delivery: [skill]
version: '2'
---

# Accessibility conventions

Accessibility and usability are requirements, not a finishing touch. Make an interface usable before making it look refined, and when a style choice conflicts with readability or usability, choose usability whatever the aesthetic: "Subtle" and "refined" never justify small or faint text. These conventions apply to a prototype or a mockup exactly as they apply to a shipped interface.

The standard is WCAG 2.2 AA. This rulebook restates only the values that an agent checks while authoring and the rules that WCAG does not set; for everything else, follow WCAG.

## Text legibility

- **Contrast.** Every text colour meets SC 1.4.3 against each surface on which it is set, in each theme that the page defines: 4.5:1, or 3:1 for large text (at least 24px, or at least 18.7px bold).
- **Size.** Body text is at least 14px, and secondary text (captions, counts, states, hints) at least 12px. WCAG does not set either floor.
- **Tiers.** Use two text colours, primary and secondary. Add a third only if it meets the same contrast floor; a third tier that passes sits within a few shades of the second and adds little.

Check contrast whenever colour tokens are defined or changed. Compute the WCAG contrast ratio of each text token against each surface token on which it is used, in each theme, compositing any translucent colour or `opacity` over its surface first. Report every failing pair with its ratio, and fix it before presenting the page.

## Interaction states

Every element that responds to a click or a key shows that it does:

- **Pointer.** The cursor is a pointer over it.
- **Hover.** Its appearance changes while the pointer is over it.
- **Focus.** A visible indicator marks it while it has keyboard focus, per SC 2.4.7, and the indicator meets the 3:1 non-text contrast of SC 1.4.11 against its surface.

A disabled element, whether disabled by the native attribute or by `aria-disabled`, shows neither the hover state nor the pointer.

Put the states in a base style or a shared component rather than setting them at each call site, so that a new element has them without anyone remembering to add them. Do not rely on a framework's or a reset's defaults: Some remove the pointer from a button.

## Checking in a browser

Check every change to a visible component in a browser before reporting it finished or reviewed. Open the page, then hover over and tab through each new or changed interactive element, and confirm the three states above, or their absence on a disabled element. A test that renders HTML, or a reading of the diff, does not replace this check: Neither shows what the element looks like under the pointer or with focus.

When a browser is not available, report that the check did not run and name the elements that it would have covered. Never report it as passed.
