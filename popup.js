// popup.js — ResumeAI Chrome Extension

// ─── Tab navigation ───────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ─── Load saved data on open ──────────────────────────────────────
chrome.storage.local.get(['apiKey', 'resume', 'tailoringStyle', 'targetRole'], (data) => {
  if (data.apiKey) document.getElementById('api-key-input').value = data.apiKey;
  if (data.resume) document.getElementById('resume-input').value = data.resume;
  if (data.tailoringStyle) document.getElementById('style-select').value = data.tailoringStyle;
  if (data.targetRole) document.getElementById('role-input').value = data.targetRole;
});

// ─── Detect if on Overleaf ────────────────────────────────────────
const banner = document.getElementById('detect-banner');
const dot = document.getElementById('detect-dot');
const detectText = document.getElementById('detect-text');
banner.style.display = 'flex';

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0]?.url || '';
  if (url.includes('overleaf.com/project')) {
    dot.className = 'dot dot-green';
    banner.className = 'detect-banner on-overleaf';
    detectText.textContent = 'Overleaf project detected — ready to inject';
  } else {
    dot.className = 'dot dot-red';
    banner.className = 'detect-banner not-overleaf';
    detectText.textContent = 'Open an Overleaf project to enable auto-inject';
  }
});

// ─── Save resume ──────────────────────────────────────────────────
document.getElementById('save-resume-btn').addEventListener('click', () => {
  const resume = document.getElementById('resume-input').value.trim();
  chrome.storage.local.set({ resume }, () => {
    const msg = document.getElementById('resume-save-msg');
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', 2500);
  });
});

// ─── Test Inject (no API cost) ────────────────────────────────────
document.getElementById('test-inject-btn').addEventListener('click', () => {
  const latex = document.getElementById('resume-input').value.trim();
  const msg = document.getElementById('test-inject-msg');

  if (!latex) {
    msg.style.color = 'var(--accent)';
    msg.textContent = '⚠ Paste your resume first.';
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', 3000);
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.url?.includes('overleaf.com/project')) {
      msg.style.color = 'var(--accent)';
      msg.textContent = '⚠ Open an Overleaf project tab first.';
      msg.style.display = 'block';
      setTimeout(() => msg.style.display = 'none', 3000);
      return;
    }

    const btn = document.getElementById('test-inject-btn');
    btn.disabled = true;
    btn.textContent = 'Injecting…';

    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, files: ['content.js'] },
      () => {
        chrome.runtime.lastError; // suppress
        chrome.tabs.sendMessage(tab.id, { action: 'injectLatex', latex }, (response) => {
          btn.disabled = false;
          btn.textContent = 'Test Inject';
          if (chrome.runtime.lastError || !response) {
            msg.style.color = 'var(--accent)';
            msg.textContent = '✗ Could not reach Overleaf. Refresh the project page.';
          } else if (response.success) {
            msg.style.color = 'var(--success)';
            msg.textContent = '✓ Injection works! Ready to use the real API.';
          } else {
            msg.style.color = 'var(--accent)';
            msg.textContent = '✗ ' + (response.error || 'Injection failed.');
          }
          msg.style.display = 'block';
          setTimeout(() => msg.style.display = 'none', 4000);
        });
      }
    );
  });
});

// ─── Save settings ────────────────────────────────────────────────
document.getElementById('save-settings-btn').addEventListener('click', () => {
  const apiKey = document.getElementById('api-key-input').value.trim();
  const tailoringStyle = document.getElementById('style-select').value;
  const targetRole = document.getElementById('role-input').value.trim();
  chrome.storage.local.set({ apiKey, tailoringStyle, targetRole }, () => {
    const msg = document.getElementById('settings-save-msg');
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', 2500);
  });
});

// ─── Step progress helpers ────────────────────────────────────────
function setStep(n, label) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById('step' + i);
    el.className = 'step' + (i < n ? ' done' : i === n ? ' active' : '');
  }
  document.getElementById('step-label').textContent = label;
}
function clearSteps() {
  for (let i = 1; i <= 4; i++) document.getElementById('step' + i).className = 'step';
  document.getElementById('step-label').textContent = '';
}

function showStatus(msg, type = '') {
  const box = document.getElementById('status-box');
  box.style.display = 'block';
  box.className = 'status-box' + (type ? ' ' + type : '');
  if (type === 'loading') {
    box.innerHTML = `<div class="spinner"></div><span>${msg}</span>`;
  } else {
    box.textContent = msg;
  }
}
function hideStatus() { document.getElementById('status-box').style.display = 'none'; }

// ─── Main: run optimization ───────────────────────────────────────
let generatedLatex = '';

