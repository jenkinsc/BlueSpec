export type NetStatus = 'scheduled' | 'active' | 'closed';

export interface Net {
  id: string;
  name: string;
  frequency: string;
  netControl: string; // operator callsign
  status: NetStatus;
  incidentId?: string;
  startedAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateNetInput = Omit<Net, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateNetInput = Partial<CreateNetInput>;
