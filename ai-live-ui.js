(function () {
  'use strict';
  const assetBase = new URL('.', document.currentScript.src);
  const host = document.createElement('div');
  host.id = 'defangAI';
  host.hidden = true;
  const shadow = host.attachShadow({ mode: 'open' });
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('ai-live.css?v=20260919-4', assetBase).href;
  shadow.appendChild(css);
  document.body.appendChild(host);
  let peer = null, origin = '', nonce = '', current = null, sequence = 0, lastActivity = 0;
  const pending = new Map();
  const views = {};

  function post(type, extra) {
    if (peer) peer.postMessage(Object.assign({ defang: type, nonce: nonce }, extra || {}), origin);
  }
  function activity() {
    if (Date.now() - lastActivity < 15000) return;
    lastActivity = Date.now();
    post('ai-live-activity');
  }
  function ticket(options) {
    return new Promise((resolve, reject) => {
      const id = String(++sequence);
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('系統連線逾時，請重新登入後再試'));
      }, 45000);
      pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      post('ai-live-ticket', { requestId: id, options: options });
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
    view.feedback.lock(active, active && view.testing);
    view.stop.textContent = view.testing ? '結束測試' : '結束通話';
    view.mute.hidden = !active || view.testing;
    clearInterval(view.keepAlive);
    if (active) view.keepAlive = setInterval(() => {
      if (view.client.run && view.client.run.ready && !view.muted) activity();
    }, 15000);
    if (!active) { view.mute.textContent = '靜音'; view.muted = false; }
  }
  function status(view, text, error) {
    view.status.textContent = text;
    view.status.classList.toggle('error', !!error);
  }
  function append(view, event) {
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
    view.version++;
    view.client.stop();
    controls(view, false, false);
    if (message) status(view, message);
  }
  function close() {
    if (current) end(current, '通話已結束');
    current = null;
    cancelPending();
    host.hidden = true;
    Object.values(views).forEach(view => { view.settings.close(); view.page.hidden = true; });
  }
  function resetAll() {
    close();
    Object.values(views).forEach(view => {
      view.empty();
      if (view.material) { view.material.value = ''; view.page.querySelector('.count').textContent = '0 / 12,000 字'; }
      status(view, view.mode === 'tutor' ? '先貼上教材，再開始陪練' : '準備好就按開始對話');
    });
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
    page.setAttribute('aria-label', tutor ? 'AI 教材陪練' : 'AI 語音對話');
    page.innerHTML = '<header><button type="button" data-close>← 返回系統</button><div><h1>' +
      (tutor ? 'AI 教材陪練' : 'AI 語音對話') + '</h1><p class="sub">' +
      (tutor ? '貼上教材，一起弄懂，再練習說出答案。' : '像打電話一樣，直接說出你想問的事。') +
      '</p></div></header><div class="model-row"><label for="model-' + mode + '">Gemini 3.8</label>' +
      '<select id="model-' + mode + '"><option value="gemini-3.8-live">一般版（Live）</option>' +
      '<option value="gemini-3.8-live-extended-thinking">Extended Thinking</option></select>' +
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
      '</p><p class="note">開始後會將聲音' + (tutor ? '與教材' : '') + '送至 Gemini；此系統不保存錄音。</p></div>' +
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
    view.feedback = new window.DFAIFeedback(mode);
    page.querySelector('.conversation').prepend(view.feedback.element);
    view.feedback.test.addEventListener('click', async () => {
      if (view.testing && view.busy) { end(view, '麥克風測試已結束'); return; }
      if (view.busy || current !== view) return;
      view.testing = true;
      controls(view, true, false);
      await view.client.start(null, view.feedback.select.value);
    });
    view.feedback.resume.addEventListener('click', () => view.client.resumeAudio());
    page.appendChild(view.settings.element);
    page.querySelector('[data-settings]').addEventListener('click', () => { view.settings.open(); activity(); });
    function empty() {
      view.lines = {};
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
        if (!info.resumed && tutor) view.client.prompt('我已準備好，請依照設定的教學方式開始。');
      },
      ended: () => controls(view, false, false),
      error: text => status(view, text, true),
      activity: activity,
      inputLevel: event => view.feedback.level('input', event),
      outputLevel: event => view.feedback.level('output', event),
      inputState: state => view.feedback.state(state),
      device: info => view.feedback.device(info)
    }, new URL('ai-live-processor.js?v=20260919-1', assetBase).href);
    view.start.addEventListener('click', async () => {
      if (view.busy || current !== view) return;
      const material = view.material ? view.material.value.trim() : '';
      if (tutor && !material) { status(view, '請先貼上教材文字', true); view.material.focus(); return; }
      if (!view.settings.valid()) return;
      view.sessionSettings = view.settings.get();
      const options = { mode: mode, model: view.model.value, material: material, settings: view.sessionSettings };
      view.version++;
      const version = view.version;
      view.testing = false;
      empty();
      controls(view, true, false);
      activity();
      await view.client.start(() => ticket(options), view.feedback.select.value);
      if (view.version === version && !view.client.run) controls(view, false, false);
    });
    view.stop.addEventListener('click', () => { end(view, '通話已結束；再次開始會建立新對話'); cancelPending(); });
    view.mute.addEventListener('click', () => {
      view.muted = !view.muted;
      view.client.mute(view.muted);
      view.mute.textContent = view.muted ? '取消靜音' : '靜音';
      activity();
    });
    view.model.addEventListener('change', () => {
      view.settings.save();
      end(view, '已切換模型，按開始建立新對話');
      cancelPending();
      activity();
    });
    page.querySelector('[data-close]').addEventListener('click', close);
    view.quick.forEach(button => button.addEventListener('click', () => {
      view.lines = {};
      append(view, { role: 'user', text: button.textContent });
      view.lines = {};
      view.client.prompt(button.dataset.prompt);
      activity();
    }));
    if (view.material) view.material.addEventListener('input', () => {
      page.querySelector('.count').textContent = view.material.value.length.toLocaleString() + ' / 12,000 字';
      activity();
    });
    controls(view, false, false);
    return view;
  }
  views.chat = makeView('chat');
  views.tutor = makeView('tutor');

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
    const message = event.data;
    if (!message || !trusted(event)) return;
    if (message.defang === 'ai-live-open') {
      if (!views[message.mode] || typeof message.nonce !== 'string' || message.nonce.length < 16) return;
      close();
      peer = event.source; origin = event.origin; nonce = message.nonce;
      current = views[message.mode];
      host.hidden = false;
      current.page.hidden = false;
      current.feedback.devices();
      current.page.querySelector('[data-close]').focus();
      post('ai-live-opened');
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
    if (current && current.settings.element.open) { activity(); return; }
    if (event.key === 'Escape') close();
    if (event.key === 'Tab' && current) {
      const focusable = Array.from(current.page.querySelectorAll('button,select,textarea')).filter(el => !el.disabled && !el.hidden && el.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && shadow.activeElement === first) { last.focus(); event.preventDefault(); }
      if (!event.shiftKey && shadow.activeElement === last) { first.focus(); event.preventDefault(); }
    }
    activity();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && current) { end(current, '已暫停收音，按開始重新連線'); cancelPending(); }
  });
  window.addEventListener('pagehide', close);
  const app = document.querySelector('#appFrameViewport > iframe');
  if (app) app.addEventListener('load', resetAll);
})();
