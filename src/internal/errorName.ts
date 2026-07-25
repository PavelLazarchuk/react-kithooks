export function errorName(err: unknown): string {
    if (typeof err === 'object' && err !== null && 'name' in err) {
        return String((err as { name: unknown }).name);
    }
    return '';
}
