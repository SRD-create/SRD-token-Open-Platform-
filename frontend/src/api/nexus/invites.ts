import { http } from '@/api/http'
import { optionalDevUserId } from '@/api/requestContext'
import { unpackDataResponse } from '@/api/response'

type UserIdOpt = { userId?: number }

function userParams(extra?: UserIdOpt) {
  return {
    ...optionalDevUserId(),
    ...(extra?.userId != null ? { user_id: extra.userId } : {}),
  }
}

/** POST /invites/bind — 登录态下绑定邀请码（body: `{ invite_code }`） */
export async function bindInviteCode(inviteCode: string): Promise<unknown> {
  const { data } = await http.post<unknown>('/invites/bind', {
    invite_code: inviteCode.trim(),
  })
  return unpackDataResponse(data)
}

/** GET /invites */
export async function listInvites(extra?: UserIdOpt): Promise<unknown> {
  const { data } = await http.get<unknown>('/invites', { params: userParams(extra) })
  return unpackDataResponse(data)
}

/** POST /invites/reward/{invite_id} */
export async function claimInviteReward(inviteId: number): Promise<unknown> {
  const { data } = await http.post<unknown>(`/invites/reward/${inviteId}`)
  return unpackDataResponse(data)
}
