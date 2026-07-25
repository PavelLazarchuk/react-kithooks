export function createDisposeScheduler(isUnused: () => boolean, dispose: () => void): () => void {
    let scheduled = false;

    return () => {
        if (scheduled) return;

        scheduled = true;
        queueMicrotask(() => {
            scheduled = false;

            if (isUnused()) dispose();
        });
    };
}
