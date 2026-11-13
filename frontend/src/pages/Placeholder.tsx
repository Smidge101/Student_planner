import { Sparkles } from 'lucide-react'

/** Stand-in for pages built in later phases. */
export default function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <>
      <h1 className="page-title">{title}</h1>
      <div className="card empty-page">
        <Sparkles aria-hidden="true" />
        <p>This page is coming in the <strong>{phase}</strong> phase.</p>
      </div>
    </>
  )
}
