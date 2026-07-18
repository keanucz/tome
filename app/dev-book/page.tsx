import type { Metadata } from 'next'
import DevPreview from '@/components/book/DevPreview'

export const metadata: Metadata = {
  title: 'Tome — Book Dev Preview',
}

export default function DevBookPage() {
  return <DevPreview />
}
