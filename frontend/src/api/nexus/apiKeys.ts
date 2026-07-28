import { http } from '@/api/http'
import { optionalDevUserId } from '@/api/requestContext'
import { unpackDataResponse, unpackListResponse } from '@/api/response'
import type { CreateApiKeyRequest, UpdateApiKeyStatusRequest } from '@/api/types/nexus'

type UserIdOpt = { userId?: number }

function userParams(extra?: UserIdOpt) {
  return {
    ...optionalDevUserId(),
    ...(extra?.userId != null ? { user_id: extra.userId } : {}),
  }
}

/** GET /api-keys */
export async function listApiKeys(params?: {
  limit?: number
  offset?: number
  userId?: number
}): Promise<{ items: unknown[]; total: number }> {
  const { data } = await http.get<unknown>('/api-keys', {
    params: {
      ...optionalDevUserId(),
      limit: params?.limit,
      offset: params?.offset,
      ...(params?.userId != null ? { user_id: params.userId } : {}),
    },
  })
  return unpackListResponse(data)
}

/** GET /api-keys/models?api_key= — 根据密钥查询可用模型 */
export async function listModelsForApiKey(apiKey: string): Promise<{ items: unknown[]; total: number }> {
  const trimmed = apiKey.trim()
  if (!trimmed) {
    return { items: [], total: 0 }
  }
  const { data } = await http.get<unknown>('/api-keys/models', {
    params: {
      api_key: trimmed,
      ...optionalDevUserId(),
    },
  })
  return unpackListResponse(data)
}

/** POST /api-keys */
export async function createApiKey(
  body: CreateApiKeyRequest,
  extra?: UserIdOpt,
): Promise<unknown> {
  const { data } = await http.post<unknown>('/api-keys', body, { params: userParams(extra) })
  return unpackDataResponse(data)
}

/** DELETE /api-keys/{api_key_id} */
export async function deleteApiKey(apiKeyId: number, extra?: UserIdOpt): Promise<unknown> {
  const { data } = await http.delete<unknown>(`/api-keys/${apiKeyId}`, {
    params: userParams(extra),
  })
  return unpackDataResponse(data)
}

/** PUT /api-keys/{api_key_id}/status */
export async function updateApiKeyStatus(
  apiKeyId: number,
  body: UpdateApiKeyStatusRequest,
  extra?: UserIdOpt,
): Promise<unknown> {
  const { data } = await http.put<unknown>(`/api-keys/${apiKeyId}/status`, body, {
    params: userParams(extra),
  })
  return unpackDataResponse(data)
}
