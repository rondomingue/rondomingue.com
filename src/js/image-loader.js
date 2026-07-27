(() => {
  const extractUrl = (value) => {
    if (!value || value === 'none') return '';
    const match = value.match(/url\(["']?(.+?)["']?\)/);
    return match ? match[1] : '';
  };

  const markLoaded = (frame) => {
    frame.classList.remove('image-loading', 'image-error');
    frame.classList.add('image-loaded');
  };

  const markError = (frame) => {
    frame.classList.remove('image-loading');
    frame.classList.add('image-error');
  };

  const watchImage = (frame, image) => {
    if (!image) {
      markLoaded(frame);
      return;
    }

    if (image.complete) {
      if (image.naturalWidth > 0) markLoaded(frame);
      else markError(frame);
      return;
    }

    image.addEventListener('load', () => markLoaded(frame), { once: true });
    image.addEventListener('error', () => markError(frame), { once: true });
  };

  const watchBackground = (frame, element) => {
    const src = extractUrl(getComputedStyle(element).backgroundImage);
    if (!src) {
      markLoaded(frame);
      return;
    }

    const image = new Image();
    image.onload = () => markLoaded(frame);
    image.onerror = () => markError(frame);
    image.src = src;
  };

  document.querySelectorAll('.image-load-frame').forEach((frame) => {
    const backgroundImage = frame.querySelector('.work-card-img');
    if (backgroundImage) {
      watchBackground(frame, backgroundImage);
      return;
    }

    watchImage(frame, frame.querySelector('img'));
  });
})();
