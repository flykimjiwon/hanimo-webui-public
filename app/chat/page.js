'use client';
import { useState } from 'react';
import { useChatPage } from '@/hooks/useChatPage';
import { useTranslation } from '@/hooks/useTranslation';

// Component Imports
import dynamic from 'next/dynamic';
const Sidebar = dynamic(() => import('@/components/chat/Sidebar'), { ssr: false });
import ChatHeader from '@/components/chat/ChatHeader';
const MessageList = dynamic(() => import('@/components/chat/MessageList'), { ssr: false });
import ScrollButtons from '@/components/chat/ScrollButtons';
import ChatLayout from '@/components/chat/ChatLayout';
const ChatInput = dynamic(() => import('@/components/chat/ChatInput'), { ssr: false });
const NoticePopup = dynamic(() => import('@/components/NoticePopup'), { ssr: false });
import { Button } from '@/components/ui/button';
import { X, Loader2, ChevronDown } from '@/components/icons';

/* ---------- 메인 컴포넌트 ---------- */
export default function Home() {
  const { t } = useTranslation();

  // draw mode is unique to chat/page.js
  const [drawMode, setDrawMode] = useState(false);
  const [drawEnabled, setDrawEnabled] = useState(false);
  const [drawSystemPrompt, setDrawSystemPrompt] = useState(
    "Generate a complete HTML page based on the user's request. Always wrap the response in a ```html code block. Only Tailwind CSS CDN (https://cdn.tailwindcss.com) is allowed. No other external libraries. Implement charts with Canvas API and diagrams with SVG."
  );
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('hanimo-webui-sidebar-mode') === 'expanded';
  });

  const {
    // Auth
    userRole,
    authChecked,
    userEmail,
    // App state
    selectedImages,
    setSelectedImages,
    maxImagesPerMessage,
    imageHistoryByRoom,
    setImageHistoryByRoom,
    profileEditEnabled,
    boardEnabled,
    // UI state
    showScrollButtons,
    isAtBottom,
    // Refs
    bottomRef,
    inputRef,
    listRef,
    // useChat
    rooms,
    currentRoom,
    messages,
    setMessages,
    chatLoading,
    createRoom,
    renameRoom,
    deleteRoom,
    switchRoom,
    loadRooms,
    // useModelManager
    modelOptions,
    modelConfig,
    selectedModel,
    setSelectedModelWithRoom,
    modelsLoading,
    userDefaultModelId,
    saveUserDefaultModel,
    // useChatSender
    input,
    setInput,
    loading,
    sendMessage,
    handleKeyDown,
    stopStreaming,
    // Handlers
    handleLogout,
    scrollToBottom,
  } = useChatPage({
    enableTranslation: true,
    onSettingsLoaded: (data) => {
      setDrawEnabled(data.drawEnabled !== undefined ? data.drawEnabled : false);
      setDrawSystemPrompt(
        data.drawSystemPrompt ||
          "Generate a complete HTML page based on the user's request. Always wrap the response in a ```html code block. Only Tailwind CSS CDN (https://cdn.tailwindcss.com) is allowed. No other external libraries. Implement charts with Canvas API and diagrams with SVG."
      );
    },
    extraSenderParams: {
      drawMode,
      drawSystemPrompt,
    },
  });

  const isUIBusy = loading;

  if (!authChecked) {
    return null;
  }

  return (
    <ChatLayout
      sidebarOpen={sidebarOpen}
      onOpenSidebar={() => setSidebarOpen(true)}
      onCloseSidebar={() => setSidebarOpen(false)}
      userRole={userRole}
    >
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        rooms={rooms}
        currentRoom={currentRoom}
        switchRoom={switchRoom}
        createRoom={createRoom}
        deleteRoom={deleteRoom}
        renameRoom={renameRoom}
        userEmail={userEmail}
        userRole={userRole}
        handleLogout={handleLogout}
        loading={isUIBusy || chatLoading}
        messages={messages}
        profileEditEnabled={profileEditEnabled}
        boardEnabled={boardEnabled}
      />
      <ChatHeader />
      <MessageList
        messages={messages}
        bottomRef={bottomRef}
        modelOptions={modelOptions}
        currentRoom={currentRoom}
        imageHistoryByRoom={imageHistoryByRoom}
        listRef={listRef}
        loading={loading}
        userEmail={userEmail}
        onIntentSelect={(seed) => { setInput(seed); setTimeout(() => inputRef.current?.focus(), 0); }}
        DrawPreviewPanelComponent={null}
      />
      <ScrollButtons show={showScrollButtons} containerRef={listRef} />
      <div
        id='chat-input-container'
        data-testid='chat-input-container'
        className={`fixed bottom-0 z-30 bg-background border-t border-border transition-all duration-300 ease-in-out left-16 ${sidebarOpen ? 'lg:left-80' : 'lg:left-16'
          } right-0 ${loading ? 'relative' : ''}`}
      >
        {/* 맨 아래로 스크롤 버튼 - 응답 끝나고 맨 아래가 아닐 때 표시 */}
        {!loading && !isAtBottom && (
          <div className='flex justify-center'>
            <Button
              variant='outline'
              onClick={scrollToBottom}
              className='absolute -top-12 rounded-full shadow-lg'
              aria-label={t('chat.scroll_to_bottom')}
            >
              <ChevronDown className='h-4 w-4' />
              <span>{t('chat.new_message')}</span>
            </Button>
          </div>
        )}
        {loading && (
          <div
            id='chat-loading-overlay'
            data-testid='chat-loading-overlay'
            className='absolute top-0 bottom-0 -left-16 lg:-left-80 right-0 bg-background z-40 flex items-center justify-center'
          >
            <div className='w-full px-4'>
              <div className='flex flex-col items-center gap-2 w-full'>
                <div className='flex items-center gap-3'>
                  <Loader2
                    data-testid='chat-loading-spinner'
                    className='h-5 w-5 text-primary animate-spin'
                  />
                  <span
                    id='chat-loading-text'
                    data-testid='chat-loading-text'
                    className='text-muted-foreground text-sm'
                  >
                    {t('chat.generating')}
                  </span>
                </div>
                <Button
                  id='chat-stop-button'
                  data-testid='chat-stop-button'
                  variant='destructive'
                  size='xs'
                  onClick={stopStreaming}
                >
                  <X className='h-3 w-3' />
                  {t('chat.stop')}
                </Button>
              </div>
            </div>
          </div>
        )}
        <ChatInput
          input={input}
          setInput={setInput}
          sendMessage={sendMessage}
          loading={isUIBusy}
          modelsLoading={modelsLoading}
          handleKeyDown={handleKeyDown}
          selectedModel={selectedModel}
          setSelectedModel={(modelId) =>
            setSelectedModelWithRoom(modelId, currentRoom)
          }
          modelOptions={modelOptions}
          modelConfig={modelConfig}
          inputRef={inputRef}
          currentRoom={currentRoom}
          selectedImages={selectedImages}
          setSelectedImages={setSelectedImages}
          maxImagesPerMessage={maxImagesPerMessage}
          userDefaultModelId={userDefaultModelId}
          onSetUserDefault={saveUserDefaultModel}
          drawEnabled={drawEnabled}
          drawMode={drawMode}
          onDrawModeToggle={() => setDrawMode((prev) => !prev)}
        />
        <NoticePopup target='main' />
      </div>
    </ChatLayout>
  );
}
