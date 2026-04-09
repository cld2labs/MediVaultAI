import { useState, useCallback } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const NODE_STYLES = {
  input: {
    background: 'linear-gradient(135deg, #A335FC, #8B2BD9)',
    border: '1px solid rgba(163,53,252,0.6)',
    color: '#fff',
    borderRadius: '12px',
    padding: '10px 16px',
    fontSize: '12px',
    fontWeight: '600',
    minWidth: '140px',
    textAlign: 'center',
    boxShadow: '0 0 16px rgba(163,53,252,0.4)',
  },
  process: {
    background: '#161d35',
    border: '1px solid rgba(6,182,212,0.4)',
    color: '#e2e8f0',
    borderRadius: '12px',
    padding: '10px 16px',
    fontSize: '12px',
    fontWeight: '500',
    minWidth: '140px',
    textAlign: 'center',
  },
  rag: {
    background: '#161d35',
    border: '1px solid rgba(163,53,252,0.5)',
    color: '#c4b5fd',
    borderRadius: '12px',
    padding: '10px 16px',
    fontSize: '12px',
    fontWeight: '500',
    minWidth: '140px',
    textAlign: 'center',
    boxShadow: '0 0 10px rgba(163,53,252,0.15)',
  },
  output: {
    background: 'linear-gradient(135deg, #0e7490, #06b6d4)',
    border: '1px solid rgba(6,182,212,0.6)',
    color: '#fff',
    borderRadius: '12px',
    padding: '10px 16px',
    fontSize: '12px',
    fontWeight: '600',
    minWidth: '140px',
    textAlign: 'center',
    boxShadow: '0 0 16px rgba(6,182,212,0.3)',
  },
  llm: {
    background: 'linear-gradient(135deg, #4c1d95, #6d28d9)',
    border: '1px solid rgba(139,92,246,0.6)',
    color: '#fff',
    borderRadius: '12px',
    padding: '10px 16px',
    fontSize: '12px',
    fontWeight: '600',
    minWidth: '140px',
    textAlign: 'center',
    boxShadow: '0 0 12px rgba(139,92,246,0.3)',
  },
}

const EDGE_STYLE = { stroke: '#A335FC', strokeWidth: 2 }
const EDGE_ANIMATED = true

const FLOWS = {
  soap: {
    label: 'SOAP Master Agentflow',
    nodes: [
      { id: '1', position: { x: 300, y: 20 },  data: { label: '🎤 Audio Input' },     style: NODE_STYLES.input },
      { id: '2', position: { x: 300, y: 120 }, data: { label: '🔊 Whisper STT' },     style: NODE_STYLES.process },
      { id: '3', position: { x: 300, y: 220 }, data: { label: '🏥 Specialty Detect' }, style: NODE_STYLES.process },
      { id: '4', position: { x: 80,  y: 320 }, data: { label: '📚 RAG Retrieval' },   style: NODE_STYLES.rag },
      { id: '5', position: { x: 520, y: 320 }, data: { label: '🧠 LLM Generate' },    style: NODE_STYLES.llm },
      { id: '6', position: { x: 300, y: 420 }, data: { label: '🔄 Self-Reflect' },    style: NODE_STYLES.process },
      { id: '7', position: { x: 300, y: 520 }, data: { label: '📋 SOAP Output' },     style: NODE_STYLES.output },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', style: EDGE_STYLE, animated: EDGE_ANIMATED },
      { id: 'e2-3', source: '2', target: '3', style: EDGE_STYLE, animated: EDGE_ANIMATED },
      { id: 'e3-4', source: '3', target: '4', style: EDGE_STYLE, animated: EDGE_ANIMATED },
      { id: 'e3-5', source: '3', target: '5', style: EDGE_STYLE, animated: EDGE_ANIMATED },
      { id: 'e4-6', source: '4', target: '6', style: EDGE_STYLE, animated: EDGE_ANIMATED },
      { id: 'e5-6', source: '5', target: '6', style: EDGE_STYLE, animated: EDGE_ANIMATED },
      { id: 'e6-7', source: '6', target: '7', style: EDGE_STYLE, animated: EDGE_ANIMATED },
    ],
  },
  qa: {
    label: 'Clinical QA Chatflow',
    nodes: [
      { id: '1', position: { x: 300, y: 20 },  data: { label: '💬 User Question' },       style: NODE_STYLES.input },
      { id: '2', position: { x: 80,  y: 140 }, data: { label: '🧠 Buffer Memory' },        style: NODE_STYLES.process },
      { id: '3', position: { x: 520, y: 140 }, data: { label: '📦 ChromaDB Retrieval' },  style: NODE_STYLES.rag },
      { id: '4', position: { x: 300, y: 280 }, data: { label: '🤖 LLM Answer' },           style: NODE_STYLES.llm },
      { id: '5', position: { x: 300, y: 400 }, data: { label: '📎 Source Citations' },     style: NODE_STYLES.output },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', style: EDGE_STYLE, animated: EDGE_ANIMATED },
      { id: 'e1-3', source: '1', target: '3', style: EDGE_STYLE, animated: EDGE_ANIMATED },
      { id: 'e2-4', source: '2', target: '4', style: EDGE_STYLE, animated: EDGE_ANIMATED },
      { id: 'e3-4', source: '3', target: '4', style: EDGE_STYLE, animated: EDGE_ANIMATED },
      { id: 'e4-5', source: '4', target: '5', style: EDGE_STYLE, animated: EDGE_ANIMATED },
    ],
  },
}

