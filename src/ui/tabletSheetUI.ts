export function bindTabletSheet(button: HTMLButtonElement, sidebar: HTMLElement): void {
  button.addEventListener('click', () => {
    const open = sidebar.classList.toggle('is-tablet-open');
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? 'Hide controls' : 'Controls';
  });
}
