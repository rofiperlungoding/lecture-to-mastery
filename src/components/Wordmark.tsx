import { GraduationCap } from 'lucide-react'

interface WordmarkProps {
  size?: 'sm' | 'md'
  showTagline?: boolean
  className?: string
}

export function Wordmark({ size = 'md', showTagline = false, className = '' }: WordmarkProps) {
  const iconSize = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'
  const iconInner = size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]'
  const textSize = size === 'sm' ? 'text-label' : 'text-label'

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Brand glyph: graduation cap in accent rounded square */}
      <div className={`flex ${iconSize} items-center justify-center rounded-lg bg-brand-500 text-white shadow-xs`}>
        <GraduationCap className={iconInner} />
      </div>
      <div className="flex flex-col">
        <span className={`${textSize} font-semibold text-text leading-tight`}>
          Lecture-to-Mastery
        </span>
        {showTagline && (
          <span className="text-caption text-text-tertiary leading-tight">
            Study smarter
          </span>
        )}
      </div>
    </div>
  )
}
export default Wordmark
