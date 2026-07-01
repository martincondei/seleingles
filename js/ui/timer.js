export function createTimer({ onTick } = {}) {
  let startedAt = null;
  let intervalId = null;
  let elapsedSeconds = 0;
  let running = false;

  function tick() {
    if (!startedAt || !running) return;
    elapsedSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    onTick?.(elapsedSeconds);
  }

  return {
    start() {
      this.stop();
      startedAt = Date.now();
      elapsedSeconds = 0;
      running = true;
      tick();
      intervalId = window.setInterval(tick, 1000);
    },
    stop() {
      if (running && startedAt) {
        elapsedSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      }
      running = false;
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    },
    reset() {
      this.stop();
      startedAt = null;
      elapsedSeconds = 0;
      running = false;
      onTick?.(0);
    },
    getElapsedSeconds() {
      tick();
      return elapsedSeconds;
    }
  };
}

export function formatTimer(seconds) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}
