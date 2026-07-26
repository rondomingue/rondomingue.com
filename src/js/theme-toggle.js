(() => {
  const root = document.documentElement;
  const button = document.querySelector('[data-theme-toggle]');
  if (!button) return;

  const label = button.querySelector('[data-theme-toggle-text]');

  let audioContext;

  const playShutterClick = () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    try {
      audioContext = audioContext || new AudioContext();
      if (audioContext.state === "suspended") audioContext.resume();

      const now = audioContext.currentTime;
      const duration = 0.045;
      const sampleCount = Math.floor(audioContext.sampleRate * duration);
      const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < sampleCount; i += 1) {
        const envelope = Math.pow(1 - i / sampleCount, 4);
        data[i] = (Math.random() * 2 - 1) * envelope;
      }

      const noise = audioContext.createBufferSource();
      const highpass = audioContext.createBiquadFilter();
      const gain = audioContext.createGain();

      noise.buffer = buffer;
      highpass.type = "highpass";
      highpass.frequency.setValueAtTime(1800, now);
      gain.gain.setValueAtTime(0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(highpass);
      highpass.connect(gain);
      gain.connect(audioContext.destination);
      noise.start(now);
      noise.stop(now + duration);
    } catch (error) {}
  };

  const applyTheme = theme => {
    const isLight = theme === 'light';
    root.dataset.theme = isLight ? 'light' : 'dark';
    button.setAttribute('aria-pressed', String(isLight));
    button.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
    if (label) label.textContent = isLight ? 'Light' : 'Dark';
  };

  let initialTheme = root.dataset.theme === 'light' ? 'light' : 'dark';
  try {
    initialTheme = localStorage.getItem('rd-theme') === 'light' ? 'light' : 'dark';
  } catch (error) {}

  applyTheme(initialTheme);

  button.addEventListener('click', () => {
    playShutterClick();
    const nextTheme = root.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
    try {
      if (nextTheme === 'light') localStorage.setItem('rd-theme', 'light');
      else localStorage.removeItem('rd-theme');
    } catch (error) {}
  });
})();
