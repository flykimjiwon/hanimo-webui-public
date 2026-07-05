'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminMain() {
  const router = useRouter();

  useEffect(() => {
    // 관리자 메인 페이지 접근 시 대시보드로 리다이렉트
    router.replace('/admin/dashboard');
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}