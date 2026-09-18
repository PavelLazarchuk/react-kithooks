export type LockStrategy = 'auto' | 'overflow' | 'fixed';

export interface LockConfig {
    strategy: LockStrategy;
    gutter: boolean;
    container: HTMLElement | null;
    inert: boolean;
}

export interface LockHandle {
    release: () => void;
}

interface DocumentState {
    locks: object[];
    restore: (() => void) | null;
}

const states = new WeakMap<Document, DocumentState>();

const STYLE_PROPERTIES = [
    'overflow',
    'paddingRight',
    'position',
    'top',
    'left',
    'right',
    'width',
] as const;

function stateOf(doc: Document): DocumentState {
    let state = states.get(doc);

    if (!state) {
        state = { locks: [], restore: null };
        states.set(doc, state);
    }

    return state;
}

export function isTouchScroller(view: Window & typeof globalThis): boolean {
    const { navigator } = view;

    if (!navigator) return false;

    const touchPoints = navigator.maxTouchPoints ?? 0;
    const platform = navigator.platform || '';

    return /iP(hone|ad|od)/.test(platform) || (platform === 'MacIntel' && touchPoints > 1);
}

function snapshot(body: HTMLElement): () => void {
    const saved = STYLE_PROPERTIES.map(
        property => [property, body.style[property]] as [(typeof STYLE_PROPERTIES)[number], string]
    );

    return () => {
        for (const [property, value] of saved) body.style[property] = value;
    };
}

function markInert(container: HTMLElement): HTMLElement[] {
    const marked: HTMLElement[] = [];
    const body = container.ownerDocument.body;

    if (container === body) return marked;

    let node: HTMLElement = container;

    while (node.parentElement) {
        for (const sibling of node.parentElement.children) {
            if (sibling === node || !(sibling instanceof HTMLElement)) continue;
            if (sibling.hasAttribute('inert')) continue;

            sibling.setAttribute('inert', '');
            marked.push(sibling);
        }

        if (node.parentElement === body) break;

        node = node.parentElement;
    }

    return marked;
}

function applyLock(doc: Document, config: LockConfig): () => void {
    const view = doc.defaultView;
    const body = doc.body;

    if (!view || !body) return () => undefined;

    const restoreStyle = snapshot(body);
    const fixed =
        config.strategy === 'fixed' ||
        (config.strategy === 'auto' && isTouchScroller(view as Window & typeof globalThis));

    const gap = view.innerWidth - doc.documentElement.clientWidth;
    const scrollY = view.scrollY;

    if (config.gutter && gap > 0) {
        const current = view.getComputedStyle(body).paddingRight;

        body.style.paddingRight = `${(Number.parseFloat(current) || 0) + gap}px`;
    }

    if (fixed) {
        body.style.position = 'fixed';
        body.style.top = `${-scrollY}px`;
        body.style.left = '0';
        body.style.right = '0';
        body.style.width = '100%';
    }

    body.style.overflow = 'hidden';

    return () => {
        restoreStyle();

        if (fixed) view.scrollTo(0, scrollY);
    };
}

export function lockScroll(doc: Document, config: LockConfig): LockHandle {
    const state = stateOf(doc);
    const token = {};

    state.locks.push(token);

    if (state.locks.length === 1) state.restore = applyLock(doc, config);

    const marked = config.inert && config.container ? markInert(config.container) : [];

    return {
        release() {
            const index = state.locks.indexOf(token);

            if (index === -1) return;

            state.locks.splice(index, 1);

            for (const element of marked) element.removeAttribute('inert');

            if (state.locks.length) return;

            state.restore?.();
            state.restore = null;
        },
    };
}
