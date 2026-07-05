'use client';

/**
 * @deprecated /chat1은 /chat 본 페이지로 통합되었습니다.
 * 외부 북마크 호환을 위해 redirect만 수행합니다.
 * (이전 본문은 git history에 보존)
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Chat1Redirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/chat');
  }, [router]);
  return null;
}
