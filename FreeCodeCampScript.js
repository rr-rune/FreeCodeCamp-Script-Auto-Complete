// ==UserScript==
// @name         stable freeCodeCamp Auto-Solver (HTML/CSS)
// @namespace    http://tampermonkey.net/
// @version      1.35
// @description  Synchronized Modal Killer with cooldown-awareness to defeat the Bear Animation. (Siren Edition)
// @author       You
// @match        https://www.freecodecamp.org/learn/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=freecodecamp.org
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      www.freecodecamp.org
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // --- State Variables ---
  let isRunning = false;
  let loopToken = 0; // bumped on every start/stop so stale loops know they were cancelled

  // --- Utility: Delays, Audio & Keyboard Simulator ---
  // --- Background-tab support ---

  // 1) Make the page believe it's always visible (some sites pause work when hidden).
  try {
    const pageDoc = unsafeWindow.document;
    Object.defineProperty(pageDoc, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(pageDoc, 'visibilityState', { get: () => 'visible', configurable: true });
    const swallow = (e) => e.stopImmediatePropagation();
    pageDoc.addEventListener('visibilitychange', swallow, true);
    unsafeWindow.addEventListener('visibilitychange', swallow, true);
  } catch (e) {
    console.warn('[FCC Auto-Solver] Could not spoof page visibility.', e);
  }

  // 2) Timer that runs in a Web Worker, so Chrome's throttling of hidden-tab
  //    timers (1s steps, then once a minute after ~5 min) doesn't slow the script.
  const sleep = (() => {
    let worker = null;
    let nextId = 0;
    const pending = new Map();

    try {
      const src = 'self.onmessage=function(e){var id=e.data.id;setTimeout(function(){self.postMessage(id);},e.data.ms);};';
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      worker.onmessage = (e) => {
        const entry = pending.get(e.data);
        if (entry) {
          pending.delete(e.data);
          entry.resolve();
        }
      };
      worker.onerror = () => {
        console.warn('[FCC Auto-Solver] Worker timer blocked, falling back to normal timers.');
        worker = null;
        pending.forEach((entry) => setTimeout(entry.resolve, entry.ms));
        pending.clear();
      };
    } catch (e) {
      console.warn('[FCC Auto-Solver] Worker timer unavailable, using normal timers.', e);
      worker = null;
    }

    return (ms) => {
      if (!worker) return new Promise((resolve) => setTimeout(resolve, ms));
      return new Promise((resolve) => {
        const id = nextId++;
        pending.set(id, { resolve, ms });
        worker.postMessage({ id, ms });
      });
    };
  })();

  // 3) Keep-alive while running: an inaudible tone (tabs playing audio are exempt
  //    from throttling) plus a Web Lock (locked pages aren't frozen).
  const keepAlive = { ctx: null, osc: null, releaseLock: null };

  function startKeepAlive() {
    try {
      if (!keepAlive.ctx) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.001; // inaudible, but not digital silence
        osc.frequency.value = 30;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        keepAlive.ctx = ctx;
        keepAlive.osc = osc;
      }
      if (keepAlive.ctx.state === 'suspended') keepAlive.ctx.resume();
    } catch (e) {
      console.warn('[FCC Auto-Solver] Keep-alive audio failed.', e);
    }

    try {
      if (navigator.locks && !keepAlive.releaseLock) {
        let release;
        const held = new Promise((resolve) => { release = resolve; });
        navigator.locks.request('fcc-auto-solver-keepalive', () => held);
        keepAlive.releaseLock = release;
      }
    } catch (e) {
      console.warn('[FCC Auto-Solver] Web Lock failed.', e);
    }
  }

  function stopKeepAlive() {
    try {
      if (keepAlive.osc) keepAlive.osc.stop();
      if (keepAlive.ctx) keepAlive.ctx.close();
    } catch (e) { /* already stopped */ }
    keepAlive.ctx = null;
    keepAlive.osc = null;
    if (keepAlive.releaseLock) {
      keepAlive.releaseLock();
      keepAlive.releaseLock = null;
    }
  }

  function playNotificationSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      // 'sawtooth' provides a harsh, penetrating buzz ideal for a siren
      oscillator.type = 'sawtooth';

      const now = audioCtx.currentTime;

      // Crank the volume (0.3 is loud but safe from peaking out speakers)
      gainNode.gain.setValueAtTime(0.3, now);

      // Wailing frequency sweep pattern (Red Alert style)
      oscillator.frequency.setValueAtTime(600, now);
      oscillator.frequency.linearRampToValueAtTime(1200, now + 0.8);
      oscillator.frequency.linearRampToValueAtTime(600, now + 1.6);
      oscillator.frequency.linearRampToValueAtTime(1200, now + 2.4);
      oscillator.frequency.linearRampToValueAtTime(600, now + 3.2);

      // Fade out abruptly at the end to avoid audio pops
      gainNode.gain.setValueAtTime(0.3, now + 3.0);
      gainNode.gain.linearRampToValueAtTime(0.001, now + 3.2);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start(now);
      oscillator.stop(now + 3.2);
    } catch (e) {
      console.warn('[FCC Auto-Solver] Web Audio API blocked or not supported.', e);
    }
  }

  function simulateCtrlEnter() {
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    (document.activeElement || document.body).dispatchEvent(event);
  }

  // --- UI ---
  function updateUI() {
    const btn = document.getElementById('fcc-auto-btn');
    if (!btn) return;
    if (isRunning) {
      btn.innerText = '⏸ Stop Auto-Solve';
      btn.style.backgroundColor = '#d9534f';
    } else {
      btn.innerText = '▶ Start Auto-Solve';
      btn.style.backgroundColor = '#0a0a23';
    }
  }

  function initUI() {
    if (!document.body || document.getElementById('fcc-auto-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'fcc-auto-btn';
    Object.assign(btn.style, {
      position: 'fixed',
      top: '70px',
      right: '20px',
      zIndex: '999999',
      padding: '10px 16px',
      backgroundColor: '#0a0a23',
      color: '#ffffff',
      border: '2px solid #feac32',
      borderRadius: '5px',
      cursor: 'pointer',
      fontWeight: 'bold',
      fontFamily: 'sans-serif',
      boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
    });

    btn.addEventListener('click', () => {
      isRunning = !isRunning;
      loopToken++; // cancels any loop instance or pending wait from the previous run
      updateUI();
      if (isRunning) {
        startKeepAlive();
        runSolverLoop();
      } else {
        stopKeepAlive();
      }
    });

    document.body.appendChild(btn);
    updateUI();
  }

  function stopSolverWithError(msg = '⚠️ Error / Stopped') {
    isRunning = false;
    loopToken++;
    stopKeepAlive();
    const btn = document.getElementById('fcc-auto-btn');
    if (btn) {
      btn.innerText = msg;
      btn.style.backgroundColor = '#d9534f';
    }
  }

  // 🛡️ THE SYNCHRONIZED MODAL KILLER
  // The "ad" is freeCodeCamp's "Become a supporter" donation modal (.donation-modal).
  // It plays a bear animation with a 20s countdown. Its close button (button.close-button,
  // labelled "Ask me later") only exists once that countdown ends, so instead of sleeping a
  // fixed time we wait for the button to appear, click it, and confirm the modal is gone.
  function isDonationModalOpen() {
    return !!document.querySelector('.donation-modal, .donation-animation-container, #donation-animation');
  }

  function findDonationCloseButton() {
    const modal = document.querySelector('.donation-modal');
    if (modal) {
      const inside = Array.from(modal.querySelectorAll('button')).find((el) => {
        const label = (el.textContent || '').trim();
        return el.classList.contains('close-button') || /^(close|ask me later)$/i.test(label);
      });
      if (inside) return inside;
    }
    return Array.from(document.querySelectorAll('button, a'))
      .find((el) => /ask me later/i.test(el.textContent || '')) || null;
  }

  async function handleDonationModal(alive = () => true) {
    if (!isDonationModalOpen()) return false;

    console.log('🐻 [FCC Auto-Solver] Donation modal detected. Waiting for its countdown to finish...');
    const statusBtn = document.getElementById('fcc-auto-btn');
    const started = Date.now();
    let closeBtn = null;

    while (Date.now() - started < 90000) {
      if (!alive()) return true;
      closeBtn = findDonationCloseButton();
      if (closeBtn && !closeBtn.disabled) break;
      closeBtn = null;
      if (statusBtn) statusBtn.innerText = `⏳ Waiting out ad... ${Math.round((Date.now() - started) / 1000)}s`;
      await sleep(500);
    }
    if (!closeBtn) throw new Error('Donation modal never showed a close button (waited 90s).');

    await sleep(700); // let the button finish fading in
    for (let click = 1; click <= 2; click++) {
      console.log(`🐻 [FCC Auto-Solver] Countdown finished. Clicking "${(closeBtn.textContent || '').trim()}" (try ${click})...`);
      closeBtn.click();
      for (let i = 0; i < 20 && isDonationModalOpen(); i++) {
        if (!alive()) return true;
        await sleep(250);
      }
      if (!isDonationModalOpen()) break;
      closeBtn = findDonationCloseButton() || closeBtn;
    }
    if (isDonationModalOpen()) throw new Error('Donation modal did not close after clicking its close button.');

    updateUI(); // restore the normal button label
    await sleep(800);
    return true;
  }

  // --- Step 1: URL Parsing & Fetching Next Step Data ---
  function getNextStepDataUrl() {
    // Use pathname so any ?query or #hash on the URL can't break the match
    const match = window.location.pathname.match(/^(.*\/step-)(\d+)\/?$/);
    if (!match) return null;

    const basePath = match[1]; // e.g. /learn/.../step-
    const nextStep = parseInt(match[2], 10) + 1;

    return `https://www.freecodecamp.org/page-data${basePath}${nextStep}/page-data.json`;
  }

  function fetchNextStepSource(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        onload: function (response) {
          if (response.status === 200) {
            try {
              resolve(JSON.parse(response.responseText));
            } catch(e) {
              reject('Failed to parse JSON');
            }
          } else if (response.status === 404) {
            reject('END_OF_MODULE_404');
          } else {
            reject(`HTTP Error: ${response.status}`);
          }
        },
        onerror: function (err) {
          reject(err);
        }
      });
    });
  }

  function extractCodeFromData(json) {
    try {
      const challengeFiles = json.result.data.challengeNode.challenge.challengeFiles;
      let htmlCode = null;
      let cssCode = null;

      // Strip freeCodeCamp's editable-region marker lines if they're present in the seed
      const clean = (s) => (typeof s === 'string'
        ? s.replace(/^[ \t]*--fcc-editable-region--[ \t]*\r?\n?/gm, '')
        : s);

      challengeFiles.forEach(file => {
        if (file.ext === 'html') htmlCode = clean(file.contents);
        if (file.ext === 'css') cssCode = clean(file.contents);
      });

      return { htmlCode, cssCode };
    } catch (e) {
      return { htmlCode: null, cssCode: null };
    }
  }

  // --- Step 2: Smart-Toggle & Clipboard Paste Injection ---
  async function clickTabByFilename(filename) {
    const tabsContainer = document.querySelector('.monaco-editor-tabs');
    if (!tabsContainer) return;

    const tabs = Array.from(tabsContainer.querySelectorAll('button'));
    const targetTab = tabs.find(t => t.innerText.toLowerCase().includes(filename.toLowerCase()));

    if (targetTab) {
      if (targetTab.getAttribute('aria-expanded') !== 'true') {
        console.log(`[FCC Auto-Solver] Opening closed tab for ${filename}...`);
        targetTab.click();
        await sleep(500);
      }
    }
  }

  async function pasteIntoExactEditor(filename, code) {
    if (code === null) return;

    await clickTabByFilename(filename);

    console.log(`[FCC Auto-Solver] Hunting for ${filename} textarea...`);
    let textarea = null;

    for (let i = 0; i < 10; i++) {
      textarea = document.querySelector(`textarea[aria-label*="${filename}"]`);
      if (textarea) break;
      await sleep(200);
    }

    if (!textarea) {
      console.warn(`[FCC Auto-Solver] Could not locate the ${filename} textarea.`);
      return;
    }

    console.log(`[FCC Auto-Solver] Locked onto ${filename}. Pasting cleanly...`);
    textarea.focus();

    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, keyCode: 65, bubbles: true }));
    document.execCommand('selectAll', false, null);
    await sleep(200);

    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', keyCode: 46, bubbles: true }));
    document.execCommand('delete', false, null);
    await sleep(200);

    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', code);
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt
      });
      textarea.dispatchEvent(pasteEvent);
    } catch (e) {
      document.execCommand('insertText', false, code);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    await sleep(500);
  }

  // --- Step 2b: Verify editor contents, read failed-test hints, wait helpers ---
  const normalize = (s) => (s || '').replace(/\r\n/g, '\n').trim();

  function getMonacoModel(lang) {
    try {
      const m = unsafeWindow.monaco;
      if (!m || !m.editor) return null;
      return m.editor.getModels().find((md) => {
        const id = md.getLanguageId ? md.getLanguageId() : md.getModeId();
        return id === lang;
      }) || null;
    } catch (e) {
      return null;
    }
  }

  // Editor text for a language, or null if it can't be read.
  function getEditorText(lang) {
    const model = getMonacoModel(lang);
    return model ? model.getValue() : null;
  }

  function setViaMonaco(lang, code) {
    const model = getMonacoModel(lang);
    if (!model) return false;
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: code }], () => null);
    return true;
  }

  // true = both editors hold exactly the expected code, false = mismatch, null = can't tell
  function editorsMatch(htmlCode, cssCode) {
    let known = true;
    for (const [lang, code] of [['html', htmlCode], ['css', cssCode]]) {
      if (code === null) continue;
      const txt = getEditorText(lang);
      if (txt === null) { known = false; continue; }
      if (normalize(txt) !== normalize(code)) return false;
    }
    return known ? true : null;
  }

  async function fillEditor(filename, lang, code, attempt) {
    if (code === null) return;
    await clickTabByFilename(filename);

    const before = getEditorText(lang);
    if (before !== null && normalize(before) === normalize(code)) {
      console.log(`[FCC Auto-Solver] ${filename} already holds the right code, not pasting again.`);
      return;
    }

    if (attempt >= 2 && setViaMonaco(lang, code)) {
      console.log(`[FCC Auto-Solver] Attempt ${attempt}: wrote ${filename} through the Monaco API.`);
    } else {
      await pasteIntoExactEditor(filename, code);
    }
    await sleep(300);

    const after = getEditorText(lang);
    if (after !== null && normalize(after) !== normalize(code)) {
      console.warn(`[FCC Auto-Solver] ${filename} doesn't match after pasting, forcing it through the Monaco API...`);
      setViaMonaco(lang, code);
      await sleep(300);
    }
  }

  async function waitForUrlChange(fromUrl, timeoutMs) {
    const ticks = Math.ceil(timeoutMs / 250);
    for (let i = 0; i < ticks; i++) {
      await sleep(250);
      if (window.location.href !== fromUrl) return true;
    }
    return false;
  }

  // Failed test descriptions from freeCodeCamp's Tests panel (these ARE the hints).
  function readFailedTests() {
    const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll('li.test-result'))
      .filter((li) => /fail/i.test((li.querySelector('.sr-only') || {}).textContent || ''))
      .map((li) => text(li.querySelector('.test-output') || li).replace(/^(failed|passed|waiting)\s*:\s*/i, ''))
      .filter(Boolean);
  }

  // Last-resort scrape if the Tests panel markup changes.
  function readHintFallback() {
    const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll('[class*="hint" i], [class*="feedback" i], [role="alert"]'))
      .map(text).filter(Boolean).slice(0, 3);
  }

  async function ensureTestsPanel() {
    if (document.querySelector('li.test-result')) return;
    const btn = Array.from(document.querySelectorAll('button'))
      .find((b) => /^\s*(tests|console)\s*$/i.test(b.innerText || ''));
    if (btn) {
      btn.click();
      await sleep(500);
    }
  }

  function showStuckPanel(title, lines) {
    const old = document.getElementById('fcc-auto-hint');
    if (old) old.remove();
    if (!document.body) return;

    const box = document.createElement('div');
    box.id = 'fcc-auto-hint';
    Object.assign(box.style, {
      position: 'fixed', top: '120px', right: '20px', zIndex: '999999', maxWidth: '360px',
      padding: '12px 14px', background: '#0a0a23', color: '#ffffff', border: '2px solid #d9534f',
      borderRadius: '5px', fontFamily: 'sans-serif', fontSize: '13px', lineHeight: '1.4',
      boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
    });

    const head = document.createElement('div');
    head.style.fontWeight = 'bold';
    head.textContent = title;
    box.appendChild(head);

    lines.forEach((line) => {
      const row = document.createElement('div');
      row.style.marginTop = '6px';
      row.textContent = '• ' + line;
      box.appendChild(row);
    });

    const close = document.createElement('button');
    close.textContent = 'Dismiss';
    Object.assign(close.style, { marginTop: '10px', cursor: 'pointer' });
    close.addEventListener('click', () => box.remove());
    box.appendChild(close);

    document.body.appendChild(box);
  }

  // --- Step 3: Autonomous Main Loop ---
  async function runSolverLoop() {
    if (!isRunning) return;
    const myToken = loopToken;
    const alive = () => isRunning && myToken === loopToken;

    try {
      // 1. Clear stuck modal on init if necessary
      await handleDonationModal(alive);

      const currentUrl = window.location.href;
      const dataUrl = getNextStepDataUrl();

      if (!dataUrl) {
        console.warn('[FCC Auto-Solver] No valid step URL found.');
        stopSolverWithError('⚠️ Stopped');
        return;
      }

      console.log(`[FCC Auto-Solver] Fetching full code data from: ${dataUrl}`);
      const jsonData = await fetchNextStepSource(dataUrl);
      const { htmlCode, cssCode } = extractCodeFromData(jsonData);

      if (!htmlCode && !cssCode) {
        throw new Error('No code payload found in Step N+1 source.');
      }

      await sleep(1500);
      if (!alive()) return;

      // Fill the editors, submit, and retry sensibly if the step fails
      const maxAttempts = 3;
      let urlChanged = false;
      let lastFailed = [];

      for (let attempt = 1; attempt <= maxAttempts && !urlChanged; attempt++) {
        if (!alive()) return;

        await fillEditor('index.html', 'html', htmlCode, attempt);
        await fillEditor('styles.css', 'css', cssCode, attempt);
        await sleep(1000);

        console.log(`[FCC Auto-Solver] Attempt ${attempt}/${maxAttempts}: submitting...`);

        for (let press = 0; press < 3 && !urlChanged; press++) {
          if (!alive()) return; // Breaks if user manually clicked Stop

          // Pre-Submit Check: if the donation modal pops up, clear it, then cold restart.
          if (await handleDonationModal(alive)) {
            console.log('🛑 [FCC Auto-Solver] Modal cleared, resetting internal state...');

            await sleep(1500); // Give the modal close animation time
            if (!alive()) return;

            if (window.location.href === currentUrl) {
              console.log('⏭️ [FCC Auto-Solver] Sending one clean transition command...');
              simulateCtrlEnter();
              await sleep(3500); // Wait for the transition to N+1
              if (!alive()) return;
            }

            console.log('🔄 [FCC Auto-Solver] Performing cold restart...');
            loopToken++; // retire this instance, then start a fresh one
            runSolverLoop();
            return; // Completely terminate this execution instance
          }

          simulateCtrlEnter();
          urlChanged = await waitForUrlChange(currentUrl, 3000);
          if (urlChanged) break;

          // Tests ran and failed: pressing again with the same code can't help.
          if (readFailedTests().length) break;
        }
        if (urlChanged) break;

        await ensureTestsPanel();
        lastFailed = readFailedTests();
        console.warn(`[FCC Auto-Solver] Attempt ${attempt} did not pass.`, lastFailed);

        const verified = editorsMatch(htmlCode, cssCode);
        if (verified === true) {
          console.warn('[FCC Auto-Solver] The editor holds exactly the Step N+1 code and it still fails, so retrying the same code is pointless.');
          break;
        }
        if (verified === null && attempt >= 2) break; // can't verify the editor, don't keep re-pasting
      }

      if (urlChanged && alive()) {
        console.log('[FCC Auto-Solver] Moved to next step! Waiting for new page to render...');
        await sleep(2500);
        if (alive()) runSolverLoop();
      } else if (!urlChanged && alive()) {
        const hints = lastFailed.length ? lastFailed : readHintFallback();
        const lines = hints.length ? hints : ["Couldn't read the hint from the page. Check the Tests panel."];
        console.error('[FCC Auto-Solver] Stuck on this step. Failed check(s):', lines);
        playNotificationSound();
        stopSolverWithError('⚠️ Stuck - see hint');
        showStuckPanel('Stuck on this step. Needs a manual fix:', lines);
      }

    } catch (error) {
      if (error === 'END_OF_MODULE_404') {
        console.log('🎉 [FCC Auto-Solver] 404 detected. You have reached the final step!');
        playNotificationSound();
        stopSolverWithError('🏁 Final Step Reached!');
      } else {
        console.error('[FCC Auto-Solver] Error during auto-solve step:', error);
        stopSolverWithError();
      }
    }
  }

  // --- Init: Global Background Tasks ---
  setInterval(() => {
    initUI(); // Self-healing button
  }, 1000);
})();