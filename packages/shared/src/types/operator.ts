export interface Operator {
  id: string;
  callsign: string;
  name: string;
  email?: string;
  licenseClass?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateOperatorInput = Omit<Operator, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateOperatorInput = Partial<CreateOperatorInput>;
