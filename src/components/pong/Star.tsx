import { STAR_POINTS } from '@/config/pong'

interface StarProps {
  size: number
  className?: string
  fill?: string
  stroke?: boolean
  style?: React.CSSProperties
}

export function Star({ size, className, fill, stroke, style }: StarProps) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className={className} style={style}>
      <polygon
        points={STAR_POINTS}
        style={fill ? { fill } : undefined}
        {...(stroke ? { stroke: '#111111', strokeWidth: 5 } : {})}
      />
    </svg>
  )
}
