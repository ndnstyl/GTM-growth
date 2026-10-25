## Step 2: Define Colors

Gather 10 color values. Colors should be hex codes WITHOUT the `#` prefix.

### Required Colors

| Color | Purpose | Guidance |
|-------|---------|----------|
| `background` | Main slide/page background | Dark themes: near-black. Light themes: white/off-white |
| `background_alt` | Alternate background for variety | Slightly different shade of background |
| `text` | Primary text color | High contrast against background |
| `text_secondary` | Muted/secondary text | Slightly lower contrast than primary |
| `accent` | Primary accent (CTAs, highlights) | Your signature brand color |
| `accent_secondary` | Secondary accent | Complement to primary accent |
| `accent_tertiary` | Third accent (optional variety) | Another complement, or same as secondary |
| `code_bg` | Code block background | Darker than main background |
| `card_bg` | Card/surface background | Between background and text |
| `card_bg_alt` | Alternate card background | Slight variation of card_bg |

### Color Discovery Questions

If user doesn't have a full color system, guide them:

1. "What's your signature brand color? (This becomes your primary accent)"
2. "Do you prefer a dark theme (dark background, light text) or light theme?"
3. "Do you have secondary colors, or should I suggest complements?"

### Color Suggestions by Theme

**For dark themes**, suggest:
```
background: 0a0a0a to 1a1a2e range
text: f5f5f5 to ffffff range
card_bg: 1a1a1a to 2d2d44 range
```

**For light themes**, suggest:
```
background: ffffff to f8f9fa range
text: 1a1a1a to 333333 range
card_bg: f0f0f0 to e8e8e8 range
```

See `references/color-presets.md` for full ready-made palettes.
