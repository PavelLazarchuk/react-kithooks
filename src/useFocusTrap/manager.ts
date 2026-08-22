import { createListenerSet } from '../internal/listenerSet';
import { edgeTabbable, GUARD_ATTR, isTabbable } from './tabbable';

export type FocusTarget = HTMLElement | string | (() => HTMLElement | null) | null;

export interface TrapConfig {
    priority: number;
    container: HTMLElement;
    getPreventScroll: () => boolean;
}

interface TrapEntry extends TrapConfig {
    seq: number;
    guards: HTMLElement[];
    lastInside: HTMLElement | null;
    borrowedTabIndex: boolean;
}

const GUARD_STYLE = 'position:fixed;width:1px;height:0;overflow:hidden;clip:rect(0 0 0 0);';

export function focusElement(el: HTMLElement, preventScroll: boolean): void {
    el.focus({ preventScroll });
}

export class FocusTrapManager {
    private entries: TrapEntry[] = [];
    private orderedCache: TrapEntry[] | null = null;
    private seqCounter = 0;
    private listeners = createListenerSet();
    private documents = new Map<Document, number>();

    register(config: TrapConfig): { entry: object; unregister: () => void } {
        const entry: TrapEntry = {
            ...config,
            seq: ++this.seqCounter,
            guards: [],
            lastInside: null,
            borrowedTabIndex: false,
        };

        this.entries.push(entry);
        this.orderedCache = null;
        this.attach(config.container.ownerDocument);
        this.installGuards(entry);
        this.syncGuards();

        return {
            entry,
            unregister: () => {
                const index = this.entries.indexOf(entry);

                if (index === -1) return;

                this.entries.splice(index, 1);
                this.orderedCache = null;
                this.removeGuards(entry);

                if (entry.borrowedTabIndex) entry.container.removeAttribute('tabindex');

                this.detach(entry.container.ownerDocument);
                this.syncGuards();
                this.notify();
            },
        };
    }

    subscribe = (listener: () => void): (() => void) => this.listeners.add(listener);

    notify(): void {
        this.listeners.notify();
    }

    isTopMost(entry: object): boolean {
        return this.topMost() === entry;
    }

    setPriority(entry: object, priority: number): void {
        const trap = entry as TrapEntry;

        if (trap.priority === priority) return;

        const previousTop = this.topMost();

        trap.priority = priority;
        this.orderedCache = null;
        this.syncGuards();

        const top = this.topMost();

        if (top && top !== previousTop) {
            const active = top.container.ownerDocument.activeElement;

            if (!(active instanceof Element) || !top.container.contains(active))
                this.focusInto(top);
        }

        this.notify();
    }

    focusInitial(entry: object, target: FocusTarget | false | undefined): void {
        const trap = entry as TrapEntry;

        if (target === false) return;

        const resolved = this.resolveInitial(trap, target);

        if (resolved) {
            focusElement(resolved, trap.getPreventScroll());
            trap.lastInside = resolved;

            return;
        }

        this.focusContainer(trap);
    }

    destroy(): void {
        for (const entry of [...this.entries]) {
            this.removeGuards(entry);

            if (entry.borrowedTabIndex) entry.container.removeAttribute('tabindex');
        }

        this.entries = [];
        this.orderedCache = null;

        for (const doc of this.documents.keys()) this.removeListeners(doc);

        this.documents.clear();
        this.notify();
    }

    private resolveInitial(trap: TrapEntry, target: FocusTarget | undefined): HTMLElement | null {
        const { container } = trap;

        if (target) {
            const explicit =
                typeof target === 'string'
                    ? container.querySelector<HTMLElement>(target)
                    : typeof target === 'function'
                      ? target()
                      : target;

            if (explicit && explicit.isConnected) return explicit;
        }

        const marked = container.querySelector<HTMLElement>('[data-autofocus],[autofocus]');

        if (marked && isTabbable(marked)) return marked;

        return edgeTabbable(container, false);
    }

    private focusContainer(trap: TrapEntry): void {
        const { container } = trap;

        if (container.getAttribute('tabindex') === null) {
            container.setAttribute('tabindex', '-1');
            trap.borrowedTabIndex = true;
        }

        focusElement(container, trap.getPreventScroll());
        trap.lastInside = null;
    }

