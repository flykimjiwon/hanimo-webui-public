'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Code, Eye, Copy, Check, ExternalLink } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function DrawPreviewPanel({ htmlContent }) {
  const [activeTab, setActiveTab] = useState('preview');
  const [copied, setCopied] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(400);

  const extractedHtml = useMemo(() => {
    if (!htmlContent || typeof htmlContent !== 'string') return null;
    const match = htmlContent.match(/```html\s*\n([\s\S]*?)```/);
    return match ? match[1].trim() : null;
  }, [htmlContent]);

  const iframeSrcdoc = useMemo(() => {
    if (!extractedHtml) return '';

    const guardScript = `<script>(function(){try{Object.defineProperty(window,'parent',{get:function(){return window;}});}catch(e){}try{Object.defineProperty(window,'top',{get:function(){return window;}});}catch(e){}try{Object.defineProperty(window,'frameElement',{get:function(){return null;}});}catch(e){}})();</script>`;
    const resizeScript = `<script>(function(){function send(){var h=document.documentElement.scrollHeight||document.body.scrollHeight;window.parent.postMessage({type:'draw-preview-resize',height:h},'*');}window.addEventListener('load',send);new MutationObserver(send).observe(document.body,{childList:true,subtree:true,attributes:true});setTimeout(send,100);setTimeout(send,500);})();</script>`;

    const withGuard = extractedHtml.includes('<head>')
      ? extractedHtml.replace('<head>', `<head>${guardScript}`)
      : `${guardScript}${extractedHtml}`;

    if (withGuard.includes('</body>')) {
      return withGuard.replace('</body>', `${resizeScript}</body>`);
    }
    if (withGuard.includes('</html>')) {
      return withGuard.replace('</html>', `${resizeScript}</html>`);
    }
    return `${withGuard}${resizeScript}`;
  }, [extractedHtml]);

  const handleMessage = useCallback((event) => {
    if (
      event?.data?.type === 'draw-preview-resize' &&
      typeof event.data.height === 'number'
    ) {
      setIframeHeight(Math.max(220, Math.min(event.data.height + 16, 900)));
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  if (!extractedHtml) return null;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(extractedHtml);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = extractedHtml;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      setCopied(false);
    }
  };

  const handleOpenNewTab = () => {
    const blob = new Blob([extractedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className='mt-3 overflow-hidden rounded-lg border border-[color-mix(in_oklch,var(--hn-good)_30%,transparent)] bg-background'>
      <div className='flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2'>
        <Tabs value={activeTab} onValueChange={setActiveTab} className='gap-0'>
          <TabsList className='h-8'>
            <TabsTrigger value='code' className='h-7 px-2.5 text-xs'>
              <Code className='h-3.5 w-3.5' />
              <span>Code</span>
            </TabsTrigger>
            <TabsTrigger value='preview' className='h-7 px-2.5 text-xs'>
              <Eye className='h-3.5 w-3.5' />
              <span>Preview</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className='flex items-center gap-1'>
          <Button
            type='button'
            variant='ghost'
            size='xs'
            className='h-7 px-2 text-xs'
            onClick={handleCopy}
            title={copied ? 'Copied' : 'Copy'}
          >
            {copied ? (
              <Check className='h-3.5 w-3.5 text-[var(--hn-good)]' />
            ) : (
              <Copy className='h-3.5 w-3.5' />
            )}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='xs'
            className='h-7 px-2 text-xs'
            onClick={handleOpenNewTab}
            title='Open in new tab'
          >
            <ExternalLink className='h-3.5 w-3.5' />
            <span className='hidden sm:inline'>Open in new tab</span>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className='gap-0'>
        <TabsContent value='code' className='mt-0'>
          <pre className='max-h-[600px] overflow-x-auto overflow-y-auto bg-muted/20 p-4 text-xs text-foreground sm:text-sm'>
            <code className='whitespace-pre font-mono'>{extractedHtml}</code>
          </pre>
        </TabsContent>
        <TabsContent value='preview' className='mt-0'>
          <iframe
            srcDoc={iframeSrcdoc}
            sandbox='allow-scripts allow-same-origin'
            title='Draw Preview'
            className='w-full border-0 bg-white'
            style={{ height: `${iframeHeight}px` }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
