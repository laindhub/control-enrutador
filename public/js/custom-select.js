(() => {
  const enhanced = new WeakMap();
  let openInstance = null;

  function closeOpen() {
    if (!openInstance) return;
    openInstance.close();
    openInstance = null;
  }

  function enhance(select) {
    if (!(select instanceof HTMLSelectElement) || enhanced.has(select)) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'custom-select-trigger';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = 'custom-select-value';

    const chevron = document.createElement('span');
    chevron.className = 'custom-select-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = '<svg viewBox="0 0 20 20" focusable="false"><path d="m5.5 7.5 4.5 4.5 4.5-4.5"/></svg>';

    button.append(label, chevron);

    const menu = document.createElement('div');
    menu.className = 'custom-select-menu';
    if (select.closest('.ai-lead-form')) menu.classList.add('ai-custom-select-menu');
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    document.body.append(menu);

    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(select, button);
    select.classList.add('custom-select-native');

    const instance = {
      select,
      wrapper,
      button,
      label,
      menu,
      options: [],
      highlighted: -1,
      close() {
        menu.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        wrapper.classList.remove('open');
        instance.highlighted = -1;
      },
      open() {
        if (select.disabled) return;
        if (openInstance && openInstance !== instance) openInstance.close();
        sync();
        positionMenu();
        menu.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        wrapper.classList.add('open');
        openInstance = instance;
        const selectedIndex = instance.options.findIndex((option) => option.dataset.value === select.value);
        instance.highlighted = selectedIndex >= 0 ? selectedIndex : 0;
        updateHighlight();
        requestAnimationFrame(() => instance.options[instance.highlighted]?.scrollIntoView({ block: 'nearest' }));
      },
    };

    enhanced.set(select, instance);

    function sync() {
      const selected = select.options[select.selectedIndex];
      label.textContent = selected?.textContent?.trim() || select.getAttribute('placeholder') || 'Seleccionar…';
      button.disabled = select.disabled;
      button.classList.toggle('placeholder', !select.value);

      menu.replaceChildren();
      instance.options = [...select.options].map((option, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'custom-select-option';
        item.dataset.value = option.value;
        item.dataset.index = String(index);
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', option.selected ? 'true' : 'false');
        item.disabled = option.disabled;
        item.textContent = option.textContent;
        if (option.selected) item.classList.add('selected');
        item.addEventListener('click', () => choose(index));
        menu.append(item);
        return item;
      });
    }

    function choose(index) {
      const option = select.options[index];
      if (!option || option.disabled) return;
      select.selectedIndex = index;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
      instance.close();
      if (openInstance === instance) openInstance = null;
      button.focus();
    }

    function positionMenu() {
      const rect = button.getBoundingClientRect();
      const viewportPadding = 12;
      const preferredWidth = Math.max(rect.width, 220);
      const width = Math.min(preferredWidth, window.innerWidth - viewportPadding * 2);
      const left = Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - width - viewportPadding);
      const roomBelow = window.innerHeight - rect.bottom - viewportPadding;
      const roomAbove = rect.top - viewportPadding;
      const openAbove = roomBelow < 220 && roomAbove > roomBelow;
      const maxHeight = Math.max(140, Math.min(340, (openAbove ? roomAbove : roomBelow) - 8));

      menu.style.width = `${width}px`;
      menu.style.maxHeight = `${maxHeight}px`;
      menu.style.left = `${left}px`;
      menu.style.top = openAbove ? 'auto' : `${rect.bottom + 6}px`;
      menu.style.bottom = openAbove ? `${window.innerHeight - rect.top + 6}px` : 'auto';
    }

    function updateHighlight() {
      instance.options.forEach((option, index) => option.classList.toggle('highlighted', index === instance.highlighted));
    }

    function moveHighlight(direction) {
      if (!instance.options.length) return;
      let next = instance.highlighted;
      do {
        next = (next + direction + instance.options.length) % instance.options.length;
      } while (instance.options[next]?.disabled && next !== instance.highlighted);
      instance.highlighted = next;
      updateHighlight();
      instance.options[next]?.scrollIntoView({ block: 'nearest' });
    }

    button.addEventListener('click', () => {
      if (menu.hidden) instance.open();
      else {
        instance.close();
        if (openInstance === instance) openInstance = null;
      }
    });

    button.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (menu.hidden) instance.open();
        else moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        if (menu.hidden) return;
        event.preventDefault();
        if (instance.highlighted >= 0) choose(instance.highlighted);
        return;
      }
      if (event.key === 'Escape' && !menu.hidden) {
        event.preventDefault();
        instance.close();
        openInstance = null;
      }
    });

    select.addEventListener('change', sync);

    const optionObserver = new MutationObserver(sync);
    optionObserver.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected', 'label'] });

    sync();
  }

  function scan(root = document) {
    if (root instanceof HTMLSelectElement) enhance(root);
    root.querySelectorAll?.('select').forEach(enhance);
  }

  document.addEventListener('click', (event) => {
    if (!openInstance) return;
    if (openInstance.wrapper.contains(event.target) || openInstance.menu.contains(event.target)) return;
    closeOpen();
  });

  window.addEventListener('resize', () => {
    if (openInstance) openInstance.close();
    openInstance = null;
  });

  window.addEventListener('scroll', (event) => {
    if (!openInstance) return;

    // Scroll events from the menu reach window during the capture phase. They
    // must not be treated as page scrolling or the list closes on mobile drag.
    if (event.target === openInstance.menu || openInstance.menu.contains(event.target)) return;

    openInstance.close();
    openInstance = null;
  }, true);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) scan(node);
      });
    }
  });

  scan();
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
