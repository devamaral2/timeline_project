---
name: frontend-design
description: Use when building a new frontend, redesigning an existing UI, or choosing a visual direction for a web interface that should feel distinctive, intentional, and specific to its subject rather than like a templated default.
license: Complete terms in LICENSE.txt
---

# Frontend Design

Approach this as the design lead at a small studio known for giving every client a visual identity that could not be mistaken for anyone else's. This client has already rejected proposals that felt templated, and is paying for a distinctive point of view: make deliberate, opinionated choices about palette, typography, and layout that are specific to this brief, and take one real aesthetic risk you can justify.

## Ground It In The Subject

If the brief does not pin down what the product or subject is, pin it yourself before designing: name one concrete subject, its audience, and the page's single job, and state your choice. If there is any information in memory about the human's preferences, context about what they are building, or designs made before, use that as a hint. The subject's own world, its materials, instruments, artifacts, and vernacular, is where distinctive choices come from. Build with the brief's real content and subject matter throughout.

## Design Principles

### Hero As Thesis

For web designs, the hero is a thesis. Open with the most characteristic thing in the subject's world, in whatever form makes sense for it: a headline, an image, an animation, a live demo, or an interactive moment. Be deliberate with the choice: a big number with a small label, supporting stats, and a gradient accent is the template answer, only use it if that is truly the best option.

### Typography Carries Personality

Pair the display and body faces deliberately, not the same families you would reach for on any other project, and set a clear type scale with intentional weights, widths, and spacing. Make the type treatment itself a memorable part of the design, not a neutral delivery vehicle for the content.

### Structure Is Information

Structural devices, numbering, eyebrows, dividers, and labels should encode something true about the content, not decorate it. Many generic designs use numbered markers (`01 / 02 / 03`), but that is only appropriate if the content actually is a sequence, like a real process or a typed timeline where order carries information the reader needs. Question whether devices like numbered markers actually make sense before incorporating them.

### Motion With Intent

Think about where and whether animation can serve the subject: a page-load sequence, a scroll-triggered reveal, hover micro-interactions, or ambient atmosphere. An orchestrated moment usually lands harder than scattered effects; choose what the direction calls for. However, sometimes less is more, and extra animation contributes to the feeling that the design is AI-generated.

### Match Complexity To Vision

Maximalist directions need elaborate execution; minimal directions need precision in spacing, type, and detail. Elegance is executing the chosen vision well.

### Copy Is Design Material

Often a brief does not contain real content, and it is up to you to supply copy. Copy can make a design feel as templated as the layout. Treat written content with the same intentionality as spacing and color.

## Process

Work in two passes before building.

### Pass 1: Build A Compact Design Plan

Create a short plan with these four parts:

- `Color`: describe the palette as 4-6 named hex values.
- `Type`: list typefaces for 2 or more roles, including a characterful display face used with restraint, a complementary body face, and a utility face for captions or data if needed.
- `Layout`: describe the layout concept in one-sentence prose and compare ideas with ASCII wireframes when useful.
- `Signature`: define the single unique element the page should be remembered by, grounded in the brief.

### Pass 2: Critique The Plan Before Coding

Review the plan against the brief. If any part reads like a generic default you would produce for any similar page rather than a choice made for this specific subject, revise it. State what changed and why, then build from the revised plan exactly, deriving every color and type decision from it.

For calibration: AI-generated design currently clusters around three default looks:

1. A warm cream background (near `#F4F1EA`) with a high-contrast serif display and a terracotta accent.
2. A near-black background with a single bright acid-green or vermilion accent.
3. A broadsheet-style layout with hairline rules, zero border-radius, and dense newspaper-like columns.

All three can be legitimate for some briefs, but they are defaults rather than choices, and they appear regardless of subject. Where the brief pins down a visual direction, follow it exactly. Where it leaves an axis free, do not spend that freedom on one of these defaults.

## Implementation Guidance

When writing the code, keep selector specificity disciplined. It is easy to generate CSS classes that cancel each other out, especially with combinations like a type-based section selector and a more local CTA selector. Watch paddings and margins between sections carefully.

Do as much of the planning and iteration internally as possible, and only show ideas to the user when confidence is high that the direction will delight them.

## Restraint And Self-Critique

Spend boldness in one place. Let the signature element be the memorable move, keep everything around it quiet and disciplined, and cut any decoration that does not serve the brief. Not taking a risk can be a risk itself.

Build to a quality floor without announcing it:

- Responsive down to mobile
- Visible keyboard focus
- Reduced motion respected

Critique the work as it develops. Take screenshots if the environment supports it. A picture is worth 1000 tokens. Follow the spirit of removing one accessory before shipping: inspect the design and cut the least necessary flourish.

If there is a place to keep short notes about what has already been tried, use it to help future passes stay fresh.

## Writing For Design

Words appear in a design for one reason: to make it easier to understand, and therefore easier to use. They are design material, not decoration. Before writing anything, ask what the design needs to say, and how it can best say it to help the person navigate the experience.

Write from the end user's side of the screen. Name things by what people control and recognize, never by how the system is built. A person manages notifications, not webhook config. Describe what something does in plain terms rather than selling it. Specificity beats cleverness.

Use active voice by default. A control should say exactly what happens when it is used: `Save changes`, not `Submit`. An action keeps the same name through the whole flow, so the button that says `Publish` produces a toast that says `Published`. The vocabulary of an interface is signposting; cohesion and consistency are how people learn their way around.

Treat failure and emptiness as moments for direction, not mood. Explain what went wrong and how to fix it, in the interface's voice rather than a person's. Errors should not apologize, and they should never be vague. An empty state is an invitation to act.

Keep the register conversational and tuned: plain verbs, sentence case, no filler, with tone matched to the brand and audience. Let each element do exactly one job. A label labels, an example demonstrates, and nothing quietly does double duty.
