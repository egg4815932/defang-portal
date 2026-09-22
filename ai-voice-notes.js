/* 音色自訂名稱與小筆記：依帳號保存，草稿按音色分開，不參與情境或 API 指令。 */
(function () {
  'use strict';
  window.DFAIVoiceNotes = function (rpc, activity, refresh) {
    let voice = 'Kore', saved = {}, drafts = {}, loaded = false, pending = false, locked = false, generation = 0;
    const renamed = refresh || (() => {});
    const element = document.createElement('div'); element.className = 'voice-notes wide';
    element.innerHTML = '<label class="voice-alias"><span data-alias-title></span><input type="text" data-voice-alias maxlength="20" placeholder="例如：女聲 · 溫柔"></label>' +
      '<p class="note">試聽後把你聽到的寫在這裡，上面的音色選單就會顯示你取的名字。最多 20 字。</p>' +
      '<label><span data-note-title></span><textarea data-voice-note maxlength="1000" rows="3" placeholder="例如：聲音很溫柔，適合慢慢講解"></textarea></label>' +
      '<p class="note">這是你的音色小筆記，跟著帳號保存。換情境也能看到，不會送給 AI。每個音色最多 1,000 字。</p>' +
      '<div class="voice-note-actions"><button type="button" data-note-save>儲存此音色名稱與備註</button><button type="button" data-note-reload>重新載入備註</button></div><p class="note" role="status" data-note-status></p>';
    const find = s => element.querySelector(s), input = find('textarea'), alias = find('[data-voice-alias]'), status = find('[data-note-status]');
    const original = key => ({ note: saved[key] ? saved[key].note : '', alias: saved[key] && saved[key].alias ? saved[key].alias : '' });
    const changed = key => Object.hasOwn(drafts, key) &&
      (drafts[key].note !== original(key).note || drafts[key].alias !== original(key).alias);
    function controls() {
      input.disabled = alias.disabled = locked || pending || !loaded;
      find('[data-note-save]').disabled = locked || pending || !loaded || !changed(voice);
      find('[data-note-reload]').disabled = locked || pending;
    }
    function select(value) {
      voice = value;
      find('[data-alias-title]').textContent = label(value) + ' 你取的名字';
      find('[data-note-title]').textContent = label(value) + ' 的備註';
      const shown = Object.hasOwn(drafts, value) ? drafts[value] : original(value);
      input.value = shown.note; alias.value = shown.alias;
      status.textContent = pending ? '處理備註中…' : !loaded ? '請載入音色備註' : changed(value) ? '此音色名稱與備註尚未儲存' : '此音色名稱與備註已同步';
      controls();
    }
    function label(value) { return value.startsWith('openai:') ? 'GPT-Live · ' + value.slice(7) : value; }
    function edit(event) {
      event.stopPropagation(); drafts[voice] = { note: input.value, alias: alias.value };
      status.textContent = '此音色名稱與備註尚未儲存'; controls(); activity();
    }
    input.addEventListener('input', edit);
    alias.addEventListener('input', edit);
    async function load(force) {
      if (pending || loaded && !force) return;
      if (force && Object.keys(drafts).some(changed) && !window.confirm('重新載入會捨棄所有尚未儲存的音色名稱與備註，確定嗎？')) return;
      const version = generation; pending = true; select(voice);
      try {
        const result = await rpc({ action: 'list' });
        if (version !== generation) return;
        saved = Object.fromEntries(result.items.map(item => [item.voice, item])); drafts = {}; loaded = true;
        pending = false; select(voice); renamed();
      } catch (error) { if (version === generation) status.textContent = error.message + '；請重新載入備註'; }
      finally { if (version === generation) { pending = false; controls(); } }
    }
    find('[data-note-save]').onclick = async () => {
      const version = generation, key = voice, note = input.value, name = alias.value.trim();
      pending = true; status.textContent = '儲存備註中…'; controls(); activity();
      try {
        const result = await rpc({ action: 'save', voice: key, note, alias: name, revision: saved[key] ? saved[key].revision : 0 });
        if (version !== generation) return;
        // 只更新本次音色，其他草稿保留原版本，避免覆蓋別的視窗更新。
        saved[key] = result.items.find(item => item.voice === key); delete drafts[key];
        pending = false; select(voice); renamed(); status.textContent = label(key) + ' 名稱與備註已儲存至你的帳號';
      } catch (error) { if (version === generation) status.textContent = error.message; }
      finally { if (version === generation) { pending = false; controls(); } }
    };
    find('[data-note-reload]').onclick = () => { activity(); load(true); };
    select(voice);
    return { element, select, load, lock: value => { locked = value; controls(); },
      alias: key => original(key).alias,
      reset: () => { generation++; saved = {}; drafts = {}; loaded = false; pending = false; locked = false; select('Kore'); renamed(); } };
  };
})();
