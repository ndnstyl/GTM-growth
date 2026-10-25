## Step 7: Generate Files

Create all four files using the gathered information.

### brand.json

```json
{
  "name": "{display_name}",
  "description": "{description}",

  "colors": {
    "background": "{background}",
    "background_alt": "{background_alt}",
    "text": "{text}",
    "text_secondary": "{text_secondary}",
    "accent": "{accent}",
    "accent_secondary": "{accent_secondary}",
    "accent_tertiary": "{accent_tertiary}",
    "code_bg": "{code_bg}",
    "card_bg": "{card_bg}",
    "card_bg_alt": "{card_bg_alt}"
  },

  "fonts": {
    "heading": "{heading_font}",
    "body": "{body_font}",
    "code": "{code_font}"
  },

  "assets": {
    "logo": "{logo_path}",
    "logo_dark": {logo_dark_path},
    "icon": {icon_path}
  }
}
```

### config.json

```json
{
  "output": {
    "directory": "output/{brand_name}",
    "naming": "{name}-{date}",
    "keep_parts": false
  },
  "generation": {
    "slides_per_batch": 5,
    "auto_combine": true,
    "open_after_generate": false
  },
  "defaults": {
    "slide_width_inches": 13.333,
    "slide_height_inches": 7.5
  }
}
```

### tone-of-voice.md

Use the template in `references/tone-template.md` and fill with gathered voice information.

### brand-system.md

Use the template in `references/brand-template.md` and fill with gathered design information.
