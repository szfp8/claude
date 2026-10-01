import type { Bindings } from '../types'
import type { ImageEntry, ImageStore } from './imageSettings'

export async function uploadPageImage(env: Bindings, group: 'home' | 'city' | 'service', slug: string, file: File): Promise<ImageEntry> {
  const type = file.type
  if (!/^image\/(jpeg|png|webp)$/.test(type)) throw new Error('图片仅支持 JPG、PNG、WEBP')
  if (file.size > 5 * 1024 * 1024) throw new Error('图片最大 5MB')
  const ext = type === 'image/jpeg' ? 'jpg' : type.split('/')[1]
  const safeGroup = group === 'home' ? 'home' : group + '/' + slug.replace(/[^a-z0-9_-]/gi, '_')
  const key = 'media/pages/' + safeGroup + '/' + crypto.randomUUID() + '.' + ext
  await env.R2_MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: type, contentDisposition: 'inline' },
    customMetadata: { purpose: 'page-image', group, slug, originalName: file.name },
  })
  return { url: '/media/' + key.slice('media/'.length), key, alt: file.name.slice(0, 120), updatedAt: new Date().toISOString() }
}

export async function replacePageImage(env: Bindings, current: ImageEntry | undefined, next: ImageEntry): Promise<void> {
  if (current?.key && current.key !== next.key) await env.R2_MEDIA.delete(current.key).catch(() => {})
}

export async function deletePageImage(env: Bindings, current: ImageEntry | undefined): Promise<void> {
  if (current?.key) await env.R2_MEDIA.delete(current.key).catch(() => {})
}

export function removeImage(store: ImageStore, group: 'home' | 'cities' | 'services', slug?: string): ImageEntry | undefined {
  if (group === 'home') {
    const old = store.home
    delete store.home
    return old
  }
  const bucket = store[group]
  if (!slug) return undefined
  const old = bucket[slug]
  delete bucket[slug]
  return old
}
