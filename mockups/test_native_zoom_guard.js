const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const checks = [
  ['最外層 viewport 鎖定 1 倍', /initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no/.test(html)],
  ['殼頁 root touch-action 禁止原生 pinch', /html,body\{[\s\S]*?touch-action:pan-x pan-y/.test(html)],
  ['touchstart/touchmove 多指守門', ['touchstart', 'touchmove'].every(event => html.includes(`addEventListener('${event}', 擋多指, { passive: false, capture: true })`))],
  ['iOS gesture 守門完整', ['gesturestart', 'gesturechange', 'gestureend'].every(event => html.includes(`addEventListener('${event}', 擋縮放`))],
  ['Ctrl+滾輪縮放守門', /addEventListener\('wheel',[\s\S]*?e\.ctrlKey/.test(html)],
  ['viewport 方向與安全區同步仍保留', /visualViewport\.addEventListener\('resize', scheduleViewportInsets\)/.test(html)]
];

let passed = 0;
for (const [name, ok] of checks) {
  if (ok) passed++;
  console.log(`${ok ? '✅' : '❌'} ${name}`);
}
console.log(`\n${passed} / ${checks.length} 項通過`);
if (passed !== checks.length) process.exit(1);
