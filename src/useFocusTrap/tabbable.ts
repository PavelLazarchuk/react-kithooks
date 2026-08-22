export const GUARD_ATTR = 'data-focus-trap-guard';

const NATIVELY_TABBABLE = [
    'a[href]',
    'area[href]',
    'button',
    'input',
    'select',
    'textarea',
    'details > summary:first-of-type',
    'iframe',
    'audio[controls]',
    'video[controls]',
];

const CANDIDATE_SELECTOR = [
    ...NATIVELY_TABBABLE,
    'object',
    'embed',
    '[contenteditable]',
    '[tabindex]',
].join(',');

const NATIVELY_TABBABLE_SELECTOR = NATIVELY_TABBABLE.join(',');

function isEditable(el: HTMLElement): boolean {
    const value = el.getAttribute('contenteditable');

    return value !== null && value !== 'false';
}

function parseTabIndex(value: string): number | null {
    const trimmed = value.trim();

    if (!/^[+-]?\d+$/.test(trimmed)) return null;

    const parsed = Number(trimmed);

    return Number.isSafeInteger(parsed) ? parsed : null;
}

function tabIndexOf(el: HTMLElement): number {
    const attr = el.getAttribute('tabindex');
    const explicit = attr === null ? null : parseTabIndex(attr);

    if (explicit !== null) return explicit;
    if (isEditable(el)) return 0;

    return el.matches(NATIVELY_TABBABLE_SELECTOR) ? 0 : -1;
}

function isDisabled(el: HTMLElement): boolean {
    if ('disabled' in el && (el as { disabled?: boolean }).disabled === true) return true;

    const fieldset = el.closest('fieldset[disabled]');

    if (!fieldset) return false;

    const legend = fieldset.querySelector('legend');

    return !(legend && legend.contains(el));
}

function isHidden(el: HTMLElement): boolean {
    if (el.hidden) return true;
    if (el.closest('[inert]')) return true;

    const details = el.closest('details:not([open])');

    if (details && el.tagName !== 'SUMMARY') return true;

    const win = el.ownerDocument.defaultView;

    if (!win) return false;

    if (win.getComputedStyle(el).visibility !== 'visible') return true;

    let node: HTMLElement | null = el;

    while (node) {
        if (win.getComputedStyle(node).display === 'none') return true;

        node = node.parentElement;
    }

    return false;
}

function isUntabbableRadio(el: HTMLElement): boolean {
    if (!(el instanceof (el.ownerDocument.defaultView?.HTMLInputElement ?? HTMLInputElement))) {
        return false;
    }

    const input = el as HTMLInputElement;

    if (input.type !== 'radio' || !input.name) return false;

    const root: ParentNode = input.form ?? input.ownerDocument;
    const group = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter(
        radio => radio.name === input.name
    );

    if (group.length === 0) return false;

    const checked = group.find(radio => radio.checked);

    return checked ? checked !== input : group[0] !== input;
}

export function isTabbable(el: HTMLElement): boolean {
    if (el.hasAttribute(GUARD_ATTR)) return false;
    if (tabIndexOf(el) < 0) return false;
    if (isDisabled(el)) return false;
    if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'hidden') return false;
    if (isUntabbableRadio(el)) return false;

    return !isHidden(el);
}

export function getTabbables(container: HTMLElement): HTMLElement[] {
    const candidates = Array.from(container.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR));

    candidates.sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1));
    const positive: { el: HTMLElement; tabIndex: number; index: number }[] = [];
    const natural: HTMLElement[] = [];

    candidates.forEach((el, index) => {
        if (!isTabbable(el)) return;

        const tabIndex = tabIndexOf(el);

        if (tabIndex > 0) positive.push({ el, tabIndex, index });
        else natural.push(el);
    });

    if (positive.length === 0) return natural;

    positive.sort((a, b) => a.tabIndex - b.tabIndex || a.index - b.index);

    return [...positive.map(entry => entry.el), ...natural];
}

export function edgeTabbable(container: HTMLElement, last: boolean): HTMLElement | null {
    const tabbables = getTabbables(container);

    return (last ? tabbables[tabbables.length - 1] : tabbables[0]) ?? null;
}
