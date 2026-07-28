import { http } from '@/api/http'
import { optionalDevUserId } from '@/api/requestContext'
import { unpackDataResponse, unpackListResponse } from '@/api/response'
import type { PurchasePackageRequest } from '@/api/types/nexus'

type UserIdOpt = { userId?: number }

function userParams(extra?: UserIdOpt) {
  return {
    ...optionalDevUserId(),
    ...(extra?.userId != null ? { user_id: extra.userId } : {}),
  }
}

/** GET /packages */
export async function listPackages(params?: {
  limit?: number
  offset?: number
}): Promise<{ items: unknown[]; total: number }> {
  const { data } = await http.get<unknown>('/packages', {
    params: { limit: params?.limit, offset: params?.offset },
  })
  return unpackListResponse(data)
}

/** GET /packages/user */
export async function listUserPackages(params?: {
  limit?: number
  offset?: number
  userId?: number
}): Promise<{ items: unknown[]; total: number }> {
  const { data } = await http.get<unknown>('/packages/user', {
    params: {
      ...optionalDevUserId(),
      limit: params?.limit,
      offset: params?.offset,
      ...(params?.userId != null ? { user_id: params.userId } : {}),
    },
  })
  return unpackListResponse(data)
}

/** POST /packages/{package_id}/purchase — 路径与 body 均带套餐 `id` */
export async function purchasePackage(
  packageId: number,
  body: Pick<PurchasePackageRequest, 'payment_method'>,
  extra?: UserIdOpt,
): Promise<unknown> {
  const payload: PurchasePackageRequest = {
    payment_method: body.payment_method,
    package_id: packageId,
  }
  const { data } = await http.post<unknown>(`/packages/${packageId}/purchase`, payload, {
    params: userParams(extra),
  })
  return unpackDataResponse(data)
}

/** GET /models/package/{package_id} — OpenAPI「Get Package Models」 */
export async function fetchModelsByPackage(packageId: number): Promise<unknown> {
  const { data } = await http.get<unknown>(`/models/package/${packageId}`)
  return unpackDataResponse(data)
}
