import { env } from '@/lib/env';
import { Client } from '@notionhq/client';
import type {
  BlockObjectResponse,
} from '@notionhq/client/build/src/api-endpoints';
import { notionRenderer } from './renderer';
import { withCache, CACHE_KEYS } from '@/lib/cache';
import { fetchBlocksRecursively as fetchBlocks } from './block-loader';
import { NotionApiError, NotionErrorCode, isNotionApiError } from '@/lib/errors';
import { withRetry } from './api-helpers';
import { NOTION_CONFIG, NOTION_ENDPOINTS, CACHE_TTL } from './constants';
import { optimizeNotionImageUrl, IMAGE_SIZE } from '@/lib/image';
import { logger } from '@/lib/logger';
import type {
  TagWithColor,
  PostListItem,
  PostDetail,
  ProfileSettings,
  SiteConfig,
  SiteSettings,
  AboutPage,
} from './types';

// Re-export for backward compatibility
export { NotionApiError, NotionErrorCode, isNotionApiError };
export type {
  TagWithColor,
  PostListItem,
  PostDetail,
  ProfileSettings,
  SiteConfig,
  SiteSettings,
  AboutPage,
};


export type NotionClientApi = {
  listPublishedPosts: () => Promise<PostListItem[]>;
  getPostBySlug: (slug: string) => Promise<PostDetail | null>;
  getSiteSettings: () => Promise<SiteSettings>;
  getSiteConfig: () => Promise<SiteConfig>;
  getAboutPage: () => Promise<AboutPage | null>;
  queryDatabase: (databaseId: string, pageSize?: number) => Promise<any[]>;
  getDatabaseSchema: (databaseId: string) => Promise<string[]>;
};

/** Slug가 빈 글에 붙는 자동 주소 앞부분 */
export const AUTO_SLUG_PREFIX = 'p-';

// 필드명은 사용자가 구성한 스키마에 맞춤
const FIELD = {
  title: 'Title',
  status: 'Status',
  slug: 'Slug',
  tags: 'Tags',
  label: 'Label',
  date: 'Date',
  description: 'Description',
  coverImage: 'CoverImage',
  language: 'Language',
  author: 'Author',
} as const;