function FlowGraph({ flowKey }) {
  const flow = FLOWS[flowKey]
  const [nodes, , onNodesChange] = useNodesState(flow.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges)

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, style: EDGE_STYLE, animated: true }, eds)),
    [setEdges]
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e2847" />
      <MiniMap
        nodeColor={(n) => {
          const bg = n.style?.background
          if (typeof bg === 'string' && bg.includes('#A335FC')) return '#A335FC'
          if (typeof bg === 'string' && bg.includes('#06b6d4')) return '#06b6d4'
          if (typeof bg === 'string' && bg.includes('#6d28d9')) return '#6d28d9'
          return '#1e2847'
        }}
        maskColor="rgba(10,14,26,0.7)"
        style={{ background: '#0f1629', border: '1px solid #1e2847' }}
      />
      <Controls style={{ background: '#161d35', border: '1px solid #1e2847', borderRadius: '8px' }} />
    </ReactFlow>
  )
}

export default function FlowCanvas() {
  const [activeFlow, setActiveFlow] = useState('soap')

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="font-semibold dark:text-white text-gray-900">AI Flow Architecture</h2>
            <p className="text-xs dark:text-slate-400 text-gray-500 mt-0.5">
              Visual representation of the Flowise flows powering MediVault AI. Drag nodes to rearrange.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-lg border text-xs font-medium dark:bg-purple-900/20 dark:border-purple-700/40 dark:text-purple-300 bg-purple-50 border-purple-200 text-purple-700">
            Flowise Agentflow / Chatflow
          </span>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {Object.entries(FLOWS).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setActiveFlow(key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border ${
                activeFlow === key
                  ? 'dark:bg-purple-600/20 dark:border-purple-500/50 dark:text-purple-300 bg-purple-100 border-purple-300 text-purple-700'
                  : 'dark:bg-surface-800 dark:border-slate-700/50 dark:text-slate-400 dark:hover:text-slate-200 bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className="rounded-2xl overflow-hidden border dark:border-slate-700/50 border-gray-200"
          style={{ height: '520px', background: '#0f1629' }}
        >
          <FlowGraph key={activeFlow} flowKey={activeFlow} />
        </div>

        <p className="text-xs dark:text-slate-600 text-gray-400 mt-3 text-center">
          Drag nodes · Scroll to zoom · These flows run inside Flowise at localhost:3001
        </p>
      </div>
    </div>
  )
}
