/* 情境編輯與選用；只有 AI 語音對話頁持有麥克風與 LiveClient。 */
(function () {
  'use strict';
  window.DFAIScenarios = function (hooks) {
    const S = window.DFAISchema;
    const general = S.migrate(null, 'chat'); general.name = '日常對話';
    const study = S.defaults('教材陪練'); study.settings.requireMaterial = 'on';
    const builtins = [{ id: 'builtin-chat', scene: general }, { id: 'builtin-tutor', scene: study }];
    let items = [], hidden = [], selectedId = builtins[0].id, editingId = '', revision = 0, dirty = false, loading = false, loaded = false, generation = 0;
    // selectedId 是對話頁套用中的情境；viewingId 是設定頁正在看的那一份，兩者可以不同。
    let viewingId = builtins[0].id;
    let busy = false;
    const page = document.createElement('section'); page.id = 'ai-tutor'; page.className = 'page scenario-page'; page.hidden = true;
    page.setAttribute('role', 'dialog'); page.setAttribute('aria-modal', 'true'); page.setAttribute('aria-label', 'AI 語音設定');
    page.innerHTML = '<header><button type="button" data-close>← 返回系統</button><div><h1>AI 語音設定</h1><p class="sub">情境設定庫 · 通話統一在 AI 語音對話</p></div><button type="button" data-use>前往對話</button></header>' +
      '<div class="scenario-layout"><aside class="scenario-library"><label>已儲存的情境<select data-library aria-label="已儲存的情境"></select></label>' +
      '<div class="scenario-actions"><button type="button" data-new>＋ 新情境</button><button type="button" data-copy>複製這份</button><button type="button" data-reload>重新載入</button></div>' +
      '<details><summary>儲存說明／匯入舊設定</summary><p class="note">每個帳號最多 200 個情境。儲存後，設定與教材會跟著帳號，可在手機、電腦使用。</p><button type="button" data-import="chat">原語音對話</button><button type="button" data-import="tutor">原教材陪練</button><button type="button" data-restore>恢復內建情境</button></details></aside>' +
      '<div class="scenario-editor"><div class="scenario-basics"><label>情境名稱<input data-name maxlength="80" placeholder="例如：溫柔老師、產品問答"></label>' +
      '<label>模型<select data-model><option value="gemini-3.8-live">Gemini 3.8 Live</option><option value="gemini-3.8-live-extended-thinking">Gemini 3.8 Extended Thinking</option><option value="gpt-live-1">OpenAI GPT-Live-1</option></select></label></div>' +
      '<p class="note" data-provider-note hidden>GPT-Live 自動處理接話與插話；Gemini 的手動分段、偵測、思考及續線選項不套用。語音每分鐘 US$0.05，後端推理另計；字幕關閉仍可正常通話。</p>' +
      '<div class="scenario-legend">每格的標記：' +
      '<span><span class="field-badge badge-api">API</span>送進連線設定，一定照做</span>' +
      '<span><span class="field-badge badge-prompt">指令</span>串成文字唸給模型，盡量照做</span>' +
      '<span><span class="field-badge badge-local">本機</span>只在你這邊生效，模型看不到</span></div>' +
      '<div data-groups></div><details class="scenario-group"><summary>教材內容</summary><label><span class="field-title">一起儲存的教材<span class="field-badge badge-prompt" title="文字指令：教材會包成 &lt;教材&gt; 區塊，接在指令後面送出。">指令</span></span><textarea data-material maxlength="12000" placeholder="貼上教材；沒有教材也可以建立一般對話情境"></textarea></label><p class="note" data-count></p></details>' +
      '<details class="scenario-group"><summary>完整送出指令</summary><p class="note" data-instruction-note></p><pre data-instruction></pre></details>' +
      '<details class="scenario-group"><summary>系統固定限制</summary><p class="note">只開放 DR136／DR252，所有讀寫先驗證登入。API Key 只留後端；票證只開一個新會話，模型與指令等欄位會鎖定。回覆為語音；Gemini 使用 16／24 kHz PCM，GPT-Live 使用 WebRTC。每分鐘最多 6 次取票、通話最長 30 分鐘、教材最多 12,000 字。GPT-Live 可依情境開關網路搜尋；Gemini 沒有搜尋。兩者都沒有操作內部系統的工具，改寫指令不會新增權限。這些不是情境可解除的限制。</p></details></div></div>' +
      '<footer class="scenario-footer"><p role="status" data-message>正在載入情境…</p><button type="button" data-delete>刪除</button><button type="button" class="primary" data-save>儲存情境</button><button type="button" data-save-use>儲存並套用</button></footer>';
    const find = sel => page.querySelector(sel), controls = {}, output = {}, switches = {};
    const name = find('[data-name]'), model = find('[data-model]'), material = find('[data-material]'), library = find('[data-library]');
    const selector = document.createElement('select'); selector.dataset.scenario = ''; selector.setAttribute('aria-label', '套用情境');
    const label = document.createElement('label'); label.className = 'scenario-picker'; label.append(document.createTextNode('情境'), selector);
    const callModel = document.createElement('select'); callModel.dataset.callModel = ''; callModel.setAttribute('aria-label', '本次通話模型');
    Array.from(model.options).forEach(o => callModel.add(new Option(o.text, o.value)));
    const modelLabel = document.createElement('label'); modelLabel.className = 'scenario-picker'; modelLabel.append(document.createTextNode('模型'), callModel);
    const picker = document.createElement('div'); picker.className = 'scenario-call-pickers'; picker.append(label, modelLabel);
    const info = document.createElement('p'); info.className = 'note scenario-info'; info.setAttribute('role', 'status');
    const groups = new Map();
    // 每格走哪條路：api＝打包進連線設定，prompt＝串成文字唸給模型，local＝只在瀏覽器／後端生效。
    const kindText = {
      api: ['API', 'API 參數：打包進連線設定送出，機器層級一定照做。'],
      prompt: ['指令', '文字指令：串成一段話唸給模型聽，它會盡量照做，但不保證。'],
      local: ['本機', '本機設定：只在你的瀏覽器或我們的後端生效，語音模型看不到。']
    };
    const kinds = { voice: 'api', openaiVoice: 'api', detection: 'api', endSensitivity: 'api', prefixMs: 'api',
      pauseMs: 'api', interruption: 'api', thinking: 'api', openaiBrain: 'api', openaiEffort: 'api', openaiMaxTokens: 'api', openaiWebSearch: 'api', resumption: 'api', compression: 'api', startSeconds: 'api',
      automatic: 'api local', subtitles: 'api local', durationMinutes: 'api local',
      requireMaterial: 'local', materialLimit: 'local', echo: 'local', noiseSuppression: 'local',
      autoGainControl: 'local', reconnects: 'local', timeoutSeconds: 'local', requestsPerMinute: 'local', nudgeMinutes: 'local' };
    const kindNotes = {
      automatic: '手動模式同時關掉 API 的自動偵測，並在對話頁顯示按鈕。',
      subtitles: 'API 決定要不要開轉錄，前端決定顯示誰的字幕。',
      durationMinutes: 'Gemini：票證到時間真的失效。GPT-Live：只是瀏覽器計時，不是帳單上限。',
      pacePercent: '滑桿只是寫進指令的數字，不是播放器倍速。',
      sentences: '滑桿只是寫進指令的數字，說到句數不會被切斷。',
      questions: '滑桿只是寫進指令的數字，不是硬性題數。',
      nudgeMinutes: '瀏覽器自己計時，到點才把下面那句話送出去。Gemini 當成你說的話，GPT-Live 插一句應用指令。'
    };
    function badges(key) {
      return (kinds[key] || 'prompt').split(' ').map(kind => {
        const tag = document.createElement('span');
        tag.className = 'field-badge badge-' + kind;
        tag.textContent = kindText[kind][0];
        tag.title = kindText[kind][1] + (kindNotes[key] ? ' ' + kindNotes[key] : '');
        return tag;
      });
    }
    const notes = new window.DFAIVoiceNotes(hooks.notesRpc, hooks.activity, () => voiceNames());
    // 使用者取的名字蓋過官方標籤；沒取名就回到官方那一行。
    function voiceNames() {
      [['voice', ''], ['openaiVoice', 'openai:']].forEach(([key, prefix]) => {
        if (!controls[key]) return;
        const choices = S.fields.find(f => f.key === key).choices;
        Array.from(controls[key].options).forEach((option, i) => {
          const name = notes.alias(prefix + option.value);
          option.text = name ? option.value + ' · ' + name : choices[i][1];
        });
      });
    }
    S.fields.forEach(f => {
      if (!groups.has(f.group)) {
        const details = document.createElement('details'); details.className = 'scenario-group';
        const summary = document.createElement('summary'); summary.textContent = f.group;
        const grid = document.createElement('div'); grid.className = 'scenario-grid'; details.append(summary, grid);
        if (!groups.size) details.open = true;
        find('[data-groups]').append(details); groups.set(f.group, grid);
      }
      const wrap = document.createElement('label');
      const title = document.createElement('span'); title.className = 'field-title'; title.textContent = f.label;
      title.append(...badges(f.key));
      // 標「指令」的每一格都給勾勾；沒打勾就整條關掉：欄位變灰、不能改，也不送出。
      if (!kinds[f.key]) {
        const box = document.createElement('input'); box.type = 'checkbox'; box.checked = true; box.dataset.switch = f.key;
        box.setAttribute('aria-label', f.label + '：送出這條指令');
        const gate = document.createElement('span'); gate.className = 'field-switch';
        gate.title = '打勾才會送出這條指令；沒打勾會變灰色，不能編輯。';
        gate.append(box, document.createTextNode('送出'));
        gate.onclick = event => { if (event.target !== box && !box.disabled) box.click(); };
        title.append(gate); switches[f.key] = box;
      }
      wrap.append(title);
      let input;
      if (f.type === 'select') {
        input = document.createElement('select'); f.choices.forEach(p => input.add(new Option(p[1], p[0])));
      } else if (f.type === 'range') {
        input = document.createElement('input'); input.type = 'range'; input.min = f.min; input.max = f.max; input.step = f.step;
        const number = document.createElement('input'); number.type = 'number'; number.min = f.min; number.max = f.max; number.step = f.step;
        number.setAttribute('aria-label', f.label + '精確數值'); number.dataset.number = f.key;
        const line = document.createElement('span'); line.className = 'range-value'; line.append(number, document.createTextNode(f.unit));
        number.addEventListener('input', () => { input.value = number.value; changed(); });
        output[f.key] = number; wrap.append(line);
        input.addEventListener('input', () => { number.value = input.value; });
      } else {
        input = document.createElement('textarea'); input.rows = f.max <= 60 ? 1 : 3; input.maxLength = f.max;
        if (f.max > 60) wrap.className = 'wide';
      }
      input.dataset.setting = f.key; input.setAttribute('aria-label', f.label);
      if (switches[f.key]) { input.id = 'scenario-field-' + f.key; wrap.htmlFor = input.id; }
      wrap.append(input);
      if (f.hint) { const hint = document.createElement('small'); hint.textContent = f.hint; wrap.append(hint); }
      controls[f.key] = input; groups.get(f.group).append(wrap);
      if (f.key === 'voice' || f.key === 'openaiVoice') {
        wrap.className = 'wide'; groups.get(f.group).append(notes.element);
      }
    });
    // 內建情境可隱藏（帳號層級）；全部刪光時仍保底一份日常對話。
    function all() { const list = builtins.filter(b => hidden.indexOf(b.id) < 0).concat(items); return list.length ? list : [builtins[0]]; }
    function first() { return all()[0].id; }
    function deletable() { return !!editingId || (/^builtin-/.test(viewingId) && all().length > 1); }
    function current() { return all().find(item => item.id === selectedId) || all()[0]; }
    function message(text, error) { find('[data-message]').textContent = text; find('[data-message]').classList.toggle('error', !!error); }
    function read() {
      const settings = {};
      S.fields.forEach(f => { settings[f.key] = f.type === 'range' ? output[f.key].valueAsNumber : controls[f.key].value; });
      const off = Object.keys(switches).filter(key => !switches[key].checked);
      return S.normalize({ name: name.value, model: model.value, material: material.value, settings, off });
    }
    // 預覽必須跟後端送出的字串同源：標底色的段落是後端固定補的，情境改不到。
    function renderInstruction(scene) {
      const plan = S.delivery(scene), pre = find('[data-instruction]'), fixed = plan.parts.some(p => p.fixed);
      pre.replaceChildren();
      plan.parts.forEach((part, i) => {
        const span = document.createElement('span');
        if (part.fixed) span.className = 'instruction-fixed';
        span.textContent = (i ? '\n' : '') + part.text;
        pre.append(span);
      });
      const label = value => Array.from(model.options).find(o => o.value === value).text;
      // 對話頁可以只改本次通話模型；那份才是真正送出的，不能讓預覽裝作沒這回事。
      const override = !dirty && viewingId === selectedId && callModel.value !== scene.model
        ? '對話頁本次通話模型選的是「' + label(callModel.value) + '」，真正通話會照那個模型的版本送出。' : '';
      find('[data-instruction-note]').textContent = '本次模型：' + label(scene.model) +
        '。下面就是語音模型收到的完整系統指令' + (fixed ? '；標底色那幾行是後端固定補的，情境改不到。' : '，這個模型沒有後端另外補的段落。') + override;
    }
    function updateInstruction() {
      const openai = model.value === 'gpt-live-1';
      find('[data-provider-note]').hidden = !openai;
      controls.voice.closest('label').hidden = openai;
      controls.openaiVoice.closest('label').hidden = !openai;
      const activeVoice = openai ? controls.openaiVoice : controls.voice;
      activeVoice.closest('label').after(notes.element);
      notes.select((openai ? 'openai:' : '') + activeVoice.value);
      ['automatic', 'detection', 'endSensitivity', 'prefixMs', 'pauseMs', 'interruption', 'thinking', 'resumption', 'compression', 'reconnects', 'startSeconds', 'timeoutSeconds'].forEach(k => { controls[k].closest('label').hidden = openai; });
      ['openaiBrain', 'openaiEffort', 'openaiMaxTokens', 'openaiWebSearch'].forEach(k => { if (controls[k]) controls[k].closest('label').hidden = !openai; });
      const teaching = switches.teaching.checked ? controls.teaching.value : 'off';
      const teachingFields = { ask: 'teachingAskRule', explain: 'teachingExplainRule', quiz: 'teachingQuizRule', hint: 'teachingHintRule' };
      Object.keys(teachingFields).forEach(mode => { controls[teachingFields[mode]].closest('label').hidden = teaching !== mode; });
      ['questions', 'questionRule', 'teachingRule'].forEach(k => { controls[k].closest('label').hidden = teaching === 'off'; });
      Object.keys(switches).forEach(key => {
        const on = switches[key].checked;
        controls[key].disabled = loading || !on;
        if (output[key]) output[key].disabled = controls[key].disabled;
        controls[key].closest('label').classList.toggle('field-off', !on);
      });
      controls.questionRule.disabled = loading || !switches.questionRule.checked || !switches.questions.checked || output.questions.valueAsNumber === 0;
      try { renderInstruction(read()); }
      catch (error) {
        find('[data-instruction]').textContent = error.message;
        find('[data-instruction-note]').textContent = '';
      }
      find('[data-count]').textContent = material.value.length.toLocaleString() + ' / ' + output.materialLimit.value + ' 字';
      controls.thinking.disabled = loading || model.value !== 'gemini-3.8-live-extended-thinking';
      ['detection', 'endSensitivity', 'prefixMs', 'pauseMs'].forEach(k => {
        controls[k].disabled = loading || controls.automatic.value === 'off';
        if (output[k]) output[k].disabled = controls[k].disabled;
      });
    }
    function changed() { dirty = true; message('尚未儲存 · 對話仍使用上次儲存的設定'); updateInstruction(); hooks.activity(); }
    function fill(scene, id, rev) {
      name.value = scene.name; model.value = scene.model; material.value = scene.material;
      S.fields.forEach(f => { controls[f.key].value = scene.settings[f.key]; if (output[f.key]) output[f.key].value = scene.settings[f.key]; });
      Object.keys(switches).forEach(key => { switches[key].checked = (scene.off || []).indexOf(key) < 0; });
      editingId = id || ''; revision = rev || 0; dirty = false;
      updateInstruction(); find('[data-delete]').disabled = !deletable() || loading;
      message(editingId ? '已載入 · 修改後記得儲存' : '這是新草稿 · 儲存後就能在對話頁選用');
    }
    function show(item) {
      viewingId = item.id; library.value = item.id;
      fill(item.scene, item.id.startsWith('builtin-') ? '' : item.id, item.revision);
    }
    function viewing() { return viewingId ? all().find(x => x.id === viewingId) || current() : null; }
    function discard() { return !dirty || window.confirm('這份情境有尚未儲存的修改，要捨棄修改嗎？'); }
    function choices() {
      [selector, library].forEach(el => { el.replaceChildren(); all().forEach(item => el.add(new Option(item.scene.name + (item.id.startsWith('builtin-') ? ' · 內建' : ''), item.id))); });
      selector.value = selectedId; library.value = viewingId || editingId || selectedId;
      callModel.value = current().scene.model;
      describe();
      if (hooks.change) hooks.change(current().scene);
    }
    function describe() {
      info.textContent = current().scene.name + ' · ' + (current().scene.material ? '含教材' : '無教材') + ' · ' +
        (callModel.value === 'gpt-live-1' ? 'GPT-Live：聲音與教材送至 OpenAI；US$0.05／分鐘，推理另計；自動接話與插話' : 'Gemini：聲音與教材送至 Google');
    }
    callModel.onchange = () => { describe(); updateInstruction(); hooks.change(S.normalize(Object.assign({}, current().scene, { model: callModel.value }))); hooks.activity(); };
    function lock(value) {
      loading = value;
      page.querySelectorAll('input,select,textarea,button').forEach(el => { if (!el.matches('[data-close]')) el.disabled = value; });
      selector.disabled = value || busy;
      callModel.disabled = value || busy;
      find('[data-delete]').disabled = value || !deletable(); updateInstruction();
      notes.lock(value);
    }
    async function load(force) {
      if (loaded && !force) return;
      const version = ++generation; lock(true); info.textContent = '正在載入帳號情境…';
      try {
        const result = await hooks.rpc({ action: 'list' });
        if (version !== generation) return;
        items = result.items.map(item => ({ id: item.id, revision: item.revision, scene: S.normalize(item.scene) })); hidden = result.hidden || [];
        if (!all().some(item => item.id === selectedId)) selectedId = first();
        if (viewingId && !all().some(item => item.id === viewingId)) viewingId = selectedId;
        loaded = true; choices();
        if (!dirty || force) { const item = viewing(); if (item) show(item); }
      } catch (error) { if (version === generation) { message(error.message, true); info.textContent = '情境庫載入失敗，可重新載入'; } }
      finally { if (version === generation) lock(false); }
    }
    async function save(use) {
      let scene;
      try { scene = read(); } catch (error) { message(error.message, true); return; }
      const version = generation; lock(true); message('儲存中…');
      try {
        const result = await hooks.rpc({ action: 'save', id: editingId, revision, scene });
        if (version !== generation) return;
        items = result.items; hidden = result.hidden || []; selectedId = result.selectedId; viewingId = selectedId;
        choices(); show(current()); message('已儲存至你的帳號');
        if (use) hooks.use();
      } catch (error) { if (version === generation) message(error.message, true); }
      finally { if (version === generation) lock(false); }
    }
    selector.onchange = () => { selectedId = selector.value; if (!dirty) viewingId = selectedId; choices(); hooks.activity(); };
    library.onchange = () => {
      if (!discard()) { library.value = viewingId || editingId || selectedId; return; }
      show(all().find(x => x.id === library.value));
    };
    page.addEventListener('input', event => { if (event.target.matches('input,textarea')) changed(); });
    page.addEventListener('change', event => { if (event.target !== library && event.target.matches('select')) changed(); });
    find('[data-new]').onclick = () => { if (discard()) { viewingId = ''; fill(S.defaults()); } };
    find('[data-copy]').onclick = () => { try { const scene = read(); scene.name = (scene.name + ' 副本').slice(0, 80); viewingId = ''; fill(scene); dirty = true; message('已複製成新草稿，請儲存'); } catch (error) { message(error.message, true); } };
    find('[data-reload]').onclick = () => { if (discard()) load(true); };
    find('[data-save]').onclick = () => save(false); find('[data-save-use]').onclick = () => save(true);
    find('[data-use]').onclick = () => {
      if (!dirty && editingId) selectedId = editingId;
      choices(); hooks.use();
    };
    find('[data-delete]').onclick = async () => {
      if (!deletable() || !window.confirm('確定刪除「' + name.value + '」？')) return;
      const version = generation; lock(true);
      try {
        const result = await hooks.rpc(editingId ? { action: 'delete', id: editingId, revision } : { action: 'hide', id: viewingId });
        if (version !== generation) return;
        items = result.items; hidden = result.hidden || []; selectedId = first(); viewingId = selectedId; choices(); show(current()); message('已刪除');
      } catch (error) { if (version === generation) message(error.message, true); }
      finally { if (version === generation) lock(false); }
    };
    find('[data-restore]').onclick = async () => {
      if (!discard()) return;
      const version = generation; lock(true);
      try {
        const result = await hooks.rpc({ action: 'restore' });
        if (version !== generation) return;
        hidden = result.hidden || []; choices(); message('已恢復內建情境');
      } catch (error) { if (version === generation) message(error.message, true); }
      finally { if (version === generation) lock(false); }
    };
    page.querySelectorAll('[data-import]').forEach(button => { button.onclick = () => {
      if (!discard()) return;
      try {
        const old = JSON.parse(localStorage.getItem('defang.ai.settings.v1.' + button.dataset.import));
        if (!old) { message('這個瀏覽器沒有這份舊設定'); return; }
        viewingId = ''; fill(S.migrate(old, button.dataset.import)); dirty = true; message('已匯入成草稿，儲存後就能選用');
      } catch (error) { message('無法匯入：' + error.message, true); }
    }; });
    choices(); fill(general);
    return { page, selector, picker, info, load, current: () => S.normalize(Object.assign({}, current().scene, { model: callModel.value })),
      get loading() { return loading; },
      edit: () => { notes.load(); if (!dirty) { const item = viewing(); if (item) show(item); } },
      lock: value => { busy = value; selector.disabled = busy || loading; callModel.disabled = busy || loading; },
      reset: () => { generation++; notes.reset(); items = []; hidden = []; selectedId = builtins[0].id; viewingId = selectedId; loaded = false; loading = false; dirty = false; choices(); fill(general); lock(false); },
      close: () => { /* 草稿留在本頁記憶體，登出 reset 才清除。 */ }
    };
  };
})();
