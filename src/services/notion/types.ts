/**
 * Notion Client Type Definitions
 *
 * NotionClient와 관련된 모든 타입 정의
 */

import { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints';

/**
 * 색상 정보를 포함한 태그
 */
export type TagWithColor = {
  name: string;
  color: string;
};

/**
 * 포스트 목록 아이템
 */
export type PostListItem = {
  slug: string;
  title: string;
  date?: string;
  tags?: string[];
  tagsWithColors?: TagWithColor[]; // Tags with color information
  label?: string;
  description?: string;
  coverImageUrl?: string;
  language?: string; // e.g., 'ko' | 'en'
  author?: string;
  status?: string;
  statusColor?: string; // Status color information
};

/**
 * 포스트 상세 정보 (목록 아이템 + 본문 데이터)
 */
export type PostDetail = PostListItem & {
  html: string; // 본문 렌더 결과
  content: BlockObjectResponse[]; // Notion 블록 데이터
};

/**
 * 프로필 설정 (기존 SiteSettings에서 분리)
 */
export type ProfileSettings = {
  name: string;
  profileImage?: string;
  jobTitle?: string;
  bio?: string;
  homeTitle: string;
  homeDescription: string;
  /** 홈 NOW 칸에서 타이핑되는 문구들 (노션 NowPhrases 칸) */
  nowPhrases?: string[];
  /** 프로필 사진 스티커 문구들 (노션 Stickers 칸) */
  stickers?: string[];
  socialLinks: {
    kakaoChannel?: string;
    kakao?: string;
    instagram?: string;
    blog?: string;
    notion?: string;
    email?: string;
    github?: string;
    twitter?: string;
    youtube?: string;
    linkedin?: string;
    threads?: string;
    facebook?: string;
    tiktok?: string;
    telegram?: string;
    line?: string;
  };
};

/**
 * 사이트 설정 (메타데이터, Analytics, AdSense 등)
 */
export type SiteConfig = {
  siteTitle: string;
  siteDescription: string;
  // SEO & Social Media
  ogImage?: string; // Open Graph 기본 이미지 URL
  twitterHandle?: string; // Twitter 계정 (@username)
  author?: string; // 기본 작성자
  // Google Analytics 4
  ga4MeasurementId?: string;
  enableAnalytics?: boolean;
  // Google AdSense
  adsensePublisherId?: string;
  enableAdsense?: boolean;
  adsenseAutoAds?: boolean;
};

/**
 * 하위 호환성을 위해 SiteSettings는 그대로 유지
 */
export type SiteSettings = ProfileSettings;

/**
 * About 페이지 정보
 */
export type AboutPage = {
  title: string;
  content: BlockObjectResponse[];
  html: string;
};
