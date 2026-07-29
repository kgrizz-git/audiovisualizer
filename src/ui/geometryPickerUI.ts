import { Variation } from '../core/types.js';

/** Builds and syncs visual geometry radio tiles from the canonical select options. */
export function initializeGeometryPicker(
  select: HTMLSelectElement,
  picker: HTMLElement,
  onSelect: (variation: Variation) => void,
): void {
  // Lightweight controller tests use select-shaped mocks without a DOM tree.
  if (!select.children) return;
  picker.replaceChildren(...Array.from(select.children).flatMap((child) => {
    const options: HTMLOptionElement[] = child instanceof HTMLOptGroupElement
      ? Array.from(child.querySelectorAll('option'))
      : [child as HTMLOptionElement];
    const group = document.createElement('div');
    group.className = 'geometry-picker-group';
    if (child instanceof HTMLOptGroupElement) {
      const label = document.createElement('span');
      label.className = 'geometry-picker-group-label';
      label.textContent = child.label;
      group.append(label);
    }
    options.forEach((option) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'geometry-tile';
      tile.dataset.variation = option.value;
      tile.setAttribute('role', 'radio');
      tile.textContent = option.text;
      tile.addEventListener('click', () => onSelect(option.value as Variation));
      group.append(tile);
    });
    return group;
  }));
}

export function updateGeometryPicker(picker: HTMLElement, variation: Variation): void {
  picker.querySelectorAll<HTMLButtonElement>('.geometry-tile').forEach((tile) => {
    const selected = tile.dataset.variation === variation;
    tile.classList.toggle('is-selected', selected);
    tile.setAttribute('aria-checked', String(selected));
  });
}
