/* 精簡呈現層：只搬移既有控制項，不改收音、PCM、取樣或模型設定。 */
(function () {
  'use strict';
  const paths = {
    back: '<path d="m12 5-7 7 7 7M5 12h14"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    settings: '<path d="M4 7h7m4 0h5M4 17h3m4 0h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    headphones: '<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>',
    mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8"/>',
    muted: '<path d="m3 3 18 18M9 9v3a3 3 0 0 0 5 2M9 5a3 3 0 0 1 6 1v5M5 11v1a7 7 0 0 0 12 5m2-5v-1M12 19v3m-4 0h8"/>',
    sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4"/>',
    phone: '<path d="m6 3 3 5-3 3a16 16 0 0 0 7 7l3-3 5 3-1 3C10 22 2 14 3 4Z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    book: '<path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z"/>',
    explain: '<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21l4-5 4 5M7 8h10M7 12h6"/>',
    quiz: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3m0 3h.01"/>',
    record: '<circle cx="12" cy="12" r="7" fill="currentColor" stroke="none"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>'
  };
  function icon(name) { return '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>'; }
  function action(button, name, label) {
    button.classList.add('icon-button');
    button.innerHTML = icon(name);
    button.setAttribute('aria-label', label); button.title = label;
  }
  const shortStatus = {
    '準備好就按開始對話': '待機', '先貼上教材，再開始陪練': '先加入教材',
    '正在開啟麥克風…': '開啟麥克風…', '正在連接 Gemini…': '連線中…',
    '已連線，可以開始說話': '聆聽中', '已連線，可以繼續說話': '聆聽中',
    '麥克風已靜音': '已靜音', 'AI 正在思考…你仍然可以說話': '思考中…',
    '已暫停收音，按開始重新連線': '已暫停', '通話已結束；再次開始會建立新對話': '通話結束',
    '已切換模型，按開始建立新對話': '已切換模型', '正在接回原本的對話…': '重新連線中…',
    '麥克風測試中，聲音只在這台裝置檢查，不傳送給 Gemini': '麥克風測試中',
    '試錄已結束，可以播放處理後的聲音': '試錄完成', '麥克風測試已結束': '測試結束'
  };
  window.DFAICompact = function (view) {
    const page = view.page, header = page.querySelector('header'), heading = header.querySelector('div');
    page.classList.add('compact');
    header.querySelector('.sub').remove();
    header.querySelector('h1').textContent = view.mode === 'chat' ? 'AI 語音' : '教材陪練';
    const modelTag = document.createElement('span'); modelTag.className = 'model-tag'; heading.append(modelTag);
    function modelLabel() { modelTag.textContent = view.model.value === 'gpt-live-1' ? 'OpenAI · GPT-Live' : view.model.value.endsWith('extended-thinking') ? 'Gemini · Thinking' : 'Gemini · Live'; }
    modelLabel(); view.model.addEventListener('change', modelLabel); view.settings.element.addEventListener('close', modelLabel);
    const settingsButton = page.querySelector('[data-settings]');
    const modelRow = page.querySelector('.model-row');
    modelRow.querySelector('.note').remove();
    modelRow.querySelector('label').textContent = '模型';
    view.settings.element.querySelector('.settings-scroll').prepend(modelRow);
    const privacy = page.querySelector('footer .note');
    const help = document.createElement('details'); help.className = 'settings-help';
    help.innerHTML = '<summary>使用說明</summary>';
    view.settings.element.querySelectorAll('fieldset > .note').forEach(p => help.append(p));
    help.append(privacy); view.settings.element.querySelector('.settings-scroll').append(help);
    const dialogs = [];
    function panel(name) {
      const dialog = document.createElement('dialog'); dialog.className = 'utility-dialog';
      dialog.setAttribute('aria-label', name);
      dialog.innerHTML = '<div class="settings-head"><h2>' + name + '</h2><button type="button" data-panel-close></button></div><div class="utility-content"></div>';
      const close = dialog.querySelector('[data-panel-close]'); action(close, 'close', '關閉' + name);
      close.onclick = () => dialog.close();
      page.append(dialog); dialogs.push(dialog);
      return dialog;
    }
    function open(dialog) { if (!dialog.open) dialog.showModal(); }
    const audioDialog = panel('收音與試聽'); audioDialog.classList.add('audio-panel');
    const audioBody = audioDialog.querySelector('.utility-content');
    audioBody.append(view.feedback.element.querySelector('.audio-tools'), view.feedback.health, view.capture.element);
    view.capture.element.open = true; view.capture.element.querySelector('summary').hidden = true;
    const notes = view.capture.element.querySelectorAll('.note');
    notes[0].textContent = '最多 15 秒 · 僅此頁暫存'; notes[1].textContent = '原音量播放 · 關閉頁面即清除';
    audioDialog.addEventListener('close', () => view.capture.audio.pause());
    const audioButton = document.createElement('button'); audioButton.type = 'button'; audioButton.dataset.audioTools = '';
    action(audioButton, 'headphones', '收音與試聽'); audioButton.onclick = () => open(audioDialog);
    function health() {
      audioButton.classList.toggle('warning', view.feedback.health.classList.contains('warning'));
      audioButton.title = view.feedback.health.classList.contains('warning') ? view.feedback.health.textContent : '收音與試聽';
      audioButton.setAttribute('aria-description', view.feedback.health.textContent);
    }
    new MutationObserver(health).observe(view.feedback.health, { attributes: true, childList: true, subtree: true }); health();
    new MutationObserver(() => audioButton.classList.toggle('recording', !view.capture.finishButton.hidden))
      .observe(view.capture.finishButton, { attributes: true, attributeFilter: ['hidden'] });
    let materialDialog, materialButton;
    if (view.material) {
      materialDialog = panel('教材'); materialDialog.classList.add('material-panel');
      const material = page.querySelector('.material');
      material.querySelector('.note').remove(); material.querySelector('h2').classList.add('sr-only');
      view.material.placeholder = '貼上教材…'; materialDialog.querySelector('.utility-content').append(material);
      const book = document.createElement('button'); book.type = 'button'; book.dataset.materialOpen = '';
      materialButton = book;
      action(book, 'book', '編輯教材'); book.onclick = () => open(materialDialog); header.append(book);
      const changed = () => { book.classList.toggle('has-material', !!view.material.value.trim()); book.title = view.material.value.trim() ? '編輯教材' : '加入教材'; };
      view.material.addEventListener('input', changed); changed();
      const quick = page.querySelector('.quick'); page.querySelector('.controls').prepend(quick);
      view.quick.forEach((button, i) => action(button, i ? 'quiz' : 'explain', button.textContent));
    }
    header.append(audioButton, settingsButton);
    action(settingsButton, 'settings', '對話設定'); action(page.querySelector('[data-close]'), 'back', '返回系統');
    action(view.settings.element.querySelector('[data-done]'), 'check', '完成設定');
    action(view.settings.element.querySelector('[data-defaults]'), 'reset', '還原這個介面的預設');
    action(view.capture.record, 'record', '錄下 15 秒供試聽');
    action(view.capture.finishButton, 'stop', '停止取樣'); action(view.capture.clearButton, 'trash', '清除音檔');
    view.feedback.user.querySelector('.meter-head').insertAdjacentHTML('afterbegin', icon('mic'));
    view.feedback.ai.querySelector('.meter-head').insertAdjacentHTML('afterbegin', icon('sparkle'));
    page.querySelector('.conversation').append(view.feedback.element);
    function refresh() {
      if (materialButton) materialButton.classList.toggle('has-material', !!view.material.value.trim());
      action(view.start, 'phone', view.mode === 'chat' ? '開始對話' : '開始陪練');
      action(view.stop, view.testing ? 'stop' : 'phone', view.testing ? '結束測試' : '結束通話');
      view.stop.classList.toggle('hangup', !view.testing);
      action(view.mute, view.muted ? 'muted' : 'mic', view.muted ? '取消靜音' : '靜音');
      view.mute.setAttribute('aria-pressed', String(view.muted));
      action(view.feedback.test, view.testing && view.busy ? 'stop' : 'mic', view.testing && view.busy ? '結束麥克風測試' : '測試麥克風');
      action(view.feedback.resume, 'phone', '恢復音訊');
      page.classList.toggle('is-active', !!view.busy);
    }
    refresh();
    return {
      refresh: refresh,
      get open() { return dialogs.some(dialog => dialog.open); },
      close: () => dialogs.forEach(dialog => dialog.close()),
      material: () => { if (materialDialog) open(materialDialog); },
      empty: () => '<div class="empty" role="img" aria-label="尚無對話">' + icon(view.mode === 'chat' ? 'sparkle' : 'book') + '</div>',
      status: (text, error) => { view.status.title = text; return error ? text : shortStatus[text] || text; }
    };
  };
})();
