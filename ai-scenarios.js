/* 情境編輯與選用；只有 AI 語音對話頁持有麥克風與 LiveClient。 */
(function () {
  'use strict';
  window.DFAIScenarios = function (hooks) {
    const S = window.DFAISchema;
    const general = S.migrate(null, 'chat'); general.name = '日常對話';
    const study = S.defaults('教材陪練'); study.settings.requireMaterial = 'on';
    const builtins = [{ id: 'builtin-chat', scene: general }, { id: 'builtin-tutor', scene: study }];
    let items = [], selectedId = builtins[0].id, editingId = '', revision = 0, dirty = false, loading = false, loaded = false, generation = 0;
    let busy = false;
    const page = document.createElement('section'); page.id = 'ai-tutor'; page.className = 'page scenario-page'; page.hidden = true;
    page.setAttribute('role', 'dialog'); page.setAttribute('aria-modal', 'true'); page.setAttribute('aria-label', 'AI 語音設定');
    page.innerHTML = '<header><button type="button" data-close>← 返回系統</button><div><h1>AI 語音設定</h1><p class="sub">情境設定庫 · 通話統一在 AI 語音對話</p></div><button type="button" data-use>前往對話</button></header>' +
      '<div class="scenario-layout"><aside class="scenario-library"><label>已儲存的情境<select data-library aria-label="已儲存的情境"></select></label>' +
      '<div class="scenario-actions"><button type="button" data-new>＋ 新情境</button><button type="button" data-copy>複製這份</button><button type="button" data-reload>重新載入</button></div>' +
      '<details><summary>儲存說明／匯入舊設定</summary><p class="note">每個帳號最多 200 個情境。儲存後，設定與教材會跟著帳號，可在手機、電腦使用。</p><button type="button" data-import="chat">原語音對話</button><button type="button" data-import="tutor">原教材陪練</button></details></aside>' +
      '<div class="scenario-editor"><div class="scenario-basics"><label>情境名稱<input data-name maxlength="80" placeholder="例如：溫柔老師、產品問答"></label>' +
      '<label>模型<select data-model><option value="gemini-3.8-live">Gemini 3.8 Live</option><option value="gemini-3.8-live-extended-thinking">Gemini 3.8 Extended Thinking</option></select></label></div>' +
      '<div data-groups></div><details class="scenario-group"><summary>教材內容</summary><label>一起儲存的教材<textarea data-material maxlength="12000" placeholder="貼上教材；沒有教材也可以建立一般對話情境"></textarea></label><p class="note" data-count></p></details>' +
      '<details class="scenario-group"><summary>完整送出指令</summary><p class="note">這裡顯示上述設定組合後，實際會交給 AI 的指令。開場訊息另送。</p><pre data-instruction></pre></details>' +
      '<details class="scenario-group"><summary>系統固定限制</summary><p class="note">只開放 DR136／DR252，所有讀寫先驗證登入。API Key 只留後端；票證只開一個新會話，模型與指令等欄位會鎖定。回覆為語音、輸入為單聲道 16 kHz PCM、播放為 24 kHz PCM。每分鐘最多 6 次取票、通話最長 30 分鐘、教材最多 12,000 字。沒有搜尋或操作內部系統的工具；改寫指令不會新增權限。這些不是情境可解除的限制。</p></details></div></div>' +
      '<footer class="scenario-footer"><p role="status" data-message>正在載入情境…</p><button type="button" data-delete>刪除</button><button type="button" class="primary" data-save>儲存情境</button><button type="button" data-save-use>儲存並套用</button></footer>';
    const find = sel => page.querySelector(sel), controls = {}, output = {};
    const name = find('[data-name]'), model = find('[data-model]'), material = find('[data-material]'), library = find('[data-library]');
    const selector = document.createElement('select'); selector.dataset.scenario = ''; selector.setAttribute('aria-label', '套用情境');
    const label = document.createElement('label'); label.className = 'scenario-picker'; label.append(document.createTextNode('情境'), selector);
    const info = document.createElement('p'); info.className = 'note scenario-info'; info.setAttribute('role', 'status');
    const groups = new Map();
    const notes = new window.DFAIVoiceNotes(hooks.notesRpc, hooks.activity);
    S.fields.forEach(f => {
      if (!groups.has(f.group)) {
        const details = document.createElement('details'); details.className = 'scenario-group';
        const summary = document.createElement('summary'); summary.textContent = f.group;
        const grid = document.createElement('div'); grid.className = 'scenario-grid'; details.append(summary, grid);
        if (!groups.size) details.open = true;
        find('[data-groups]').append(details); groups.set(f.group, grid);
      }
      const wrap = document.createElement('label'); wrap.textContent = f.label;
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
      input.dataset.setting = f.key; input.setAttribute('aria-label', f.label); wrap.append(input);
      if (f.hint) { const hint = document.createElement('small'); hint.textContent = f.hint; wrap.append(hint); }
      controls[f.key] = input; groups.get(f.group).append(wrap);
      if (f.key === 'voice') {
        wrap.className = 'wide'; groups.get(f.group).append(notes.element);
        input.addEventListener('change', () => notes.select(input.value));
      }
    });
    function all() { return builtins.concat(items); }
    function current() { return all().find(item => item.id === selectedId) || builtins[0]; }
    function message(text, error) { find('[data-message]').textContent = text; find('[data-message]').classList.toggle('error', !!error); }
    function read() {
      const settings = {};
      S.fields.forEach(f => { settings[f.key] = f.type === 'range' ? output[f.key].valueAsNumber : controls[f.key].value; });
      return S.normalize({ name: name.value, model: model.value, material: material.value, settings });
    }
    function updateInstruction() {
      try { find('[data-instruction]').textContent = S.instruction(read()); }
      catch (error) { find('[data-instruction]').textContent = error.message; }
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
      editingId = id || ''; revision = rev || 0; dirty = false;
      notes.select(controls.voice.value);
      updateInstruction(); find('[data-delete]').disabled = !editingId || loading;
      message(editingId ? '已載入 · 修改後記得儲存' : '這是新草稿 · 儲存後就能在對話頁選用');
    }
    function discard() { return !dirty || window.confirm('這份情境有尚未儲存的修改，要捨棄修改嗎？'); }
    function choices() {
      [selector, library].forEach(el => { el.replaceChildren(); all().forEach(item => el.add(new Option(item.scene.name + (item.id.startsWith('builtin-') ? ' · 內建' : ''), item.id))); });
      selector.value = selectedId; library.value = editingId || selectedId;
      info.textContent = current().scene.name + ' · ' + (current().scene.material ? '含教材' : '無教材') + ' · ' + (current().scene.model.endsWith('extended-thinking') ? 'Thinking' : 'Live');
      if (hooks.change) hooks.change(current().scene);
    }
    function lock(value) {
      loading = value;
      page.querySelectorAll('input,select,textarea,button').forEach(el => { if (!el.matches('[data-close]')) el.disabled = value; });
      selector.disabled = value || busy;
      find('[data-delete]').disabled = value || !editingId; updateInstruction();
      notes.lock(value);
    }
    async function load(force) {
      if (loaded && !force) return;
      const version = ++generation; lock(true); info.textContent = '正在載入帳號情境…';
      try {
        const result = await hooks.rpc({ action: 'list' });
        if (version !== generation) return;
        items = result.items.map(item => ({ id: item.id, revision: item.revision, scene: S.normalize(item.scene) }));
        if (!all().some(item => item.id === selectedId)) selectedId = builtins[0].id;
        loaded = true; choices();
        if (!dirty || force) { const item = current(); fill(item.scene, item.id.startsWith('builtin-') ? '' : item.id, item.revision); }
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
        items = result.items; selectedId = result.selectedId;
        const item = current(); fill(item.scene, item.id, item.revision); choices(); message('已儲存至你的帳號');
        if (use) hooks.use();
      } catch (error) { if (version === generation) message(error.message, true); }
      finally { if (version === generation) lock(false); }
    }
    selector.onchange = () => { selectedId = selector.value; choices(); hooks.activity(); };
    library.onchange = () => {
      if (!discard()) { library.value = editingId || selectedId; return; }
      const item = all().find(x => x.id === library.value);
      fill(item.scene, item.id.startsWith('builtin-') ? '' : item.id, item.revision);
    };
    page.addEventListener('input', event => { if (event.target.matches('input,textarea')) changed(); });
    page.addEventListener('change', event => { if (event.target !== library && event.target.matches('select')) changed(); });
    find('[data-new]').onclick = () => { if (discard()) fill(S.defaults()); };
    find('[data-copy]').onclick = () => { try { const scene = read(); scene.name = (scene.name + ' 副本').slice(0, 80); fill(scene); dirty = true; message('已複製成新草稿，請儲存'); } catch (error) { message(error.message, true); } };
    find('[data-reload]').onclick = () => { if (discard()) load(true); };
    find('[data-save]').onclick = () => save(false); find('[data-save-use]').onclick = () => save(true);
    find('[data-use]').onclick = () => {
      if (!dirty && editingId) selectedId = editingId;
      choices(); hooks.use();
    };
    find('[data-delete]').onclick = async () => {
      if (!editingId || !window.confirm('確定刪除「' + name.value + '」？')) return;
      const version = generation; lock(true);
      try {
        const result = await hooks.rpc({ action: 'delete', id: editingId, revision });
        if (version !== generation) return;
        items = result.items; selectedId = builtins[0].id; choices(); fill(current().scene); message('已刪除');
      } catch (error) { if (version === generation) message(error.message, true); }
      finally { if (version === generation) lock(false); }
    };
    page.querySelectorAll('[data-import]').forEach(button => { button.onclick = () => {
      if (!discard()) return;
      try {
        const old = JSON.parse(localStorage.getItem('defang.ai.settings.v1.' + button.dataset.import));
        if (!old) { message('這個瀏覽器沒有這份舊設定'); return; }
        fill(S.migrate(old, button.dataset.import)); dirty = true; message('已匯入成草稿，儲存後就能選用');
      } catch (error) { message('無法匯入：' + error.message, true); }
    }; });
    choices(); fill(general);
    return { page, selector, picker: label, info, load, current: () => S.normalize(current().scene),
      get loading() { return loading; },
      edit: () => { notes.load(); if (!dirty) { const item = current(); fill(item.scene, item.id.startsWith('builtin-') ? '' : item.id, item.revision); } },
      lock: value => { busy = value; selector.disabled = busy || loading; },
      reset: () => { generation++; notes.reset(); items = []; selectedId = builtins[0].id; loaded = false; loading = false; dirty = false; choices(); fill(general); lock(false); },
      close: () => { /* 草稿留在本頁記憶體，登出 reset 才清除。 */ }
    };
  };
})();
