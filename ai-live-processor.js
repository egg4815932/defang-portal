/* 把裝置採樣率連續轉為 16 kHz、16-bit little-endian PCM；不回播麥克風。 */
class DefangPCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.buffer = new ArrayBuffer(1024);
    this.view = new DataView(this.buffer);
    this.offset = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.sum += channel[i];
      this.count++;
      this.phase += 16000;
      if (this.phase < sampleRate) continue;
      this.phase -= sampleRate;
      const value = Math.max(-1, Math.min(1, this.sum / this.count));
      this.view.setInt16(this.offset, value < 0 ? value * 32768 : value * 32767, true);
      this.offset += 2;
      this.sum = 0;
      this.count = 0;
      if (this.offset === this.buffer.byteLength) {
        this.port.postMessage(this.buffer, [this.buffer]);
        this.buffer = new ArrayBuffer(1024);
        this.view = new DataView(this.buffer);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('defang-pcm', DefangPCMProcessor);
