(function () {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  requestAnimationFrame(() => document.body.classList.add('page-entered'));

  const siteHeader = document.querySelector('.site-header');
  const headerNav = document.querySelector('.header-nav');
  const mobileNavQuery = window.matchMedia('(max-width: 600px)');

  const setNavIndicator = (target = headerNav?.querySelector('.nav-link.active')) => {
    if (!headerNav || !target || !mobileNavQuery.matches) return;
    const navRect = headerNav.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    headerNav.style.setProperty('--nav-indicator-x', `${targetRect.left - navRect.left}px`);
    headerNav.style.setProperty('--nav-indicator-y', `${targetRect.top - navRect.top}px`);
    headerNav.style.setProperty('--nav-indicator-width', `${targetRect.width}px`);
    headerNav.style.setProperty('--nav-indicator-height', `${targetRect.height}px`);
  };

  if (headerNav) {
    requestAnimationFrame(() => setNavIndicator());
    document.fonts?.ready.then(() => setNavIndicator());
    window.addEventListener('resize', () => setNavIndicator());
    headerNav.addEventListener('pointerdown', (event) => {
      const link = event.target.closest('.nav-link');
      if (!link || !mobileNavQuery.matches) return;
      setNavIndicator(link);
      if (!siteHeader || reducedMotion) return;
      siteHeader.classList.remove('is-nav-bouncing');
      void siteHeader.offsetWidth;
      siteHeader.classList.add('is-nav-bouncing');
    });
    siteHeader?.addEventListener('animationend', () => {
      siteHeader.classList.remove('is-nav-bouncing');
    });
  }

  document.querySelectorAll('.illustration-mosaic img').forEach((image) => {
    image.classList.remove('media-reveal', 'is-media-loaded');
  });

  const images = document.querySelectorAll('main img:not(.project-lightbox-image):not(.illustration-lightbox-image)');
  images.forEach((image) => {
    if (image.closest('.illustration-mosaic')) return;
    image.classList.add('media-reveal');
    const reveal = () => image.classList.add('is-media-loaded');
    if (image.complete) reveal();
    else image.addEventListener('load', reveal, { once: true });
  });

  const items = document.querySelectorAll('.work-card, .project-gallery-item, .illustration-item, .about-photo-wrap');
  items.forEach((item, index) => {
    item.classList.add('reveal-item');
    item.style.setProperty('--reveal-delay', `${(index % 6) * 45}ms`);
  });

  if (reducedMotion || !('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-in-view'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in-view');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });

  items.forEach((item) => observer.observe(item));
})();
