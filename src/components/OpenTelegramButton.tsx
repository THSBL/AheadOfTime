import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { cachedBotLink, warmTelegramBot } from '../services/telegramOpen';

/**
 * Opens the chat with the bot in Telegram and wakes the bot at the same
 * moment. A real link (not window.open after an await), so phones hand it
 * straight to the Telegram app and no popup blocker gets in the way.
 */
export const OpenTelegramButton: React.FC<{ className?: string; label?: string }> = ({
  className = 'px-3 py-1.5 bg-[#182A42] hover:bg-slate-800 text-white font-semibold rounded-lg text-xs transition inline-flex items-center gap-1.5 shrink-0',
  label = 'Open',
}) => {
  const [href, setHref] = useState<string>(cachedBotLink);

  // Learn the bot's link, and warm it up already while the page is open.
  useEffect(() => {
    let cancelled = false;
    warmTelegramBot().then((link) => {
      if (!cancelled) setHref(link);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() => void warmTelegramBot()}
      className={className}
      title="Open the chat with the bot in Telegram"
    >
      <span>{label}</span>
      <ExternalLink className="w-3 h-3" />
    </a>
  );
};
