export function errorName(err: unknown): string {
    if (typeof err === 'object' && err !== null && 'name' in err) {
        const name = (err as { name: unknown }).name;

        return name === undefined ? '' : String(name);
    }
    return '';
}
