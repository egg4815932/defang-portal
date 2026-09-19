/* 兩個介面各自記住本機偏好；不保存教材、對話或登入資料。 */
(function () {
  'use strict';
  const voices = [
    ['Kore', '堅定'], ['Zephyr', '明亮'], ['Puck', '活潑'], ['Charon', '解說感'], ['Fenrir', '熱情'],
    ['Leda', '年輕感'], ['Orus', '堅定'], ['Aoede', '輕快'], ['Callirrhoe', '隨和'], ['Autonoe', '明亮'],
    ['Enceladus', '氣聲感'], ['Iapetus', '清晰'], ['Umbriel', '隨和'], ['Algieba', '流暢'], ['Despina', '流暢'],
    ['Erinome', '清晰'], ['Algenib', '沙啞'], ['Rasalgethi', '解說感'], ['Laomedeia', '活潑'], ['Achernar', '柔和'],
    ['Alnilam', '堅定'], ['Schedar', '平穩'], ['Gacrux', '成熟'], ['Pulcherrima', '直接'], ['Achird', '親切'],
    ['Zubenelgenubi', '輕鬆'], ['Vindemiatrix', '溫柔'], ['Sadachbia', '有活力'], ['Sadaltager', '博學感'], ['Sulafat', '溫暖']
  ].map(pair => [pair[0], pair[0] + ' · ' + pair[1]]);
  const fields = [
    ['voice', '聲音', voices],
    ['language', '回應語言', [['zh-TW', '台灣中文'], ['en-US', '美式英語'], ['en-GB', '英式英語'], ['ja', '日語'], ['ko', '韓語'], ['auto', '跟隨我說的語言'], ['custom', '自訂語言']]],
    ['role', '角色', [['assistant', '專業助理'], ['teacher', '耐心老師'], ['partner', '陪練夥伴']]],
    ['tone', '語氣', [['natural', '自然'], ['gentle', '溫柔'], ['formal', '正式'], ['lively', '活潑']]],
    ['pace', '語速', [['slow', '慢一點'], ['normal', '自然'], ['fast', '快一點']]],
    ['length', '回答長短', [['brief', '簡短 · 兩三句'], ['balanced', '適中 · 重點加例子'], ['detailed', '詳細 · 分段解釋']]],
    ['thinking', '思考深度', [['LOW', '低'], ['MEDIUM', '中'], ['HIGH', '高']]],
    ['detection', '說話偵測', [['noise-resistant', '抗雜音優先（預設）'], ['sensitive', '輕聲優先 · 較容易觸發']]],
    ['echo', '回音消除', [['on', '開啟（建議）'], ['off', '關閉 · 麥克風也可能收到喇叭聲']]],
    ['pause', '停頓多久才接話', [['auto', '建議 · 等 1.2 秒'], ['300', '0.3 秒 · 容易在停頓時接話'], ['700', '0.7 秒'], ['1200', '1.2 秒'], ['1800', '1.8 秒 · 多等我一下']]],
    ['interruption', '我說話時打斷 AI', [['on', '開啟 · AI 停下來聽'], ['off', '關閉 · 讓 AI 說完']]],
    ['subtitles', '文字字幕', [['both', '雙方都顯示'], ['user', '只顯示我的話'], ['model', '只顯示 AI 的話'], ['off', '關閉字幕']]],
    ['teaching', '教學方式', [['ask', '先問我要講解或練習'], ['explain', '先講解，再確認理解'], ['quiz', '先出題，回答後講解'], ['hint', '先出題，答錯先給提示']]]
  ];
  const defaults = { voice: 'Kore', language: 'zh-TW', role: 'assistant', tone: 'natural', pace: 'normal',
    length: 'brief', thinking: 'LOW', pause: 'auto', detection: 'noise-resistant', echo: 'on', interruption: 'on', subtitles: 'both', teaching: 'ask', customLanguage: '', accent: '' };
  window.DFAISettings = function (mode, model) {
    const storageKey = 'defang.ai.settings.v1.' + mode;
    const values = Object.assign({}, defaults);
    if (mode === 'tutor') values.role = 'teacher';
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && saved.settings) {
        fields.forEach(([key, , choices]) => {
          if (choices.some(pair => pair[0] === saved.settings[key])) values[key] = saved.settings[key];
        });
        ['customLanguage', 'accent'].forEach(key => {
          if (typeof saved.settings[key] === 'string' && saved.settings[key].length <= 60 && !/[\r\n\x00-\x1f]/.test(saved.settings[key])) values[key] = saved.settings[key];
        });
        if (values.language === 'custom' && !values.customLanguage.trim()) values.language = 'zh-TW';
        if (['gemini-3.8-live', 'gemini-3.8-live-extended-thinking'].includes(saved.model)) model.value = saved.model;
      }
    } catch (error) {}
    const dialog = document.createElement('dialog');
    dialog.className = 'settings';
    dialog.setAttribute('aria-labelledby', 'settings-title-' + mode);
    dialog.innerHTML = '<div class="settings-head"><h2 id="settings-title-' + mode + '">對話設定 · ' +
      (mode === 'tutor' ? '教材陪練' : '語音對話') + '</h2><button type="button" data-done>完成</button></div>' +
      '<p class="note" data-settings-note>這個介面會記住你的選擇，下次開始對話時生效。</p>' +
      '<div class="settings-scroll"><fieldset><legend>聲音與對話偏好</legend><div class="settings-grid"></div>' +
      '<p class="note">語言、口音、語氣、語速與教學方式會引導 AI 回應，實際表現可能略有不同。語速不是固定倍速。</p>' +
      '<p class="note" data-language-check>台灣中文模式會檢查 AI 回覆文字，明顯外語會停播並重答一次；關閉字幕仍會檢查。整段外語練習請改選回應語言。</p>' +
      '<p class="note">思考深度只適用 Extended Thinking；越高可能等越久。接話時間是停頓判定，不是保證的回應速度。</p>' +
      '<p class="note">雜音常打斷 AI，先用「抗雜音優先」。輕聲說話常沒被接住，可試「輕聲優先」，但也較容易被雜音觸發。完全不想被打斷，可關閉「我說話時打斷 AI」。</p>' +
      '<button type="button" data-defaults>還原這個介面的預設</button></fieldset></div>' +
      '<p class="note settings-storage" role="status">設定保存在這個瀏覽器；不保存教材與對話。</p>';
    const grid = dialog.querySelector('.settings-grid'), inputs = {};
    fields.forEach(([key, title, choices]) => {
      const label = document.createElement('label');
      label.textContent = title;
      const select = document.createElement('select');
      select.dataset.setting = key;
      select.name = key;
      choices.forEach(([value, text]) => select.add(new Option(text, value)));
      select.value = values[key];
      label.appendChild(select); grid.appendChild(label); inputs[key] = select;
      if (key === 'language') {
        [['customLanguage', '自訂語言（例：法文）'], ['accent', '口音偏好（選填）']].forEach(([name, title]) => {
          const textLabel = document.createElement('label');
          textLabel.textContent = title;
          const input = document.createElement('input');
          input.type = 'text'; input.maxLength = 60; input.name = name; input.dataset.setting = name;
          input.value = values[name]; input.placeholder = name === 'accent' ? '例如：台灣口音、倫敦口音' : '請填寫要使用的語言';
          textLabel.appendChild(input); grid.appendChild(textLabel); inputs[name] = input;
        });
      }
    });
    let active = false;
    function get() {
      const settings = {};
      Object.keys(inputs).forEach(key => { settings[key] = inputs[key].value.trim(); });
      return settings;
    }
    function sync() {
      dialog.querySelector('[data-language-check]').hidden = inputs.language.value !== 'zh-TW';
      inputs.thinking.disabled = active || model.value !== 'gemini-3.8-live-extended-thinking';
      inputs.thinking.parentElement.title = model.value === 'gemini-3.8-live' ? '請先選擇 Extended Thinking' : '';
      inputs.customLanguage.parentElement.hidden = inputs.language.value !== 'custom';
      inputs.customLanguage.required = inputs.language.value === 'custom';
      inputs.customLanguage.setCustomValidity(inputs.language.value === 'custom' && !inputs.customLanguage.value.trim() ? '請填寫自訂語言' : '');
    }
    function save() {
      sync();
      try {
        localStorage.setItem(storageKey, JSON.stringify({ model: model.value, settings: get() }));
        dialog.querySelector('.settings-storage').textContent = '已記住設定 · 只保存在這個瀏覽器，不保存教材與對話。';
      } catch (error) {
        dialog.querySelector('.settings-storage').textContent = '瀏覽器無法保存設定；這次仍可使用，重新開頁後需再選擇。';
      }
    }
    function open() { if (!dialog.open) dialog.showModal(); }
    function valid() {
      if (inputs.language.value === 'custom' && !inputs.customLanguage.value.trim()) {
        open(); inputs.customLanguage.focus(); inputs.customLanguage.reportValidity(); return false;
      }
      return true;
    }
    dialog.querySelector('[data-done]').addEventListener('click', () => { if (active || valid()) dialog.close(); });
    dialog.addEventListener('change', save);
    dialog.addEventListener('input', event => { if (event.target.tagName === 'INPUT') save(); });
    dialog.querySelector('[data-defaults]').addEventListener('click', () => {
      Object.keys(inputs).forEach(key => { inputs[key].value = defaults[key]; });
      if (mode === 'tutor') inputs.role.value = 'teacher';
      model.value = 'gemini-3.8-live'; save();
    });
    sync();
    return { element: dialog, get: get, open: open, valid: valid, save: save,
      close: () => dialog.close(),
      lock: value => {
        active = value;
        dialog.querySelector('fieldset').disabled = value;
        dialog.querySelector('[data-settings-note]').textContent = value ? '通話中 · 結束後可調整' : '自動記住 · 下次通話生效';
        sync();
      }
    };
  };
})();
