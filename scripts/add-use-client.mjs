import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIRECTIVE = `'use client';`;
const ENTRY_FILE = /^(index|rhf)\.(js|cjs)$/;
const DIST = 'dist';

async function* entryFiles(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, item.name);

        if (item.isDirectory()) yield* entryFiles(path);
        else if (ENTRY_FILE.test(item.name)) yield path;
    }
}

let count = 0;

for await (const file of entryFiles(DIST)) {
    const code = await readFile(file, 'utf8');

    if (code.startsWith(DIRECTIVE)) continue;

    await writeFile(file, DIRECTIVE + code);
    count += 1;
}

console.log(`add-use-client: marked ${count} entry file(s) as client modules.`);
