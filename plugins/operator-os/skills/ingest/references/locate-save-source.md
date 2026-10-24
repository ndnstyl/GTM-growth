# Locate or save the source

If source is:
- **Already in raw/**: read directly from path
- **A URL**: WebFetch the content, save to `raw/{type}-{slug}_{YYYY-MM-DD}.md` first, then read from local
- **Pasted text**: ask the operator for type + slug, save to `raw/{type}-{slug}_{YYYY-MM-DD}.md`, then read
- **A PDF**: use `pdftotext` or `mutool draw` to extract text first, save extracted text alongside the PDF in raw/
- **An audio transcript**: file as `raw/transcript-{slug}_{YYYY-MM-DD}.md`

Determine which vault to operate in:
- General-purpose content → main vault `$OPERATOR_VAULT/`
- Client-specific content → client vault `$CLAUDE_PROJECT_DIR/projects/{client-slug}/`
