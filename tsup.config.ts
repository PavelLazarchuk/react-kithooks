import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts', 'src/use*/index.ts', 'src/useFormCrashRecovery/rhf.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    treeshake: true,
    external: ['react', 'react-hook-form'],
});
