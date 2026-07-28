import { http } from '@/api/http'
import { optionalDevUserId } from '@/api/requestContext'
import { unpackDataResponse, unpackListResponse } from '@/api/response'
import type { UserUpdate } from '@/api/types/nexus'

type UserIdOpt = { userId?: number }

function userParams(extra?: UserIdOpt) {
  return {
    ...optionalDevUserId(),
    ...(extra?.userId != null ? { user_id: extra.userId } : {}),
  }
}

/** GET /user/me */
export async function fetchCurrentUser(extra?: UserIdOpt): Promise<unknown> {
  const { data } = await http.get<unknown>('/user/me', { params: userParams(extra) })
  return unpackDataResponse(data)
}

/** PUT /user/me */
export async function updateCurrentUser(body: UserUpdate, extra?: UserIdOpt): Promise<unknown> {
  const { data } = await http.put<unknown>('/user/me', body, { params: userParams(extra) })
  return unpackDataResponse(data)
}

/** GET /user/invited-users */
export async function fetchInvitedUsers(params?: {
  limit?: number
  offset?: number
  userId?: number
}): Promise<{ items: unknown[]; total: number }> {
  const { data } = await http.get<unknown>('/user/invited-users', {
    params: {
      ...optionalDevUserId(),
      limit: params?.limit,
      offset: params?.offset,
      ...(params?.userId != null ? { user_id: params.userId } : {}),
    },
  })
  return unpackListResponse(data)
}
