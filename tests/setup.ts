import { vi } from 'vitest'

// Mock AWS SDK
vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({}))
}))

vi.mock('@aws-sdk/lib-dynamodb', () => {
  const mockSend = vi.fn()
  return {
    DynamoDBDocumentClient: { from: vi.fn().mockReturnValue({ send: mockSend }) },
    ScanCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'Scan' })),
    GetCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'Get' })),
    PutCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'Put' })),
    DeleteCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'Delete' })),
    QueryCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'Query' })),
    UpdateCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'Update' }))
  }
})

vi.mock('@aws-sdk/client-codecommit', () => ({
  CodeCommitClient: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
  ListRepositoriesCommand: vi.fn(),
  BatchGetRepositoriesCommand: vi.fn()
}))

vi.mock('@temporalio/client', () => ({
  Connection: { connect: vi.fn().mockResolvedValue({}) },
  Client: vi.fn().mockImplementation(() => ({
    workflow: {
      start: vi.fn().mockResolvedValue({ workflowId: 'test-wf-1' }),
      getHandle: vi.fn().mockReturnValue({ terminate: vi.fn() })
    }
  }))
}))

vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: vi.fn().mockReturnValue({
      verify: vi.fn().mockRejectedValue(new Error('Invalid token'))
    })
  }
}))

export const VALID_BEARER = 'test-api-token-123'

// Set env before imports
process.env.API_BEARER_TOKEN = VALID_BEARER
process.env.LOG_LEVEL = 'silent'
