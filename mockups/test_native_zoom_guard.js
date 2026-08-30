const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const checks = [
  ['最外層 viewport 鎖定 1 倍', /initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no/.test(html)],
  ['殼頁 root touch-action 禁止原生 pinch', /html,body\{[\s\S]*?touch-action:pan-x pan-y/.test(html)],
  ['touchstart/touchmove 多指守門', ['touchstart', 'touchmove'].every(event => html.includes(`addEventListener('${event}', 擋多指, { passive: false, capture: true })`))],
  ['iOS gesture 守門完整', ['gesturestart', 'gesturechange', 'gestureend'].every(event => html.includes(`addEventListener('${event}', 擋縮放`))],
  ['Ctrl+滾輪縮放守門', /addEventListener\('wheel',[\s\S]*?e\.ctrlKey/.test(html)],
  ['viewport 方向與安全區同步仍保留', /visualViewport\.addEventListener\('resize', scheduleViewportInsets\)/.test(html)],
  ['iPad 合成 guard 維持 16px', /html\.ios-device:not\(\.iphone-device\)\{\s*--app-overscan-guard:16px/.test(html)],
  ['iPhone 外殼維持精確高度', /html\.ios-device\.iphone-device\{\s*--app-bottom-inset:0px;\s*--app-overscan-guard:0px/.test(html)],
  ['standalone 底部 overscan 僅限 iPad', /html\.ios-device:not\(\.iphone-device\)\.ios-standalone,[\s\S]*?--app-bottom-inset:max\(/.test(html)],
  ['iPhone iframe 回到一般排版基準', /html\.iphone-device iframe\{position:static;top:auto;left:auto\}/.test(html)],
  ['iPad iframe absolute 合成基準未動', /iframe\{\s*display:block;position:absolute;top:0;left:0;width:100%;height:100%/.test(html)],
  ['iPad guard 不回報內頁裁切', /rect\.bottom - viewportHeight - overscanGuard/.test(html)],
  ['iPhone 讀取左右安全區', /--app-safe-left:env\(safe-area-inset-left,0px\)[\s\S]*--app-safe-right:env\(safe-area-inset-right,0px\)/.test(html)],
  ['iPhone 播放中心採左右安全區差', /\(safeRight - safeLeft\) \/ \(2 \* scale\)/.test(html)],
  ['播放中心偏移會傳入 GAS', /centerOffsetX: centerOffsetX/.test(html)]
];

let passed = 0;
for (const [name, ok] of checks) {
  if (ok) passed++;
  console.log(`${ok ? '✅' : '❌'} ${name}`);
}
console.log(`\n${passed} / ${checks.length} 項通過`);
if (passed !== checks.length) process.exit(1);
