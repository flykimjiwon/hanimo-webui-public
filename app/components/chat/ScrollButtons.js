'use client';

import { ChevronUp, ChevronDown } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/useTranslation';

function ScrollButtons({ show, containerRef }) {
  const { t } = useTranslation();

  const scrollToTop = () => {
    const container = containerRef?.current;
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    const container = containerRef?.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
      return;
    }
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'smooth',
    });
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-28 right-5 z-50 flex flex-col space-y-2">
      <Button
        variant="outline"
        size="icon"
        onClick={scrollToTop}
        className="rounded-full shadow-lg size-12"
        aria-label={t('chat.scroll_to_top')}
      >
        <ChevronUp className="size-6" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={scrollToBottom}
        className="rounded-full shadow-lg size-12"
        aria-label={t('chat.scroll_to_bottom')}
      >
        <ChevronDown className="size-6" />
      </Button>
    </div>
  );
}

export default ScrollButtons;
