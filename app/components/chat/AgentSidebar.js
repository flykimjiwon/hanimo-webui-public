'use client';


import logger from '@/lib/logger';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Menu,
  LogOut,
  X,
  Bell,
  MessageSquare,
  Shield,
  User,
  Mail,
  Bot,
  History,
  Presentation,
} from '@/components/icons';
import dynamic from 'next/dynamic';
const ConfirmModal = dynamic(() => import('@/components/ui/modal').then(m => m.ConfirmModal), { ssr: false });
const DirectMessageModal = dynamic(() => import('@/components/DirectMessageModal'), { ssr: false });
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet';
import { Card, CardContent } from '@/components/ui/card';

const AGENT_SIDEBAR_MENUS = {
  '7': {
    title: 'PPT Maker',
    items: [
      { id: 'ppt-compose', label: 'PPT Maker', icon: Presentation },
      { id: 'ppt-history', label: 'Generation History', icon: History },
    ],
  },
};

function AgentSidebar({
  sidebarOpen,
  setSidebarOpen,
  agentId,
  agentName,
  agentDescription,
  agentColor = 'text-foreground',
  userEmail,
  userRole,
  handleLogout,
  loading,
  profileEditEnabled = true,
  boardEnabled = true,
  activeAgentMenu = '',
  onAgentMenuSelect = null,
}) {
  const router = useRouter();
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning',
    onConfirm: null,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
  });

  const [unreadDmCount, setUnreadDmCount] = useState(0);
  const [showDmModal, setShowDmModal] = useState(false);
  const [showDmNotification, setShowDmNotification] = useState(false);
  const [newDmCount, setNewDmCount] = useState(0);
  const prevUnreadCountRef = useRef(0);

  const fetchUnreadDmCount = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/direct-messages/unread-count', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const newCount = data.count || 0;

        if (newCount > prevUnreadCountRef.current && prevUnreadCountRef.current >= 0) {
          const diff = newCount - prevUnreadCountRef.current;
          setNewDmCount(diff);
          setShowDmNotification(true);

          setTimeout(() => {
            setShowDmNotification(false);
          }, 5000);
        }

        prevUnreadCountRef.current = newCount;
        setUnreadDmCount(newCount);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        logger.warn('Failed to fetch unread message count:', error);
      }
    }
  }, []);

  useEffect(() => {
    fetchUnreadDmCount();
    const interval = setInterval(fetchUnreadDmCount, 60000);
    return () => clearInterval(interval);
  }, [fetchUnreadDmCount]);

  return (
    <>
      <div
        className={`
          fixed left-0 top-0 h-full w-16 bg-background border-r border-border z-40
          flex flex-col items-center py-4
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? '-translate-x-full' : 'translate-x-0'}
        `}
      >
        <Button
          variant='ghost'
          size='icon'
          onClick={() => setSidebarOpen(true)}
          title='Open sidebar'
          className='mb-4'
        >
          <Menu className='h-5 w-5' />
        </Button>

        <div className='p-3 mb-4'>
          <Bot className={`h-5 w-5 ${agentColor}`} />
        </div>

        <div className='relative'>
          <Button
            variant='ghost'
            size='icon'
            onClick={() => !loading && setShowDmModal(true)}
            title='Messages'
            disabled={loading}
            className='relative'
          >
            <Mail className='h-5 w-5' />
            {unreadDmCount > 0 && (
              <span className='absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-destructive text-white'>
                {unreadDmCount > 99 ? '99+' : unreadDmCount}
              </span>
            )}
          </Button>

          {showDmNotification && (
            <div className='absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 animate-bounce'>
              <div className='relative bg-foreground text-background text-xs font-medium px-3 py-2 rounded-lg shadow-lg whitespace-nowrap'>
                <div className='absolute -left-2 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[8px] border-r-foreground'></div>
                {newDmCount} new message(s) received
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDmNotification(false);
                  }}
                  className='ml-2 hover:opacity-70'
                >
                  <X className='h-3 w-3 inline' />
                </button>
              </div>
            </div>
          )}
        </div>

        <Button
          variant='ghost'
          size='icon'
          onClick={() => {
            if (!loading) {
              setConfirmModal({
                isOpen: true,
                title: 'Confirm Logout',
                message: 'Are you sure you want to log out?',
                type: 'warning',
                onConfirm: () => {
                  handleLogout();
                },
                confirmText: 'Log out',
                cancelText: 'Cancel',
              });
            }
          }}
          title='Log out'
          disabled={loading}
          className='mt-auto'
        >
          <LogOut className='h-5 w-5' />
        </Button>
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side='left' showCloseButton={false} className='w-80 sm:max-w-80 p-0 gap-0'>
          <div className='flex items-center justify-between p-4 border-b border-border'>
            <div className='flex items-center gap-3'>
              <Bot className={`h-6 w-6 ${agentColor}`} />
              <div>
                <SheetTitle className='text-lg'>
                  {agentName}
                </SheetTitle>
                <SheetDescription className='text-xs'>
                  {agentDescription || `${agentName} menu`}
                </SheetDescription>
              </div>
            </div>
            <SheetClose asChild>
              <Button variant='ghost' size='icon-sm' title='Close sidebar'>
                <X className='h-5 w-5' />
              </Button>
            </SheetClose>
          </div>

          <ScrollArea className='flex-1'>
            <div className='p-4'>
              {AGENT_SIDEBAR_MENUS[agentId] && (
                <div className='space-y-1'>
                  <h3 className='text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3'>
                    {AGENT_SIDEBAR_MENUS[agentId].title}
                  </h3>
                  {AGENT_SIDEBAR_MENUS[agentId].items.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <Button
                        key={item.id}
                        variant={activeAgentMenu === item.id ? 'secondary' : 'ghost'}
                        size='sm'
                        onClick={() => {
                          if (typeof onAgentMenuSelect === 'function') {
                            onAgentMenuSelect(item.id);
                            return;
                          }
                        }}
                        className='w-full justify-start gap-3'
                      >
                        <ItemIcon className={`h-4 w-4 ${agentColor}`} />
                        {item.label}
                      </Button>
                    );
                  })}
                </div>
              )}

              <Card className='mt-6 py-0'>
                <CardContent className='p-4'>
                  <p className='text-sm text-muted-foreground'>
                    {agentDescription || 'Agent features are available.'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>

          <Separator />
          <div className='p-4 space-y-1 flex-shrink-0'>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => !loading && router.push('/notice')}
              className='w-full justify-start gap-3'
              disabled={loading}
            >
              <Bell className='h-4 w-4' />
              Notices
            </Button>

            {boardEnabled && (
              <Button
                variant='ghost'
                size='sm'
                onClick={() => !loading && router.push('/board')}
                className='w-full justify-start gap-3'
                disabled={loading}
              >
                <MessageSquare className='h-4 w-4' />
                Board
              </Button>
            )}

            {profileEditEnabled && (
              <Button
                variant='ghost'
                size='sm'
                onClick={() => !loading && router.push('/profile')}
                className='w-full justify-start gap-3'
                disabled={loading}
              >
                <User className='h-4 w-4' />
                Edit Profile
              </Button>
            )}

            {userRole === 'admin' && (
              <Button
                variant='ghost'
                size='sm'
                onClick={() => !loading && router.push('/admin')}
                className='w-full justify-start gap-3'
                disabled={loading}
              >
                <Shield className='h-4 w-4' />
                Admin
              </Button>
            )}
          </div>

          <Separator />
          <div className='p-4 bg-muted flex-shrink-0'>
            <div className='flex items-center justify-between'>
              <div className='min-w-0 flex-1'>
                <p className='text-sm font-medium text-foreground'>
                  Signed in as
                </p>
                <p className='text-xs text-muted-foreground truncate'>
                  {userEmail}
                </p>
                {userRole === 'admin' && (
                  <Badge variant='destructive' className='mt-1'>
                    Admin
                  </Badge>
                )}
              </div>
              <div className='flex items-center gap-1'>
                <div className='relative'>
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    onClick={() => !loading && setShowDmModal(true)}
                    title='Messages'
                    disabled={loading}
                    className='relative'
                  >
                    <Mail className='h-4 w-4' />
                    {unreadDmCount > 0 && (
                      <span className='absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-destructive text-white'>
                        {unreadDmCount > 99 ? '99+' : unreadDmCount}
                      </span>
                    )}
                  </Button>

                  {showDmNotification && (
                    <div className='absolute bottom-full mb-2 right-0 z-50 animate-bounce'>
                      <div className='relative bg-foreground text-background text-xs font-medium px-3 py-2 rounded-lg shadow-lg whitespace-nowrap'>
                        {newDmCount} new message(s) received
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDmNotification(false);
                          }}
                          className='ml-2 hover:opacity-70'
                        >
                          <X className='h-3 w-3 inline' />
                        </button>
                        <div className='absolute -bottom-2 right-4 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-foreground'></div>
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  variant='ghost'
                  size='icon-sm'
                  onClick={() => {
                    if (!loading) {
                      setConfirmModal({
                        isOpen: true,
                        title: 'Confirm Logout',
                        message: 'Are you sure you want to log out?',
                        type: 'warning',
                        onConfirm: () => {
                          handleLogout();
                        },
                        confirmText: 'Log out',
                        cancelText: 'Cancel',
                      });
                    }
                  }}
                  title='Log out'
                  disabled={loading}
                >
                  <LogOut className='h-4 w-4' />
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() =>
          setConfirmModal({
            isOpen: false,
            title: '',
            message: '',
            type: 'warning',
            onConfirm: null,
            confirmText: 'Confirm',
            cancelText: 'Cancel',
          })
        }
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        confirmText={confirmModal.confirmText || 'Confirm'}
        cancelText={confirmModal.cancelText || 'Cancel'}
      />

      <DirectMessageModal
        isOpen={showDmModal}
        onClose={() => setShowDmModal(false)}
        onUnreadCountChange={fetchUnreadDmCount}
      />
    </>
  );
}

export default AgentSidebar;
