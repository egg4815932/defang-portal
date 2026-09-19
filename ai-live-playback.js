/* 單一播放器連續讀取 Gemini 24 kHz PCM，避免每包建立 BufferSource 的瀏覽器失真。 */
class DefangPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(24000 * 30);
    this.reset();
    this.port.onmessage = ({ data }) => {
      if (data.type === 'clear') { this.reset(); return; }
      if (data.type !== 'audio') return;
      const samples = data.samples;
      if (samples.length > this.buffer.length - this.count) {
        this.reset(); this.port.postMessage({ type: 'overflow' }); return;
      }
      if (!this.count) this.wait = Math.round(sampleRate * 0.12);
      for (let i = 0; i < samples.length; i++) {
        this.buffer[this.write] = samples[i];
        this.write = (this.write + 1) % this.buffer.length;
      }
      this.count += samples.length;
    };
  }
  reset() { this.read = 0; this.write = 0; this.count = 0; this.phase = 0; this.wait = 0; }
  process(inputs, outputs) {
    const out = outputs[0][0];
    out.fill(0);
    for (let i = 0; i < out.length; i++) {
      if (!this.count) break;
      if (this.wait > 0) { this.wait--; continue; }
      const a = this.buffer[this.read];
      const b = this.count > 1 ? this.buffer[(this.read + 1) % this.buffer.length] : a;
      out[i] = a + (b - a) * this.phase;
      // 沿用裝置的採樣率；跨封包與 render block 保留重採樣位置。
      this.phase += 24000 / sampleRate;
      const step = Math.floor(this.phase);
      this.phase -= step;
      const consumed = Math.min(step, this.count);
      this.read = (this.read + consumed) % this.buffer.length;
      this.count -= consumed;
      if (!this.count) this.phase = 0;
    }
    return true;
  }
}
registerProcessor('defang-playback', DefangPlaybackProcessor);
