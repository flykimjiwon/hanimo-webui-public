'use client';

/**
 * @deprecated /chat2 (사이버펑크/네온 변형)는 /chat 본 페이지로 통합되었습니다.
 * 사용자 결정에 따라 디자인 톤을 amber + Pretendard로 통일했고,
 * 디자인 변형 비교는 /design-variants.html에서 진행합니다.
 * 외부 북마크 호환을 위해 redirect만 수행합니다. (이전 본문은 git history에 보존)
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Chat2Redirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/chat');
  }, [router]);
  return null;
}
