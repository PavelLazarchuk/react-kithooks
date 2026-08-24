export function omitPaths<T>(value: T, paths: readonly string[]): T {
    let result = value;

    for (const path of paths) {
        result = omitPath(result, path.split('.'));
    }

    return result;
}

function omitPath<T>(value: T, segments: string[]): T {
    if (value === null || typeof value !== 'object' || segments.length === 0) return value;

    const head = segments[0]!;

    if (Array.isArray(value)) {
        const index = Number(head);

        if (!Number.isInteger(index) || index < 0 || index >= value.length) return value;

        const copy = value.slice() as unknown[];
        copy[index] = segments.length === 1 ? undefined : omitPath(value[index], segments.slice(1));

        return copy as unknown as T;
    }

    const record = value as Record<string, unknown>;

    if (!(head in record)) return value;

    const copy: Record<string, unknown> = { ...record };

    if (segments.length === 1) {
        delete copy[head];
    } else {
        copy[head] = omitPath(record[head], segments.slice(1));
    }

    return copy as unknown as T;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    if (v === null || typeof v !== 'object') return false;

    const proto: unknown = Object.getPrototypeOf(v);

    return proto === Object.prototype || proto === null;
}

export function deepMergeDefined<T>(base: T, overrides: Partial<T>): T {
    if (!isPlainObject(base) || !isPlainObject(overrides)) {
        return overrides === undefined ? base : (overrides as T);
    }

    const baseObj = base;
    const overridesObj = overrides as Record<string, unknown>;
    const result: Record<string, unknown> = { ...baseObj };

    for (const key of Object.keys(overridesObj)) {
        const overrideValue = overridesObj[key];
        const baseValue = baseObj[key];
        result[key] =
            isPlainObject(baseValue) && isPlainObject(overrideValue)
                ? deepMergeDefined(baseValue, overrideValue)
                : overrideValue;
    }

    return result as T;
}

const CLONEABLE_TAGS = new Set([
    '[object ArrayBuffer]',
    '[object BigInt64Array]',
    '[object BigUint64Array]',
    '[object Blob]',
    '[object DataView]',
    '[object Date]',
    '[object Error]',
    '[object File]',
    '[object FileList]',
    '[object Float32Array]',
    '[object Float64Array]',
    '[object ImageData]',
    '[object Int16Array]',
    '[object Int32Array]',
    '[object Int8Array]',
    '[object Map]',
    '[object RegExp]',
    '[object Set]',
    '[object Uint16Array]',
    '[object Uint32Array]',
    '[object Uint8Array]',
    '[object Uint8ClampedArray]',
]);

const NON_CLONEABLE_HOST_TYPES = [
    'Node',
    'Window',
    'Event',
    'NodeList',
    'HTMLCollection',
    'DOMTokenList',
];

function isNonCloneableHostObject(input: object): boolean {
    for (const name of NON_CLONEABLE_HOST_TYPES) {
        const ctor = (globalThis as Record<string, unknown>)[name];

        if (typeof ctor === 'function' && input instanceof (ctor as new () => unknown)) return true;
    }

    return false;
}

function isStructuredCloneable(input: object): boolean {
    if (isNonCloneableHostObject(input)) return false;

    if (typeof structuredClone === 'function') {
        try {
            structuredClone(input);

            return true;
        } catch {
            return false;
        }
    }

    return CLONEABLE_TAGS.has(Object.prototype.toString.call(input));
}

export function stripNonCloneable<T>(value: T): { cleaned: T; dropped: string[] } {
    const dropped: string[] = [];
    const cleanedByInput = new WeakMap<object, unknown>();

    const walk = (input: unknown, path: string): unknown => {
        if (typeof input === 'function' || typeof input === 'symbol') {
            dropped.push(path || '(root)');

            return undefined;
        }
        if (input === null || typeof input !== 'object') return input;

        if (cleanedByInput.has(input)) return cleanedByInput.get(input);

        if (Array.isArray(input)) {
            const out: unknown[] = [];
            cleanedByInput.set(input, out);

            input.forEach((item, i) => {
                out[i] = walk(item, path ? `${path}.${i}` : String(i));
            });

            return out;
        }

        const proto: unknown = Object.getPrototypeOf(input);

        if (proto !== Object.prototype && proto !== null) {
            if (!isStructuredCloneable(input)) {
                dropped.push(path || '(root)');
                cleanedByInput.set(input, undefined);

                return undefined;
            }

            cleanedByInput.set(input, input);

            return input;
        }

        const out: Record<string, unknown> = {};
        cleanedByInput.set(input, out);

        for (const [key, item] of Object.entries(input)) {
            const next = walk(item, path ? `${path}.${key}` : key);

            if (next !== undefined || item === undefined) out[key] = next;
        }

        return out;
    };

    return { cleaned: walk(value, '') as T, dropped };
}
