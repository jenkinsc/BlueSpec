export type IncidentSeverity = 'routine' | 'urgent' | 'emergency';
export type IncidentStatus = 'open' | 'monitoring' | 'resolved';

export interface Incident {
  id: string;
  title: string;
  description?: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  location?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export type CreateIncidentInput = Omit<Incident, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateIncidentInput = Partial<CreateIncidentInput>;
