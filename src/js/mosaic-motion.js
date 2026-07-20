(() => {
  const settle = animation => animation.finished.catch(() => undefined);

  window.animateMosaicFilter = async (tiles, orientation, controls) => {
    if (controls.dataset.animating === 'true') return;
    controls.dataset.animating = 'true';
    controls.querySelectorAll('button').forEach(button => { button.disabled = true; });

    const shouldShow = tile => orientation === 'all' || tile.dataset.orientation === orientation;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      tiles.forEach(tile => { tile.hidden = !shouldShow(tile); });
      controls.dataset.animating = 'false';
      controls.querySelectorAll('button').forEach(button => { button.disabled = false; });
      return;
    }

    const visibleBefore = tiles.filter(tile => !tile.hidden);
    const firstRects = new Map(visibleBefore.map(tile => [tile, tile.getBoundingClientRect()]));
    const exiting = visibleBefore.filter(tile => !shouldShow(tile));
    const entering = tiles.filter(tile => tile.hidden && shouldShow(tile));

    await Promise.all(exiting.map(tile => settle(tile.animate([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(0.965)' }
    ], {
      duration: 150,
      easing: 'cubic-bezier(.4, 0, 1, 1)',
      fill: 'forwards'
    }))));

    exiting.forEach(tile => {
      tile.hidden = true;
      tile.getAnimations().forEach(animation => animation.cancel());
    });
    entering.forEach(tile => { tile.hidden = false; });

    // Force the column layout to settle before measuring its new positions.
    document.querySelector('.illustration-mosaic').offsetHeight;

    const nowVisible = tiles.filter(tile => !tile.hidden);
    const movingAnimations = [];
    nowVisible.forEach((tile, index) => {
      const previous = firstRects.get(tile);
      const current = tile.getBoundingClientRect();

      if (previous) {
        const deltaX = previous.left - current.left;
        const deltaY = previous.top - current.top;
        if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
          movingAnimations.push(tile.animate([
            { transform: `translate(${deltaX}px, ${deltaY}px)`, opacity: 0.82 },
            { transform: 'translate(0, 0)', opacity: 1 }
          ], {
            duration: 620,
            delay: Math.min(index * 7, 105),
            easing: 'cubic-bezier(.16, 1, .3, 1)'
          }));
        }
      } else {
        movingAnimations.push(tile.animate([
          { opacity: 0, transform: 'translateY(18px) scale(0.98)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' }
        ], {
          duration: 480,
          delay: Math.min(index * 10, 160),
          easing: 'cubic-bezier(.16, 1, .3, 1)'
        }));
      }
    });

    await Promise.all(movingAnimations.map(settle));
    controls.dataset.animating = 'false';
    controls.querySelectorAll('button').forEach(button => { button.disabled = false; });
  };
})();
