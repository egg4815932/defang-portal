/* 極簡心臟呈現層：包住 compact，只搬移與隱藏既有元素，不碰收音、票證或情境儲存。 */
(function () {
  'use strict';
  const HEART = 'M100 176C64 148 18 114 18 70 18 40 40 18 64 18 82 18 95 29 100 42 105 29 118 18 136 18 160 18 182 40 182 70 182 114 136 148 100 176Z';
  const POINTS = 90, MID = 92, SPAN = 200;
  // 一次心搏的 P-Q-R-S-T 形狀，一格一個取樣點；不說話時佇列是空的，線就是平的。
  const PULSE = [0.18, 0.06, -0.14, -0.3, 1, -0.44, 0.06, 0.24, 0.12];
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  // AI 出聲時的收縮幅度；沒接通或沒出聲就停在原尺寸。
  const SWELL = calm ? 0.08 : 0.30;
  function clock(ms) {
    const total = Math.round(ms / 1000);
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }
  window.DFAIHeart = function (view, compact) {
    const page = view.page;
    page.classList.add('minimal');
    const header = page.querySelector('header');
    header.querySelector('h1').classList.add('sr-only');

    const subtitles = document.createElement('button');
    subtitles.type = 'button'; subtitles.className = 'icon-button'; subtitles.dataset.subtitles = '';
    subtitles.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 5h16v11h-9l-5 4v-4H4Z"/><path d="M8 9.5h8M8 12.5h5"/></svg>';
    let showText = false;
    function subtitleState() {
      subtitles.setAttribute('aria-pressed', String(showText));
      subtitles.title = showText ? '關閉文字訊息' : '開啟文字訊息';
      subtitles.setAttribute('aria-label', subtitles.title);
      page.classList.toggle('subtitles', showText);
    }
    subtitles.onclick = () => { showText = !showText; subtitleState(); };
    subtitleState();
    header.insertBefore(subtitles, header.querySelector('[data-audio-tools]'));

    const selector = page.querySelector('[data-scenario]');
    const cards = document.createElement('div');
    cards.className = 'scenario-cards';
    cards.setAttribute('role', 'group');
    cards.setAttribute('aria-label', '選擇情境');
    page.querySelector('.scenario-call-pickers').after(cards);
    let picked = false, wasBusy = false;
    function build() {
      cards.replaceChildren();
      Array.from(selector.options).forEach(option => {
        const card = document.createElement('button');
        card.type = 'button'; card.className = 'scenario-card';
        card.textContent = option.text.replace(' · 內建', '');
        card.disabled = selector.disabled;
        card.onclick = () => {
          if (selector.disabled) return;
          if (selector.value !== option.value) { selector.value = option.value; selector.dispatchEvent(new Event('change')); }
          picked = true; apply();
        };
        cards.append(card);
      });
    }
    new MutationObserver(build).observe(selector, { childList: true, attributes: true, attributeFilter: ['disabled'] });
    build();

    const stage = document.createElement('div');
    stage.className = 'heart-stage';
    stage.innerHTML = '<svg class="heart" viewBox="0 0 200 190" role="img" aria-label="通話狀態">' +
      '<defs><clipPath id="heart-clip-' + view.mode + '"><path d="' + HEART + '"/></clipPath>' +
      '<linearGradient id="heart-fill-' + view.mode + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#F32232"/><stop offset="1" stop-color="#C3000E"/></linearGradient></defs>' +
      '<path class="heart-body" fill="url(#heart-fill-' + view.mode + ')" d="' + HEART + '"/>' +
      '<g clip-path="url(#heart-clip-' + view.mode + ')"><path class="heart-ecg" d="M0 ' + MID + 'H' + SPAN + '"/></g></svg>';
    page.querySelector('.conversation').prepend(stage);
    const heart = stage.querySelector('.heart'), ecg = stage.querySelector('.heart-ecg');

    const timer = document.createElement('p');
    timer.className = 'call-clock';
    timer.innerHTML = '<span class="call-left" role="timer" aria-live="off"></span><span class="call-note" role="status"></span>';
    timer.hidden = true;
    page.querySelector('.controls').before(timer);
    const leftText = timer.querySelector('.call-left'), noteText = timer.querySelector('.call-note');
    let shownLeft = '', shownNote = '', connected = false;
    function showClock() {
      const live = connected && view.callStartedAt && view.callLimitMs;
      timer.hidden = !live;
      if (!live) { shownLeft = shownNote = ''; return; }
      const left = Math.max(0, view.callLimitMs - (Date.now() - view.callStartedAt));
      const text = clock(left);
      if (text !== shownLeft) { shownLeft = text; leftText.textContent = text; }
      timer.classList.toggle('ending', left <= 60000);
      const note = view.nudgeSentAt && Date.now() - view.nudgeSentAt < 6000 ? '已送出提醒'
        : view.sessionNudge && !view.nudgeSentAt ? '第 ' + view.sessionNudge.at / 60000 + ' 分提醒' : '';
      if (note !== shownNote) { shownNote = note; noteText.textContent = note; }
    }

    // 只鏡射既有的振幅事件，原本的量表與心電圖各自讀同一份資料。
    const buffer = new Float32Array(POINTS);
    let inputLevel = 0, outputLevel = 0, stamp = 0, pulse = 0, last = 0, raf = 0;
    let queue = [], cooldown = 0, amplitude = 0;
    const baseLevel = view.feedback.level.bind(view.feedback);
    view.feedback.level = function (kind, event) {
      baseLevel(kind, event);
      const strength = Math.min(1, Math.sqrt(Math.max(0, event.level) * 6));
      if (kind === 'input') inputLevel = strength; else outputLevel = strength;
      stamp = performance.now();
    };

    function frame(now) {
      const delta = Math.min(0.05, (now - last) / 1000) || 0;
      last = now;
      if (now - stamp > 300) { inputLevel *= 0.85; outputLevel *= 0.85; }
      // 聲音越大，心搏越高也越密；沒聲音就不再排新的心搏。
      if (!queue.length) {
        if (cooldown > 0) cooldown--;
        else if (inputLevel > 0.04) { queue = PULSE.slice(); amplitude = inputLevel * 30; cooldown = Math.round(15 - inputLevel * 9); }
      }
      buffer.copyWithin(0, 1);
      buffer[POINTS - 1] = queue.length ? queue.shift() * amplitude : 0;
      let path = 'M0 ' + MID;
      for (let i = 0; i < POINTS; i++) {
        path += 'L' + ((i / (POINTS - 1)) * SPAN).toFixed(1) + ' ' + (MID - buffer[i]).toFixed(1);
      }
      ecg.setAttribute('d', path);
      // 跟著 AI 的音量起伏：衝上去快、放掉慢，看起來才像被聲音推的。
      const target = connected ? Math.min(1, outputLevel * 1.2) : 0;
      const ease = 1 - Math.pow(1 - (target > pulse ? 0.45 : 0.10), delta * 60 || 1);
      pulse += (target - pulse) * ease;
      heart.style.transform = 'scale(' + (1 + pulse * SWELL).toFixed(4) + ')';
      showClock();
      raf = requestAnimationFrame(frame);
    }
    function tick() {
      const live = !page.hidden && page.isConnected;
      if (live && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
      else if (!live && raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    new MutationObserver(tick).observe(page, { attributes: true, attributeFilter: ['hidden'] });

    function apply() {
      connected = !!(view.busy && !view.testing && view.client && view.client.run && view.client.run.ready);
      page.classList.toggle('picked', picked);
      page.classList.toggle('call-live', connected);
      showClock();
      tick();
    }
    apply();

    return {
      refresh: () => {
        compact.refresh();
        if (wasBusy && !view.busy) picked = false;
        wasBusy = view.busy;
        apply();
      },
      get open() { return compact.open; },
      close: () => { compact.close(); picked = false; apply(); },
      material: () => compact.material(),
      empty: () => compact.empty(),
      status: (text, error) => compact.status(text, error)
    };
  };
})();
