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

export function stripNonCloneable<T>(value: T): { cleaned: T; dropped: string[] } {
    const dropped: string[] = [];
    const seen = new WeakSet<object>();

    const walk = (input: unknown, path: string): unknown => {
        if (typeof input === 'function' || typeof input === 'symbol') {
            dropped.push(path || '(root)');

            return undefined;
        }
        if (input === null || typeof input !== 'object') return input;
        if (seen.has(input)) return input;

        seen.add(input);

        if (Array.isArray(input)) {
            return input.map((item, i) => walk(item, path ? `${path}.${i}` : String(i)));
        }

        const proto: unknown = Object.getPrototypeOf(input);

        if (proto !== Object.prototype && proto !== null) return input;

        const out: Record<string, unknown> = {};

        for (const [key, item] of Object.entries(input)) {
            const next = walk(item, path ? `${path}.${key}` : key);

            if (next !== undefined || item === undefined) out[key] = next;
        }

        return out;
    };

    return { cleaned: walk(value, '') as T, dropped };
}
