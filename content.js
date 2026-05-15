// content.js — Injected into Overleaf project pages
// Handles receiving LaTeX from popup and inserting into the CodeMirror editor

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'injectLatex') {
    injectIntoOverleaf(message.latex)
      .then(result => sendResponse(result))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true; // keep channel open for async
  }
});

async function injectIntoOverleaf(latex) {
  // ── Strategy 1: CodeMirror 6 via main world (most reliable) ──────
  // Runs in the page's JS context via background.js, so it can access
  // CM6's EditorView reference that lives in the page's world.
  const cm6mw = await tryCodeMirror6MainWorld(latex);
  if (cm6mw.success) return cm6mw;

  // ── Strategy 2: CM6 contenteditable execCommand (fallback) ───────
  // Works if CM6's DOMObserver picks up the execCommand-triggered input event.
  const ce = tryContentEditable(latex);
  if (ce.success) return ce;

  // ── Strategy 3: CodeMirror 5 (older Overleaf) ────────────────────
  const cm5 = tryCodeMirror5(latex);
  if (cm5.success) return cm5;

  return {
    success: false,
    error: 'Could not find the Overleaf editor. Make sure a .tex file is open and focused in the editor.'
  };
}

// ── CM6 contenteditable injection ────────────────────────────────
// CM6's .cm-content is a contenteditable div. Selecting all and calling
// execCommand('insertText') fires CM6's internal domchange handler, which
// syncs the new text into the EditorState — no EditorView ref needed.
function tryContentEditable(latex) {
  try {
    const contentEl = document.querySelector('.cm-content');
    if (!contentEl || !contentEl.isContentEditable) return { success: false };

    contentEl.focus();

    // Select all existing content
    const range = document.createRange();
    range.selectNodeContents(contentEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    // Replace selection — triggers CM6's native input handling
    const ok = document.execCommand('insertText', false, latex);
    if (!ok) {
      // execCommand can return false without throwing; fall through
      return { success: false, error: 'execCommand returned false' };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── CodeMirror 6 via main world (no inline script injection) ──────
// Sends to background.js which uses chrome.scripting.executeScript
// with world:'MAIN' — this runs as an extension script, not inline,
// so it is not blocked by Overleaf's CSP.
function tryCodeMirror6MainWorld(latex) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'injectLatexMainWorld', latex },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { success: false, error: 'No response from background' });
        }
      }
    );
  });
}

// ── CodeMirror 5 approach ──────────────────────────────────────────
function tryCodeMirror5(latex) {
  try {
    // CM5 exposes instances on the global or as .CodeMirror on wrapper elements
    const cmEl = document.querySelector('.CodeMirror');
    if (!cmEl) return { success: false };

    const cm = cmEl.CodeMirror;
    if (!cm) return { success: false };

    cm.setValue(latex);
    cm.refresh();
    cm.focus();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}


// ── Notify that content script is ready ───────────────────────────
console.log('[ResumeAI] Content script loaded on', window.location.href);
