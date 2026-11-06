import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Photo } from './types'

// Photos of a point. See docs/plan-fotos.md and the migration 20261106160000_inspection_photos.sql.
// There is never a photo row without a file: upload first, then register; remove the row first,
// then the file. A file without a row can stay behind when a step fails, which nobody sees.

const BUCKET = 'inspection-photos'

/** The database allows 3 photos per point. */
export const MAX_PHOTOS = 3

// The free plan cannot make images smaller, so the phone does it. About 200 to 400 kB per photo.
const LONG_EDGE = 1600
const QUALITY = 0.8

/** Signed URLs are valid for an hour; a new one is made a few minutes before that. */
const URL_SECONDS = 60 * 60
const URL_MARGIN_MS = 5 * 60 * 1000

export function photoPath(inspectionId: string, itemId: string, photoId: string): string {
  return `${inspectionId}/${itemId}/${photoId}.jpg`
}

/**
 * Makes a photo at most 1600 px on its long edge, as JPEG. Drawing it on a canvas also drops the
 * EXIF data, so the GPS location never leaves the phone. Throws when the browser cannot read it.
 */
export async function resizePhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no canvas')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no jpeg'))), 'image/jpeg', QUALITY),
    )
  } finally {
    bitmap.close()
  }
}

/** Deletes files from the bucket. Failures are left alone: a file without a row is harmless. */
export async function removeFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await supabase.storage.from(BUCKET).remove(paths)
}

/** Uploads the file and registers it as a photo of the point. */
export async function savePhoto(itemId: string, path: string, blob: Blob): Promise<Photo> {
  const upload = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (upload.error) throw upload.error
  const { data, error } = await supabase.rpc('add_item_photo', { p_item_id: itemId, p_path: path })
  if (error) {
    await removeFiles([path]).catch(() => {})
    throw error
  }
  return { id: data as string, path, created_at: new Date().toISOString() }
}

/** Removes a photo of a draft: the row, then the file. */
export async function deletePhoto(photoId: string): Promise<void> {
  const { data, error } = await supabase.rpc('delete_item_photo', { p_photo_id: photoId })
  if (error) throw error
  await removeFiles([data as string]).catch(() => {})
}

// Signed URLs, shared by every screen, so a thumbnail and the large view do not both ask for one.
const urls = new Map<string, { url: string; until: number }>()

function fresh(path: string): boolean {
  const known = urls.get(path)
  return known !== undefined && known.until > Date.now() + URL_MARGIN_MS
}

/** A photo just taken on this phone is shown from memory, without downloading it again. */
export function rememberPhotoUrl(path: string, url: string): void {
  urls.set(path, { url, until: Number.POSITIVE_INFINITY })
}

/**
 * The URLs to show these photos with, made in one request. A path without a URL yet gives
 * undefined; the hook renders again once the URLs are in.
 */
export function usePhotoUrls(paths: string[]): (path: string) => string | undefined {
  const [, setVersion] = useState(0)
  const key = paths.join('\n')

  useEffect(() => {
    const missing = key === '' ? [] : key.split('\n').filter((path) => !fresh(path))
    if (missing.length === 0) return
    let active = true
    supabase.storage
      .from(BUCKET)
      .createSignedUrls(missing, URL_SECONDS)
      .then(({ data }) => {
        const until = Date.now() + URL_SECONDS * 1000
        for (const entry of data ?? []) {
          if (entry.path && entry.signedUrl) urls.set(entry.path, { url: entry.signedUrl, until })
        }
        if (active) setVersion((version) => version + 1)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [key])

  return (path) => urls.get(path)?.url
}
