/**
 * Notion Client Unit Tests
 *
 * 테스트 범위:
 * - NotionApiError 클래스
 * - withRetry 재시도 로직
 * - listPublishedPosts 메서드
 * - getPostBySlug 메서드
 * - getSiteSettings 메서드
 * - 캐시 통합
 * - 오류 처리
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createNotionClient, NotionApiError, NotionErrorCode } from '../client'
import { contentCache } from '@/lib/cache'
// @ts-expect-error - mockEnv is exported by the mock, not the real module
import { mockEnv } from '@/lib/env'

// Mock environment variables with dynamic values
vi.mock('@/lib/env', () => {
  const mockEnvData = {
    NOTION_API_KEY: 'test-api-key',
    NOTION_DATABASE_ID: 'test-database-id',
    NOTION_PROFILE_DATABASE_ID: undefined as string | undefined,
    NOTION_SITE_DATABASE_ID: undefined as string | undefined,
  }

  return {
    env: new Proxy(mockEnvData, {
      get(target, prop) {
        return target[prop as keyof typeof target]
      },
    }),
    mockEnv: mockEnvData, // Export mockEnv for test access
    getEnv: vi.fn((key: string) => {
      if (key === 'NOTION_API_KEY') return 'test-api-key'
      if (key === 'NOTION_DATABASE_ID') return 'test-database-id'
      return ''
    }),
    getEnvOptional: vi.fn((key: string) => {
      if (key === 'NOTION_SETTINGS_DATABASE_ID') return undefined
      return undefined
    }),
  }
})

// Mock renderer
vi.mock('../renderer', () => ({
  notionRenderer: {
    renderBlocks: vi.fn((blocks: any[]) => {
      return blocks.map(b => `<p>${b.type}</p>`).join('')
    }),
    setNotionClient: vi.fn(),
  },
}))

// Mock image optimization functions
vi.mock('@/lib/image', () => ({
  IMAGE_SIZE: {
    THUMBNAIL: 256,
    SMALL: 400,
    MEDIUM: 800,
    LARGE: 1200,
    ORIGINAL: 1600,
  },
  optimizeNotionImageUrl: vi.fn((url: string | undefined) => url), // Return URL as-is
  generateImageSrcSet: vi.fn((url: string | undefined, sizes: number[]) =>
    sizes.map(size => `${url} ${size}w`).join(', ')
  ),
  getOptimalImageSize: vi.fn((type: string) => {
    switch (type) {
      case 'thumbnail': return 256
      case 'cover': return 800
      case 'hero': return 1200
      case 'profile': return 400
      default: return 800
    }
  }),
  getOptimizedImageUrl: vi.fn((url: string) => url), // Deprecated, for backward compatibility
  getImageDimensions: vi.fn(() => ({ width: 800, height: 600 })), // For backward compatibility
}))

// Mock icons
vi.mock('@/lib/icons', () => {
  // Mock Lucide icon component
  const MockIcon = () => null

  return {
    icons: {
      arrowLeft: MockIcon,
      arrowRight: MockIcon,
      menu: MockIcon,
      close: MockIcon,
      home: MockIcon,
      user: MockIcon,
      linkedin: MockIcon,
      instagram: MockIcon,
      mail: MockIcon,
      github: MockIcon,
      calendar: MockIcon,
      tag: MockIcon,
      clock: MockIcon,
      eye: MockIcon,
      heart: MockIcon,
      share: MockIcon,
      search: MockIcon,
      filter: MockIcon,
      sortAsc: MockIcon,
      sortDesc: MockIcon,
      chevronDown: MockIcon,
      chevronUp: MockIcon,
      chevronLeft: MockIcon,
      chevronRight: MockIcon,
      loading: MockIcon,
      error: MockIcon,
      success: MockIcon,
      info: MockIcon,
      refreshCw: MockIcon,
      file: MockIcon,
      image: MockIcon,
      video: MockIcon,
      download: MockIcon,
      externalLink: MockIcon,
      copy: MockIcon,
      bookmark: MockIcon,
      star: MockIcon,
    },
    Icon: vi.fn(() => null),
    socialIcons: {
      linkedin: MockIcon,
      instagram: MockIcon,
      email: MockIcon,
      github: MockIcon,
      threads: MockIcon,
      blog: MockIcon,
      notion: MockIcon,
      twitter: MockIcon,
      youtube: MockIcon,
      kakao: MockIcon,
      kakaoChannel: MockIcon,
      facebook: MockIcon,
      tiktok: MockIcon,
      telegram: MockIcon,
      line: MockIcon,
    },
    SocialIcon: vi.fn(() => null),
    navigationIcons: {
      prev: MockIcon,
      next: MockIcon,
    },
    NavigationIcon: vi.fn(() => null),
    themeIcons: {
      light: MockIcon,
      dark: MockIcon,
      system: MockIcon,
    },
    ThemeIcon: vi.fn(() => null),
  }
})

// Mock fetch globally
global.fetch = vi.fn()

describe('NotionApiError', () => {
  it('should create error with message', () => {
    const error = new NotionApiError('Test error')
    expect(error.message).toBe('Test error')
    expect(error.name).toBe('NotionApiError')
    expect(error.status).toBeUndefined()
    expect(error.code).toBe(NotionErrorCode.UNKNOWN_ERROR)
  })

  it('should create error with status and code', () => {
    const error = new NotionApiError('Test error', NotionErrorCode.API_NOT_FOUND, { status: 404 })
    expect(error.message).toBe('Test error')
    expect(error.status).toBe(404)
    expect(error.code).toBe(NotionErrorCode.API_NOT_FOUND)
  })

  it('should be instance of Error', () => {
    const error = new NotionApiError('Test error')
    expect(error instanceof Error).toBe(true)
    expect(error instanceof NotionApiError).toBe(true)
  })
})

describe('createNotionClient', () => {
  let mockFetch: any

  beforeEach(() => {
    // Clear cache before each test
    contentCache.clear()

    // Reset mock
    mockFetch = global.fetch as any
    mockFetch.mockReset()

    // Reset timers
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('listPublishedPosts', () => {
    it('should fetch published posts successfully', async () => {
      const mockResponse = {
        results: [
          {
            id: 'page-1',
            properties: {
              Title: { title: [{ plain_text: 'Test Post 1' }] },
              Slug: { rich_text: [{ plain_text: 'test-post-1' }] },
              Status: { select: { name: 'Publish' } },
              Date: { date: { start: '2025-01-15' } },
              Tags: { multi_select: [{ name: 'test' }, { name: 'dev' }] },
              Label: { select: { name: 'Featured' } },
              Description: { rich_text: [{ plain_text: 'Test description' }] },
              Language: { select: { name: 'ko' } },
              Author: { rich_text: [{ plain_text: 'John Doe' }] },
            },
            cover: {
              type: 'external',
              external: { url: 'https://example.com/cover.jpg' },
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const client = createNotionClient()
      const posts = await client.listPublishedPosts()

      expect(posts).toHaveLength(1)
      expect(posts[0]).toEqual({
        slug: 'test-post-1',
        title: 'Test Post 1',
        date: '2025-01-15',
        tags: ['test', 'dev'],
        tagsWithColors: [
          { name: 'test', color: 'default' },
          { name: 'dev', color: 'default' },
        ],
        label: 'Featured',
        description: 'Test description',
        coverImageUrl: 'https://example.com/cover.jpg',
        language: 'ko',
        author: 'John Doe',
        status: 'Publish',
        statusColor: undefined,
      })
    })

    it('should give posts without slug an automatic address from the page id', async () => {
      const mockResponse = {
        results: [
          {
            id: 'page-1',
            properties: {
              Title: { title: [{ plain_text: 'Valid Post' }] },
              Slug: { rich_text: [{ plain_text: 'valid-slug' }] },
            },
          },
          {
            id: '3f28a7a4-17e4-8150-9a21-c6358a3c0ba5',
            properties: {
              Title: { title: [{ plain_text: 'No Slug Post' }] },
              Slug: { rich_text: [] }, // No slug
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const client = createNotionClient()
      const posts = await client.listPublishedPosts()

      expect(posts).toHaveLength(2)
      expect(posts[0].slug).toBe('valid-slug')
      expect(posts[1].slug).toBe('p-3f28a7a417e481509a21c6358a3c0ba5')
    })

    it('should use cache on subsequent calls', async () => {
      const mockResponse = {
        results: [
          {
            id: 'page-1',
            properties: {
              Title: { title: [{ plain_text: 'Cached Post' }] },
              Slug: { rich_text: [{ plain_text: 'cached-post' }] },
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const client = createNotionClient()

      // First call - should hit API
      const posts1 = await client.listPublishedPosts()
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second call - should use cache
      const posts2 = await client.listPublishedPosts()
      expect(mockFetch).toHaveBeenCalledTimes(1) // Still 1
      expect(posts1).toEqual(posts2)
    })

    it('should throw NotionApiError on API failure', async () => {
      vi.useFakeTimers()

      // Mock all 3 retries to fail
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      })

      const client = createNotionClient()
      const promise = client.listPublishedPosts()

      // Set up the rejection handler BEFORE advancing timers
      const expectation = expect(promise).rejects.toThrow(NotionApiError)

      // Advance timers for all retry attempts
      await vi.advanceTimersByTimeAsync(10000)

      // Wait for the expectation
      await expectation

      vi.useRealTimers()
    })

    it('should handle missing properties gracefully', async () => {
      const mockResponse = {
        results: [
          {
            id: 'page-1',
            properties: {
              Title: { title: [] }, // Empty title
              Slug: { rich_text: [{ plain_text: 'minimal-post' }] },
              // Other properties missing
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const client = createNotionClient()
      const posts = await client.listPublishedPosts()

      expect(posts[0]).toEqual({
        slug: 'minimal-post',
        title: '', // Empty title array returns empty string, not 'Untitled'
        date: undefined,
        tags: undefined,
        label: undefined,
        description: undefined,
        coverImageUrl: undefined,
        language: undefined,
        author: undefined,
      })
    })

    it('should support Person type for Author field', async () => {
      const mockResponse = {
        results: [
          {
            id: 'page-1',
            properties: {
              Title: { title: [{ plain_text: 'Test Post' }] },
              Slug: { rich_text: [{ plain_text: 'test-post' }] },
              Author: { people: [{ name: 'Jane Smith' }] },
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const client = createNotionClient()
      const posts = await client.listPublishedPosts()

      expect(posts[0].author).toBe('Jane Smith')
    })

    it('should fallback to Text type if Person type is empty', async () => {
      const mockResponse = {
        results: [
          {
            id: 'page-1',
            properties: {
              Title: { title: [{ plain_text: 'Test Post' }] },
              Slug: { rich_text: [{ plain_text: 'test-post' }] },
              Author: {
                people: [], // Empty Person field
                rich_text: [{ plain_text: 'Text Author' }],
              },
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const client = createNotionClient()
      const posts = await client.listPublishedPosts()

      expect(posts[0].author).toBe('Text Author')
    })

    it('should prioritize Person type over Text type for Author', async () => {
      const mockResponse = {
        results: [
          {
            id: 'page-1',
            properties: {
              Title: { title: [{ plain_text: 'Test Post' }] },
              Slug: { rich_text: [{ plain_text: 'test-post' }] },
              Author: {
                people: [{ name: 'Person Author' }],
                rich_text: [{ plain_text: 'Text Author' }],
              },
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const client = createNotionClient()
      const posts = await client.listPublishedPosts()

      expect(posts[0].author).toBe('Person Author')
    })

    it('should retry on 5xx errors', async () => {
      vi.useFakeTimers()

      // First call fails with 500
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{
            id: 'page-1',
            properties: {
              Title: { title: [{ plain_text: 'Retry Success' }] },
              Slug: { rich_text: [{ plain_text: 'retry-success' }] },
            },
          }],
        }),
      })

      const client = createNotionClient()
      const promise = client.listPublishedPosts()

      // Advance timers for retry delay
      await vi.advanceTimersByTimeAsync(1000)

      const posts = await promise

      expect(posts[0].title).toBe('Retry Success')
      expect(mockFetch).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })
  })

  describe('getPostBySlug', () => {
    it('should fetch post by slug successfully', async () => {
      const mockPostResponse = {
        results: [
          {
            id: 'page-123',
            properties: {
              Title: { title: [{ plain_text: 'Test Post' }] },
              Slug: { rich_text: [{ plain_text: 'test-post' }] },
              Description: { rich_text: [{ plain_text: 'Test description' }] },
            },
          },
        ],
      }

      const mockBlocksResponse = {
        results: [
          {
            id: 'block-1',
            type: 'paragraph',
            has_children: false,
            paragraph: {
              rich_text: [{ plain_text: 'Test content' }],
            },
          },
        ],
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockPostResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockBlocksResponse,
        })

      const client = createNotionClient()
      const post = await client.getPostBySlug('test-post')

      expect(post).not.toBeNull()
      expect(post?.title).toBe('Test Post')
      expect(post?.slug).toBe('test-post')
      expect(post?.content).toHaveLength(1)
      expect(post?.html).toBeTruthy()
    })

    it('should return null for non-existent slug', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      })

      const client = createNotionClient()
      const post = await client.getPostBySlug('non-existent')

      expect(post).toBeNull()
    })

    it('should not open an automatic address for a page outside the posts database', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: '3f28a7a4-17e4-8150-9a21-c6358a3c0ba5',
          parent: { database_id: 'other-database-id' },
          properties: {
            Title: { title: [{ plain_text: 'Private page' }] },
            Status: { select: { name: 'Publish' } },
            Slug: { rich_text: [] },
          },
        }),
      })

      const client = createNotionClient()
      const post = await client.getPostBySlug('p-3f28a7a417e481509a21c6358a3c0ba5')

      expect(post).toBeNull()
    })

    it('should not open an automatic address for an unpublished post', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: '3f28a7a4-17e4-8150-9a21-c6358a3c0ba5',
          parent: { database_id: 'test-database-id' },
          properties: {
            Title: { title: [{ plain_text: 'Draft' }] },
            Status: { select: { name: 'Draft' } },
            Slug: { rich_text: [] },
          },
        }),
      })

      const client = createNotionClient()
      const post = await client.getPostBySlug('p-3f28a7a417e481509a21c6358a3c0ba5')

      expect(post).toBeNull()
    })

    it('should handle nested blocks with has_children', async () => {
      const mockPostResponse = {
        results: [
          {
            id: 'page-123',
            properties: {
              Title: { title: [{ plain_text: 'Nested Post' }] },
              Slug: { rich_text: [{ plain_text: 'nested-post' }] },
            },
          },
        ],
      }

      const mockParentBlocks = {
        results: [
          {
            id: 'parent-block',
            type: 'bulleted_list_item',
            has_children: true,
            bulleted_list_item: {
              rich_text: [{ plain_text: 'Parent item' }],
            },
          },
        ],
      }

      const mockChildBlocks = {
        results: [
          {
            id: 'child-block',
            type: 'paragraph',
            has_children: false,
            paragraph: {
              rich_text: [{ plain_text: 'Child content' }],
            },
          },
        ],
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockPostResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockParentBlocks,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockChildBlocks,
        })

      const client = createNotionClient()
      const post = await client.getPostBySlug('nested-post')

      expect(post?.content[0].has_children).toBe(true)
      expect((post?.content[0] as any).bulleted_list_item.children).toHaveLength(1)
    })

    it('should use cache for blocks', async () => {
      const mockPostResponse = {
        results: [
          {
            id: 'page-123',
            properties: {
              Title: { title: [{ plain_text: 'Cached Blocks' }] },
              Slug: { rich_text: [{ plain_text: 'cached-blocks' }] },
            },
          },
        ],
      }

      const mockBlocksResponse = {
        results: [{ id: 'block-1', type: 'paragraph', has_children: false }],
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockPostResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockBlocksResponse,
        })

      const client = createNotionClient()

      // First call
      await client.getPostBySlug('cached-blocks')
      expect(mockFetch).toHaveBeenCalledTimes(2) // post + blocks

      // Clear only post cache, not blocks cache
      contentCache.delete('notion:post:cached-blocks')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPostResponse,
      })

      // Second call - blocks should be cached
      await client.getPostBySlug('cached-blocks')
      expect(mockFetch).toHaveBeenCalledTimes(3) // +1 for post only
    })

    it('should handle YouTube bookmark enrichment', async () => {
      const mockPostResponse = {
        results: [
          {
            id: 'page-123',
            properties: {
              Title: { title: [{ plain_text: 'YouTube Post' }] },
              Slug: { rich_text: [{ plain_text: 'youtube-post' }] },
            },
          },
        ],
      }

      const mockBlocksResponse = {
        results: [
          {
            id: 'block-1',
            type: 'bookmark',
            has_children: false,
            bookmark: {
              url: 'https://www.youtube.com/watch?v=test123',
              caption: [], // Empty caption
            },
          },
        ],
      }

      const mockOEmbedResponse = {
        title: 'Test Video Title',
        author_name: 'Test Channel',
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockPostResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockBlocksResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockOEmbedResponse,
        })

      const client = createNotionClient()
      const post = await client.getPostBySlug('youtube-post')

      expect((post?.content[0] as any).bookmark.caption).toHaveLength(1)
      expect((post?.content[0] as any).bookmark.caption[0].plain_text).toContain('Test Video Title')
      expect((post?.content[0] as any).bookmark.caption[0].plain_text).toContain('Test Channel')
    })

    it('should throw NotionApiError on API failure', async () => {
      vi.useFakeTimers()

      // Mock all retries to fail
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      })

      const client = createNotionClient()
      const promise = client.getPostBySlug('error-post')

      // Set up the rejection handlers BEFORE advancing timers
      const expectation1 = expect(promise).rejects.toThrow(NotionApiError)
      const expectation2 = expect(promise).rejects.toThrow('Failed to fetch post by slug')

      // Advance timers for all retry attempts
      await vi.advanceTimersByTimeAsync(10000)

      // Wait for the expectations
      await expectation1
      await expectation2

      vi.useRealTimers()
    })
  })

  describe('getSiteSettings', () => {
    it('should return default settings when database ID not provided', async () => {
      const client = createNotionClient()
      const settings = await client.getSiteSettings()

      expect(settings.name).toBe('프로필 설정 DB의 Name 속성을 설정하세요')
      expect(settings.jobTitle).toBe('프로필 설정 DB의 JobTitle 속성을 설정하세요')
      expect(settings.homeTitle).toBe('프로필 설정 DB의 HomeTitle 속성을 설정하세요')
      expect(settings.socialLinks).toBeDefined()
    })

    it('should fetch settings from Notion when database ID provided', async () => {
      // Set env.NOTION_PROFILE_DATABASE_ID
      const { env } = await import('@/lib/env')
      ;(env as any).NOTION_PROFILE_DATABASE_ID = 'settings-db-id'

      const mockResponse = {
        results: [
          {
            id: 'settings-page',
            properties: {
              Name: { title: [{ plain_text: 'Custom Name' }] },
              JobTitle: { rich_text: [{ plain_text: 'Custom Job' }] },
              Bio: { rich_text: [{ plain_text: 'Custom bio' }] },
              HomeTitle: { rich_text: [{ plain_text: 'Custom Home' }] },
              HomeDescription: { rich_text: [{ plain_text: 'Custom description' }] },
              Email: { email: 'test@example.com' },
              GitHub: { url: 'https://github.com/test' },
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const client = createNotionClient()
      const settings = await client.getSiteSettings()

      expect(settings.name).toBe('Custom Name')
      expect(settings.jobTitle).toBe('Custom Job')
      expect(settings.bio).toBe('Custom bio')
      expect(settings.homeTitle).toBe('Custom Home')
      expect(settings.socialLinks.email).toBe('mailto:test@example.com')
      expect(settings.socialLinks.github).toBe('https://github.com/test')

      // Cleanup
      ;(env as any).NOTION_PROFILE_DATABASE_ID = undefined
    })

    it('should return default settings when API fails', async () => {
      const { getEnvOptional } = await import('@/lib/env')
      ;(getEnvOptional as any).mockReturnValueOnce('settings-db-id')

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const client = createNotionClient()
      const settings = await client.getSiteSettings()

      // Should return default settings
      expect(settings.name).toBe('프로필 설정 DB의 Name 속성을 설정하세요')
    })

    it('should return default settings when database is empty', async () => {
      const { getEnvOptional } = await import('@/lib/env')
      ;(getEnvOptional as any).mockReturnValueOnce('settings-db-id')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      })

      const client = createNotionClient()
      const settings = await client.getSiteSettings()

      // Should return default settings
      expect(settings.name).toBe('프로필 설정 DB의 Name 속성을 설정하세요')
    })

    it('should handle email with mailto: prefix', async () => {
      // Set env.NOTION_PROFILE_DATABASE_ID
      const { env } = await import('@/lib/env')
      ;(env as any).NOTION_PROFILE_DATABASE_ID = 'settings-db-id'

      const mockResponse = {
        results: [
          {
            id: 'settings-page',
            properties: {
              Name: { title: [{ plain_text: 'Test' }] },
              Email: { email: 'mailto:test@example.com' }, // Already has mailto:
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const client = createNotionClient()
      const settings = await client.getSiteSettings()

      // Should not add another mailto:
      expect(settings.socialLinks.email).toBe('mailto:test@example.com')

      // Cleanup
      ;(env as any).NOTION_PROFILE_DATABASE_ID = undefined
    })

    it('should use cache on subsequent calls', async () => {
      // Set env.NOTION_PROFILE_DATABASE_ID
      const { env } = await import('@/lib/env')
      ;(env as any).NOTION_PROFILE_DATABASE_ID = 'settings-db-id'

      const mockResponse = {
        results: [
          {
            id: 'settings-page',
            properties: {
              Name: { title: [{ plain_text: 'Cached Settings' }] },
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const client = createNotionClient()

      // First call
      await client.getSiteSettings()
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second call - should use cache
      await client.getSiteSettings()
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Cleanup
      ;(env as any).NOTION_PROFILE_DATABASE_ID = undefined
    })
  })

  describe('Custom Database Configuration', () => {
    it('should use custom database ID when provided', async () => {
      const mockResponse = {
        results: [
          {
            id: 'page-1',
            properties: {
              Title: { title: [{ plain_text: 'Custom DB Post' }] },
              Slug: { rich_text: [{ plain_text: 'custom-db-post' }] },
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const client = createNotionClient({ databaseId: 'custom-database-id' })
      await client.listPublishedPosts()

      // Verify the fetch was called with custom database ID
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('custom-database-id'),
        expect.any(Object)
      )
    })
  })

  describe('Cover Image Priority', () => {
    it('should prioritize page cover over CoverImage property', async () => {
      const mockResponse = {
        results: [
          {
            id: 'page-1',
            properties: {
              Title: { title: [{ plain_text: 'Cover Test' }] },
              Slug: { rich_text: [{ plain_text: 'cover-test' }] },
              CoverImage: {
                files: [{
                  type: 'external',
                  external: { url: 'https://example.com/property-cover.jpg' },
                }],
              },
            },
            cover: {
              type: 'external',
              external: { url: 'https://example.com/page-cover.jpg' },
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const client = createNotionClient()
      const posts = await client.listPublishedPosts()

      // Should use page cover, not property cover
      expect(posts[0].coverImageUrl).toBe('https://example.com/page-cover.jpg')
    })

    it('should use CoverImage property when page cover is null', async () => {
      const mockResponse = {
        results: [
          {
            id: 'page-1',
            properties: {
              Title: { title: [{ plain_text: 'Cover Test' }] },
              Slug: { rich_text: [{ plain_text: 'cover-test' }] },
              CoverImage: {
                files: [{
                  type: 'file',
                  file: { url: 'https://example.com/property-cover.jpg' },
                }],
              },
            },
            cover: null,
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const client = createNotionClient()
      const posts = await client.listPublishedPosts()

      expect(posts[0].coverImageUrl).toBe('https://example.com/property-cover.jpg')
    })
  })

  describe('Label Field Type Handling', () => {
    it('should handle label as select type', async () => {
      const mockResponse = {
        results: [
          {
            id: 'page-1',
            properties: {
              Title: { title: [{ plain_text: 'Label Test' }] },
              Slug: { rich_text: [{ plain_text: 'label-test' }] },
              Label: { select: { name: 'Featured' } },
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const client = createNotionClient()
      const posts = await client.listPublishedPosts()

      expect(posts[0].label).toBe('Featured')
    })

    it('should handle label as rich_text type', async () => {
      const mockResponse = {
        results: [
          {
            id: 'page-1',
            properties: {
              Title: { title: [{ plain_text: 'Label Test' }] },
              Slug: { rich_text: [{ plain_text: 'label-test' }] },
              Label: { rich_text: [{ plain_text: 'Custom Label' }] },
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const client = createNotionClient()
      const posts = await client.listPublishedPosts()

      expect(posts[0].label).toBe('Custom Label')
    })
  })

  describe('getSiteConfig', () => {
    it('should return default config when database ID not provided', async () => {
      const client = createNotionClient()
      const config = await client.getSiteConfig()

      expect(config).toEqual({
        siteTitle: '사이트 설정 DB의 SiteTitle 속성을 설정하세요',
        siteDescription: '사이트 설정 DB의 SiteDescription 속성을 설정하세요',
        enableAnalytics: false,
        enableAdsense: false,
        adsenseAutoAds: false,
      })
    })

    it('should fetch site config from Notion when database ID provided', async () => {
      // Set mock environment variable
      mockEnv.NOTION_SITE_DATABASE_ID = 'site-db-123'

      const mockResponse = {
        results: [
          {
            id: 'site-page-1',
            properties: {
              SiteTitle: { title: [{ plain_text: 'Test Blog Site' }] },
              SiteDescription: { rich_text: [{ plain_text: 'Test blog description' }] },
              OGImage: { files: [{ file: { url: 'https://example.com/test-og.png' } }] },
              TwitterHandle: { rich_text: [{ plain_text: '@testblog' }] },
              Author: { people: [{ name: 'Test Author' }] },
              GA4MeasurementId: { rich_text: [{ plain_text: 'G-TEST1234567' }] },
              EnableAnalytics: { checkbox: true },
              AdSensePublisherId: { rich_text: [{ plain_text: 'ca-pub-0000000000000000' }] },
              EnableAdSense: { checkbox: true },
              AdSenseAutoAds: { checkbox: false },
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const client = createNotionClient()
      const config = await client.getSiteConfig()

      expect(config).toEqual({
        siteTitle: 'Test Blog Site',
        siteDescription: 'Test blog description',
        ogImage: '/og-images/default.jpg', // OG Image는 로컬 경로로 변환됨
        twitterHandle: '@testblog',
        author: 'Test Author',
        ga4MeasurementId: 'G-TEST1234567',
        enableAnalytics: true,
        adsensePublisherId: 'ca-pub-0000000000000000',
        enableAdsense: true,
        adsenseAutoAds: false,
      })

      // Restore environment variable
      mockEnv.NOTION_SITE_DATABASE_ID = undefined
    })

    it('should return default config when API fails', async () => {
      mockEnv.NOTION_SITE_DATABASE_ID = 'site-db-123'

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      })

      const client = createNotionClient()
      const config = await client.getSiteConfig()

      expect(config).toEqual({
        siteTitle: '사이트 설정 DB의 SiteTitle 속성을 설정하세요',
        siteDescription: '사이트 설정 DB의 SiteDescription 속성을 설정하세요',
        enableAnalytics: false,
        enableAdsense: false,
        adsenseAutoAds: false,
      })

      mockEnv.NOTION_SITE_DATABASE_ID = undefined
    })

    it('should return default config when database is empty', async () => {
      mockEnv.NOTION_SITE_DATABASE_ID = 'site-db-123'

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      })

      const client = createNotionClient()
      const config = await client.getSiteConfig()

      expect(config).toEqual({
        siteTitle: '사이트 설정 DB의 SiteTitle 속성을 설정하세요',
        siteDescription: '사이트 설정 DB의 SiteDescription 속성을 설정하세요',
        enableAnalytics: false,
        enableAdsense: false,
        adsenseAutoAds: false,
      })

      mockEnv.NOTION_SITE_DATABASE_ID = undefined
    })

    it('should support Author as Text type fallback', async () => {
      mockEnv.NOTION_SITE_DATABASE_ID = 'site-db-123'

      const mockResponse = {
        results: [
          {
            id: 'site-page-1',
            properties: {
              SiteTitle: { title: [{ plain_text: 'Test Blog' }] },
              SiteDescription: { rich_text: [{ plain_text: 'Test Description' }] },
              Author: {
                people: [], // Empty Person field
                rich_text: [{ plain_text: 'Text Author' }],
              },
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const client = createNotionClient()
      const config = await client.getSiteConfig()

      expect(config.author).toBe('Text Author')

      mockEnv.NOTION_SITE_DATABASE_ID = undefined
    })

    it('should use cache on subsequent calls', async () => {
      mockEnv.NOTION_SITE_DATABASE_ID = 'site-db-123'

      const mockResponse = {
        results: [
          {
            id: 'site-page-1',
            properties: {
              SiteTitle: { title: [{ plain_text: 'Cached Blog' }] },
              SiteDescription: { rich_text: [{ plain_text: 'Cached Description' }] },
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const client = createNotionClient()

      // First call - should hit API
      const config1 = await client.getSiteConfig()
      expect(config1.siteTitle).toBe('Cached Blog')

      // Second call - should use cache (no additional fetch)
      const config2 = await client.getSiteConfig()
      expect(config2.siteTitle).toBe('Cached Blog')

      // Verify fetch was only called once
      expect(mockFetch).toHaveBeenCalledTimes(1)

      mockEnv.NOTION_SITE_DATABASE_ID = undefined
    })
  })
})
