export default {
    '**/*.{ts,tsx}': ['prettier --write', 'eslint --fix --max-warnings=0', 'vitest related --run'],
    '**/*.{json,md,yml,yaml}': ['prettier --write'],
};
