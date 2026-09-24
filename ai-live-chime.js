/* 接通提示音：像店門口「叮—咚」有客人進門。直接用通話的 AudioContext 合成，不經過音量鈕與錄音。 */
(function () {
  'use strict';
  // 高音叮、低音咚；每一聲是鐘聲：基音＋一點泛音，敲下去立刻響、慢慢消失。
  const NOTES = [{ at: 0, hz: 659.25 }, { at: 0.42, hz: 523.25 }];
  const PARTIALS = [{ ratio: 1, gain: 1 }, { ratio: 2, gain: 0.28 }, { ratio: 3, gain: 0.08 }];
  window.DFAIChime = function (context) {
    if (!context || context.state === 'closed') return;
    try {
      const out = context.createGain();
      out.gain.value = 0.22;
      out.connect(context.destination);
      const start = context.currentTime + 0.05;
      NOTES.forEach(note => PARTIALS.forEach(partial => {
        const t = start + note.at, length = partial.ratio === 1 ? 1.4 : 0.6;
        const osc = context.createOscillator(), env = context.createGain();
        osc.type = 'sine'; osc.frequency.value = note.hz * partial.ratio;
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(partial.gain, t + 0.008);
        env.gain.exponentialRampToValueAtTime(0.0001, t + length);
        osc.connect(env); env.connect(out);
        osc.start(t); osc.stop(t + length + 0.05);
      }));
      setTimeout(() => out.disconnect(), 2600);
    } catch (error) {}
  };
})();
