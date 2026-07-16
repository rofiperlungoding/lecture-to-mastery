import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node as FlowNode,
  type Edge as FlowEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { ragQuery, generateConceptMap } from '../lib/api'
import type { ConceptMapData } from '../lib/api'
import { Spinner } from './Spinner'
import { Button } from './Button'
import { EmptyState } from './EmptyState'

// ============================================================================
// Node Explanation Popover
// ============================================================================

interface NodeExplanation {
  nodeId: string
  label: string
  explanation: string
  loading: boolean
}

export default function ConceptMapPanel({ docId }: { docId: string }) {
  const [data, setData] = useState<ConceptMapData | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<NodeExplanation | null>(null)

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<FlowNode>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<FlowEdge>([])

  // On mount, check if concept map already cached
  useEffect(() => {
    setLoading(true)
    generateConceptMap(docId).then((result) => {
      setData(result)
      if (result.nodes && result.nodes.length > 0) {
        buildFlow(result)
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [docId])

  const buildFlow = useCallback((cm: ConceptMapData) => {
    const nodeSizeMap: Record<number, { w: number; h: number; fontSize: string }> = {
      1: { w: 100, h: 40, fontSize: '11px' },
      2: { w: 140, h: 50, fontSize: '13px' },
      3: { w: 180, h: 60, fontSize: '15px' },
    }

    const nodes: FlowNode[] = cm.nodes.map((n, i) => {
      const size = nodeSizeMap[n.importance] || nodeSizeMap[2]
      const angle = (2 * Math.PI * i) / cm.nodes.length
      const radius = Math.max(180, cm.nodes.length * 40)
      const x = radius * Math.cos(angle) + 300
      const y = radius * Math.sin(angle) + 250

      return {
        id: n.id,
        type: 'default',
        position: { x, y },
        data: {
          label: n.label,
          importance: n.importance,
        },
        style: {
          width: size.w,
          padding: '8px 12px',
          fontSize: size.fontSize,
          fontWeight: n.importance >= 2 ? 600 : 400,
          border: n.importance === 3
            ? '2px solid #7c3aed'
            : n.importance === 2
              ? '2px solid #a78bfa'
              : '1px solid #d1d5db',
          background: n.importance === 3
            ? '#f5f3ff'
            : n.importance === 2
              ? '#faf5ff'
              : '#ffffff',
          borderRadius: '8px',
          cursor: 'pointer',
          boxShadow: n.importance === 3
            ? '0 4px 12px rgba(124, 58, 237, 0.15)'
            : '0 1px 3px rgba(0,0,0,0.08)',
          transition: 'all 150ms ease-out',
        },
      }
    })

    const edges: FlowEdge[] = cm.edges.map((e) => ({
      id: `${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      label: e.label,
      style: { stroke: '#a78bfa', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#a78bfa' },
      labelStyle: { fontSize: '10px', fill: '#6b7280', fontWeight: 500 },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
      animated: true,
    }))

    setRfNodes(nodes)
    setRfEdges(edges)
  }, [setRfNodes, setRfEdges])

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    try {
      const result = await generateConceptMap(docId)
      setData(result)
      if (result.nodes && result.nodes.length > 0) {
        buildFlow(result)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }, [docId, buildFlow])

  const handleNodeClick = useCallback(async (_event: React.MouseEvent, node: FlowNode) => {
    const label = node.data.label as string
    if (!label) return

    setExplanation({ nodeId: node.id, label, explanation: '', loading: true })
    try {
      const result = await ragQuery(docId, `Explain what "${label}" means in the context of this document.`)
      setExplanation({ nodeId: node.id, label, explanation: result.answer, loading: false })
    } catch {
      setExplanation({ nodeId: node.id, label, explanation: 'Failed to load explanation.', loading: false })
    }
  }, [docId])

  const closeExplanation = () => setExplanation(null)

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3">
          <Spinner size="md" />
          <span className="text-body text-text-secondary">Loading concept map...</span>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">{error}</div>
        <div className="mt-4">
          <Button onClick={handleGenerate} variant="secondary" size="sm" isLoading={generating} disabled={generating}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (!data || !data.nodes || data.nodes.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          illustration="sparkle"
          title="No concept map yet"
          description="Generate a visual concept map to see how ideas in this document connect."
          action={
            <Button onClick={handleGenerate} isLoading={generating} disabled={generating}>
              {generating ? 'Generating…' : 'Generate Concept Map'}
            </Button>
          }
        />
        {error && (
          <div className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-small text-rose-700">{error}</div>
        )}
      </div>
    )
  }

  return (
    <div className="relative h-[calc(100vh-220px)] min-h-[400px] w-full">
      {/* Regenerate button */}
      <div className="absolute left-3 top-3 z-10">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleGenerate}
          isLoading={generating}
          disabled={generating}
          leadingIcon={!generating ? <RefreshCw className="h-3.5 w-3.5" /> : undefined}
        >
          {generating ? 'Regenerating…' : 'Regenerate'}
        </Button>
      </div>

      {/* ReactFlow canvas */}
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        minZoom={0.3}
        maxZoom={3}
      >
        <Background color="#f3f0ff" gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeStrokeColor="#a78bfa"
          nodeColor="#f5f3ff"
          maskColor="rgba(0,0,0,0.08)"
          style={{ border: '1px solid #e5e7eb', borderRadius: '8px' }}
        />
      </ReactFlow>

      {/* Explanation popover */}
      {explanation && (
        <div className="absolute bottom-4 left-4 right-4 z-20 mx-auto max-w-lg">
          <div className="rounded-xl border border-violet-200 dark:border-violet-900/40 bg-white dark:bg-surface p-4 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-label font-semibold text-violet-800">{explanation.label}</h4>
              <button
                onClick={closeExplanation}
                className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-bg-muted hover:text-text-secondary transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {explanation.loading ? (
              <div className="flex items-center gap-2">
                <Spinner size="sm" />
                <span className="text-small text-text-muted">Loading explanation...</span>
              </div>
            ) : (
              <p className="text-small leading-relaxed text-text-secondary">{explanation.explanation}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