export function createNotionClient(override?: { notion?: Client; databaseId?: string }): NotionClientApi {
  // 환경 변수
  const apiKey = env.NOTION_API_KEY;
  const databaseId = override?.databaseId ?? env.NOTION_DATABASE_ID;
  const _notion = override?.notion ?? new Client({ auth: apiKey }); // Reserved for future use

  // NotionClient 인스턴스 생성 (self-reference를 위해)
  const clientApi: NotionClientApi = {} as NotionClientApi;

  type RichText = { plain_text?: string };
  function getPlainText(rt: RichText[] | undefined): string {
    if (!rt) return '';
    return rt.map((t) => t.plain_text ?? '').join('');
  }

  // 최소 타입 형태만 정의(필요 필드만)
  type NotionSelect = { name: string; color?: string };
  type NotionMultiSelect = NotionSelect[];
  type NotionDate = { start?: string };
  type NotionFiles = Array<{ type: 'external' | 'file'; external?: { url?: string }; file?: { url?: string } }>;
  type NotionPeople = Array<{ name?: string }>;
  type NotionProperty = {
    title?: RichText[];
    rich_text?: RichText[];
    multi_select?: NotionMultiSelect;
    date?: NotionDate;
    files?: NotionFiles;
    select?: { name?: string; color?: string } | null;
    status?: { name?: string; color?: string } | null; // Status type property
    people?: NotionPeople;
    url?: string;
    email?: string;
    checkbox?: boolean;
  };
  type NotionCover = {
    type: 'external' | 'file';
    external?: { url?: string };
    file?: { url?: string };
  };
  type NotionPage = {
    id?: string;
    parent?: { database_id?: string };
    properties?: Record<string, NotionProperty>;
    cover?: NotionCover | null;
  };

  function firstFileUrl(files?: NotionFiles): string | undefined {
    if (!files || files.length === 0) return undefined;
    const f = files[0];
    return f.type === 'external' ? f.external?.url : f.file?.url;
  }

  function pageToItem(page: NotionPage): PostListItem {
    const props = page.properties ?? {};
    const title = props[FIELD.title]?.title ? getPlainText(props[FIELD.title].title) : 'Untitled';
    // Slug를 비워 두면 페이지 ID로 주소를 자동으로 만듦 (예: p-3f28a7a417e48150...)
    const slugText = props[FIELD.slug]?.rich_text ? getPlainText(props[FIELD.slug].rich_text).trim() : '';
    const slug = slugText || (page.id ? `${AUTO_SLUG_PREFIX}${page.id.replace(/-/g, '')}` : '');
    const date = props[FIELD.date]?.date?.start ?? undefined;

    // Tags with color information
    const tagsWithColors = props[FIELD.tags]?.multi_select?.map((t) => ({
      name: t.name,
      color: t.color || 'default'
    })) ?? undefined;
    const tags = tagsWithColors?.map((t) => t.name) ?? undefined; // Backward compatibility

    // Status with color information
    const status = props[FIELD.status]?.status?.name ?? (props[FIELD.status]?.select?.name ?? undefined);
    const statusColor = props[FIELD.status]?.status?.color ?? (props[FIELD.status]?.select?.color ?? undefined);

    // Label can be either Select or Text type in Notion
    const label = props[FIELD.label]?.select?.name
      ?? (props[FIELD.label]?.rich_text ? getPlainText(props[FIELD.label].rich_text) : undefined);
    const description = props[FIELD.description]?.rich_text ? getPlainText(props[FIELD.description].rich_text) : undefined;

    // 커버 이미지 우선순위: 1. 페이지 cover 2. CoverImage 속성
    let coverImageUrl: string | undefined;
    if (page.cover) {
      coverImageUrl = page.cover.type === 'external'
        ? page.cover.external?.url
        : page.cover.file?.url;
    } else {
      coverImageUrl = firstFileUrl(props[FIELD.coverImage]?.files);
    }
    // 커버 이미지 최적화: 목록용 썸네일 크기 (256px)
    coverImageUrl = optimizeNotionImageUrl(coverImageUrl, IMAGE_SIZE.THUMBNAIL);

    const language = props[FIELD.language]?.select?.name ?? undefined;
    // Author: Person 타입 우선, 없으면 Text 타입 fallback
    const author = props[FIELD.author]?.people?.[0]?.name ||
                  (props[FIELD.author]?.rich_text ? getPlainText(props[FIELD.author].rich_text) : undefined);
    return { slug, title, date, tags, tagsWithColors, status, statusColor, label, description, coverImageUrl, language, author };
  }

  // Slug 칸에 적힌 주소로 공개 글 찾기
  async function fetchPageBySlug(slug: string): Promise<NotionPage | undefined> {
    const response = await fetch(
      `${NOTION_CONFIG.BASE_URL}/${NOTION_ENDPOINTS.databaseQuery(databaseId)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': NOTION_CONFIG.API_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: {
            and: [
              { property: FIELD.status, select: { equals: 'Publish' } },
              { property: FIELD.slug, rich_text: { equals: slug } },
            ],
          },
          page_size: 1,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw NotionApiError.fromHttpStatus(
        response.status,
        `Failed to fetch post by slug: ${errorText}`
      );
    }

    const data = await response.json();
    return data.results[0];
  }

  // 자동 주소(p-페이지ID)로 글 찾기: Posts 데이터베이스의 공개 글이고 Slug가 비어 있을 때만
  async function fetchAutoSlugPage(rawId: string): Promise<NotionPage | undefined> {
    if (!/^[0-9a-f]{32}$/i.test(rawId)) return undefined;
    const pageId = rawId.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    const response = await fetch(`${NOTION_CONFIG.BASE_URL}/${NOTION_ENDPOINTS.page(pageId)}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': NOTION_CONFIG.API_VERSION,
      },
    });
    if (!response.ok) return undefined;

    const page: NotionPage = await response.json();
    const sameDatabase = page.parent?.database_id?.replace(/-/g, '') === databaseId?.replace(/-/g, '');
    const props = page.properties ?? {};
    const published = props[FIELD.status]?.select?.name === 'Publish';
    const slugText = props[FIELD.slug]?.rich_text ? getPlainText(props[FIELD.slug].rich_text).trim() : '';
    return sameDatabase && published && !slugText ? page : undefined;
  }

  // 렌더러에 NotionClient 설정 (링크드 데이터베이스 쿼리용)
  // clientApi가 완전히 생성된 후에 설정해야 하므로 나중에 설정

  // Client API 객체 정의
  Object.assign(clientApi, {
    async getSiteSettings() {
      const settingsDatabaseId = env.NOTION_PROFILE_DATABASE_ID;

      // 기본값 설정 (각 속성별 안내 메시지)
      const defaultSettings: ProfileSettings = {
        name: '프로필 설정 DB의 Name 속성을 설정하세요',
        profileImage: '/images/profile.jpg',
        jobTitle: '프로필 설정 DB의 JobTitle 속성을 설정하세요',
        bio: '프로필 설정 DB의 Bio 속성을 설정하세요',
        homeTitle: '프로필 설정 DB의 HomeTitle 속성을 설정하세요',
        homeDescription: '프로필 설정 DB의 HomeDescription 속성을 설정하세요',
        socialLinks: {
          kakaoChannel: '',
          kakao: '',
          instagram: '',
          email: '',
          blog: '',
        },
      };

      // 설정 데이터베이스 ID가 없으면 기본값 반환
      if (!settingsDatabaseId) {
        return defaultSettings;
      }

      return withCache(
        CACHE_KEYS.SITE_SETTINGS,
        () => withRetry(async () => {
          try {
            // Notion 데이터베이스에서 첫 번째 행 가져오기
            const response = await fetch(
              `${NOTION_CONFIG.BASE_URL}/${NOTION_ENDPOINTS.databaseQuery(settingsDatabaseId)}`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Notion-Version': NOTION_CONFIG.API_VERSION,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  page_size: 1, // 첫 번째 행만 가져오기
                }),
              }
            );

            if (!response.ok) {
              logger.warn(`Failed to fetch settings database: ${response.status}`);
              return defaultSettings;
            }

            const data = await response.json();
            if (!data.results || data.results.length === 0) {
              logger.warn('Settings database is empty');
              return defaultSettings;
            }

            const page: NotionPage = data.results[0];
            const props = page.properties ?? {};

            // 속성 파싱
            const name = props['Name']?.title ? getPlainText(props['Name'].title) : defaultSettings.name;
            let profileImage = firstFileUrl(props['ProfileImage']?.files) ?? defaultSettings.profileImage;
            // 프로필 이미지 최적화: 작은 이미지 크기 (400px)
            profileImage = optimizeNotionImageUrl(profileImage, IMAGE_SIZE.SMALL) ?? profileImage;
            const jobTitle = props['JobTitle']?.rich_text ? getPlainText(props['JobTitle'].rich_text) : defaultSettings.jobTitle;
            const bio = props['Bio']?.rich_text ? getPlainText(props['Bio'].rich_text) : defaultSettings.bio;
            const homeTitle = props['HomeTitle']?.rich_text ? getPlainText(props['HomeTitle'].rich_text) : defaultSettings.homeTitle;
            const homeDescription = props['HomeDescription']?.rich_text ? getPlainText(props['HomeDescription'].rich_text) : defaultSettings.homeDescription;

            // 소셜 링크 파싱
            const emailValue = props['Email']?.email ?? (props['Email']?.rich_text ? getPlainText(props['Email'].rich_text) : defaultSettings.socialLinks.email);
            const socialLinks = {
              kakaoChannel: props['KakaoChannel']?.url ?? (props['KakaoChannel']?.rich_text ? getPlainText(props['KakaoChannel'].rich_text) : defaultSettings.socialLinks.kakaoChannel),
              kakao: props['Kakao']?.url ?? (props['Kakao']?.rich_text ? getPlainText(props['Kakao'].rich_text) : defaultSettings.socialLinks.kakao),
              instagram: props['Instagram']?.url ?? (props['Instagram']?.rich_text ? getPlainText(props['Instagram'].rich_text) : defaultSettings.socialLinks.instagram),
              blog: props['Blog']?.url ?? (props['Blog']?.rich_text ? getPlainText(props['Blog'].rich_text) : defaultSettings.socialLinks.blog),
              notion: props['Notion']?.url ?? (props['Notion']?.rich_text ? getPlainText(props['Notion'].rich_text) : undefined),
              email: emailValue && !emailValue.startsWith('mailto:') ? `mailto:${emailValue}` : emailValue,
              github: props['GitHub']?.url ?? (props['GitHub']?.rich_text ? getPlainText(props['GitHub'].rich_text) : undefined),
              twitter: props['Twitter']?.url ?? (props['Twitter']?.rich_text ? getPlainText(props['Twitter'].rich_text) : undefined),
              youtube: props['YouTube']?.url ?? (props['YouTube']?.rich_text ? getPlainText(props['YouTube'].rich_text) : undefined),
              linkedin: props['LinkedIn']?.url ?? (props['LinkedIn']?.rich_text ? getPlainText(props['LinkedIn'].rich_text) : undefined),
              threads: props['Threads']?.url ?? (props['Threads']?.rich_text ? getPlainText(props['Threads'].rich_text) : undefined),
              facebook: props['Facebook']?.url ?? (props['Facebook']?.rich_text ? getPlainText(props['Facebook'].rich_text) : undefined),
              tiktok: props['TikTok']?.url ?? (props['TikTok']?.rich_text ? getPlainText(props['TikTok'].rich_text) : undefined),
              telegram: props['Telegram']?.url ?? (props['Telegram']?.rich_text ? getPlainText(props['Telegram'].rich_text) : undefined),
              line: props['LINE']?.url ?? (props['LINE']?.rich_text ? getPlainText(props['LINE'].rich_text) : undefined),
            };

            return {
              name,
              profileImage,
              jobTitle,
              bio,
              homeTitle,
              homeDescription,
              socialLinks,
            };
          } catch (error: unknown) {
            logger.error('Failed to fetch site settings:', error);
            return defaultSettings;
          }
        }),
        60 * 1000
      );
    },
    async listPublishedPosts() {
      return withCache(
        CACHE_KEYS.POSTS_LIST,
        () => withRetry(async () => {
          try {
            let allPosts: PostListItem[] = [];
            let startCursor: string | undefined;

            // 페이지네이션 처리
            do {
              const requestBody: any = {
                filter: {
                  property: FIELD.status,
                  select: { equals: 'Publish' },
                },
                sorts: [
                  { property: FIELD.date, direction: 'descending' },
                ],
                page_size: 100,
              };

              if (startCursor) {
                requestBody.start_cursor = startCursor;
              }

              const response = await fetch(
                `${NOTION_CONFIG.BASE_URL}/${NOTION_ENDPOINTS.databaseQuery(databaseId)}`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Notion-Version': NOTION_CONFIG.API_VERSION,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(requestBody),
                }
              );

              if (!response.ok) {
                let errorBody = '';
                try {
                  errorBody = typeof response.text === 'function' ? await response.text() : 'Unable to read error response';
                } catch {
                  errorBody = 'Unable to read error response';
                }
                throw NotionApiError.fromHttpStatus(
                  response.status,
                  `Failed to fetch published posts: ${errorBody}`
                );
              }

              const data = await response.json();
              const posts = data.results
                .map(pageToItem)
                .filter((p: PostListItem) => p.slug);

              allPosts = allPosts.concat(posts);

              startCursor = data.has_more ? data.next_cursor : undefined;

              // 무한 루프 방지: 최대 1000개 포스트까지만 가져오기
              if (allPosts.length >= 1000) {
                logger.warn(`[WARN] Post limit reached (1000 posts)`);
                break;
              }
            } while (startCursor);

            return allPosts;
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('[Notion API] Error fetching posts:', errorMessage);

            // If it's already a NotionApiError, re-throw it
            if (isNotionApiError(error)) {
              throw error;
            }

            // Otherwise, wrap it as an unknown error
            throw new NotionApiError(
              `Failed to fetch published posts: ${errorMessage}`,
              NotionErrorCode.UNKNOWN_ERROR,
              { cause: error instanceof Error ? error : undefined }
            );
          }
        }),
        CACHE_TTL.POSTS_LIST
      );
    },
    async getPostBySlug(slug: string) {
      return withCache(
        CACHE_KEYS.POST_BY_SLUG(slug),
        () => withRetry(async () => {
          try {
            // slug가 32자 16진수 문자열인 경우 페이지 ID로 간주
            const isPageId = /^[0-9a-f]{32}$/i.test(slug);

            if (isPageId) {
              // 페이지 ID로 직접 조회 (child_page용)
              const pageIdWithHyphens = slug.replace(
                /(.{8})(.{4})(.{4})(.{4})(.{12})/,
                '$1-$2-$3-$4-$5'
              );

              const pageResponse = await fetch(
                `${NOTION_CONFIG.BASE_URL}/${NOTION_ENDPOINTS.page(pageIdWithHyphens)}`,
                {
                  headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Notion-Version': NOTION_CONFIG.API_VERSION,
                  },
                }
              );

              if (!pageResponse.ok) {
                return null;
              }

              const page = await pageResponse.json();

              // 일반 페이지를 포스트 형식으로 변환
              const title = page.properties?.title?.title?.[0]?.plain_text || 'Untitled';
              const item: PostListItem = {
                title,
                slug,
                date: page.created_time || new Date().toISOString(),
                description: '',
                tags: [],
              };

              // 블록 데이터 가져오기 (페이지네이션 지원)
              async function fetchBlocksRecursively(blockId: string): Promise<BlockObjectResponse[]> {
                const allBlocks: BlockObjectResponse[] = [];
                let startCursor: string | undefined;

                // 페이지네이션 처리
                do {
                  const response = await _notion.blocks.children.list({
                    block_id: blockId,
                    page_size: 100,
                    start_cursor: startCursor,
                  });

                  for (const block of response.results) {
                    if ('type' in block) {
                      allBlocks.push(block as BlockObjectResponse);
                      if (block.has_children) {
                        const children = await fetchBlocksRecursively(block.id);
                        (block as any)[block.type].children = children;
                      }
                    }
                  }

                  startCursor = response.has_more ? response.next_cursor || undefined : undefined;

                  // 무한 루프 방지: 최대 1000개 블록까지만 가져오기
                  if (allBlocks.length >= 1000) {
                    logger.warn(`[WARN] Block limit reached (1000 blocks) for blockId ${blockId}`);
                    break;
                  }
                } while (startCursor);

                return allBlocks;
              }

              const blocks = await fetchBlocksRecursively(page.id);
              notionRenderer.setNotionClient(clientApi);
              const html = notionRenderer.renderBlocks(blocks);

              // 포스트 상세 페이지용 커버 이미지는 더 큰 크기 사용 (목록용은 제외)
              // child_page의 경우 coverImageUrl이 없을 수 있음
              const detailCoverImageUrl = item.coverImageUrl
                ? optimizeNotionImageUrl(item.coverImageUrl, IMAGE_SIZE.LARGE) || item.coverImageUrl
                : undefined;

              return { ...item, coverImageUrl: detailCoverImageUrl, html, content: blocks };
            }

            const page = slug.startsWith(AUTO_SLUG_PREFIX)
              ? await fetchAutoSlugPage(slug.slice(AUTO_SLUG_PREFIX.length))
              : await fetchPageBySlug(slug);
            if (!page) {
              return null;
            }

            const item = pageToItem(page);

            // 페이지 ID를 사용하여 블록 데이터 가져오기
            const pageId: string | undefined = 'id' in page ? (page.id as string) : undefined;
            if (!pageId) {
              // 페이지 ID가 없으면 description을 사용
              const html = item.description ? `<p>${item.description}</p>` : '';
              return { ...item, html, content: [] };
            }

            // Notion 블록 API를 사용하여 페이지 내용 가져오기 (재귀적으로)
            // 공통 블록 로더 모듈 사용
            const content = await fetchBlocks(pageId, {
              apiKey,
              enableSyncedBlocks: true,
              enableChildDatabases: true,
              notionClient: clientApi,
            });

            // YouTube 북마크의 경우 oEmbed API로 제목과 채널명 가져오기 (캐시 적용)
            const fetchYouTubeInfo = async (block: BlockObjectResponse) => {
              // Type guard: only process bookmark blocks
              if (block.type !== 'bookmark' || !('bookmark' in block)) return;

              const url = block.bookmark?.url;

              try {
                // YouTube 정보 캐시 확인
                const youtubeCacheKey = CACHE_KEYS.YOUTUBE_INFO(url!);
                const cachedYouTubeInfo = await withCache(
                  youtubeCacheKey,
                  async () => {
                    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url!)}&format=json`;
                    const response = await fetch(oembedUrl);
                    if (response.ok) {
                      return await response.json();
                    }
                    return null;
                  },
                  CACHE_TTL.YOUTUBE_INFO
                );

                if (cachedYouTubeInfo && 'bookmark' in block) {
                  // caption에 제목과 채널명 추가
                  (block.bookmark as Record<string, unknown>).caption = [
                    {
                      type: 'text',
                      text: { content: `${cachedYouTubeInfo.title}\n${cachedYouTubeInfo.author_name || ''}`, link: null },
                      plain_text: `${cachedYouTubeInfo.title}\n${cachedYouTubeInfo.author_name || ''}`
                    }
                  ];
                }
              } catch (error) {
                logger.error('Failed to fetch YouTube info for', url, error);
              }
            };

            // YouTube 북마크만 필터링하여 병렬로 처리
            // caption이 비어있고 YouTube URL인 경우에만 API 호출
            const youtubeBookmarks = content.filter(block => {
              if (block.type === 'bookmark' && 'bookmark' in block) {
                const url = block.bookmark?.url;
                const caption = block.bookmark?.caption;
                return url &&
                       (url.includes('youtube.com') || url.includes('youtu.be')) &&
                       (!caption || caption.length === 0);
              }
              return false;
            });

            await Promise.all(youtubeBookmarks.map(fetchYouTubeInfo));

            // HTML 렌더링 (개발 환경에서는 캐싱 비활성화)
            const html = process.env.NODE_ENV === 'development'
              ? await notionRenderer.renderBlocks(content)
              : await withCache(
                  CACHE_KEYS.POST_RENDERED(slug),
                  async () => await notionRenderer.renderBlocks(content),
                  CACHE_TTL.RENDERED_CONTENT
                );

            // 포스트 상세 페이지용 커버 이미지는 더 큰 크기 사용 (LARGE: 1200px)
            // 목록에서는 THUMBNAIL(256px)을 사용하지만, 상세 페이지는 히어로 이미지이므로 큰 크기 필요
            const detailCoverImageUrl = item.coverImageUrl
              ? optimizeNotionImageUrl(item.coverImageUrl, IMAGE_SIZE.LARGE) || item.coverImageUrl
              : undefined;

            return { ...item, coverImageUrl: detailCoverImageUrl, html, content };
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // If it's already a NotionApiError, re-throw it
            if (isNotionApiError(error)) {
              throw error;
            }

            // Otherwise, wrap it as an unknown error
            throw new NotionApiError(
              `Failed to fetch post by slug "${slug}": ${errorMessage}`,
              NotionErrorCode.UNKNOWN_ERROR,
              { cause: error instanceof Error ? error : undefined }
            );
          }
        }),
        CACHE_TTL.POSTS_LIST
      );
    },
    async getAboutPage() {
      const aboutPageId = env.NOTION_ABOUT_PAGE_ID;

      // About page ID가 없으면 null 반환
      if (!aboutPageId) {
        return null;
      }

      return withCache(
        CACHE_KEYS.ABOUT_PAGE,
        () => withRetry(async () => {
          try {
            // 페이지 정보 가져오기
            const pageResponse = await fetch(
              `${NOTION_CONFIG.BASE_URL}/${NOTION_ENDPOINTS.page(aboutPageId)}`,
              {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Notion-Version': NOTION_CONFIG.API_VERSION,
                },
              }
            );

            if (!pageResponse.ok) {
              const errorText = await pageResponse.text();
              throw NotionApiError.fromHttpStatus(
                pageResponse.status,
                `Failed to fetch about page: ${errorText}`
              );
            }

            const pageData = await pageResponse.json();
            const page: NotionPage = pageData;

            // 페이지 제목 추출
            const props = page.properties ?? {};
            const title = props['title']?.title ? getPlainText(props['title'].title) : 'About';

            // 블록 데이터 가져오기 (공통 블록 로더 모듈 사용)
            const content = await fetchBlocks(aboutPageId, {
              apiKey,
              enableSyncedBlocks: false,
              enableChildDatabases: false,
            });

            // HTML 렌더링
            const renderedCacheKey = CACHE_KEYS.ABOUT_PAGE_RENDERED;
            const html = await withCache(
              renderedCacheKey,
              async () => notionRenderer.renderBlocks(content),
              CACHE_TTL.RENDERED_CONTENT
            );

            return { title, html, content };
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // If it's already a NotionApiError, re-throw it
            if (isNotionApiError(error)) {
              throw error;
            }

            // Otherwise, wrap it as an unknown error
            throw new NotionApiError(
              `Failed to fetch about page: ${errorMessage}`,
              NotionErrorCode.UNKNOWN_ERROR,
              { cause: error instanceof Error ? error : undefined }
            );
          }
        }),
        CACHE_TTL.POSTS_LIST
      );
    },

    async getSiteConfig() {
      const siteDatabaseId = env.NOTION_SITE_DATABASE_ID;

      // 기본값 설정 (각 속성별 안내 메시지)
      const defaultConfig: SiteConfig = {
        siteTitle: '사이트 설정 DB의 SiteTitle 속성을 설정하세요',
        siteDescription: '사이트 설정 DB의 SiteDescription 속성을 설정하세요',
        enableAnalytics: false,
        enableAdsense: false,
        adsenseAutoAds: false,
      };

      // 사이트 설정 데이터베이스 ID가 없으면 기본값 반환
      if (!siteDatabaseId) {
        return defaultConfig;
      }

      return withCache(
        CACHE_KEYS.SITE_CONFIG,
        () => withRetry(async () => {
          try {
            // Notion 데이터베이스에서 첫 번째 행 가져오기
            const response = await fetch(
              `${NOTION_CONFIG.BASE_URL}/${NOTION_ENDPOINTS.databaseQuery(siteDatabaseId)}`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Notion-Version': NOTION_CONFIG.API_VERSION,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  page_size: 1, // 첫 번째 행만 가져오기
                }),
              }
            );

            if (!response.ok) {
              const errorText = await response.text();
              throw NotionApiError.fromHttpStatus(
                response.status,
                `Failed to fetch site config: ${errorText}`
              );
            }

            const data = await response.json();
            if (!data.results || data.results.length === 0) {
              return defaultConfig;
            }

            const page = data.results[0];
            const props = page.properties;

            // Notion 페이지에서 설정 값 추출
            // SiteTitle은 title 타입 필드 (데이터베이스 이름 열)
            const siteTitle = props.SiteTitle?.title ? getPlainText(props.SiteTitle.title) : defaultConfig.siteTitle;
            const siteDescription = props.SiteDescription?.rich_text ? getPlainText(props.SiteDescription.rich_text) : defaultConfig.siteDescription;

            // SEO & Social Media 설정
            // 로컬 OG Image 우선 사용 (빌드 시 다운로드된 파일)
            // 로컬 파일이 없으면 Notion S3 URL 사용 (fallback)
            const notionOgImageUrl = props.OGImage?.files?.[0]?.file?.url || props.OGImage?.files?.[0]?.external?.url;
            const ogImage = notionOgImageUrl ? '/og-images/default.jpg' : undefined;
            const twitterHandle = props.TwitterHandle?.rich_text ? getPlainText(props.TwitterHandle.rich_text) : undefined;
            // Author: Person 타입 우선, 없으면 Text 타입 fallback
            const author = props.Author?.people?.[0]?.name ||
                          (props.Author?.rich_text ? getPlainText(props.Author.rich_text) : undefined);

            // Google Analytics 4 설정
            const ga4MeasurementId = props.GA4MeasurementId?.rich_text ? getPlainText(props.GA4MeasurementId.rich_text) : undefined;
            const enableAnalytics = props.EnableAnalytics?.checkbox ?? defaultConfig.enableAnalytics;

            // Google AdSense 설정
            const adsensePublisherId = props.AdSensePublisherId?.rich_text ? getPlainText(props.AdSensePublisherId.rich_text) : undefined;
            const enableAdsense = props.EnableAdSense?.checkbox ?? defaultConfig.enableAdsense;
            const adsenseAutoAds = props.AdSenseAutoAds?.checkbox ?? defaultConfig.adsenseAutoAds;

            return {
              siteTitle,
              siteDescription,
              ogImage,
              twitterHandle,
              author,
              ga4MeasurementId,
              enableAnalytics,
              adsensePublisherId,
              enableAdsense,
              adsenseAutoAds,
            };
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('[Notion API] Error fetching site config:', errorMessage);
            // 에러 발생 시 기본값 반환
            return defaultConfig;
          }
        }),
        CACHE_TTL.POSTS_LIST
      );
    },

    /**
     * 링크드 데이터베이스 쿼리 함수
     * @param databaseId 데이터베이스 ID
     * @param pageSize 가져올 행 수 (기본값: 10, 100 이상이면 페이지네이션 처리)
     * @returns 데이터베이스 행 배열
     */
    async queryDatabase(databaseId: string, pageSize: number = 10) {
      return withCache(
        CACHE_KEYS.DATABASE_QUERY(databaseId, pageSize),
        () => withRetry(async () => {
          try {
            // pageSize가 100 이하면 단일 요청으로 처리
            if (pageSize <= 100) {
              const response = await fetch(
                `${NOTION_CONFIG.BASE_URL}/${NOTION_ENDPOINTS.databaseQuery(databaseId)}`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Notion-Version': NOTION_CONFIG.API_VERSION,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    page_size: pageSize,
                  }),
                }
              );

              if (!response.ok) {
                const errorText = await response.text();
                throw NotionApiError.fromHttpStatus(
                  response.status,
                  `Failed to query database: ${errorText}`
                );
              }

              const data = await response.json();
              return data.results || [];
            }

            // pageSize가 100 이상이면 페이지네이션 처리
            let allResults: any[] = [];
            let startCursor: string | undefined;

            do {
              const requestBody: any = {
                page_size: 100, // 최대값 사용
              };

              if (startCursor) {
                requestBody.start_cursor = startCursor;
              }

              const response = await fetch(
                `${NOTION_CONFIG.BASE_URL}/${NOTION_ENDPOINTS.databaseQuery(databaseId)}`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Notion-Version': NOTION_CONFIG.API_VERSION,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(requestBody),
                }
              );

              if (!response.ok) {
                const errorText = await response.text();
                throw NotionApiError.fromHttpStatus(
                  response.status,
                  `Failed to query database: ${errorText}`
                );
              }

              const data = await response.json();
              allResults = allResults.concat(data.results || []);

              startCursor = data.has_more ? data.next_cursor : undefined;

              // 요청한 pageSize에 도달하면 중단
              if (allResults.length >= pageSize) {
                return allResults.slice(0, pageSize);
              }
            } while (startCursor);

            return allResults;
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`[Notion API] Error querying database ${databaseId}:`, errorMessage);

            // If it's already a NotionApiError, re-throw it
            if (isNotionApiError(error)) {
              throw error;
            }

            // Otherwise, wrap it as an unknown error
            throw new NotionApiError(
              `Failed to query database: ${errorMessage}`,
              NotionErrorCode.UNKNOWN_ERROR,
              { cause: error instanceof Error ? error : undefined }
            );
          }
        }),
        CACHE_TTL.DEFAULT
      );
    },

    /**
     * 데이터베이스 스키마 정보를 가져와서 속성 순서를 반환
     * @param databaseId 데이터베이스 ID
     * @returns 속성 이름 배열 (Notion에서 정의된 순서대로)
     */
    async getDatabaseSchema(databaseId: string): Promise<string[]> {
      return withCache(
        CACHE_KEYS.DATABASE_SCHEMA(databaseId),
        () => withRetry(async () => {
          try {
            const response = await fetch(
              `${NOTION_CONFIG.BASE_URL}/${NOTION_ENDPOINTS.database(databaseId)}`,
              {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Notion-Version': NOTION_CONFIG.API_VERSION,
                },
              }
            );

            if (!response.ok) {
              const errorText = await response.text();
              throw NotionApiError.fromHttpStatus(
                response.status,
                `Failed to fetch database schema: ${errorText}`
              );
            }

            const data = await response.json();
            const properties = data.properties || {};

            // Notion API는 properties를 순서대로 반환하므로 Object.keys() 사용
            return Object.keys(properties);
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`[Notion API] Error fetching database schema ${databaseId}:`, errorMessage);

            // If it's already a NotionApiError, re-throw it
            if (isNotionApiError(error)) {
              throw error;
            }

            // Otherwise, wrap it as an unknown error
            throw new NotionApiError(
              `Failed to fetch database schema: ${errorMessage}`,
              NotionErrorCode.UNKNOWN_ERROR,
              { cause: error instanceof Error ? error : undefined }
            );
          }
        }),
        CACHE_TTL.DATABASE_SCHEMA
      );
    },
  });

  // 렌더러에 NotionClient 인스턴스 설정 (링크드 데이터베이스 쿼리용)
  notionRenderer.setNotionClient(clientApi);

  return clientApi;
}


