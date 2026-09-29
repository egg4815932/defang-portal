/* 情境授權編輯器；額度與情境內容各自保存，避免儲存教材時覆寫已使用的次數。 */
(function () {
  'use strict';
  window.DFAIScenarioAccess = function (rpc) {
    const element = document.createElement('details');
    element.className = 'scenario-group scenario-access'; element.dataset.access = '';
    element.innerHTML = '<summary>開放帳號與對話額度</summary><p class="note">每個帳號分開計次，每次最多 5 分鐘。取得連線後扣 1 次，中斷不退回。移除帳號後無法再開始；擁有者試用不扣次。</p>' +
      '<div class="access-add"><select aria-label="新增可使用帳號"></select><button type="button" data-add>加入帳號</button></div>' +
      '<div class="access-rows"></div><div class="access-actions"><button type="button" data-refresh>重新載入額度</button><button type="button" data-save-access>儲存授權與額度</button></div><p role="status" data-access-status></p>';
    const select = element.querySelector('select'), rows = element.querySelector('.access-rows'), status = element.querySelector('[data-access-status]');
    let sceneId = '', revision = 0, grants = [], accounts = [], generation = 0, loaded = false, busy = false, dirty = false;
    function note(text) { status.textContent = text; }
    function lock(value) {
      busy = value;
      element.querySelectorAll('button,input,select').forEach(el => { el.disabled = value || !sceneId || !loaded; });
      element.querySelector('[data-refresh]').disabled = value || !sceneId;
    }
    function draw() {
      rows.replaceChildren(); select.replaceChildren();
      accounts.filter(a => !grants.some(g => g.id === a.id)).forEach(a => select.add(new Option(a.id + ' ' + a.name, a.id)));
      grants.forEach(g => {
        const row = document.createElement('div'); row.className = 'access-row';
        const who = document.createElement('span'), account = accounts.find(a => a.id === g.id);
        who.textContent = g.id + (account ? ' ' + account.name : '');
        const label = document.createElement('label'); label.textContent = '剩餘次數';
        const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = '9999'; input.step = '1'; input.value = g.remaining;
        input.setAttribute('aria-label', g.id + ' 剩餘次數');
        input.oninput = () => { g.remaining = input.valueAsNumber; dirty = true; note('尚未儲存額度'); };
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '移除'; remove.setAttribute('aria-label', '移除 ' + g.id);
        remove.onclick = () => { grants = grants.filter(x => x !== g); dirty = true; draw(); note('尚未儲存授權'); };
        label.append(input); row.append(who, label, remove); rows.append(row);
      });
      if (!grants.length) rows.textContent = '尚未開放給其他帳號。';
      lock(busy);
    }
    async function load() {
      if (!sceneId || busy) return;
      const seq = ++generation; lock(true); note('正在載入額度…');
      try {
        const result = await rpc({ action: 'list', id: sceneId });
        if (seq !== generation) return;
        grants = result.grants; accounts = result.accounts; revision = result.revision; loaded = true; dirty = false;
        draw(); note('可隨時調整剩餘次數，改完請儲存。也要在權限管理開放 AI情境模擬分頁。');
      } catch (error) { if (seq === generation) note(error.message); }
      finally { if (seq === generation) lock(false); }
    }
    element.ontoggle = () => { if (element.open && !loaded) load(); };
    element.querySelector('[data-add]').onclick = () => {
      if (!select.value || grants.some(g => g.id === select.value)) return;
      grants.push({ id: select.value, remaining: 1 }); dirty = true; draw(); note('尚未儲存授權');
    };
    element.querySelector('[data-refresh]').onclick = () => { if (!dirty || confirm('捨棄尚未儲存的額度修改，重新載入？')) load(); };
    element.querySelector('[data-save-access]').onclick = async () => {
      if (!loaded || busy) return;
      if (grants.some(g => !Number.isInteger(g.remaining) || g.remaining < 0 || g.remaining > 9999)) { note('剩餘次數須為 0 至 9999 的整數'); return; }
      const seq = ++generation; lock(true); note('正在儲存授權與額度…');
      try {
        const result = await rpc({ action: 'save', id: sceneId, revision, grants });
        if (seq !== generation) return;
        revision = result.revision; grants = result.grants; dirty = false; draw(); note('已儲存授權與額度');
      } catch (error) { if (seq === generation) note(error.message); }
      finally { if (seq === generation) lock(false); }
    };
    return { element, get dirty() { return dirty; }, select: id => {
      if ((id || '') === sceneId && loaded) return;
      generation++; sceneId = id || ''; revision = 0; grants = []; accounts = []; loaded = false; busy = false; dirty = false;
      draw(); note(sceneId ? '展開後可設定開放帳號與額度' : '請先儲存這份情境，再設定開放帳號與額度');
      if (element.open) load();
    } };
  };
})();
