import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');

const dirs = (...parts: string[]) =>
    readdirSync(join(root, ...parts), { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

const hooks = dirs('src')
    .filter(name => name.startsWith('use'))
    .sort();

interface SizeLimitEntry {
    name: string;
    path: string;
    import?: string;
}

const sizeLimit = JSON.parse(read('.size-limit.json')) as SizeLimitEntry[];
const barrel = read('src', 'index.ts');
const readme = read('README.md');
const ssrTest = read('src', 'ssr.test.tsx');

const entryPaths = new Set(sizeLimit.map(entry => entry.path));
const treeShakenImports = new Set(
    sizeLimit.filter(entry => entry.import !== undefined).map(entry => entry.import)
);

describe('every hook is wired up', () => {
    it('has at least one hook to check', () => {
        expect(hooks.length).toBeGreaterThan(0);
    });

    it.each(hooks)('%s is re-exported from the root barrel', hook => {
        const reExport = new RegExp(
            String.raw`export\s*\{[^}]*\b${hook}\b[^}]*\}\s*from\s*'\./${hook}';`
        );

        expect(barrel).toMatch(reExport);
    });

    it.each(hooks)('%s has a docs page', hook => {
        expect(() => read('docs', hook, 'README.md')).not.toThrow();
    });

    it.each(hooks)('%s is linked from the root README', hook => {
        expect(readme).toContain(`(docs/${hook}/README.md)`);
    });

    it.each(hooks)('%s has a subpath size-limit entry', hook => {
        expect(entryPaths).toContain(`dist/${hook}/index.js`);
    });

    it.each(hooks)('%s has a tree-shaking size-limit entry', hook => {
        expect(treeShakenImports).toContain(`{ ${hook} }`);
    });

    it.each(hooks)('%s is covered by the SSR smoke test', hook => {
        expect(ssrTest).toContain(hook);
    });
});

describe('nothing is left behind', () => {
    it('has no docs page without a hook', () => {
        expect(
            dirs('docs')
                .filter(name => name.startsWith('use'))
                .sort()
        ).toEqual(hooks);
    });

    it('has no size-limit entry pointing at a removed hook', () => {
        const orphans = sizeLimit
            .map(entry => /^dist\/(use[A-Za-z]+)\/index\.js$/.exec(entry.path)?.[1])
            .filter((name): name is string => name !== undefined && !hooks.includes(name));

        expect(orphans).toEqual([]);
    });
});
