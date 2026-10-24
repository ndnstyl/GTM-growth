---
name: frontend-design
description: |
  Create distinctive, production-grade frontend interfaces with high design quality.
  Use this skill when:
  - Building web components, pages, or landing pages
  - Styling/beautifying any web UI
  - Creating websites, dashboards, or React components
  - Any frontend work where visual quality matters
  Generates creative, polished code that avoids generic AI aesthetics.
triggers:
  - "frontend design"
  - "web design"
  - "landing page"
  - "beautify"
  - "ui design"
  - "make it look good"
  - "styling"
  - "visual polish"
---

# Frontend Design, Anti-Slop UI/UX

Create distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

## Stack Context

- **Current site**: Next.js 13 (Pages Router), React 18, Bootstrap 5.3, SCSS/Sass, GSAP 3.12, Swiper
- **Fonts**: Custom (not system defaults)
- **Animations**: GSAP + split-type for text animations, Vanilla Tilt for 3D hover

---

## Design Thinking (Before Coding)

Before writing code, commit to a BOLD aesthetic direction:

1. **Purpose**: What problem does this interface solve? Who uses it?
2. **Tone**: Pick a clear direction, brutally minimal, maximalist, retro-futuristic, organic/natural, luxury/refined, playful, editorial/magazine, brutalist/raw, art deco, soft/pastel, industrial. There are endless flavors.
3. **Constraints**: Technical requirements (framework, performance, accessibility)
4. **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work, the key is intentionality, not intensity.

---

## Anti-Slop Rules

### NEVER use these generic AI aesthetics:

- **Fonts**: Inter, Roboto, Arial, system fonts as primary. These scream "AI generated."
- **Colors**: Purple gradients on white backgrounds. The universal AI cliche.
- **Layouts**: Predictable card grids, centered hero + 3-column features + testimonial carousel.
- **Patterns**: Cookie-cutter design without context-specific character.
- **Convergence**: Never default to Space Grotesk, Outfit, or whatever the current "trendy safe choice" is.

### ALWAYS do:

- **Typography**: Choose fonts that are beautiful, unique, and interesting. Pair a distinctive display font with a refined body font. Search for fonts that match the aesthetic direction.
- **Color & Theme**: Commit to a cohesive palette. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: GSAP for high-impact moments. One well-orchestrated page load with staggered reveals creates more delight than scattered micro-interactions. Scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Depth**: Create atmosphere, gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, grain overlays. Never default to solid white/gray.

---

## Typography Guidelines

```scss
// GOOD - distinctive pairing
$font-display: 'Playfair Display', serif;    // Or: Clash Display, Cabinet Grotesk, Satoshi
$font-body: 'DM Sans', sans-serif;           // Or: General Sans, Switzer, Synonym

// BAD - generic
$font-display: 'Inter', sans-serif;
$font-body: 'Roboto', sans-serif;
```

**Rules:**
- Display fonts: 48px+ for heroes, bold weight, letter-spacing adjustments
- Body fonts: 16-18px base, generous line-height (1.5-1.7)
- Never use more than 2-3 font families
- Use `split-type` + GSAP for text reveal animations

---

## Color Strategy

```scss
// Strong palette with intentional hierarchy
:root {
  --color-primary: #1a1a2e;       // Deep, commanding
  --color-accent: #e94560;        // Bold, memorable
  --color-surface: #0f0f23;       // Rich background
  --color-text: #eaeaea;          // High contrast
  --color-muted: #6c6c8a;        // Supporting
}
```

**The 80/20 Rule**: 80% neutral/background, 15% secondary, 5% primary accent. Restraint makes accents powerful.

---

## Motion with GSAP (Already Installed)

### Page Load Sequence

```javascript
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SplitType from 'split-type'

gsap.registerPlugin(ScrollTrigger)

// Hero text reveal
const text = new SplitType('.hero-title', { types: 'chars' })
gsap.from(text.chars, {
  opacity: 0,
  y: 50,
  rotateX: -90,
  stagger: 0.02,
  duration: 0.8,
  ease: 'back.out(1.7)',
})

// Staggered section reveals
gsap.utils.toArray('.section').forEach(section => {
  gsap.from(section, {
    scrollTrigger: {
      trigger: section,
      start: 'top 80%',
      toggleActions: 'play none none reverse',
    },
    opacity: 0,
    y: 60,
    duration: 1,
    ease: 'power3.out',
  })
})
```

### Hover Micro-Interactions

```javascript
// Magnetic button effect
const btn = document.querySelector('.magnetic-btn')
btn.addEventListener('mousemove', (e) => {
  const rect = btn.getBoundingClientRect()
  const x = e.clientX - rect.left - rect.width / 2
  const y = e.clientY - rect.top - rect.height / 2
  gsap.to(btn, { x: x * 0.3, y: y * 0.3, duration: 0.3 })
})
btn.addEventListener('mouseleave', () => {
  gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' })
})
```

---

## Layout Patterns (Beyond the Grid)

### Overlapping Sections

```scss
.hero {
  position: relative;
  z-index: 2;
  margin-bottom: -120px; // Overlap into next section
}

.feature-section {
  position: relative;
  padding-top: 160px; // Account for overlap
}
```

### Asymmetric Grid

```scss
.asymmetric-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 2rem;

  &__item:nth-child(even) {
    margin-top: 4rem; // Stagger vertically
  }
}
```

### Full-Bleed with Contained Content

```scss
.full-bleed {
  width: 100vw;
  margin-left: calc(-50vw + 50%);
  padding: 6rem 0;

  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 2rem;
  }
}
```

---

## Background & Atmosphere

### Noise Texture Overlay

```scss
.textured-bg {
  position: relative;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 1;
  }
}
```

### Gradient Mesh

```scss
.gradient-mesh {
  background:
    radial-gradient(at 40% 20%, hsla(28, 100%, 74%, 0.3) 0px, transparent 50%),
    radial-gradient(at 80% 0%, hsla(189, 100%, 56%, 0.2) 0px, transparent 50%),
    radial-gradient(at 0% 50%, hsla(355, 85%, 63%, 0.15) 0px, transparent 50%),
    var(--color-surface);
}
```

---

## Responsive Design

```scss
// Mobile-first breakpoints
$breakpoints: (
  sm: 640px,
  md: 768px,
  lg: 1024px,
  xl: 1440px,
);

@mixin respond-to($bp) {
  @media (min-width: map-get($breakpoints, $bp)) {
    @content;
  }
}

// Usage
.hero-title {
  font-size: 2.5rem;

  @include respond-to(md) { font-size: 4rem; }
  @include respond-to(lg) { font-size: 5.5rem; }
}
```

---

## Checklist Before Shipping

- [ ] No generic fonts (Inter, Roboto, Arial)
- [ ] No purple-gradient-on-white cliches
- [ ] Clear aesthetic direction, executed consistently
- [ ] GSAP animations feel intentional, not decorative
- [ ] Color palette has clear hierarchy (dominant + accent)
- [ ] Typography has rhythm (consistent scale + spacing)
- [ ] Backgrounds create atmosphere (not flat white/gray)
- [ ] Mobile layout is considered (not just shrunk desktop)
- [ ] Hover states surprise and delight
- [ ] Page load has a choreographed entrance
