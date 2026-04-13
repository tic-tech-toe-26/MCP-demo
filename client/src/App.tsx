import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useWebSocket } from './hooks/useWebSocket';
import WorkflowInput from './components/WorkflowInput';
import PrePlanningPanel from './components/PrePlanningPanel';
import DAGViewer from './components/DAGViewer';
import NodeDetailPanel from './components/NodeDetailPanel';
import HITLModal from './components/HITLModal';
import AnomalyAlert from './components/AnomalyAlert';
import AuditLog from './components/AuditLog';
import ExecutionTimeline from './components/ExecutionTimeline';
import './index.css';

function AppContent() {
  useWebSocket();

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-logo">⬡</div>
            <div>
              <div className="brand-text">MCP Gateway</div>
              <div className="brand-subtitle">Agentic AI Orchestration</div>
            </div>
          </div>
        </div>

        <WorkflowInput />
        <PrePlanningPanel />
      </div>

      {/* Main Content */}
      <div className="main-content">
        <ExecutionTimeline />

        <ReactFlowProvider>
          <DAGViewer />
        </ReactFlowProvider>

        <AuditLog />
      </div>

      {/* Overlays */}
      <NodeDetailPanel />
      <HITLModal />
      <AnomalyAlert />
    </div>
  );
}

export default function App() {
  return <AppContent />;
}
