// background.js — Service Worker for ResumeAI extension

chrome.runtime.onInstalled.addListener(() => {
  console.log('[ResumeAI] Extension installed.');
});

// Relay messages between popup and content scripts if needed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getActiveTab') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs[0] });
    });
    return true;
  }

  // Inject latex into the CM6 editor running in the page's main world.
  // Using chrome.scripting.executeScript with world:'MAIN' runs the function
  // as an extension script — it is NOT treated as an inline script and is
  // therefore not blocked by Overleaf's Content Security Policy.
  if (message.action === 'injectLatexMainWorld') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false, error: 'No sender tab ID' });
      return true;
    }

    chrome.scripting.executeScript({
      target: { tabId },
      func: injectLatexInMainWorld,
      args: [message.latex],
      world: 'MAIN'
    }).then(results => {
      sendResponse(results[0]?.result ?? { success: false, error: 'No result returned' });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });

    return true; // async response
  }
});

// Runs in the page's main JS context (world: 'MAIN').
function injectLatexInMainWorld(latex) {
  // ── A: CM6 cmView chain ──────────────────────────────────────────
  // CM6 stores the DocView on .cm-content via the `cmView` property,
  // and DocView.view is the EditorView. This is the most reliable path.
  try {
    const view = document.querySelector('.cm-content')?.cmView?.view;
    if (view && typeof view.dispatch === 'function') {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: latex },
        selection: { anchor: 0 }
      });
      view.focus();
      return { success: true };
    }
  } catch (_) {}

  // ── B: execCommand on contenteditable ───────────────────────────
  try {
    const contentEl = document.querySelector('.cm-content');
    if (contentEl?.isContentEditable) {
      contentEl.focus();
      const range = document.createRange();
      range.selectNodeContents(contentEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      if (document.execCommand('insertText', false, latex)) {
        return { success: true };
      }
    }
  } catch (_) {}

  // ── C: property + symbol scan across the editor DOM ─────────────
  // Includes Object.getOwnPropertySymbols because CM6 may key the view
  // with a Symbol, which getOwnPropertyNames misses.
  try {
    function looksLikeView(v) {
      return v && typeof v === 'object' && v.state && typeof v.dispatch === 'function';
    }
    function findView(el) {
      const keys = [...Object.getOwnPropertyNames(el), ...Object.getOwnPropertySymbols(el)];
      for (const k of keys) {
        try { const v = el[k]; if (looksLikeView(v)) return v; } catch (_) {}
      }
      return null;
    }

    const candidates = [
      document.querySelector('.cm-content'),
      document.querySelector('.cm-editor'),
    ];
    let el = candidates[1]?.parentElement;
    for (let i = 0; i < 5 && el; i++, el = el.parentElement) candidates.push(el);

    let view = null;
    for (const t of candidates) {
      if (t) { view = findView(t); if (view) break; }
    }

    if (!view) return { success: false, error: 'EditorView not found' };

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: latex },
      selection: { anchor: 0 }
    });
    view.focus();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
