# ResumeAI — Overleaf Resume Optimizer
### Chrome Extension

Paste a job description → Claude tailors your LaTeX resume → Inject directly into Overleaf.

---

## Installation

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this folder (`resume-extension/`)

The ResumeAI icon will appear in your Chrome toolbar.

---

## Setup (one-time)

### 1. Add your Anthropic API Key
- Click the extension icon
- Go to the **Settings** tab
- Paste your API key from [console.anthropic.com](https://console.anthropic.com)
- Click **Save Settings**

### 2. Save your base LaTeX resume
- Go to the **My Resume** tab
- Paste your full Overleaf LaTeX resume source
- Click **Save Resume**

Your resume is stored locally in Chrome — never uploaded anywhere.

---

## Usage

1. Open your Overleaf project (the tab with `overleaf.com/project/...`)
2. Make sure the `.tex` file you want to update is open in the editor
3. Click the ResumeAI extension icon
4. Paste the job description in the **Optimize** tab
5. Click **Tailor Resume to This Job**
6. Review the LaTeX preview
7. Click **Send to Overleaf** — your editor will be updated instantly

---

## Tailoring Styles

| Style | What it does |
|-------|-------------|
| **Conservative** | Keyword injection only — minimal changes |
| **Moderate** | Reorders bullets, reframes achievements (recommended) |
| **Aggressive** | Full rewrite for maximum ATS keyword match |

---

## How it works

1. **Popup** sends your base resume + job description to Claude via the Anthropic API
2. **Claude** returns tailored LaTeX
3. **Content script** (injected into Overleaf) receives the LaTeX and replaces the editor content using CodeMirror's API
4. Overleaf re-renders the PDF automatically

---

## Privacy

- Your API key is stored only in `chrome.storage.local` (your device)
- Your resume is stored only locally
- The only external request is to `api.anthropic.com` — your data is governed by Anthropic's API terms
- No data is ever sent to any other server

---

## Troubleshooting

**"Could not connect to Overleaf tab"**
→ Refresh your Overleaf project page and try again

**"EditorView not found"**
→ Click inside the Overleaf editor to focus it, then try injecting again

**"The AI response did not appear to be valid LaTeX"**
→ Try again — this is rare. If it persists, check that your base resume is valid LaTeX

**API key error**
→ Make sure your key starts with `sk-ant-` and has billing enabled at console.anthropic.com
