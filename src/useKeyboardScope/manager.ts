import { createListenerSet } from '../internal/listenerSet';

export type KeyHandler = (event: KeyboardEvent) => void;

export interface KeyBindingOptions {
    enableOnFormElements?: boolean;
    preventDefault?: boolean;
    ignoreRepeat?: boolean;
}

export type KeyBindingValue = KeyHandler | ({ handler: KeyHandler } & KeyBindingOptions);

export type KeyBindings = Record<string, KeyBindingValue>;

interface NormalizedBinding {
    keys: string;
    handler: KeyHandler;
    enableOnFormElements: boolean;
    preventDefault: boolean;
    ignoreRepeat: boolean;
}

interface ParsedCombo {
    key: string | null;
    code: string | null;
    ctrl: boolean;
    meta: boolean;
    alt: boolean;
    shift: boolean;
}

export interface ScopeConfig {
    priority: number;
    passthrough: boolean;
    getBindings: () => KeyBindings;
    getOnEscape: () => (() => void) | undefined;
}

interface ScopeEntry extends ScopeConfig {
    seq: number;
}

function isMacLike(): boolean {
    if (typeof navigator === 'undefined') return false;
    const platform = navigator.platform ?? '';
    const ua = navigator.userAgent ?? '';
    return /Mac|iPhone|iPad|iPod/i.test(platform || ua);
}

// US-QWERTY shift map for symbol keys — lets 'shift+/' and the literal '?' both
// match, since event.key already reports the shifted glyph on a real keypress.
// Non-US layouts are out of scope here, same documented limitation as 'code:'.
const SHIFT_MAP: Record<string, string> = {
    '1': '!',
    '2': '@',
    '3': '#',
    '4': '$',
    '5': '%',
    '6': '^',
    '7': '&',
    '8': '*',
    '9': '(',
    '0': ')',
    '-': '_',
    '=': '+',
    '[': '{',
    ']': '}',
    '\\': '|',
    ';': ':',
    "'": '"',
    ',': '<',
    '.': '>',
    '/': '?',
    '`': '~',
};
const SHIFTED_SYMBOLS = new Set(Object.values(SHIFT_MAP));

const comboCache = new Map<string, ParsedCombo[]>();
const COMBO_CACHE_MAX = 500;

export function clearComboCache(): void {
    comboCache.clear();
}

function parseCombos(spec: string): ParsedCombo[] {
    const cached = comboCache.get(spec);

    if (cached) return cached;

    const combos = spec.split(',').map((raw): ParsedCombo => {
        const combo: ParsedCombo = {
            key: null,
            code: null,
            ctrl: false,
            meta: false,
            alt: false,
            shift: false,
        };

        for (const token of raw.trim().split('+')) {
            const t = token.trim();
            const lower = t.toLowerCase();

            switch (lower) {
                case 'mod':
                    if (isMacLike()) combo.meta = true;
                    else combo.ctrl = true;
                    break;
                case 'ctrl':
                case 'control':
                    combo.ctrl = true;
                    break;
                case 'meta':
                case 'cmd':
                case 'command':
                    combo.meta = true;
                    break;
                case 'alt':
                case 'option':
                    combo.alt = true;
                    break;
                case 'shift':
                    combo.shift = true;
                    break;
                default:
                    if (lower.startsWith('code:')) {
                        combo.code = t.slice(5);
                    } else {
                        combo.key = lower === 'esc' ? 'escape' : lower;
                    }
            }
        }
        return combo;
    });

    if (comboCache.size >= COMBO_CACHE_MAX) comboCache.clear();

    comboCache.set(spec, combos);

    return combos;
}

function comboMatches(combo: ParsedCombo, e: KeyboardEvent): boolean {
    if (combo.code !== null) {
        if (e.code !== combo.code) return false;
    } else if (combo.key !== null) {
        const eventKey = e.key.toLowerCase();
        if (eventKey !== combo.key && SHIFT_MAP[combo.key] !== e.key) return false;
    } else {
        return false;
    }
    if (e.ctrlKey !== combo.ctrl) return false;
    if (e.metaKey !== combo.meta) return false;
    if (e.altKey !== combo.alt) return false;

    const isSymbolKey = combo.key !== null && SHIFTED_SYMBOLS.has(combo.key);

    if (!isSymbolKey && e.shiftKey !== combo.shift) return false;

    return true;
}