    private topMost(): TrapEntry | null {
        return this.ordered().find(entry => entry.container.isConnected) ?? null;
    }

    private ordered(): TrapEntry[] {
        this.orderedCache ??= [...this.entries].sort(
            (a, b) => b.priority - a.priority || b.seq - a.seq
        );

        return this.orderedCache;
    }

    private attach(doc: Document): void {
        const count = this.documents.get(doc) ?? 0;

        this.documents.set(doc, count + 1);

        if (count === 0) {
            doc.addEventListener('focusin', this.handleFocusIn, true);
            doc.addEventListener('focusout', this.handleFocusOut, true);
        }
    }

    private detach(doc: Document): void {
        const count = this.documents.get(doc) ?? 0;

        if (count <= 1) {
            this.documents.delete(doc);
            this.removeListeners(doc);

            return;
        }

        this.documents.set(doc, count - 1);
    }

    private removeListeners(doc: Document): void {
        doc.removeEventListener('focusin', this.handleFocusIn, true);
        doc.removeEventListener('focusout', this.handleFocusOut, true);
    }

    private installGuards(entry: TrapEntry): void {
        const { container } = entry;
        const parent = container.parentNode;

        if (!parent) return;

        const doc = container.ownerDocument;
        const before = this.createGuard(doc, () => {
            if (this.isTopMost(entry)) this.focusEdge(entry, true);
        });
        const after = this.createGuard(doc, () => {
            if (this.isTopMost(entry)) this.focusEdge(entry, false);
        });

        parent.insertBefore(before, container);
        parent.insertBefore(after, container.nextSibling);
        entry.guards = [before, after];
    }

    private createGuard(doc: Document, onFocus: () => void): HTMLElement {
        const guard = doc.createElement('span');

        guard.setAttribute(GUARD_ATTR, '');
        guard.setAttribute('aria-hidden', 'true');
        guard.tabIndex = 0;
        guard.style.cssText = GUARD_STYLE;
        guard.addEventListener('focus', onFocus);

        return guard;
    }

    private removeGuards(entry: TrapEntry): void {
        for (const guard of entry.guards) guard.remove();

        entry.guards = [];
    }

    private syncGuards(): void {
        const top = this.topMost();

        for (const entry of this.entries) {
            const tabIndex = entry === top ? 0 : -1;

            for (const guard of entry.guards) guard.tabIndex = tabIndex;
        }
    }

    private focusEdge(entry: TrapEntry, last: boolean): void {
        const target = edgeTabbable(entry.container, last);

        if (target) {
            focusElement(target, entry.getPreventScroll());
            entry.lastInside = target;

            return;
        }

        this.focusContainer(entry);
    }

    private focusInto(entry: TrapEntry): void {
        const { lastInside } = entry;

        if (lastInside && entry.container.contains(lastInside) && isTabbable(lastInside)) {
            focusElement(lastInside, entry.getPreventScroll());

            return;
        }

        this.focusEdge(entry, false);
    }

    private handleFocusIn = (event: FocusEvent): void => {
        const top = this.topMost();

        if (!top) return;

        const target = event.target;

        if (!(target instanceof Element)) return;
        if (target.hasAttribute(GUARD_ATTR)) return;
        if (target.ownerDocument !== top.container.ownerDocument) return;

        if (top.container.contains(target)) {
            if (target instanceof HTMLElement) top.lastInside = target;

            return;
        }

        this.focusInto(top);
    };

    private handleFocusOut = (event: FocusEvent): void => {
        const top = this.topMost();

        if (!top || event.relatedTarget !== null) return;

        const doc = top.container.ownerDocument;

        setTimeout(() => {
            if (this.topMost() !== top) return;

            const active = doc.activeElement;

            if (active instanceof Element && top.container.contains(active)) return;

            this.focusInto(top);
        }, 0);
    };
}

let defaultManager: FocusTrapManager | null = null;

export function getFocusTrapManager(): FocusTrapManager {
    defaultManager ??= new FocusTrapManager();

    return defaultManager;
}

export function resetFocusTrapManager(): void {
    defaultManager?.destroy();
    defaultManager = null;
}
