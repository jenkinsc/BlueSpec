/**
 * OpenAPI 3.0 specification for the EmComm API.
 * Served at GET /openapi.json
 */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'EmComm Coordination API',
    version: '0.1.0',
    description:
      'REST API for coordinating amateur radio and emergency communications operations.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local dev' }],
  paths: {
    '/operators': {
      get: {
        summary: 'List operators',
        tags: ['Operators'],
        responses: { '200': { description: 'List of operators' } },
      },
      post: {
        summary: 'Create operator',
        tags: ['Operators'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateOperator' },
            },
          },
        },
        responses: { '201': { description: 'Created operator' } },
      },
    },
    '/operators/{id}': {
      get: { summary: 'Get operator', tags: ['Operators'], parameters: [{ $ref: '#/components/parameters/Id' }], responses: { '200': { description: 'Operator' }, '404': { description: 'Not found' } } },
      patch: { summary: 'Update operator', tags: ['Operators'], parameters: [{ $ref: '#/components/parameters/Id' }], responses: { '200': { description: 'Updated operator' } } },
      delete: { summary: 'Delete operator', tags: ['Operators'], parameters: [{ $ref: '#/components/parameters/Id' }], responses: { '204': { description: 'Deleted' } } },
    },
    '/incidents': {
      get: { summary: 'List incidents', tags: ['Incidents'], responses: { '200': { description: 'List of incidents' } } },
      post: { summary: 'Create incident', tags: ['Incidents'], responses: { '201': { description: 'Created incident' } } },
    },
    '/incidents/{id}': {
      get: { summary: 'Get incident', tags: ['Incidents'], parameters: [{ $ref: '#/components/parameters/Id' }], responses: { '200': { description: 'Incident' } } },
      patch: { summary: 'Update incident', tags: ['Incidents'], parameters: [{ $ref: '#/components/parameters/Id' }], responses: { '200': { description: 'Updated incident' } } },
      delete: { summary: 'Delete incident', tags: ['Incidents'], parameters: [{ $ref: '#/components/parameters/Id' }], responses: { '204': { description: 'Deleted' } } },
    },
    '/nets': {
      get: {
        summary: 'List nets',
        tags: ['Nets'],
        parameters: [{ name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['draft', 'open', 'closed', 'all'], default: 'open' } }],
        responses: { '200': { description: 'List of nets' } },
      },
      post: {
        summary: 'Create net (draft)',
        tags: ['Nets'],
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateNet' } } } },
        responses: { '201': { description: 'Created net in draft status' }, '401': { description: 'Unauthorized' } },
      },
    },
    '/nets/{id}': {
      get: { summary: 'Get net', tags: ['Nets'], parameters: [{ $ref: '#/components/parameters/Id' }], responses: { '200': { description: 'Net' }, '404': { description: 'Not found' } } },
      patch: {
        summary: 'Update net (net control only)',
        tags: ['Nets'],
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/Id' }],
        responses: { '200': { description: 'Updated net' }, '401': { description: 'Unauthorized' }, '403': { description: 'Forbidden' }, '404': { description: 'Not found' } },
      },
    },
    '/nets/{id}/open': {
      post: {
        summary: 'Open a net (draft → open)',
        tags: ['Nets'],
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/Id' }],
        responses: { '200': { description: 'Net opened' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not found' }, '409': { description: 'Net is not in draft status' } },
      },
    },
    '/nets/{id}/close': {
      post: {
        summary: 'Close a net (open → closed, net control only)',
        tags: ['Nets'],
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/Id' }],
        responses: { '200': { description: 'Net closed' }, '401': { description: 'Unauthorized' }, '403': { description: 'Forbidden' }, '404': { description: 'Not found' }, '409': { description: 'Net is not in open status' } },
      },
    },
    '/check-ins': {
      get: {
        summary: 'List check-ins',
        tags: ['Check-ins'],
        parameters: [{ name: 'netId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'List of check-ins' } },
      },
      post: { summary: 'Create check-in', tags: ['Check-ins'], responses: { '201': { description: 'Created check-in' } } },
    },
    '/check-ins/{id}': {
      get: { summary: 'Get check-in', tags: ['Check-ins'], parameters: [{ $ref: '#/components/parameters/Id' }], responses: { '200': { description: 'Check-in' } } },
      patch: { summary: 'Update check-in', tags: ['Check-ins'], parameters: [{ $ref: '#/components/parameters/Id' }], responses: { '200': { description: 'Updated check-in' } } },
      delete: { summary: 'Delete check-in', tags: ['Check-ins'], parameters: [{ $ref: '#/components/parameters/Id' }], responses: { '204': { description: 'Deleted' } } },
    },
    '/auth/login': {
      post: {
        summary: 'Login with callsign + password',
        tags: ['Auth'],
        description: 'Implemented in BLUAAA-5',
        responses: { '200': { description: 'JWT token' }, '401': { description: 'Invalid credentials' } },
      },
    },
  },
  components: {
    parameters: {
      Id: { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    },
    schemas: {
      CreateOperator: {
        type: 'object',
        required: ['callsign', 'name'],
        properties: {
          callsign: { type: 'string', example: 'W1AW' },
          name: { type: 'string', example: 'Hiram Percy Maxim' },
          email: { type: 'string', format: 'email' },
          licenseClass: { type: 'string', enum: ['technician', 'general', 'extra'] },
        },
      },
      CreateNet: {
        type: 'object',
        required: ['name', 'frequency'],
        properties: {
          name: { type: 'string', example: 'Sunday Morning Net' },
          frequency: { type: 'string', example: '146.520', description: 'Frequency in MHz as a decimal string' },
          mode: { type: 'string', enum: ['FM', 'SSB', 'CW', 'DMR', 'D-STAR', 'FT8', 'other'], default: 'FM' },
          schedule: { type: 'string', example: 'Sundays 09:00 local' },
        },
      },
    },
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
} as const;
