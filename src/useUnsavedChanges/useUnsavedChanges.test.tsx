import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useUnsavedChanges } from './index';
import type { UseUnsavedChangesOptions, UseUnsavedChangesReturn } from './index';

function Form({
    dirty,
    options,
    capture,
}: {
    dirty: boolean;
    options?: UseUnsavedChangesOptions;
    capture?: (value: UseUnsavedChangesReturn) => void;
}) {
    const api = useUnsavedChanges(dirty, options);

    capture?.(api);

    return null;
}

function listenerCount() {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');

    return {
        added: () => add.mock.calls.filter(([type]) => type === 'beforeunload').length,
        removed: () => remove.mock.calls.filter(([type]) => type === 'beforeunload').length,
        handler: () =>
            add.mock.calls.find(([type]) => type === 'beforeunload')?.[1] as (
                event: BeforeUnloadEvent
            ) => unknown,
    };
}

function unload(): BeforeUnloadEvent {
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;

    window.dispatchEvent(event);

    return event;
}

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('useUnsavedChanges', () => {
    it('listens only while the form is dirty', () => {
        const events = listenerCount();
        const view = render(<Form dirty={false} />);

        expect(events.added()).toBe(0);

        view.rerender(<Form dirty />);

        expect(events.added()).toBe(1);

        view.rerender(<Form dirty={false} />);

        expect(events.removed()).toBe(1);
    });

    it('cancels the unload while it is dirty, and not otherwise', () => {
        const view = render(<Form dirty />);

        expect(unload().defaultPrevented).toBe(true);

        view.rerender(<Form dirty={false} />);

        expect(unload().defaultPrevented).toBe(false);
    });

    it('lets go of the listener on unmount', () => {
        const view = render(<Form dirty />);

        view.unmount();

        expect(unload().defaultPrevented).toBe(false);
    });

    it('asks before a client-side navigation, through `confirmLeave`', () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        let api!: UseUnsavedChangesReturn;

        render(<Form dirty capture={value => (api = value)} />);

        expect(api.confirmLeave()).toBe(false);
        expect(confirm).toHaveBeenCalledWith('You have unsaved changes. Leave this page?');

        confirm.mockReturnValue(true);

        expect(api.confirmLeave()).toBe(true);
    });

    it('says yes without asking when there is nothing to lose', () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        let api!: UseUnsavedChangesReturn;

        render(<Form dirty={false} capture={value => (api = value)} />);

        expect(api.confirmLeave()).toBe(true);
        expect(confirm).not.toHaveBeenCalled();
    });

    it('hands the question to `onNavigate` when there is one', () => {
        const confirm = vi.spyOn(window, 'confirm');
        const onNavigate = vi.fn(() => true);
        let api!: UseUnsavedChangesReturn;

        render(
            <Form
                dirty
                options={{ message: 'Draft not saved', onNavigate }}
                capture={value => (api = value)}
            />
        );

        expect(api.confirmLeave()).toBe(true);
        expect(onNavigate).toHaveBeenCalledWith('Draft not saved');
        expect(confirm).not.toHaveBeenCalled();
    });

    it('keeps one identity for `confirmLeave` across renders', () => {
        const seen: Array<() => boolean> = [];
        const view = render(<Form dirty capture={value => seen.push(value.confirmLeave)} />);

        view.rerender(<Form dirty={false} />);

        expect(new Set(seen).size).toBe(1);
    });

    it('puts the message on the event for the browsers that still read it', () => {
        const events = listenerCount();

        render(<Form dirty options={{ message: 'Draft not saved' }} />);

        const event = { preventDefault: vi.fn(), returnValue: '' } as unknown as BeforeUnloadEvent;

        expect(events.handler()(event)).toBe('Draft not saved');
        expect(event.returnValue).toBe('Draft not saved');
        expect(event.preventDefault).toHaveBeenCalled();
    });
});
