/**
 * react-hook-form adapter — the ONLY module in the package that imports
 * react-hook-form. Import it via the dedicated subpath:
 *
 *   import { useFormCrashRecoveryRHF } from 'react-kithooks/useFormCrashRecovery/rhf';
 *
 * Consumers without react-hook-form never load this file.
 */
import { useCallback, useRef } from 'react';
import { useWatch } from 'react-hook-form';
import type { Control, FieldValues, UseFormReset } from 'react-hook-form';

import { useFormCrashRecovery } from './index';
import type { UseFormCrashRecoveryOptions, UseFormCrashRecoveryReturn } from './index';
import { deepMergeDefined } from './paths';

export type { UseFormCrashRecoveryOptions, UseFormCrashRecoveryReturn };

export interface UseFormCrashRecoveryRHFReturn<
    T extends FieldValues,
> extends UseFormCrashRecoveryReturn<T> {
    applyRecovered: (reset: UseFormReset<T>) => void;
}

export function useFormCrashRecoveryRHF<T extends FieldValues>(
    control: Control<T>,
    options: UseFormCrashRecoveryOptions
): UseFormCrashRecoveryRHFReturn<T> {
    const values = useWatch({ control }) as T;
    const base = useFormCrashRecovery<T>(values, options);
    const { restore } = base;

    const valuesRef = useRef(values);
    valuesRef.current = values;

    const applyRecovered = useCallback(
        (reset: UseFormReset<T>) => {
            const draft = restore();

            if (!draft) return;

            const merged = deepMergeDefined(valuesRef.current, draft);

            reset(merged, { keepDefaultValues: true });
        },
        [restore]
    );

    return { ...base, applyRecovered };
}
