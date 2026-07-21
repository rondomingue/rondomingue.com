(() => {
  window.shuffleChildren = (container, selector) => {
    const items = [...container.querySelectorAll(selector)];

    for (let index = items.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
    }

    items.forEach(item => container.appendChild(item));
    return items;
  };
})();
