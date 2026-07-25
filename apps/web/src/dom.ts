export function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required DOM element is missing: ${selector}`);
  return element;
}

export function clearAndAppend(parent: Element, children: readonly Node[]): void {
  const fragment = document.createDocumentFragment();
  fragment.append(...children);
  parent.replaceChildren(fragment);
}

export function button(label: string, action: string, value?: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'neo-btn compact';
  element.dataset['action'] = action;
  if (value) element.dataset['value'] = value;
  element.textContent = label;
  return element;
}
