import { useMemo, useRef, useEffect, useState } from 'react'
import type { ConceptMapData } from '../types/db'

interface LayoutNode {
  id: string
  label: string
  x: number
  y: number
}

interface LayoutEdge {
  from: string
  to: string
  label: string
}

// Simple force-directed layout simulation
function computeLayout(data: ConceptMapData, width: number, height: number): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const centerX = width / 2
  const centerY = height / 2
  const radius = Math.min(width, height) * 0.35

  // Place nodes in a circle
  const nodes: LayoutNode[] = data.nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / data.nodes.length - Math.PI / 2
    return {
      id: n.id,
      label: n.label,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    }
  })

  const edges: LayoutEdge[] = data.edges.map((e) => ({
    from: e.from,
    to: e.to,
    label: e.label,
  }))

  return { nodes, edges }
}

function getNodeColor(index: number, total: number): string {
  const hue = (index * 360) / total
  return `hsl(${hue}, 55%, 45%)`
}

interface ConceptMapProps {
  data: ConceptMapData
  className?: string
}

export function ConceptMap({ data, className = '' }: ConceptMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 })

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({ width: Math.max(rect.width, 300), height: Math.max(Math.min(rect.width * 0.6, 500), 300) })
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const layout = useMemo(() => computeLayout(data, dimensions.width, dimensions.height), [data, dimensions.width, dimensions.height])

  const nodeMap = useMemo(() => {
    const map = new Map<string, LayoutNode>()
    layout.nodes.forEach((n) => map.set(n.id, n))
    return map
  }, [layout.nodes])

  if (!data.nodes.length) {
    return (
      <div className={`flex items-center justify-center py-12 text-small text-text-muted ${className}`}>
        No concepts to display yet.
      </div>
    )
  }

  const padding = 20
  const svgWidth = dimensions.width - padding * 2
  const svgHeight = dimensions.height - padding * 2

  return (
    <div ref={containerRef} className={`w-full ${className}`} style={{ minHeight: 300 }}>
      <svg
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className="w-full h-full"
        style={{ minHeight: 300 }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
          </marker>
        </defs>

        {/* Edges */}
        {layout.edges.map((edge, i) => {
          const from = nodeMap.get(edge.from)
          const to = nodeMap.get(edge.to)
          if (!from || !to) return null

          const dx = to.x - from.x
          const dy = to.y - from.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const nodeRadius = 28
          const shrinkX = (dx / dist) * nodeRadius
          const shrinkY = (dy / dist) * nodeRadius

          const x1 = from.x + shrinkX
          const y1 = from.y + shrinkY
          const x2 = to.x - shrinkX
          const y2 = to.y - shrinkY

          const midX = (x1 + x2) / 2
          const midY = (y1 + y2) / 2

          return (
            <g key={`edge-${i}`}>
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#94a3b8"
                strokeWidth={1.5}
                markerEnd="url(#arrowhead)"
                className="transition-all duration-200"
              />
              <rect
                x={midX - 60} y={midY - 8}
                width={120} height={16}
                rx={4}
                fill="#f8fafc"
                className="transition-all duration-200"
              />
              <text
                x={midX} y={midY + 3}
                textAnchor="middle"
                fill="#64748b"
                fontSize={9}
                fontFamily="Inter, sans-serif"
                className="select-none"
              >
                {edge.label.length > 18 ? edge.label.slice(0, 17) + '...' : edge.label}
              </text>
            </g>
          )
        })}

        {/* Nodes */}
        {layout.nodes.map((node, i) => {
          const color = getNodeColor(i, layout.nodes.length)
          return (
            <g key={node.id} className="transition-all duration-200">
              <circle
                cx={node.x} cy={node.y} r={28}
                fill={color}
                className="drop-shadow-sm transition-all duration-200 hover:brightness-110 cursor-pointer"
              />
              <text
                x={node.x} y={node.y + 1}
                textAnchor="middle"
                fill="white"
                fontSize={10}
                fontWeight={600}
                fontFamily="Inter, sans-serif"
                className="select-none pointer-events-none"
              >
                {node.label.length > 12 ? node.label.slice(0, 11) + '...' : node.label}
              </text>
              <text
                x={node.x} y={node.y + 16}
                textAnchor="middle"
                fill="rgba(255,255,255,0.7)"
                fontSize={7}
                fontFamily="Inter, sans-serif"
                className="select-none pointer-events-none"
              >
                {node.label.length > 12 ? '...' : ''}
              </text>
              <title>{node.label}</title>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
