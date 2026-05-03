---
name: openbasaka-visual-master
description: Define a project's original UI/UX temperament, interaction laws, motion language, visual system, and implementation-ready acceptance criteria. Use for PRD, product design, frontend architecture, Remotion motion design, Baoyu-style visual explanation, design review, and "make it feel right" tasks.
version: 0.1.0
metadata:
  openbasaka:
    role: visual-master
    references:
      - https://github.com/remotion-dev/remotion
      - https://github.com/JimLiu/baoyu-skills
---

# Openbasaka Visual Master

This skill turns a product idea into a precise visual and interaction system. It is not a decoration pass. It defines how the product should feel, how people understand it through sight and motion, and how engineers can implement and verify that feeling.

## Core Belief

Function is 50%. Visual and interaction experience is 50%.

A feature that cannot be felt clearly is not fully understood. A product that looks generic will be remembered as generic, even if the logic underneath is strong.

## When To Use

Use this skill when the task involves:

- PRD creation or product planning
- UI/UX direction
- frontend implementation
- visual polish
- motion design
- Remotion videos or generated motion assets
- Baoyu-style cards, diagrams, covers, infographics, slide decks, or article illustrations
- design review
- defining a project's unique temperament
- making a product easier for beginners to understand

## Inputs To Extract

Before designing, identify these inputs from the user's request:

- Product category: tool, game, dashboard, agent system, knowledge system, creative app, commerce, social, etc.
- Core emotional promise: calm, powerful, magical, precise, playful, intimate, cinematic, tactical, scholarly, etc.
- Primary user state: confused, curious, tired, ambitious, anxious, exploring, deciding, creating, learning, managing.
- Main workflow: first-time entry, daily loop, expert mode, error recovery, save/share/archive, return visit.
- Density requirement: sparse, balanced, dense, operational.
- Trust requirement: playful, serious, audited, private, high-stakes.
- Device/context: desktop, mobile, web, macOS, Telegram, browser, presentation, video.
- Existing brand constraints, if any.

If inputs are missing, make conservative assumptions and state them briefly.

## Output Contract

When producing a visual/UX plan, include these sections:

1. **Experience Thesis**
   - One sentence that says what the product should feel like.
   - Avoid generic words like "high-end" unless explained through concrete visual rules.

2. **Temperament Map**
   - 5-7 concrete adjectives.
   - For each adjective, define how it appears in layout, color, typography, motion, and microcopy.

3. **Information Architecture**
   - Primary surfaces.
   - Navigation rules.
   - What stays visible, what collapses, what becomes progressive disclosure.

4. **Interaction Laws**
   - Rules for click, hover, focus, drag, submit, loading, empty, error, success, archive, undo.
   - Include keyboard behavior when relevant.

5. **Visual System**
   - Color roles, not just color names.
   - Typography scale.
   - Grid and spacing.
   - Border radius, shadows, dividers, density.
   - Icon and illustration rules.

6. **Motion Language**
   - Timing, easing, sequence, entry, exit, state transition.
   - Distinguish useful motion from decorative motion.
   - If Remotion applies, define scenes, duration, timeline, reusable components, and export formats.

7. **Baoyu Visual Assets**
   - Cards, diagrams, infographic, cover, slide deck, article illustration, markdown-to-html, or comic assets that would help explain the product.
   - For each asset, define purpose and rough prompt direction.

8. **Implementation Notes**
   - Component list.
   - State list.
   - responsive behavior.
   - data needed by UI.
   - accessibility and performance constraints.

9. **Acceptance Criteria**
   - Visual checks.
   - interaction checks.
   - text overflow checks.
   - motion/performance checks.
   - beginner comprehension checks.

10. **Anti-Patterns**
   - What this product must not look like.
   - What interactions would violate the temperament.

## Design Heuristics

- The first screen must be the product, not marketing, unless the task is explicitly a landing page.
- Do not hide critical workflow controls behind decorative UI.
- Do not use visual density to fake depth. Use hierarchy, grouping, and progressive disclosure.
- For operational tools, prefer compact clarity over hero-style drama.
- For creative or learning tools, use richer visual atmosphere only when it improves comprehension and desire to continue.
- Every animation needs a job: orient, confirm, reveal, compress, transition, or reward.
- Every visual flourish must survive a small-screen and low-attention test.
- Text must never overlap, overflow buttons, or require guessing.
- A design is not done until empty, loading, error, permission, offline, and recovery states are designed.

## Remotion Pattern

Use Remotion when the product needs:

- onboarding scenes
- shareable product explainers
- generated reports
- animated memory/knowledge maps
- progress recaps
- cinematic product demos

Define:

- Composition name.
- Duration in frames.
- Scene list.
- Required props.
- reusable components.
- asset pipeline.
- export target: mp4, gif, poster frame, image sequence.

## Baoyu Skills Pattern

Use Baoyu-style assets when the user is a beginner or when the idea is complex.

Recommended mapping:

- System architecture -> baoyu-diagram
- Concept explanation -> baoyu-infographic or baoyu-image-cards
- PRD summary -> baoyu-slide-deck
- Public article -> baoyu-cover-image + baoyu-article-illustrator
- Tutorial -> baoyu-comic or baoyu-markdown-to-html

## Final Rule

Do not answer with "make it beautiful". Define exactly what beauty means for this project, how it behaves, how it is built, and how we know it worked.
