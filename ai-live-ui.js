(function () {
  'use strict';
  const assetBase = new URL('.', document.currentScript.src);
  const host = document.createElement('div');
  host.id = 'defangAI';
  host.hidden = true;
  const shadow = host.attachShadow({ mode: 'open' });
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('ai-live.css?v=20260919-1', assetBase).href;
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
    if (!active) { view.mute.textContent = '靜音'; view.muted = false; }
  }
  function status(view, text, error) {
    view.status.textContent = text;
    view.status.classList.toggle('error', !!error);
  }
  function append(view, event) {
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
    Object.values(views).forEach(view => { view.page.hidden = true; });
  }
  function resetAll() {
    close();
    Object.values(views).forEach(view => {
      view.empty();
      if (view.material) { view.material.value = ''; view.page.querySelector('.count').textContent = '0 / 12,000 字'; }
      view.model.selectedIndex = 0;
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
    function empty() {
      view.lines = {};
      view.log.innerHTML = '<div class="empty"><div class="orb" aria-hidden="true">' + (tutor ? '✦' : '◉') +
        '</div><strong>' + (tutor ? '從一段文字，開始練習' : '你說，我聽') +
        '</strong><p>' + (tutor ? '可以請 AI 解釋，也可以讓 AI 問你。' : '你隨時可以插話，或按靜音暫停收音。') + '</p></div>';
    }
    view.empty = empty;
    empty();
    view.client = new window.DFLiveClient({
      state: text => status(view, text),
      text: event => append(view, event),
      turn: () => { view.lines = {}; },
      ready: info => {
        controls(view, true, true);
        if (!info.resumed && tutor) view.client.prompt('我已準備好，請先問我要聽講解還是做練習。');
      },
      ended: () => controls(view, false, false),
      error: text => status(view, text, true),
      activity: activity
    }, new URL('ai-live-processor.js?v=20260919-1', assetBase).href);
    view.start.addEventListener('click', async () => {
      if (view.busy || current !== view) return;
      const material = view.material ? view.material.value.trim() : '';
      if (tutor && !material) { status(view, '請先貼上教材文字', true); view.material.focus(); return; }
      const options = { mode: mode, model: view.model.value, material: material };
      view.version++;
      const version = view.version;
      empty();
      controls(view, true, false);
      activity();
      await view.client.start(() => ticket(options));
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
    try { return event.source && event.source.parent === frame.contentWindow; } catch (error) { return false; }
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
    if (event.key === 'Escape') close();
    if (event.key === 'Tab' && current) {
      const focusable = Array.from(current.page.querySelectorAll('button,select,textarea')).filter(el => !el.disabled && !el.hidden);
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
