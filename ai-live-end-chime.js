/* 到時提示：通話已停止後，沿用原音訊環境播完叮咚，再釋放環境。 */
(function () {
  'use strict';
  window.DFAIEndChime = function (context) {
    if (!context || context.state === 'closed' || !window.DFAIChime) return false;
    try {
      context.resume().catch(() => {});
      window.DFAIChime(context);
      setTimeout(() => { if (context.state !== 'closed') context.close().catch(() => {}); }, 2600);
      return true;
    } catch (error) { return false; }
  };
})();
