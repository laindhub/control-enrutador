(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('dialog').forEach(dialog => {
    const close = dialog.close.bind(dialog);
    let closing = false;
    dialog.close = value => {
      if (!dialog.open || reducedMotion.matches) return close(value);
      if (closing) return;
      closing = true;
      dialog.classList.add('is-closing');
      setTimeout(() => {
        close(value);
        dialog.classList.remove('is-closing');
        closing = false;
      }, 160);
    };
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      dialog.close();
    });
  });
})();