function normalizeBindings(bindings: KeyBindings): NormalizedBinding[] {
    return Object.entries(bindings).map(([keys, value]) =>
        typeof value === 'function'
            ? {
                  keys,
                  handler: value,
                  enableOnFormElements: false,
                  preventDefault: true,
                  ignoreRepeat: false,
              }
            : {
                  keys,
                  handler: value.handler,
                  enableOnFormElements: value.enableOnFormElements ?? false,
                  preventDefault: value.preventDefault ?? true,
                  ignoreRepeat: value.ignoreRepeat ?? false,
              }
    );
}

function isFormTarget(e: KeyboardEvent): boolean {
    const t = e.target;

    if (!t || !(t instanceof Element)) return false;

    const tag = t.tagName;

    return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (t as HTMLElement).isContentEditable === true
    );
}

export class KeyboardScopeManager {
    private entries: ScopeEntry[] = [];
    private seqCounter = 0;
    private listeners = createListenerSet();
    private attached = false;
    private readonly resolveTarget: () => EventTarget | null;

    constructor(resolveTarget?: () => EventTarget | null) {
        this.resolveTarget =
            resolveTarget ?? (() => (typeof document === 'undefined' ? null : document));
    }

    register(config: ScopeConfig): { entry: object; unregister: () => void } {
        const entry: ScopeEntry = { ...config, seq: ++this.seqCounter };

        this.entries.push(entry);
        this.attach();

        return {
            entry,
            unregister: () => {
                const idx = this.entries.indexOf(entry);

                if (idx !== -1) this.entries.splice(idx, 1);
                if (this.entries.length === 0) this.detach();

                this.notify();
            },
        };
    }

    subscribe = (listener: () => void): (() => void) => this.listeners.add(listener);

    notify(): void {
        this.listeners.notify();
    }

    isTopMost(entry: object): boolean {
        return this.ordered()[0] === entry;
    }

    destroy(): void {
        this.entries = [];
        this.detach();
        this.notify();
    }

    private ordered(): ScopeEntry[] {
        return [...this.entries].sort((a, b) => b.priority - a.priority || b.seq - a.seq);
    }

    private attach(): void {
        if (this.attached) return;

        const target = this.resolveTarget();

        if (!target) return;

        target.addEventListener('keydown', this.handleKeydown as EventListener);
        this.attached = true;
    }

    private detach(): void {
        if (!this.attached) return;

        const target = this.resolveTarget();
        target?.removeEventListener('keydown', this.handleKeydown as EventListener);
        this.attached = false;
    }

    private findMatch(entry: ScopeEntry, e: KeyboardEvent): NormalizedBinding | null {
        const formTarget = isFormTarget(e);

        for (const binding of normalizeBindings(entry.getBindings())) {
            if (formTarget && !binding.enableOnFormElements) continue;
            if (binding.ignoreRepeat && e.repeat) continue;
            if (parseCombos(binding.keys).some(combo => comboMatches(combo, e))) {
                return binding;
            }
        }

        return null;
    }

    private handleKeydown = (e: KeyboardEvent): void => {
        if (e.isComposing || e.keyCode === 229) return;

        const ordered = this.ordered();

        if (ordered.length === 0) return;

        if (e.key === 'Escape') {
            const top = ordered[0]!;
            const match = this.findMatch(top, e);

            if (match) {
                if (match.preventDefault) e.preventDefault();
                match.handler(e);
                return;
            }

            const onEscape = top.getOnEscape();

            if (onEscape) {
                e.preventDefault();
                onEscape();
            }

            return;
        }

        for (const entry of ordered) {
            const match = this.findMatch(entry, e);

            if (match) {
                if (match.preventDefault) e.preventDefault();

                match.handler(e);

                return;
            }

            if (!entry.passthrough) return;
        }
    };
}

let defaultManager: KeyboardScopeManager | null = null;

export function getDefaultManager(): KeyboardScopeManager {
    if (!defaultManager) defaultManager = new KeyboardScopeManager();

    return defaultManager;
}

export function resetDefaultManager(): void {
    defaultManager?.destroy();
    defaultManager = null;
}
