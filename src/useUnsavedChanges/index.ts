import { useCallback, useEffect, useRef } from 'react';

export type LeavePrompt = (message: string) => boolean;

export interface UseUnsavedChangesOptions {
    message?: string;
    onNavigate?: LeavePrompt;
}

export interface UseUnsavedChangesReturn {
    isDirty: boolean;
    confirmLeave: () => boolean;
}

const DEFAULT_MESSAGE = 'You have unsaved changes. Leave this page?';

export function useUnsavedChanges(
    isDirty: boolean,
    options: UseUnsavedChangesOptions = {}
): UseUnsavedChangesReturn {
    const { message = DEFAULT_MESSAGE, onNavigate } = options;

    const promptRef = useRef(onNavigate);
    promptRef.current = onNavigate;

    const messageRef = useRef(message);
    messageRef.current = message;

    const dirtyRef = useRef(isDirty);
    dirtyRef.current = isDirty;

    useEffect(() => {
        if (!isDirty || typeof window === 'undefined') return;

        const warn = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = messageRef.current;

            return messageRef.current;
        };

        window.addEventListener('beforeunload', warn);

        return () => window.removeEventListener('beforeunload', warn);
    }, [isDirty]);

    const confirmLeave = useCallback(() => {
        if (!dirtyRef.current) return true;

        const prompt = promptRef.current;

        if (prompt) return prompt(messageRef.current);
        if (typeof window === 'undefined') return true;

        return window.confirm(messageRef.current);
    }, []);

    return { isDirty, confirmLeave };
}