document.getElementById('run-btn').addEventListener('click', async () => {
  const jd = document.getElementById('jd-input').value.trim();
  const resume = document.getElementById('resume-input').value.trim();

  chrome.storage.local.get(['apiKey', 'tailoringStyle', 'targetRole'], async (data) => {
    const apiKey = data.apiKey || document.getElementById('api-key-input').value.trim();
    const style = data.tailoringStyle || 'moderate';
    const role = data.targetRole || '';

    // ── Validate ──────────────────────────────────────────────────
    if (!apiKey) {
      showStatus('⚠ Please add your Anthropic API key in Settings.', 'error');
      return;
    }
    if (!jd) {
      showStatus('⚠ Please paste a job description.', 'error');
      return;
    }
    if (!resume) {
      showStatus('⚠ Please paste your base LaTeX resume in the "My Resume" tab.', 'error');
      return;
    }

    // ── UI: loading ───────────────────────────────────────────────
    const btn = document.getElementById('run-btn');
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="border-top-color:white"></div> Analyzing…`;
    document.getElementById('diff-wrap').style.display = 'none';
    document.getElementById('inject-row').style.display = 'none';
    clearSteps();

    const styleInstructions = {
      conservative: 'Make only minimal changes: inject relevant keywords from the job description into existing bullets. Do not restructure, reorder, or rewrite anything.',
      moderate: 'Reorder bullet points to lead with the most relevant experience, reframe achievements to match job language, and inject keywords naturally. Keep the overall structure intact.',
      aggressive: 'Aggressively rewrite the resume for maximum ATS keyword match and relevance. Reorder sections, rewrite bullets in the language of the job description, and emphasize the most relevant skills and projects.'
    };

    const systemPrompt = `You are an expert resume writer and ATS optimization specialist. You tailor LaTeX resumes to specific job descriptions.

                          RULES:
                          1. Return ONLY valid LaTeX code — no markdown, no explanations, no code fences.
                          2. Preserve ALL LaTeX formatting, packages, and document structure exactly.
                          3. Do not add or remove sections unless explicitly instructed.
                          4. ${styleInstructions[style]}
                          5. Never fabricate experience, skills, or accomplishments.
                          6. Preserve all \\begin{} \\end{} environments and custom commands.
                          ${role ? `7. The candidate is targeting roles as: ${role}` : ''}`;

                              const userPrompt = `Here is my current LaTeX resume:

                          <resume>
                          ${resume}
                          </resume>

                          Here is the job description I am applying to:

                          <job_description>
                          ${jd}
                          </job_description>

                          Please return my resume, updated to be tailored for this job. Return ONLY the complete LaTeX code.`;

    try {
      setStep(1, 'Sending resume + job description to Claude…');
      showStatus('Analyzing job description…', 'loading');

      // MOCK — remove when ready to use real API
      // await new Promise(r => setTimeout(r, 1500));
      // let latex = resume.replace(
      //   /\\section\{(.*?)\}/g,
      //   (m, s) => `\\section{${s}} % tailored for: ${jd.slice(0,40)}`
      // );

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      });

      // const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${apiKey}`
      //   },
      //   body: JSON.stringify({
      //     model: 'anthropic/claude-sonnet-4-5',
      //     max_tokens: 4000,
      //     messages: [
      //       { role: 'system', content: systemPrompt },
      //       { role: 'user', content: userPrompt }
      //     ]
      //   })
      // });


      setStep(2, 'Claude is rewriting your resume…');
      showStatus('Claude is tailoring your resume…', 'loading');

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || `API error ${response.status}`);
      }

      const result = await response.json();
      let latex = result.content?.[0]?.text || '';

      // Strip accidental markdown fences
      latex = latex.replace(/^```(?:latex)?\n?/i, '').replace(/\n?```$/i, '').trim();

      if (!latex.includes('\\') || !latex.includes('begin')) {
        throw new Error('The AI response did not appear to be valid LaTeX. Try again.');
      }

      generatedLatex = latex;

      setStep(3, 'Resume tailored — previewing changes…');
      showStatus('Resume tailored successfully!', 'success');

      // Show preview
      const diffWrap = document.getElementById('diff-wrap');
      const diffBody = document.getElementById('diff-body');
      const diffBadge = document.getElementById('diff-badge');
      diffBody.textContent = latex;
      const lineCount = latex.split('\n').length;
      diffBadge.textContent = `${lineCount} lines`;
      diffWrap.style.display = 'block';

      setStep(4, 'Ready to inject into Overleaf!');

      // Show action buttons
      document.getElementById('inject-row').style.display = 'flex';

    } catch (err) {
      showStatus('Error: ' + err.message, 'error');
      clearSteps();
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> Tailor Resume to This Job`;
    }
  });
});

// ─── Copy to clipboard ────────────────────────────────────────────
document.getElementById('copy-btn').addEventListener('click', () => {
  if (!generatedLatex) return;
  navigator.clipboard.writeText(generatedLatex).then(() => {
    const btn = document.getElementById('copy-btn');
    const orig = btn.textContent;
    btn.textContent = '✓ Copied!';
    setTimeout(() => btn.textContent = orig, 2000);
  });
});

// ─── Inject into Overleaf ─────────────────────────────────────────
document.getElementById('inject-btn').addEventListener('click', () => {
  if (!generatedLatex) return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.url?.includes('overleaf.com/project')) {
      showStatus('⚠ Please open your Overleaf project first, then click "Send to Overleaf".', 'error');
      return;
    }

    const btn = document.getElementById('inject-btn');
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="border-top-color:white;width:13px;height:13px;"></div> Injecting…`;

    function sendInject() {
      chrome.tabs.sendMessage(tab.id, {
        action: 'injectLatex',
        latex: generatedLatex
      }, (response) => {
        btn.disabled = false;
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg> Send to Overleaf`;

        if (chrome.runtime.lastError) {
          showStatus('Could not connect to Overleaf tab. Try refreshing your Overleaf project page.', 'error');
          return;
        }
        if (response?.success) {
          showStatus('✓ Resume injected into Overleaf! The editor has been updated.', 'success');
        } else {
          showStatus('Injection issue: ' + (response?.error || 'Unknown error. Try manually clicking into the Overleaf editor first.'), 'error');
        }
      });
    }

    // Ensure content script is loaded, then inject
    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, files: ['content.js'] },
      () => { chrome.runtime.lastError; sendInject(); }
    );
  });
});
