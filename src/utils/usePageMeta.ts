import { useEffect } from 'react';

const DEFAULT_TITLE = 'Ahead Of Time - The assistant for busy calendars';
const DEFAULT_DESCRIPTION =
  'Calendars tell you when an event starts. Ahead Of Time makes sure you are ready when it does. Drop an entry onto your calendar or plan with our assistant, and Ahead Of Time automatically builds backward preparation milestones.';

/**
 * Sets a page-specific <title> and meta description for the lifetime of the
 * mounted component, reverting to the shared app-wide default on unmount.
 * Every public route previously shared one static title/description from
 * index.html - fine for the SPA shell itself, but it meant an AI crawler or
 * answer engine fetching /features or /feedback saw identical, generic
 * metadata instead of page-specific signals. No head-management library is
 * installed; this follows the same plain document.title pattern already
 * used in PrivacyPage.tsx, extended to also update the description tag.
 */
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    const descriptionTag = document.querySelector('meta[name="description"]');
    const previousDescription = descriptionTag?.getAttribute('content') || undefined;
    if (description && descriptionTag) {
      descriptionTag.setAttribute('content', description);
    }

    return () => {
      document.title = previousTitle;
      if (description && descriptionTag && previousDescription !== undefined) {
        descriptionTag.setAttribute('content', previousDescription);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description]);
}

export { DEFAULT_TITLE, DEFAULT_DESCRIPTION };
