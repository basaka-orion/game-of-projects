import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAssessmentStore } from '../store';

export default function ProfilingTestGate({ children }: { children: ReactNode }) {
  const { humanMapMode, humanMapBlueprint } = useAssessmentStore();

  if (!humanMapMode) {
    return <Navigate to="/assessment" replace />;
  }

  if (humanMapMode !== 'skip' && !humanMapBlueprint) {
    return <Navigate to={`/intake/${humanMapMode}`} replace />;
  }

  return <>{children}</>;
}
