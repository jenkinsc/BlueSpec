export type CheckInStatus = 'active' | 'standby' | 'signed_off';

export interface CheckIn {
  id: string;
  netId: string;
  operatorCallsign: string;
  status: CheckInStatus;
  remarks?: string;
  checkedInAt: string;
  updatedAt: string;
}

export type CreateCheckInInput = Omit<CheckIn, 'id' | 'checkedInAt' | 'updatedAt'>;
export type UpdateCheckInInput = Partial<Pick<CheckIn, 'status' | 'remarks'>>;
