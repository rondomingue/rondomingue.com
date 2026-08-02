(() => {
  if (document.body.classList.contains("page-analytics")) return;

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const interactiveSelector = [
    "a[href]",
    "button",
    "[role='button']",
    "summary",
    "input[type='button']",
    "input[type='submit']",
    "input[type='reset']"
  ].join(",");

  let audioContext = null;
  let soundEnabled = false;
  let lastHoverTarget = null;
  let lastHoverAt = 0;

  const getContext = () => {
    if (!audioContext) audioContext = new AudioContext();
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  };

  const playTone = ({ frequency, duration, volume, type = "sine", slideTo }) => {
    const context = getContext();
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (slideTo) {
      oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.018);
  };

  const isSoundTarget = target => {
    const element = target.closest(interactiveSelector);
    if (!element) return null;
    if (element.matches("[disabled], [aria-disabled='true']")) return null;
    return element;
  };

  const enableSound = () => {
    soundEnabled = true;
    getContext();
  };

  document.addEventListener("pointerdown", event => {
    const target = isSoundTarget(event.target);
    if (!target) return;
    enableSound();
    playTone({ frequency: 360, slideTo: 510, duration: 0.045, volume: 0.012, type: "triangle" });
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = isSoundTarget(event.target);
    if (!target) return;
    enableSound();
    playTone({ frequency: 360, slideTo: 510, duration: 0.045, volume: 0.012, type: "triangle" });
  }, true);

  document.addEventListener("pointerover", event => {
    if (!soundEnabled) return;
    const target = isSoundTarget(event.target);
    if (!target || target === lastHoverTarget) return;

    const now = performance.now();
    if (now - lastHoverAt < 80) return;
    lastHoverAt = now;
    lastHoverTarget = target;
    playTone({ frequency: 620, slideTo: 720, duration: 0.032, volume: 0.007 });
  }, { passive: true });

  document.addEventListener("pointerout", event => {
    const target = isSoundTarget(event.target);
    if (target && !target.contains(event.relatedTarget)) {
      lastHoverTarget = null;
    }
  }, { passive: true });
})();
