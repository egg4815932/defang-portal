(function () {
  'use strict';
  const assetBase = new URL('.', document.currentScript.src);
  const embedded = window.DFAIEmbedded;
  const host = document.createElement('div');
  host.id = 'defangAI';
  host.hidden = true;
  // Shadow DOM 的外部樣式不阻擋首屏；備齊前禁止露出未定尺寸的 SVG。
  host.style.setProperty('display', 'none', 'important');
  const shadow = host.attachShadow({ mode: 'open' });
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('ai-live.css?v=20260922-3', assetBase).href;
  shadow.appendChild(css);
  const compactCss = document.createElement('link');
  compactCss.rel = 'stylesheet'; compactCss.href = new URL('ai-live-compact.css?v=20260922-3', assetBase).href;
  shadow.appendChild(compactCss);
  const scenarioCss = document.createElement('link');
  scenarioCss.rel = 'stylesheet'; scenarioCss.href = new URL('ai-scenarios.css?v=20260922-3', assetBase).href;
  shadow.appendChild(scenarioCss);
  if (embedded) {
    const embeddedCss = document.createElement('link'); embeddedCss.rel = 'stylesheet';
    embeddedCss.href = new URL('ai-live-embedded.css?v=20260920-5', assetBase).href; shadow.appendChild(embeddedCss);
  }
  const heartCss = document.createElement('link');
  heartCss.rel = 'stylesheet'; heartCss.href = new URL('ai-live-heart.css?v=20260922-4', assetBase).href;
  shadow.appendChild(heartCss);
  const stylesReady = Promise.all(Array.from(shadow.querySelectorAll('link')).map(link => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('AI 頁面樣式載入逾時，請重新整理後再試')), 20000);
    link.onload = () => { clearTimeout(timer); resolve(); };
    link.onerror = () => { clearTimeout(timer); reject(new Error('AI 頁面樣式載入失敗，請重新整理後再試')); };
  }))).then(() => { host.style.removeProperty('display'); });
  stylesReady.catch(() => {}); // 由開啟頁面的呼叫端顯示錯誤。
  document.body.appendChild(host);
  let peer = null, origin = '', nonce = '', current = null, sequence = 0, lastActivity = 0, openSequence = 0;
  const pending = new Map();
  const views = {};

  function post(type, extra) {
    if (embedded) { if (type === 'ai-live-activity') embedded.activity(); return; }
    if (peer) peer.postMessage(Object.assign({ defang: type, nonce: nonce }, extra || {}), origin);
  }
  function activity() {
    if (Date.now() - lastActivity < 15000) return;
    lastActivity = Date.now();
    post('ai-live-activity');
  }
  function ticket(options, type) {
    if (embedded) return embedded.request(type || 'ai-live-ticket', options);
    return new Promise((resolve, reject) => {
      const id = String(++sequence);
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('系統連線逾時，請重新登入後再試'));
      }, 45000);
      pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      post(type || 'ai-live-ticket', { requestId: id, options: options });
    });
  }
  function cancelPending() {
    pending.forEach(request => { clearTimeout(request.timer); request.reject(new Error('連線已取消')); });
    pending.clear();
  }
  function controls(view, active, ready) {
    view.busy = active;
    view.start.hidden = active;
    view.stop.hidden = !active;
    view.mute.hidden = !active;
    view.mute.disabled = !ready;
    view.quick.forEach(button => { button.disabled = !ready; });
    if (view.material) view.material.disabled = active;
    view.settings.lock(active);
    scenarios.lock(active);
    view.feedback.lock(active, active && view.testing);
    view.capture.lock(active, ready && !view.muted || active && view.testing);
    if (active && !view.testing && view.sessionSettings && view.sessionSettings.provider === 'openai') {
      view.capture.record.disabled = true;
      view.capture.status.textContent = 'GPT-Live 通話使用 WebRTC；通話中不提供 PCM 取樣，結束後可做本機試錄。';
    }
    view.stop.textContent = view.testing ? '結束測試' : '結束通話';
    view.mute.hidden = !active || view.testing;
    clearInterval(view.keepAlive);
    if (active) view.keepAlive = setInterval(() => {
      if (view.client.run && view.client.run.ready && !view.muted) activity();
    }, 15000);
    if (!active) { view.mute.textContent = '靜音'; view.muted = false; }
    if (view.compact) view.compact.refresh();
    if (view.manual) {
      view.manual.hidden = !active || view.testing || !view.sessionSettings || view.sessionSettings.automatic !== 'off';
      view.manual.disabled = !ready || view.muted;
      view.manual.textContent = view.client && view.client.run && view.client.run.manualSpeaking ? '送出這段話' : '開始說話';
      view.manual.setAttribute('aria-pressed', String(!!(view.client && view.client.run && view.client.run.manualSpeaking)));
    }
  }
  function status(view, text, error) {
    view.status.textContent = view.compact ? view.compact.status(text, error) : text;
    view.status.classList.toggle('error', !!error);
  }
  function append(view, event) {
    if (event.newLine) delete view.lines[event.role];
    const subtitles = view.sessionSettings ? view.sessionSettings.subtitles : view.settings.get().subtitles;
    if (subtitles === 'off' || (subtitles !== 'both' && subtitles !== event.role)) return;
    if (!view.lines[event.role]) {
      const empty = view.log.querySelector('.empty');
      if (empty) empty.remove();
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.dataset.role = event.role;
      const who = document.createElement('b');
      who.textContent = event.role === 'user' ? '你' : 'AI';
      const text = document.createElement('span');
      bubble.append(who, text);
      view.log.appendChild(bubble);
      view.lines[event.role] = text;
      while (view.log.children.length > 100) view.log.firstElementChild.remove();
    }
    const line = view.lines[event.role];
    line.textContent = (line.textContent + event.text).slice(-20000);
    view.log.scrollTop = view.log.scrollHeight;
  }
  function end(view, message) {
    if (!view.client) return;
    view.version++;
    view.client.stop();
    controls(view, false, false);
    if (message) status(view, message);
  }
  function close() {
    openSequence++;
    if (current) end(current, '通話已結束');
    current = null;
    cancelPending();
    host.hidden = true;
    Object.values(views).forEach(view => {
      if (view.client) { view.capture.clear(); view.compact.close(); view.settings.close(); }
      view.page.hidden = true;
    });
  }
  function resetAll() {
    close();
    Object.values(views).forEach(view => {
      if (!view.client) return;
      view.empty();
      if (view.material) { view.material.value = ''; view.page.querySelector('.count').textContent = '0 / 12,000 字'; }
      view.compact.refresh();
      status(view, view.mode === 'tutor' ? '先貼上教材，再開始陪練' : '準備好就按開始對話');
    });
    scenarios.reset();
    peer = null; origin = ''; nonce = '';
  }
  function makeView(mode) {
    const tutor = mode === 'tutor';
    const page = document.createElement('section');
    page.className = 'page';
    page.id = 'ai-' + mode;
    page.hidden = true;
    page.setAttribute('role', 'dialog');
    page.setAttribute('aria-modal', 'true');
    page.setAttribute('aria-label', tutor ? 'AI 語音設定' : 'AI 語音對話');
    page.innerHTML = '<header><button type="button" data-close>← 返回系統</button><div><h1>' +
      (tutor ? 'AI 語音設定' : 'AI 語音對話') + '</h1><p class="sub">' +
      (tutor ? '貼上教材，一起弄懂，再練習說出答案。' : '像打電話一樣，直接說出你想問的事。') +
      '</p></div></header><div class="model-row"><label for="model-' + mode + '">Gemini 3.8</label>' +
      '<select id="model-' + mode + '"><option value="gemini-3.8-live">一般版（Live）</option>' +
      '<option value="gemini-3.8-live-extended-thinking">Extended Thinking</option><option value="gpt-live-1">GPT-Live-1</option></select>' +
      '<button type="button" data-settings>對話設定</button>' +
      '<span class="note">切換模型後，按開始建立新對話。</span></div><div class="workspace">' +
      (tutor ? '<aside class="material"><h2><label for="material-tutor">這次要練習的教材</label></h2>' +
        '<p class="note">可以貼一段課文、產品說明或工作流程。</p><textarea id="material-tutor" maxlength="12000" placeholder="把教材文字貼在這裡…"></textarea>' +
        '<div class="count">0 / 12,000 字</div></aside>' : '') +
      '<div class="conversation"><div class="transcript" role="log" aria-label="本次對話文字"></div>' +
      (tutor ? '<div class="quick"><button type="button" data-prompt="請根據教材，分成簡短的小段講解，先講第一個重點。">講解教材</button>' +
        '<button type="button" data-prompt="請根據教材出一道口頭練習題，等我回答後再給回饋，不要先公布答案。">出題練習</button></div>' : '') +
      '</div></div><footer><div class="status-wrap"><p class="status" role="status" aria-live="polite">' +
      (tutor ? '先貼上教材，再開始陪練' : '準備好就按開始對話') +
      '</p><p class="note">開始後會將聲音' + (tutor ? '與教材' : '') + '送至選用的 AI 服務；僅手動試聽會暫存本機音檔。</p></div>' +
      '<div class="controls"><button type="button" class="primary" data-start>' + (tutor ? '開始陪練' : '開始對話') +
      '</button><button type="button" data-mute hidden>靜音</button><button type="button" class="stop" data-stop hidden>結束通話</button></div></footer>';
    shadow.appendChild(page);
    const view = {
      mode: mode, page: page, model: page.querySelector('select'), material: page.querySelector('textarea'),
      log: page.querySelector('.transcript'), status: page.querySelector('.status'),
      start: page.querySelector('[data-start]'), stop: page.querySelector('[data-stop]'),
      mute: page.querySelector('[data-mute]'), quick: Array.from(page.querySelectorAll('[data-prompt]')),
      lines: {}, version: 0, busy: false, muted: false
    };
    view.settings = new window.DFAISettings(mode, view.model);
    view.settings.get = () => scenarios.current().settings;
    view.settings.open = () => {}; // 設定頁只能從有權限的系統側欄進入。
    view.settings.valid = () => !scenarios.loading;
    view.feedback = new window.DFAIFeedback(mode);
    const volumeKey = 'defang.ai.volume';
    let volumePercent = 100;
    try { volumePercent = Math.max(0, Math.min(200, Number(localStorage.getItem(volumeKey)) || 100)); } catch (error) {}
    view.feedback.setVolume(volumePercent);
    view.feedback.volume.addEventListener('input', () => {
      volumePercent = Number(view.feedback.volume.value);
      try { localStorage.setItem(volumeKey, String(volumePercent)); } catch (error) {}
      if (view.client) view.client.volume(volumePercent / 100);
      activity();
    });
    page.querySelector('.conversation').prepend(view.feedback.element);
    view.capture = new window.DFAICapture(async () => {
      if (current !== view || view.capture.active) return;
      if (!view.busy) {
        view.testing = true;
        controls(view, true, false);
        view.capture.record.disabled = true;
        const started = await view.client.start(null, view.feedback.select.value, view.settings.get());
        if (!started || current !== view || !view.client.run) return;
      }
      const run = view.client.run;
      if (!run || run.muted || !run.testing && !run.ready) return;
      view.capture.start(!run.testing);
    }, () => {
      if (view.testing && view.client.run) end(view, '試錄已結束，可以播放處理後的聲音');
    });
    view.feedback.element.after(view.capture.element);
    view.feedback.test.addEventListener('click', async () => {
      if (view.testing && view.busy) { end(view, '麥克風測試已結束'); return; }
      if (view.busy || current !== view) return;
      view.testing = true;
      controls(view, true, false);
      await view.client.start(null, view.feedback.select.value, view.settings.get());
    });
    view.feedback.resume.addEventListener('click', () => view.client.resumeAudio());
    page.appendChild(view.settings.element);

    function empty() {
      view.lines = {};
      if (view.compact) { view.log.innerHTML = view.compact.empty(); return; }
      view.log.innerHTML = '<div class="empty"><div class="orb" aria-hidden="true">' + (tutor ? '✦' : '◉') +
        '</div><strong>' + (tutor ? '從一段文字，開始練習' : '你說，我聽') +
        '</strong><p>' + (view.settings.get().subtitles === 'off' ? '字幕已關閉，仍可正常語音對話。' :
          tutor ? '可以請 AI 解釋，也可以讓 AI 問你。' : '用自己的步調說話，也可以按靜音暫停收音。') + '</p></div>';
    }
    view.empty = empty;
    empty();
    view.client = new window.DFLiveClient({
      state: text => status(view, text),
      text: event => append(view, event),
      turn: () => { view.lines = {}; },
      ready: info => {
        controls(view, true, true);
        view.client.volume(volumePercent / 100);
        if (!info.resumed && view.sessionSettings.provider !== 'openai' && view.sessionSettings.autoGreeting === 'on') view.client.prompt(view.sessionSettings.opening);
      },
      ended: () => { view.capture.finish(); controls(view, false, false); },
      error: text => status(view, text, true),
      activity: activity,
      inputLevel: event => view.feedback.level('input', event),
      inputPCM: event => view.capture.add(event),
      outputLevel: event => view.feedback.level('output', event),
      inputState: state => view.feedback.state(state),
      device: info => view.feedback.device(info)
    }, new URL('ai-live-processor.js?v=20260919-1', assetBase).href);
    view.start.addEventListener('click', async () => {
      if (view.busy || current !== view) return;
      if (scenarios.loading) { status(view, '情境載入中，請稍候'); return; }
      const scene = scenarios.current();
      if (scene.settings.requireMaterial === 'on' && !scene.material) { status(view, '此情境需要教材，請到情境設定加入並儲存', true); return; }
      if (!view.settings.valid()) return;
      view.sessionSettings = Object.assign({}, scene.settings, { provider: scene.model === 'gpt-live-1' ? 'openai' : 'gemini' });
      if (view.sessionSettings.provider === 'openai') view.sessionSettings.automatic = 'on';
      view.model.value = scene.model;
      const options = { scenario: scene };
      view.version++;
      const version = view.version;
      view.testing = false;
      empty();
      controls(view, true, false);
      activity();
      await view.client.start(extra => scene.model === 'gpt-live-1' ? ticket(Object.assign({ scenario: scene }, extra), 'ai-openai-session') : ticket(options), view.feedback.select.value, view.sessionSettings);
      if (view.version === version && !view.client.run) controls(view, false, false);
    });
    view.stop.addEventListener('click', () => { end(view, '通話已結束；再次開始會建立新對話'); cancelPending(); });
    view.mute.addEventListener('click', () => {
      view.muted = !view.muted;
      view.capture.finish();
      view.client.mute(view.muted);
      view.capture.lock(true, !view.muted && view.client.run && view.client.run.ready);
      view.mute.textContent = view.muted ? '取消靜音' : '靜音';
      view.compact.refresh();
      controls(view, true, true);
      activity();
    });
    view.model.addEventListener('change', () => {
      view.settings.save();
      end(view, '已切換模型，按開始建立新對話');
      view.capture.clear();
      cancelPending();
      activity();
    });
    page.querySelector('[data-close]').addEventListener('click', close);
    view.quick.forEach(button => button.addEventListener('click', () => {
      view.lines = {};
      append(view, { role: 'user', text: button.getAttribute('aria-label') || button.textContent });
      view.lines = {};
      view.client.prompt(button.dataset.prompt);
      activity();
    }));
    if (view.material) view.material.addEventListener('input', () => {
      page.querySelector('.count').textContent = view.material.value.length.toLocaleString() + ' / 12,000 字';
      activity();
    });
    view.compact = new window.DFAICompact(view);
    page.querySelector('[data-settings]').remove();
    view.manual = document.createElement('button'); view.manual.type = 'button'; view.manual.className = 'manual-turn'; view.manual.dataset.manualTurn = '';
    view.manual.hidden = true; view.manual.textContent = '開始說話';
    view.manual.onclick = () => { if (view.client.manualTurn()) controls(view, true, true); activity(); };
    page.querySelector('.controls').prepend(view.manual);
    page.querySelector('header').after(scenarios.picker, scenarios.info);
    view.compact = window.DFAIHeart(view, view.compact);
    empty(); status(view, view.status.textContent);
    controls(view, false, false);
    return view;
  }
  const scenarios = new window.DFAIScenarios({ rpc: options => ticket(options, 'ai-live-scenarios'), notesRpc: options => ticket(options, 'ai-live-voice-notes'), activity: activity,
    use: () => switchView('chat'), change: scene => {
      if (views.chat) {
        views.chat.model.value = scene.model;
        views.chat.settings.element.dispatchEvent(new Event('close'));
        if (!views.chat.busy) { views.chat.capture.clear(); views.chat.empty(); }
      }
    } });
  views.chat = makeView('chat');
  views.tutor = { page: scenarios.page };
  shadow.appendChild(scenarios.page);
  scenarios.page.querySelector('[data-close]').onclick = close;
  function switchView(mode) {
    if (current) {
      end(current);
      if (current.client) { current.capture.clear(); current.compact.close(); current.settings.close(); }
      current.page.hidden = true;
    }
    current = views[mode]; current.page.hidden = false;
    if (embedded) embedded.select(mode);
    if (mode === 'tutor') scenarios.edit();
    else current.feedback.devices();
    scenarios.load();
    if (!embedded) current.page.querySelector('[data-close]').focus();
    activity();
  }

  function trusted(event) {
    const frame = document.querySelector('#appFrameViewport > iframe');
    if (!frame || !/^https:\/\/(?:[a-z0-9-]+-)?script\.googleusercontent\.com$/.test(event.origin)) return false;
    try {
      // Google 線上會再包一層同來源 userCodeAppPanel；只接受既有 GAS iframe 的後代。
      var source = event.source;
      for (var depth = 0; source && depth < 4; depth++) {
        if (source === frame.contentWindow) return true;
        if (source === source.parent) break;
        source = source.parent;
      }
    } catch (error) {}
    return false;
  }
  window.addEventListener('message', event => {
    if (embedded) return;
    const message = event.data;
    if (!message || !trusted(event)) return;
    if (message.defang === 'ai-live-open') {
      if (!views[message.mode] || typeof message.nonce !== 'string' || message.nonce.length < 16) return;
      close();
      peer = event.source; origin = event.origin; nonce = message.nonce;
      const opening = openSequence;
      stylesReady.then(() => {
        if (opening !== openSequence || peer !== event.source || nonce !== message.nonce) return;
        host.hidden = false;
        switchView(message.mode);
        post('ai-live-opened');
      }).catch(() => { if (opening === openSequence) close(); });
      return;
    }
    if (event.source !== peer || event.origin !== origin || message.nonce !== nonce) return;
    if (message.defang === 'ai-live-reset') {
      resetAll();
      return;
    }
    if (message.defang !== 'ai-live-result') return;
    const request = pending.get(message.requestId);
    if (!request) return;
    pending.delete(message.requestId);
    clearTimeout(request.timer);
    if (message.result && message.result.ok) request.resolve(message.result.ticket);
    else request.reject(new Error(message.result && message.result.error || '連線未成功'));
  });
  shadow.addEventListener('keydown', event => {
    if (embedded) { activity(); return; }
    if (current && current.client && (current.settings.element.open || current.compact.open)) { activity(); return; }
    if (event.key === 'Escape') close();
    if (event.key === 'Tab' && current) {
      const focusable = Array.from(current.page.querySelectorAll('button,input,select,textarea,summary,audio[controls]')).filter(el => !el.disabled && !el.hidden && el.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && shadow.activeElement === first) { last.focus(); event.preventDefault(); }
      if (!event.shiftKey && shadow.activeElement === last) { first.focus(); event.preventDefault(); }
    }
    activity();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && current && current.client) { end(current, '已暫停收音，按開始重新連線'); current.capture.clear(); cancelPending(); }
  });
  window.addEventListener('pagehide', close);
  const app = document.querySelector('#appFrameViewport > iframe');
  if (app) app.addEventListener('load', resetAll);
  if (embedded) {
    Object.values(views).forEach(view => { view.page.setAttribute('role', 'region'); view.page.removeAttribute('aria-modal'); });
    embedded.mount({ ready: stylesReady, open: mode => { host.hidden = false; switchView(mode); }, close, reset: resetAll });
  }
})();
